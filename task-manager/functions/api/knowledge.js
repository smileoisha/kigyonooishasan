// functions/api/knowledge.js
// ナレッジ横断検索 API
//
// GET   /api/knowledge?q=検索語&source_type=xxx&customer_id=xxx&limit=20
// GET   /api/knowledge?backlinks=<id>  → 被リンク検索
// GET   /api/knowledge?trash=true      → ゴミ箱一覧（自動パージ込み）
// POST  /api/knowledge  { entries: [...] }  → 一括upsert（内部同期用）
// PUT   /api/knowledge?id=xxx  { title, body, tags, parent_id }  → 手動エントリ更新
// PUT   /api/knowledge?action=restore&id=xxx  → ゴミ箱から復元
// PATCH /api/knowledge  { orders: [{id, sort_order}] }  → 並べ替え順保存
// DELETE /api/knowledge?id=xxx            → 論理削除（ゴミ箱に移動）
// DELETE /api/knowledge?id=xxx&permanent=true → 物理削除（ゴミ箱から完全削除）
// DELETE /api/knowledge?empty_trash=true  → ゴミ箱一括物理削除
// DELETE /api/knowledge?source_id=xxx     → 物理削除（auto-sync ソース削除）

// ─── スキーママイグレーション（deleted_at カラム追加）─────────
let _migrated = false;
async function ensureSchema(env) {
  if (_migrated) return;
  try {
    await env.DB.prepare('ALTER TABLE knowledge ADD COLUMN deleted_at TEXT DEFAULT NULL').run();
  } catch { /* already exists */ }
  _migrated = true;
}

export async function onRequest(context) {
  const { request, env } = context;
  await ensureSchema(env);
  const method = request.method;
  const url = new URL(request.url);

  if (method === 'GET')    return handleSearch(env, url);
  if (method === 'POST')   return handleUpsert(env, request);
  if (method === 'PUT')    return handleUpdate(env, url, request);
  if (method === 'PATCH')  return handleReorder(env, request);
  if (method === 'DELETE') return handleDelete(env, url);
  return json({ error: 'Method not allowed' }, 405);
}

// ─── GET: 検索 ───────────────────────────────────────────────
async function handleSearch(env, url) {
  try {
    // ゴミ箱一覧：?trash=true
    if (url.searchParams.get('trash') === 'true') {
      // 自動パージ（30日超）
      const purgedIds = await env.DB.prepare(
        "SELECT id FROM knowledge WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')"
      ).all();
      if (purgedIds.results && purgedIds.results.length > 0) {
        const ids = purgedIds.results.map(r => r.id);
        for (const pid of ids) {
          await env.DB.prepare('DELETE FROM knowledge_history WHERE knowledge_id = ?').bind(pid).run();
        }
        await env.DB.prepare("DELETE FROM knowledge WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')").run();
      }
      // ゴミ箱一覧取得
      const result = await env.DB.prepare(
        'SELECT id, title, deleted_at, tags FROM knowledge WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
      ).all();
      return json({ ok: true, entries: result.results || [] });
    }

    // バックリンク検索：?backlinks=<id>
    const backlinksId = url.searchParams.get('backlinks');
    if (backlinksId) {
      const needle1 = `[[id:${backlinksId}|`;                  // 旧Markdown形式
      const needle2 = `kn-wiki" data-id="${backlinksId}"`;   // kn-wikiリンクのみ（page-block除外）
      const result = await env.DB.prepare(
        'SELECT id, source_type, title, updated_at FROM knowledge WHERE (INSTR(body, ?) > 0 OR INSTR(body, ?) > 0) AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 50'
      ).bind(needle1, needle2).all();
      return json({ ok: true, entries: result.results || [] });
    }

    const q          = url.searchParams.get('q') || '';
    const sourceType = url.searchParams.get('source_type') || '';
    const customerId = url.searchParams.get('customer_id') || '';
    const limit      = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 5000);

    let sql = 'SELECT id, source_type, source_id, title, body, tags, customer_id, parent_id, sort_order, created_at, updated_at, comments FROM knowledge WHERE deleted_at IS NULL';
    const params = [];

    if (q.trim()) {
      const like = `%${q.trim()}%`;
      sql += ' AND (title LIKE ? OR body LIKE ? OR tags LIKE ?)';
      params.push(like, like, like);
    }
    if (sourceType) {
      sql += ' AND source_type = ?';
      params.push(sourceType);
    }
    if (customerId) {
      sql += ' AND customer_id = ?';
      params.push(customerId);
    }

    sql += ' ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END, sort_order ASC, created_at ASC LIMIT ?';
    params.push(limit);

    const result = await env.DB.prepare(sql).bind(...params).all();
    const entries = (result.results || []).map(row => ({
      ...row,
      tags: safeJsonParse(row.tags, []),
      comments: safeJsonParse(row.comments, [])
    }));

    return json({ ok: true, entries, total: entries.length });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── POST: 一括upsert ──────────────────────────────────────
async function handleUpsert(env, request) {
  try {
    const { entries } = await request.json();
    if (!Array.isArray(entries) || entries.length === 0) {
      return json({ ok: true, count: 0 });
    }

    const now = new Date().toISOString();
    let count = 0;

    const chunks = chunkArray(entries, 50);
    for (const chunk of chunks) {
      const stmts = chunk.map(e =>
        env.DB.prepare(
          'INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, tags, customer_id, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          e.id,
          e.source_type,
          e.source_id || null,
          (e.title || '').slice(0, 200),
          (e.body || '').slice(0, 5000),
          typeof e.tags === 'string' ? e.tags : JSON.stringify(e.tags || []),
          e.customer_id || null,
          e.parent_id || null,
          e.created_at || now,
          e.updated_at || now
        )
      );
      await env.DB.batch(stmts);
      count += chunk.length;
    }

    return json({ ok: true, count });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── PUT: 手動エントリ更新 ────────────────────────────────
async function handleUpdate(env, url, request) {
  try {
    // ゴミ箱から復元：?action=restore&id=xxx
    if (url.searchParams.get('action') === 'restore') {
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id required' }, 400);
      const row = await env.DB.prepare('SELECT parent_id FROM knowledge WHERE id = ? AND deleted_at IS NOT NULL').bind(id).first();
      if (!row) return json({ error: 'Not found in trash' }, 404);
      const now = new Date().toISOString();
      let newParentId = row.parent_id;
      if (newParentId) {
        const parent = await env.DB.prepare('SELECT id FROM knowledge WHERE id = ? AND deleted_at IS NULL').bind(newParentId).first();
        if (!parent) newParentId = null; // 親も削除済みならルートへ
      }
      await env.DB.prepare('UPDATE knowledge SET deleted_at=NULL, parent_id=?, updated_at=? WHERE id=?').bind(newParentId, now, id).run();
      return json({ ok: true, restored_to_root: !newParentId && !!row.parent_id });
    }

    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'id required' }, 400);

    const existing = await env.DB.prepare('SELECT source_type, title, body, tags, updated_at FROM knowledge WHERE id = ? AND deleted_at IS NULL').bind(id).first();
    if (!existing) return json({ error: 'Not found' }, 404);

    const body = await request.json();
    const now = new Date().toISOString();

    // ─── オプティミスティックロック：クライアントの読み込み時刻よりDBが新しければ競合 ───
    if (body.client_updated_at && existing.updated_at > body.client_updated_at) {
      return json({ error: 'conflict', message: '外部で更新されています。リロードしてから編集してください。' }, 409);
    }

    // comments のみの更新は全 source_type に許可
    const isCommentsOnly = body.comments !== undefined
      && body.title === undefined && body.body === undefined && body.tags === undefined;
    if (isCommentsOnly) {
      const newComments = JSON.stringify(Array.isArray(body.comments) ? body.comments : []);
      await env.DB.prepare('UPDATE knowledge SET comments=?, updated_at=? WHERE id=?').bind(newComments, now, id).run();
      return json({ ok: true });
    }

    // parent_id のみの更新（ドラッグ&ドロップで親変更）
    const isParentOnly = body.parent_id !== undefined
      && body.title === undefined && body.body === undefined && body.tags === undefined && body.comments === undefined;
    if (isParentOnly) {
      const newParentId = body.parent_id || null;
      if (newParentId === id) return json({ error: '自分自身を親には設定できません' }, 400);
      if (newParentId) {
        const cycle = await isAncestor(env, id, newParentId);
        if (cycle) return json({ error: '循環参照になります' }, 400);
      }
      await env.DB.prepare('UPDATE knowledge SET parent_id=?, updated_at=? WHERE id=?').bind(newParentId, now, id).run();
      return json({ ok: true });
    }

    if (existing.source_type !== 'manual') return json({ error: 'Only manual entries can be updated' }, 403);

    const newTitle = (body.title || '').slice(0, 200);
    const newBody  = (body.body  || '').slice(0, 100000);
    const newTags  = typeof body.tags === 'string' ? body.tags : JSON.stringify(body.tags || []);

    // ─── 履歴保存（内容が変わった場合のみ）────────────────────
    const changed = (newBody !== (existing.body || '')) || (newTitle !== (existing.title || ''));
    if (changed) {
      // 直近履歴と同じなら重複保存しない
      const lastHist = await env.DB.prepare(
        'SELECT body, title FROM knowledge_history WHERE knowledge_id = ? ORDER BY saved_at DESC LIMIT 1'
      ).bind(id).first();
      const isDuplicate = lastHist && lastHist.body === existing.body && lastHist.title === existing.title;

      if (!isDuplicate) {
        await env.DB.prepare(
          'INSERT INTO knowledge_history (knowledge_id, title, body, tags, saved_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(id, existing.title, existing.body, existing.tags, now).run();

        // 21件目以降を削除（直近20件のみ保持）
        await env.DB.prepare(
          `DELETE FROM knowledge_history WHERE knowledge_id = ? AND id NOT IN (
            SELECT id FROM knowledge_history WHERE knowledge_id = ? ORDER BY saved_at DESC LIMIT 20
          )`
        ).bind(id, id).run();
      }
    }
    // ─────────────────────────────────────────────────────────

    // parent_id が指定されている場合は循環参照チェック
    let newParentId = body.parent_id !== undefined ? (body.parent_id || null) : undefined;
    if (newParentId !== undefined) {
      if (newParentId === id) return json({ error: '自分自身を親には設定できません' }, 400);
      if (newParentId) {
        const cycle = await isAncestor(env, id, newParentId);
        if (cycle) return json({ error: '循環参照になります（指定先はこのエントリの子孫です）' }, 400);
      }
    }

    if (newParentId !== undefined) {
      await env.DB.prepare(
        'UPDATE knowledge SET title=?, body=?, tags=?, parent_id=?, updated_at=? WHERE id=?'
      ).bind(newTitle, newBody, newTags, newParentId, now, id).run();
    } else {
      await env.DB.prepare(
        'UPDATE knowledge SET title=?, body=?, tags=?, updated_at=? WHERE id=?'
      ).bind(newTitle, newBody, newTags, now, id).run();
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── PATCH: 並べ替え順保存 ─────────────────────────────────
async function handleReorder(env, request) {
  try {
    const { orders } = await request.json();
    if (!Array.isArray(orders) || !orders.length) return json({ ok: true });
    const stmts = orders.map(o =>
      env.DB.prepare('UPDATE knowledge SET sort_order = ? WHERE id = ?').bind(Number(o.sort_order), o.id)
    );
    await env.DB.batch(stmts);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── DELETE: 削除 ────────────────────────────────────────
async function handleDelete(env, url) {
  try {
    const sourceId   = url.searchParams.get('source_id');
    const id         = url.searchParams.get('id');
    const permanent  = url.searchParams.get('permanent') === 'true';
    const emptyTrash = url.searchParams.get('empty_trash') === 'true';

    // auto-sync ソース削除（物理削除のまま）
    if (sourceId) {
      await env.DB.prepare('DELETE FROM knowledge WHERE source_id = ?').bind(sourceId).run();
      return json({ ok: true });
    }

    // ゴミ箱を空にする（全件物理削除）
    if (emptyTrash) {
      const trashed = await env.DB.prepare('SELECT id FROM knowledge WHERE deleted_at IS NOT NULL').all();
      if (trashed.results && trashed.results.length > 0) {
        const ids = trashed.results.map(r => r.id);
        // 子エントリの孤児化
        const placeholders = ids.map(() => '?').join(',');
        await env.DB.prepare(`UPDATE knowledge SET parent_id=NULL WHERE parent_id IN (${placeholders})`).bind(...ids).run();
        // 履歴削除
        for (const tid of ids) {
          await env.DB.prepare('DELETE FROM knowledge_history WHERE knowledge_id = ?').bind(tid).run();
        }
        // 本体削除
        await env.DB.prepare('DELETE FROM knowledge WHERE deleted_at IS NOT NULL').run();
      }
      return json({ ok: true });
    }

    if (!id) return json({ error: 'source_id or id required' }, 400);

    if (permanent) {
      // 物理削除（ゴミ箱から完全削除）
      await env.DB.prepare('UPDATE knowledge SET parent_id=NULL WHERE parent_id=?').bind(id).run();
      await env.DB.prepare('DELETE FROM knowledge_history WHERE knowledge_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM knowledge WHERE id = ?').bind(id).run();
    } else {
      // 論理削除（ゴミ箱へ移動）：manual / spacer のみ
      const row = await env.DB.prepare('SELECT source_type FROM knowledge WHERE id = ? AND deleted_at IS NULL').bind(id).first();
      if (!row) return json({ error: 'Not found' }, 404);
      if (row.source_type !== 'manual') return json({ error: 'Only manual entries can be trashed' }, 403);
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE knowledge SET deleted_at=? WHERE id=?").bind(now, id).run();
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── 循環参照チェック：ancestor が target の祖先か ────────
async function isAncestor(env, ancestor, target) {
  let current = target;
  const visited = new Set();
  while (current) {
    if (visited.has(current)) return false; // 既存の循環（壊れたデータ）
    if (current === ancestor) return true;
    visited.add(current);
    const row = await env.DB.prepare('SELECT parent_id FROM knowledge WHERE id = ?').bind(current).first();
    if (!row || !row.parent_id) return false;
    current = row.parent_id;
  }
  return false;
}

// ─── ユーティリティ ──────────────────────────────────────────
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

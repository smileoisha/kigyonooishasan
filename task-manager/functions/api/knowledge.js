// functions/api/knowledge.js
// ナレッジ横断検索 API
//
// GET   /api/knowledge?q=検索語&source_type=xxx&customer_id=xxx&limit=20
// GET   /api/knowledge?backlinks=<id>  → 被リンク検索
// POST  /api/knowledge  { entries: [...] }  → 一括upsert（内部同期用）
// PUT   /api/knowledge?id=xxx  { title, body, tags, parent_id }  → 手動エントリ更新
// PATCH /api/knowledge  { orders: [{id, sort_order}] }  → 並べ替え順保存
// DELETE /api/knowledge?id=xxx / ?source_id=xxx

export async function onRequest(context) {
  const { request, env } = context;
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
    // バックリンク検索：?backlinks=<id>
    const backlinksId = url.searchParams.get('backlinks');
    if (backlinksId) {
      const like1 = `%[[id:${backlinksId}|%`;        // 旧Markdown形式
      const like2 = `%data-id="${backlinksId}"%`;    // 新HTML形式
      const result = await env.DB.prepare(
        'SELECT id, source_type, title, updated_at FROM knowledge WHERE (body LIKE ? OR body LIKE ?) ORDER BY updated_at DESC LIMIT 50'
      ).bind(like1, like2).all();
      return json({ ok: true, entries: result.results || [] });
    }

    const q          = url.searchParams.get('q') || '';
    const sourceType = url.searchParams.get('source_type') || '';
    const customerId = url.searchParams.get('customer_id') || '';
    const limit      = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 200);

    let sql = 'SELECT id, source_type, source_id, title, body, tags, customer_id, parent_id, created_at, updated_at FROM knowledge WHERE 1=1';
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

    sql += ' ORDER BY sort_order ASC, updated_at DESC LIMIT ?';
    params.push(limit);

    const result = await env.DB.prepare(sql).bind(...params).all();
    const entries = (result.results || []).map(row => ({
      ...row,
      tags: safeJsonParse(row.tags, [])
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
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'id required' }, 400);

    const existing = await env.DB.prepare('SELECT source_type FROM knowledge WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Not found' }, 404);
    if (existing.source_type !== 'manual') return json({ error: 'Only manual entries can be updated' }, 403);

    const body = await request.json();
    const now = new Date().toISOString();

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
      ).bind(
        (body.title || '').slice(0, 200),
        (body.body || '').slice(0, 5000),
        typeof body.tags === 'string' ? body.tags : JSON.stringify(body.tags || []),
        newParentId,
        now,
        id
      ).run();
    } else {
      await env.DB.prepare(
        'UPDATE knowledge SET title=?, body=?, tags=?, updated_at=? WHERE id=?'
      ).bind(
        (body.title || '').slice(0, 200),
        (body.body || '').slice(0, 5000),
        typeof body.tags === 'string' ? body.tags : JSON.stringify(body.tags || []),
        now,
        id
      ).run();
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
    const sourceId = url.searchParams.get('source_id');
    const id       = url.searchParams.get('id');

    if (sourceId) {
      await env.DB.prepare('DELETE FROM knowledge WHERE source_id = ?').bind(sourceId).run();
    } else if (id) {
      // 子エントリの parent_id を null にしてから削除
      await env.DB.prepare('UPDATE knowledge SET parent_id=NULL WHERE parent_id=?').bind(id).run();
      await env.DB.prepare('DELETE FROM knowledge WHERE id = ?').bind(id).run();
    } else {
      return json({ error: 'source_id or id required' }, 400);
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

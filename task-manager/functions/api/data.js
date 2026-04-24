// functions/api/data.js — Cloudflare Pages Function (D1 backend)

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const result = await env.DB.prepare(
      'SELECT value FROM store WHERE key = ?'
    ).bind('main').first();
    const storeData = result ? JSON.parse(result.value) : {};

    const knowledgeResult = await env.DB.prepare(
      "SELECT id, source_type, source_id, title, body, structured, tags, customer_id, parent_id, sort_order, created_at, updated_at FROM knowledge WHERE source_type = 'manual' ORDER BY created_at"
    ).all();

    storeData._manualKnowledge = knowledgeResult.results || [];

    return new Response(JSON.stringify(storeData), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  return handleSave(context);
}

export async function onRequestPut(context) {
  return handleSave(context);
}

async function handleSave(context) {
  const { env, request } = context;
  try {
    const body = await request.text();
    const data = JSON.parse(body);
    const now = new Date().toISOString();

    // _manualKnowledge はstoreに保存しない（knowledgeテーブルで管理）
    const manualKnowledge = data._manualKnowledge;
    delete data._manualKnowledge;
    const cleanBody = JSON.stringify(data);

    await env.DB.prepare(
      'INSERT OR REPLACE INTO store (key, value, updated_at) VALUES (?, ?, ?)'
    ).bind('main', cleanBody, now).run();

    // タスクノート・面談記録の同期
    try { await syncKnowledge(env.DB, data); } catch (e) { console.error('[knowledge sync]', e.message); }

    // リストア時: manualナレッジを復元
    if (Array.isArray(manualKnowledge) && manualKnowledge.length > 0) {
      try { await restoreManualKnowledge(env.DB, manualKnowledge); } catch (e) { console.error('[manual knowledge restore]', e.message); }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function restoreManualKnowledge(db, entries) {
  for (let i = 0; i < entries.length; i += 50) {
    const chunk = entries.slice(i, i + 50);
    const stmts = chunk.map(e =>
      db.prepare(
        'INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, structured, tags, customer_id, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        e.id, e.source_type, e.source_id ?? null, e.title, e.body ?? null,
        e.structured ?? null, e.tags ?? null, e.customer_id ?? null,
        e.parent_id ?? null, e.sort_order ?? 0, e.created_at, e.updated_at
      )
    );
    await db.batch(stmts);
  }
}

// ─── ナレッジ同期 ─────────────────────────────────────────────
// データ保存のたびにタスクノート・顧客面談をknowledgeテーブルへupsert

// 数値タイムスタンプ（Date.now()等）をISOに統一
function toISO(val) {
  if (!val) return null;
  if (typeof val === 'number') return new Date(val).toISOString();
  if (typeof val === 'string' && /^\d{10,13}$/.test(val)) return new Date(Number(val)).toISOString();
  return val;
}

async function syncKnowledge(db, data) {
  const now = new Date().toISOString();
  const entries = [];

  // タスクノート
  for (const task of (data.tasks || [])) {
    for (const note of (task.notes || [])) {
      if (!note.content?.trim()) continue;
      entries.push({
        id:          `task_note_${note.id}`,
        source_type: 'task_note',
        source_id:   note.id,
        title:       (task.title || '').slice(0, 200),
        body:        note.content.slice(0, 5000),
        tags:        JSON.stringify(task.tags || []),
        customer_id: task.customerId || null,
        created_at:  toISO(note.at) || now,
        updated_at:  toISO(note.updatedAt) || toISO(note.at) || now
      });
    }
  }

  // 顧客面談記録
  for (const customer of (data.customers || [])) {
    for (const m of (customer.meetings || [])) {
      // 全フィールドをラベル付きで結合（全文検索用 body）
      const bodyParts = [
        m.process       ? `【過程・議事】\n${m.process}` : '',
        m.content       ? `【メモ】\n${m.content}` : '',
        m.aiSummary     ? `【要約】${m.aiSummary}` : '',
        m.financialNote ? `【財務】${m.financialNote}` : '',
        m.actionPlan    ? `【アクションプラン】${m.actionPlan}` : '',
        (m.issues      || []).length ? `【経営課題】${m.issues.join('、')}` : '',
        (m.nextActions || []).length ? `【次回アクション】${m.nextActions.join('、')}` : '',
      ].filter(Boolean);
      const body = bodyParts.join('\n\n').slice(0, 5000);
      if (!body.trim()) continue;

      // 構造化データ（knowledge.html でセクション別表示用）
      const structured = JSON.stringify({
        process:      m.process      || '',
        content:      m.content      || '',
        aiSummary:    m.aiSummary    || '',
        financialNote:m.financialNote|| '',
        actionPlan:   m.actionPlan   || '',
        issues:       m.issues       || [],
        nextActions:  m.nextActions  || [],
      });

      entries.push({
        id:          `meeting_${m.id}`,
        source_type: 'customer_meeting',
        source_id:   m.id,
        title:       (m.conclusion || `${customer.name} 面談 ${m.date}`).slice(0, 200),
        body,
        structured,
        tags:        JSON.stringify(m.tags || []),
        customer_id: customer.id,
        created_at:  m.date ? `${m.date}T00:00:00Z` : now,
        updated_at:  toISO(m.updatedAt) || (m.date ? `${m.date}T00:00:00Z` : now)
      });
    }
  }

  if (entries.length === 0) return;

  // 50件ずつバッチupsert
  for (let i = 0; i < entries.length; i += 50) {
    const chunk = entries.slice(i, i + 50);
    const stmts = chunk.map(e =>
      db.prepare(
        'INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, structured, tags, customer_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(e.id, e.source_type, e.source_id, e.title, e.body, e.structured || null, e.tags, e.customer_id, e.created_at, e.updated_at)
    );
    await db.batch(stmts);
  }
}

// functions/api/data.js — Cloudflare Pages Function (D1 backend)

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const result = await env.DB.prepare(
      'SELECT value FROM store WHERE key = ?'
    ).bind('main').first();
    const body = result ? result.value : 'null';
    return new Response(body, {
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
    const data = JSON.parse(body); // バリデーション兼パース
    const now = new Date().toISOString();
    await env.DB.prepare(
      'INSERT OR REPLACE INTO store (key, value, updated_at) VALUES (?, ?, ?)'
    ).bind('main', body, now).run();

    // ナレッジテーブルへの同期（失敗してもメイン保存には影響しない）
    syncKnowledge(env.DB, data).catch(e => console.error('[knowledge sync]', e.message));

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

// ─── ナレッジ同期 ─────────────────────────────────────────────
// データ保存のたびにタスクノート・顧客面談をknowledgeテーブルへupsert
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
        created_at:  note.at || now,
        updated_at:  note.at || now
      });
    }
  }

  // 顧客面談記録
  for (const customer of (data.customers || [])) {
    for (const m of (customer.meetings || [])) {
      // m.content（WYSIWYGで編集した内容）が優先。なければ各フィールドを結合
      let body;
      if (m.content && m.content.trim()) {
        body = m.content.slice(0, 5000);
      } else {
        const bodyParts = [
          m.aiSummary    ? `要約: ${m.aiSummary}` : '',
          m.financialNote ? `財務: ${m.financialNote}` : '',
          (m.issues     || []).length ? `課題: ${m.issues.join(', ')}` : '',
          (m.nextActions|| []).length ? `アクション: ${m.nextActions.join(', ')}` : '',
          m.actionPlan   ? `アクションプラン: ${m.actionPlan}` : ''
        ].filter(Boolean);
        body = bodyParts.join('\n').slice(0, 5000);
      }
      if (!body.trim()) continue;

      entries.push({
        id:          `meeting_${m.id}`,
        source_type: 'customer_meeting',
        source_id:   m.id,
        title:       (m.conclusion || `${customer.name} 面談 ${m.date}`).slice(0, 200),
        body,
        tags:        JSON.stringify(m.tags || []),
        customer_id: customer.id,
        created_at:  m.date ? `${m.date}T00:00:00Z` : now,
        updated_at:  now
      });
    }
  }

  if (entries.length === 0) return;

  // 50件ずつバッチupsert
  for (let i = 0; i < entries.length; i += 50) {
    const chunk = entries.slice(i, i + 50);
    const stmts = chunk.map(e =>
      db.prepare(
        'INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, tags, customer_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(e.id, e.source_type, e.source_id, e.title, e.body, e.tags, e.customer_id, e.created_at, e.updated_at)
    );
    await db.batch(stmts);
  }
}

// functions/api/resync.js
// POST /api/resync — store最新データからknowledgeテーブルを完全再同期
// knowledge.html 起動時にバックグラウンドで呼び出す

export async function onRequestPost(context) {
  const { env } = context;
  try {
    const result = await env.DB.prepare(
      'SELECT value FROM store WHERE key = ?'
    ).bind('main').first();
    if (!result) return json({ ok: true, synced: 0 });

    const data = JSON.parse(result.value);
    await syncKnowledge(env.DB, data);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

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
      let body;
      if (m.content && m.content.trim()) {
        body = m.content.slice(0, 5000);
      } else {
        const bodyParts = [
          m.aiSummary     ? `要約: ${m.aiSummary}` : '',
          m.financialNote ? `財務: ${m.financialNote}` : '',
          (m.issues      || []).length ? `課題: ${m.issues.join(', ')}` : '',
          (m.nextActions || []).length ? `アクション: ${m.nextActions.join(', ')}` : '',
          m.actionPlan    ? `アクションプラン: ${m.actionPlan}` : ''
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
        updated_at:  toISO(m.updatedAt) || (m.date ? `${m.date}T00:00:00Z` : now)
      });
    }
  }

  if (entries.length === 0) return;

  // 既存の自動同期エントリを全削除してクリーン再挿入
  // （削除済みタスク/面談のstaleエントリも除去される）
  await db.batch([
    db.prepare("DELETE FROM knowledge WHERE source_type = 'task_note'"),
    db.prepare("DELETE FROM knowledge WHERE source_type = 'customer_meeting'")
  ]);

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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// functions/api/resync.js
// POST /api/resync — relational tablesからknowledgeテーブルを完全再同期
// knowledge.html 起動時にバックグラウンドで呼び出す

export async function onRequestPost(context) {
  const { env } = context;
  try {
    const data = await loadDataFromTables(env.DB);
    await syncKnowledge(env.DB, data);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

async function loadDataFromTables(db) {
  const [customersR, meetingsR] = await db.batch([
    db.prepare('SELECT id, name FROM customers ORDER BY created_at'),
    db.prepare('SELECT id, customer_id, date, conclusion, content, ai_summary, financial_note, action_plan, issues, next_actions, tags, updated_at FROM customer_meetings ORDER BY date'),
  ]);

  const meetingsByCustomer = {};
  for (const m of (meetingsR.results || [])) {
    (meetingsByCustomer[m.customer_id] ||= []).push({
      id: m.id, date: m.date, conclusion: m.conclusion,
      content: m.content || '', aiSummary: m.ai_summary || '',
      financialNote: m.financial_note || '', actionPlan: m.action_plan || '',
      issues:      _parseJSON(m.issues, []),
      nextActions: _parseJSON(m.next_actions, []),
      tags:        _parseJSON(m.tags, []),
      updatedAt: m.updated_at,
    });
  }

  return {
    tasks: [],
    customers: (customersR.results || []).map(c => ({
      id: c.id, name: c.name,
      meetings: meetingsByCustomer[c.id] || [],
    })),
  };
}

function _parseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
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
  await db.prepare("DELETE FROM knowledge WHERE source_type = 'customer_meeting'").run();

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

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
    // process を追加取得（buildMeetingBody で使用）
    db.prepare('SELECT id, customer_id, date, conclusion, process, content, ai_summary, financial_note, action_plan, issues, next_actions, tags, updated_at FROM customer_meetings ORDER BY date'),
  ]);

  const meetingsByCustomer = {};
  for (const m of (meetingsR.results || [])) {
    (meetingsByCustomer[m.customer_id] ||= []).push({
      id: m.id, date: m.date, conclusion: m.conclusion,
      process:      m.process       || '',
      content:      m.content       || '',
      aiSummary:    m.ai_summary    || '',
      financialNote:m.financial_note|| '',
      actionPlan:   m.action_plan   || '',
      issues:       _parseJSON(m.issues, []),
      nextActions:  _parseJSON(m.next_actions, []),
      tags:         _parseJSON(m.tags, []),
      updatedAt:    m.updated_at,
    });
  }

  return {
    customers: (customersR.results || []).map(c => ({
      id: c.id, name: c.name,
      meetings: meetingsByCustomer[c.id] || [],
    })),
  };
}

// ─── buildMeetingBody: meetings.js / [mid].js と同一ロジック ────────────────

function buildMeetingBody(m) {
  const issues      = m.issues      || [];
  const nextActions = m.nextActions || [];
  return [
    m.process       ? `【過程・議事】\n${m.process}`       : '',
    m.content       ? `【メモ】\n${m.content}`             : '',
    m.aiSummary     ? `【要約】${m.aiSummary}`             : '',
    m.financialNote ? `【財務】${m.financialNote}`         : '',
    m.actionPlan    ? `【アクションプラン】${m.actionPlan}` : '',
    issues.length      ? `【経営課題】${issues.join('、')}`           : '',
    nextActions.length ? `【次回アクション】${nextActions.join('、')}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 5000);
}

// ─── 差分同期（全件DELETE廃止 → UPSERT + 孤立エントリ削除） ────────────────
// 全件DELETEはknowledge.htmlアクセス中に面談記録が消えるウィンドウを作るため廃止。
// 現在の面談セットと照合し、新規・更新はUPSERT、削除済みのみDELETEする。

async function syncKnowledge(db, data) {
  const now = new Date().toISOString();
  const entries = [];

  for (const customer of (data.customers || [])) {
    for (const m of (customer.meetings || [])) {
      const body = buildMeetingBody(m);
      if (!body.trim()) continue;

      const structured = JSON.stringify({
        process:       m.process       || '',
        content:       m.content       || '',
        aiSummary:     m.aiSummary     || '',
        financialNote: m.financialNote || '',
        actionPlan:    m.actionPlan    || '',
        issues:        m.issues        || [],
        nextActions:   m.nextActions   || [],
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
        updated_at:  toISO(m.updatedAt) || (m.date ? `${m.date}T00:00:00Z` : now),
      });
    }
  }

  // 既存エントリを取得してIDセットを構築
  const existing = await db.prepare(
    "SELECT id FROM knowledge WHERE source_type = 'customer_meeting'"
  ).all();
  const existingIds = new Set((existing.results || []).map(r => r.id));

  // 新規・更新分をUPSERT（INSERT OR REPLACE）
  for (let i = 0; i < entries.length; i += 50) {
    const chunk = entries.slice(i, i + 50);
    await db.batch(chunk.map(e =>
      db.prepare(
        'INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, structured, tags, customer_id, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        e.id, e.source_type, e.source_id, e.title, e.body,
        e.structured, e.tags, e.customer_id, 'normal',
        e.created_at, e.updated_at
      )
    ));
  }

  // 削除済み面談のknowledgeエントリを除去（孤立エントリ）
  const entryIds = new Set(entries.map(e => e.id));
  const toDelete = [...existingIds].filter(id => !entryIds.has(id));
  for (let i = 0; i < toDelete.length; i += 50) {
    const batch = toDelete.slice(i, i + 50);
    const ph = batch.map(() => '?').join(',');
    await db.prepare(
      `DELETE FROM knowledge WHERE id IN (${ph}) AND source_type = 'customer_meeting'`
    ).bind(...batch).run();
  }
}

// ─── ユーティリティ ───────────────────────────────────────────────

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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

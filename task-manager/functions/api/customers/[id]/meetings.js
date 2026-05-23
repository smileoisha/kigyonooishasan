// functions/api/customers/[id]/meetings.js
// POST /api/customers/:id/meetings — 会議記録追加 + knowledge同期

export async function onRequestPost(context) {
  const { env, request, params } = context;
  const customerId = params.id;
  const now = new Date().toISOString();
  try {
    const m = await request.json();
    if (!m.id)   return json({ error: 'id is required' }, 400);
    if (!m.date) return json({ error: 'date is required' }, 400);
    await env.DB.prepare(
      'INSERT OR REPLACE INTO customer_meetings (id, customer_id, date, conclusion, process, content, ai_summary, financial_note, action_plan, issues, proposals, next_actions, tags, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      m.id, customerId,
      m.date        ?? null,
      m.conclusion  ?? null,
      m.process     ?? null,
      m.content     ?? null,
      m.aiSummary   ?? null,
      m.financialNote ?? null,
      m.actionPlan  ?? null,
      JSON.stringify(m.issues     ?? []),
      JSON.stringify(m.proposals  ?? []),
      JSON.stringify(m.nextActions ?? []),
      JSON.stringify(m.tags       ?? []),
      m.updatedAt   ?? now
    ).run();

    await syncMeetingKnowledge(env.DB, customerId, m, now);
    return json({ ok: true, id: m.id });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── knowledge 同期ユーティリティ（[mid].js でも同一ロジック） ────────────

export function buildMeetingBody(m) {
  const issues      = m.issues      ?? [];
  const nextActions = m.nextActions ?? [];
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

export async function syncMeetingKnowledge(db, customerId, m, now) {
  const knowledgeId = `meeting_${m.id}`;
  const body = buildMeetingBody(m);

  if (!body.trim()) {
    await db.prepare(
      "DELETE FROM knowledge WHERE id = ? AND source_type = 'customer_meeting'"
    ).bind(knowledgeId).run();
    return;
  }

  const structured = JSON.stringify({
    process:       m.process       ?? '',
    content:       m.content       ?? '',
    aiSummary:     m.aiSummary     ?? '',
    financialNote: m.financialNote ?? '',
    actionPlan:    m.actionPlan    ?? '',
    issues:        m.issues        ?? [],
    nextActions:   m.nextActions   ?? [],
  });
  const title     = (m.conclusion || `面談 ${m.date}`).slice(0, 200);
  const createdAt = m.date ? `${m.date}T00:00:00Z` : now;
  const updatedAt = m.updatedAt ?? (m.date ? `${m.date}T00:00:00Z` : now);

  await db.prepare(
    'INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, structured, tags, customer_id, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    knowledgeId, 'customer_meeting', m.id,
    title, body, structured,
    JSON.stringify(m.tags ?? []),
    customerId, 'normal',
    createdAt, updatedAt
  ).run();
}

// ─── ユーティリティ ───────────────────────────────────────────────

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

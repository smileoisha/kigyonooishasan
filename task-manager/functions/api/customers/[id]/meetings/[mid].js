// functions/api/customers/[id]/meetings/[mid].js
// PATCH  /api/customers/:id/meetings/:mid — 会議更新 + knowledge再同期
// DELETE /api/customers/:id/meetings/:mid — 会議削除 + knowledge削除

const FIELD_MAP = {
  date:         'date',
  conclusion:   'conclusion',
  process:      'process',
  content:      'content',
  aiSummary:    'ai_summary',
  financialNote:'financial_note',
  actionPlan:   'action_plan',
  issues:       'issues',
  proposals:    'proposals',
  nextActions:  'next_actions',
  tags:         'tags',
  updatedAt:    'updated_at',
};

const JSON_FIELDS = new Set(['issues', 'proposals', 'nextActions', 'tags']);

export async function onRequestPatch(context) {
  const { env, request, params } = context;
  const { id: customerId, mid } = params;
  const now = new Date().toISOString();
  try {
    const fields = await request.json();
    const sets = [], vals = [];
    for (const [jsKey, col] of Object.entries(FIELD_MAP)) {
      if (!(jsKey in fields)) continue;
      const v = fields[jsKey];
      sets.push(`${col} = ?`);
      vals.push(JSON_FIELDS.has(jsKey) ? JSON.stringify(v ?? []) : (v ?? null));
    }
    if (!sets.length) return json({ ok: true });
    if (!('updatedAt' in fields)) {
      sets.push('updated_at = ?');
      vals.push(now);
    }
    vals.push(mid);
    await env.DB.prepare(
      `UPDATE customer_meetings SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...vals).run();

    // knowledge再同期：UPDATEした後に全フィールドを再読み込み
    const row = await env.DB.prepare(
      'SELECT * FROM customer_meetings WHERE id = ?'
    ).bind(mid).first();

    if (row) {
      const m = rowToMeeting(row);
      await syncMeetingKnowledge(env.DB, customerId, m, now);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const { mid } = params;
  try {
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM knowledge WHERE id = ? AND source_type = 'customer_meeting'"
      ).bind(`meeting_${mid}`),
      env.DB.prepare(
        'DELETE FROM customer_meetings WHERE id = ?'
      ).bind(mid),
    ]);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── ユーティリティ ───────────────────────────────────────────────

function rowToMeeting(row) {
  const p = s => { try { return JSON.parse(s); } catch { return []; } };
  return {
    id:           row.id,
    date:         row.date,
    conclusion:   row.conclusion,
    process:      row.process      ?? '',
    content:      row.content      ?? '',
    aiSummary:    row.ai_summary   ?? '',
    financialNote:row.financial_note ?? '',
    actionPlan:   row.action_plan  ?? '',
    issues:       p(row.issues),
    proposals:    p(row.proposals),
    nextActions:  p(row.next_actions),
    tags:         p(row.tags),
    updatedAt:    row.updated_at,
  };
}

function buildMeetingBody(m) {
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

async function syncMeetingKnowledge(db, customerId, m, now) {
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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

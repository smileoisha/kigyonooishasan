// functions/api/admin/meetings.js
// POST /api/admin/meetings — 管理者向け面談記録作成（JWT不要）
// store の customer.meetings[] に追記し、knowledge テーブルへ同期する

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'リクエスト形式が正しくありません' }, 400);
  }

  const {
    customer_id,
    date,
    title       = null,
    summary     = '',
    action_plan = '',
    issues      = [],
    next_actions = []
  } = body;

  if (!customer_id) return json({ error: 'customer_id は必須です' }, 400);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'date は YYYY-MM-DD 形式で指定してください' }, 400);
  }
  if (summary     && summary.length     > 5000) return json({ error: 'summary は5000文字以内で指定してください' }, 400);
  if (action_plan && action_plan.length > 5000) return json({ error: 'action_plan は5000文字以内で指定してください' }, 400);

  // ─── store 読み込み ────────────────────────────────────────────
  const row = await env.DB.prepare('SELECT value FROM store WHERE key = ?').bind('main').first();
  if (!row) return json({ error: 'データが見つかりません' }, 500);

  let data;
  try {
    data = JSON.parse(row.value);
  } catch {
    return json({ error: 'データ解析エラー' }, 500);
  }

  const customer = (data.customers || []).find(c => c.id === customer_id);
  if (!customer) return json({ error: '顧客が見つかりません' }, 404);

  // ─── meeting オブジェクト生成 ──────────────────────────────────
  const meetingId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const now = new Date().toISOString();

  const meeting = {
    id:          meetingId,
    date,
    conclusion:  title || `${date} 面談記録`,
    aiSummary:   summary.trim(),
    actionPlan:  action_plan.trim(),
    issues:      Array.isArray(issues)       ? issues       : [],
    nextActions: Array.isArray(next_actions) ? next_actions : [],
    process:     '',
    content:     '',
    financialNote: '',
    tags:        [],
    updatedAt:   now
  };

  // ─── store に追記して書き戻し ──────────────────────────────────
  if (!Array.isArray(customer.meetings)) customer.meetings = [];
  customer.meetings.push(meeting);

  await env.DB.prepare(
    'INSERT OR REPLACE INTO store (key, value, updated_at) VALUES (?, ?, ?)'
  ).bind('main', JSON.stringify(data), now).run();

  // ─── knowledge テーブルへ同期（この1件のみ）────────────────────
  const bodyParts = [
    meeting.aiSummary      ? `【要約】${meeting.aiSummary}`              : '',
    meeting.actionPlan     ? `【アクションプラン】${meeting.actionPlan}` : '',
    meeting.issues.length      ? `【経営課題】${meeting.issues.join('、')}`      : '',
    meeting.nextActions.length ? `【次回アクション】${meeting.nextActions.join('、')}` : '',
  ].filter(Boolean);
  const bodyText = bodyParts.join('\n\n').slice(0, 5000);

  if (bodyText.trim()) {
    const structured = JSON.stringify({
      process:      '',
      content:      '',
      aiSummary:    meeting.aiSummary,
      financialNote:'',
      actionPlan:   meeting.actionPlan,
      issues:       meeting.issues,
      nextActions:  meeting.nextActions,
    });

    await env.DB.prepare(
      'INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, structured, tags, customer_id, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      `meeting_${meetingId}`,
      'customer_meeting',
      meetingId,
      meeting.conclusion.slice(0, 200),
      bodyText,
      structured,
      JSON.stringify([]),
      customer_id,
      'normal',
      `${date}T00:00:00Z`,
      now
    ).run();
  }

  return json({
    ok:           true,
    meeting_id:   meetingId,
    knowledge_id: `meeting_${meetingId}`,
    title:        meeting.conclusion,
    date
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

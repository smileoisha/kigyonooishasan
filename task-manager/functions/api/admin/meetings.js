// functions/api/admin/meetings.js
// POST /api/admin/meetings — 管理者向け面談記録作成（JWT不要）
// Phase 1: customers テーブルで顧客検証、customer_meetings テーブルに書き込む

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

  // ─── 顧客検証（customers テーブル → フォールバック: store） ──
  let customerName;
  const customerRow = await env.DB.prepare(
    'SELECT id, name FROM customers WHERE id = ?'
  ).bind(customer_id).first();

  if (customerRow) {
    customerName = customerRow.name;
  } else {
    // フォールバック: store（移行前）
    const storeRow = await env.DB.prepare('SELECT value FROM store WHERE key = ?').bind('main').first();
    if (!storeRow) return json({ error: '顧客が見つかりません' }, 404);
    let data;
    try { data = JSON.parse(storeRow.value); } catch { return json({ error: 'データ解析エラー' }, 500); }
    const c = (data.customers || []).find(c => c.id === customer_id);
    if (!c) return json({ error: '顧客が見つかりません' }, 404);
    customerName = c.name;
  }

  // ─── meeting オブジェクト生成 ────────────────────────────────
  const meetingId   = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const now         = new Date().toISOString();
  const meetingTitle = title || `${date} 面談記録`;

  // ─── customer_meetings テーブルに書き込み ────────────────────
  await env.DB.prepare(
    'INSERT OR REPLACE INTO customer_meetings (id, customer_id, date, conclusion, process, content, ai_summary, financial_note, action_plan, issues, proposals, next_actions, tags, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    meetingId, customer_id, date,
    meetingTitle,
    '',                            // process（後から編集）
    summary.trim(),                // content に要約を格納
    summary.trim(),                // ai_summary
    '',                            // financial_note
    action_plan.trim(),
    JSON.stringify(Array.isArray(issues)       ? issues       : []),
    JSON.stringify([]),
    JSON.stringify(Array.isArray(next_actions) ? next_actions : []),
    JSON.stringify([]),
    now
  ).run();

  // ─── knowledge テーブルへ同期 ─────────────────────────────────
  const bodyParts = [
    summary.trim()      ? `【要約】${summary.trim()}`              : '',
    action_plan.trim()  ? `【アクションプラン】${action_plan.trim()}` : '',
    (Array.isArray(issues)       && issues.length)       ? `【経営課題】${issues.join('、')}`           : '',
    (Array.isArray(next_actions) && next_actions.length) ? `【次回アクション】${next_actions.join('、')}` : '',
  ].filter(Boolean);
  const bodyText = bodyParts.join('\n\n').slice(0, 5000);

  if (bodyText.trim()) {
    const structured = JSON.stringify({
      process: '', content: summary.trim(), aiSummary: summary.trim(),
      financialNote: '', actionPlan: action_plan.trim(),
      issues: Array.isArray(issues) ? issues : [],
      nextActions: Array.isArray(next_actions) ? next_actions : [],
    });

    await env.DB.prepare(
      'INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, structured, tags, customer_id, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      `meeting_${meetingId}`, 'customer_meeting', meetingId,
      meetingTitle.slice(0, 200), bodyText, structured, JSON.stringify([]),
      customer_id, 'normal', `${date}T00:00:00Z`, now
    ).run();
  }

  return json({
    ok:           true,
    meeting_id:   meetingId,
    knowledge_id: `meeting_${meetingId}`,
    title:        meetingTitle,
    date
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// functions/api/concerns/summary.js
// GET /api/concerns/summary?customer_id=xxx — MCP用（管理者のみ）
// Phase 1: customers テーブルから顧客検索、未移行時は store にフォールバック

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const customerId = url.searchParams.get('customer_id');

  if (!customerId) {
    return json({ error: 'customer_id は必須です' }, 400);
  }

  // 顧客情報を取得（customers テーブル → フォールバック: store）
  let customerName;
  const customerRow = await env.DB.prepare(
    'SELECT id, name FROM customers WHERE id = ?'
  ).bind(customerId).first();

  if (customerRow) {
    customerName = customerRow.name;
  } else {
    // フォールバック: store（移行前）
    const storeRow = await env.DB.prepare('SELECT value FROM store WHERE key = ?').bind('main').first();
    if (!storeRow) return json({ error: 'データが見つかりません' }, 500);
    let data;
    try { data = JSON.parse(storeRow.value); } catch { return json({ error: 'データ解析エラー' }, 500); }
    const c = (data.customers || []).find(c => c.id === customerId);
    if (!c) return json({ error: '顧客が見つかりません' }, 404);
    customerName = c.name;
  }

  if (!customerName) return json({ error: '顧客が見つかりません' }, 404);

  // 投稿一覧取得（customer_concerns テーブル）
  const openResult = await env.DB.prepare(
    "SELECT id, body, urgency, created_at, updated_at FROM customer_concerns WHERE customer_id = ? AND status = 'open' ORDER BY created_at DESC"
  ).bind(customerId).all();

  const resolvedResult = await env.DB.prepare(
    "SELECT id, body, urgency, created_at, updated_at, resolved_at, auto_resolved FROM customer_concerns WHERE customer_id = ? AND status = 'resolved' ORDER BY resolved_at DESC LIMIT 10"
  ).bind(customerId).all();

  const openConcerns     = openResult.results     || [];
  const resolvedConcerns = resolvedResult.results || [];
  const lastSubmitted    = openConcerns.length > 0 ? openConcerns[0].created_at : null;

  return json({
    customer_name:     customerName,
    customer_id:       customerId,
    open_concerns:     openConcerns,
    resolved_concerns: resolvedConcerns,
    total_open:        openConcerns.length,
    last_submitted:    lastSubmitted
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

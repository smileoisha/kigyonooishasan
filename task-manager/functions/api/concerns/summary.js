// functions/api/concerns/summary.js
// GET /api/concerns/summary?customer_id=xxx — MCP用（管理者のみ）
// MCPはmcp.jsからD1を直接クエリするため、このエンドポイントはブラウザ管理画面用

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const customerId = url.searchParams.get('customer_id');

  if (!customerId) {
    return json({ error: 'customer_id は必須です' }, 400);
  }

  // 顧客情報を取得（storeのJSON blobから）
  const row = await env.DB.prepare('SELECT value FROM store WHERE key = ?').bind('main').first();
  if (!row) return json({ error: 'データが見つかりません' }, 500);

  const data = JSON.parse(row.value);
  const customer = (data.customers || []).find(c => c.id === customerId);
  if (!customer) return json({ error: '顧客が見つかりません' }, 404);

  // 投稿一覧取得
  const openResult = await env.DB.prepare(
    "SELECT id, body, urgency, created_at, updated_at FROM customer_concerns WHERE customer_id = ? AND status = 'open' ORDER BY created_at DESC"
  ).bind(customerId).all();

  const resolvedResult = await env.DB.prepare(
    "SELECT id, body, urgency, created_at, updated_at, resolved_at, auto_resolved FROM customer_concerns WHERE customer_id = ? AND status = 'resolved' ORDER BY resolved_at DESC LIMIT 10"
  ).bind(customerId).all();

  const openConcerns = openResult.results || [];
  const resolvedConcerns = resolvedResult.results || [];
  const lastSubmitted = openConcerns.length > 0 ? openConcerns[0].created_at : null;

  return json({
    customer_name: customer.name,
    customer_id: customerId,
    open_concerns: openConcerns,
    resolved_concerns: resolvedConcerns,
    total_open: openConcerns.length,
    last_submitted: lastSubmitted
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

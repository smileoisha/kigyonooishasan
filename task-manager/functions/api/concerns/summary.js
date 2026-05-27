// functions/api/concerns/summary.js
// GET /api/concerns/summary?customer_id=xxx — MCP用（管理者のみ）

let concernSchemaInitPromise = null;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const customerId = url.searchParams.get('customer_id');

  if (!customerId) {
    return json({ error: 'customer_id は必須です' }, 400);
  }

  const customerRow = await env.DB.prepare(
    'SELECT id, name FROM customers WHERE id = ?'
  ).bind(customerId).first();
  if (!customerRow) return json({ error: '顧客が見つかりません' }, 404);
  const customerName = customerRow.name;

  await ensureConcernResponseColumns(env);

  // 投稿一覧取得（customer_concerns テーブル）
  const openResult = await env.DB.prepare(
    "SELECT id, body, urgency, response, responded_at, created_at, updated_at FROM customer_concerns WHERE customer_id = ? AND status = 'open' ORDER BY created_at DESC"
  ).bind(customerId).all();

  const resolvedResult = await env.DB.prepare(
    "SELECT id, body, urgency, response, responded_at, created_at, updated_at, resolved_at, auto_resolved FROM customer_concerns WHERE customer_id = ? AND status = 'resolved' ORDER BY resolved_at DESC LIMIT 10"
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

async function ensureConcernResponseColumns(env) {
  if (!concernSchemaInitPromise) {
    concernSchemaInitPromise = (async () => {
      const info = await env.DB.prepare('PRAGMA table_info(customer_concerns)').all();
      const columns = new Set((info.results || []).map(row => row.name));
      if (!columns.has('response')) {
        await env.DB.prepare('ALTER TABLE customer_concerns ADD COLUMN response TEXT').run();
      }
      if (!columns.has('responded_at')) {
        await env.DB.prepare('ALTER TABLE customer_concerns ADD COLUMN responded_at TEXT').run();
      }
    })().catch(err => {
      concernSchemaInitPromise = null;
      throw err;
    });
  }
  return concernSchemaInitPromise;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

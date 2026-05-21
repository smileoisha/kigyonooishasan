// functions/api/admin/concerns.js
// GET   /api/admin/concerns?customer_id=xxx — 管理者向け困りごと一覧（JWT不要）
// PATCH /api/admin/concerns                 — 管理者向けステータス更新（JWT不要）

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const customerId = url.searchParams.get('customer_id');

  if (!customerId) return json({ error: 'customer_id は必須です' }, 400);

  const result = await env.DB.prepare(
    'SELECT id, body, urgency, status, created_at, updated_at, resolved_at, auto_resolved FROM customer_concerns WHERE customer_id = ? ORDER BY created_at DESC'
  ).bind(customerId).all();

  return json({ concerns: result.results || [] });
}

export async function onRequestPatch(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'リクエスト形式が正しくありません' }, 400);
  }

  const { id, status } = body;
  if (!id) return json({ error: 'id は必須です' }, 400);
  if (!['open', 'resolved'].includes(status)) {
    return json({ error: 'statusは open または resolved のみ指定できます' }, 400);
  }

  const existing = await env.DB.prepare(
    'SELECT id FROM customer_concerns WHERE id = ?'
  ).bind(id).first();
  if (!existing) return json({ error: '投稿が見つかりません' }, 404);

  const now = new Date().toISOString();
  const resolvedAt = status === 'resolved' ? now : null;

  await env.DB.prepare(
    'UPDATE customer_concerns SET status = ?, updated_at = ?, resolved_at = ?, auto_resolved = 0 WHERE id = ?'
  ).bind(status, now, resolvedAt, id).run();

  return json({ ok: true, id, status, updated_at: now });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

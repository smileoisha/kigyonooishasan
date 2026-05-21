// functions/api/concerns/[id].js
// PATCH  /api/concerns/:id — ステータス更新（CF Access JWT認証）
// DELETE /api/concerns/:id — 投稿削除（CF Access JWT認証）
// お客さんは自分の投稿のみ操作可

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const id = params.id;

  const emailResult = await getEmailFromJWT(request);
  if (!emailResult.ok) return json({ error: emailResult.error }, emailResult.status);

  const customerResult = await resolveCustomer(env, emailResult.email);
  if (!customerResult.ok) return json({ error: customerResult.error }, customerResult.status);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'リクエスト形式が正しくありません' }, 400);
  }

  const { status } = body;
  if (!['open', 'resolved'].includes(status)) {
    return json({ error: 'statusは open または resolved のみ指定できます' }, 400);
  }

  // 投稿の存在確認 + 自分の投稿かチェック
  const existing = await env.DB.prepare(
    'SELECT id, customer_id, status FROM customer_concerns WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return json({ error: '投稿が見つかりません' }, 404);
  }
  if (existing.customer_id !== customerResult.customerId) {
    return json({ error: '他のお客さんの投稿は更新できません' }, 403);
  }

  const now = new Date().toISOString();
  const resolvedAt = status === 'resolved' ? now : null;

  await env.DB.prepare(
    'UPDATE customer_concerns SET status = ?, updated_at = ?, resolved_at = ?, auto_resolved = 0 WHERE id = ?'
  ).bind(status, now, resolvedAt, id).run();

  return json({ ok: true, id, status, updated_at: now });
}

// ─── DELETE /api/concerns/:id ────────────────────────────────────
export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const id = params.id;

  const emailResult = await getEmailFromJWT(request);
  if (!emailResult.ok) return json({ error: emailResult.error }, emailResult.status);

  const customerResult = await resolveCustomer(env, emailResult.email);
  if (!customerResult.ok) return json({ error: customerResult.error }, customerResult.status);

  const existing = await env.DB.prepare(
    'SELECT id, customer_id FROM customer_concerns WHERE id = ?'
  ).bind(id).first();

  if (!existing) return json({ error: '投稿が見つかりません' }, 404);
  if (existing.customer_id !== customerResult.customerId) {
    return json({ error: '他のお客さんの投稿は削除できません' }, 403);
  }

  await env.DB.prepare('DELETE FROM customer_concerns WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}

// ─── CF Access JWT デコード ──────────────────────────────────────
function decodeJWTPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const base64 = padded + '='.repeat((4 - padded.length % 4) % 4);
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

async function getEmailFromJWT(request) {
  const jwt = request.headers.get('CF-Access-JWT-Assertion');
  if (!jwt) return { ok: false, error: '認証が必要です', status: 401 };

  const payload = decodeJWTPayload(jwt);
  if (!payload || !payload.email) return { ok: false, error: '認証情報が無効です', status: 401 };

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: '認証の有効期限が切れています', status: 401 };
  }

  return { ok: true, email: payload.email };
}

// ─── 顧客解決 ────────────────────────────────────────────────────
async function resolveCustomer(env, email) {
  let row;
  try {
    row = await env.DB.prepare('SELECT value FROM store WHERE key = ?').bind('main').first();
  } catch {
    return { ok: false, error: 'データベースエラー', status: 500 };
  }
  if (!row) return { ok: false, error: 'データが見つかりません', status: 500 };

  let data;
  try {
    data = JSON.parse(row.value);
  } catch {
    return { ok: false, error: 'データ解析エラー', status: 500 };
  }

  const customer = (data.customers || []).find(c => c.email === email);
  if (!customer) {
    return { ok: false, error: '顧問契約者のみご利用いただけます', status: 403 };
  }

  return { ok: true, customerId: customer.id, customerName: customer.name };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

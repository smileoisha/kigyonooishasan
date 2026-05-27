// functions/api/concerns/[id]/response.js
// PUT /api/concerns/:id/response — 管理者向け回答保存

let concernSchemaInitPromise = null;

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const id = params.id;

  const adminResult = await getAdminUser(request, env);
  if (!adminResult.ok) return json({ error: adminResult.error }, adminResult.status);

  await ensureConcernResponseColumns(env);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'リクエスト形式が正しくありません' }, 400);
  }

  if (!body || typeof body.response !== 'string') {
    return json({ error: 'response は文字列で指定してください' }, 400);
  }

  const responseValue = body.response.trim() || null;
  const respondedAt = responseValue ? new Date().toISOString() : null;
  const now = new Date().toISOString();

  const existing = await env.DB.prepare(
    'SELECT id, customer_id, body, urgency, category, status, resolution, response, responded_at, created_at, updated_at, resolved_at, auto_resolved FROM customer_concerns WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return json({ error: '投稿が見つかりません' }, 404);
  }

  await env.DB.prepare(
    'UPDATE customer_concerns SET response = ?, responded_at = ?, updated_at = ? WHERE id = ?'
  ).bind(responseValue, respondedAt, now, id).run();

  return json({
    ...existing,
    response: responseValue,
    responded_at: respondedAt,
    updated_at: now
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

async function getAdminUser(request, env) {
  const userId = request.headers.get('X-Task-Manager-User');
  if (!userId) return { ok: false, error: '管理者認証が必要です', status: 401 };

  const user = await env.DB.prepare(
    'SELECT id, name FROM users WHERE id = ?'
  ).bind(userId).first();
  if (!user) return { ok: false, error: '管理者認証が無効です', status: 403 };
  return { ok: true, user };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Task-Manager-User'
  };
}

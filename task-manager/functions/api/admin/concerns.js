// functions/api/admin/concerns.js
// GET   /api/admin/concerns?customer_id=xxx — 管理者向け困りごと一覧（JWT不要）
// PATCH /api/admin/concerns                 — 管理者向けステータス更新（JWT不要）

let concernSchemaInitPromise = null;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const customerId = url.searchParams.get('customer_id');

  if (!customerId) return json({ error: 'customer_id は必須です' }, 400);

  await ensureConcernResponseColumns(env);

  const result = await env.DB.prepare(
    'SELECT id, body, urgency, category, status, resolution, response, responded_at, created_at, updated_at, resolved_at, auto_resolved FROM customer_concerns WHERE customer_id = ? ORDER BY created_at DESC'
  ).bind(customerId).all();

  return json({ concerns: result.results || [] });
}

// PUT /api/admin/concerns — 管理者向け回答保存 { id, response }
export async function onRequestPut(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'リクエスト形式が正しくありません' }, 400);
  }

  const { id, response: responseText } = body;
  if (!id) return json({ error: 'id は必須です' }, 400);
  if (typeof responseText !== 'string') {
    return json({ error: 'response は文字列で指定してください' }, 400);
  }

  await ensureConcernResponseColumns(env);

  const existing = await env.DB.prepare(
    'SELECT id FROM customer_concerns WHERE id = ?'
  ).bind(id).first();
  if (!existing) return json({ error: '投稿が見つかりません' }, 404);

  const trimmed = responseText.trim() || null;
  const respondedAt = trimmed ? new Date().toISOString() : null;
  const now = new Date().toISOString();

  await env.DB.prepare(
    'UPDATE customer_concerns SET response = ?, responded_at = ?, updated_at = ? WHERE id = ?'
  ).bind(trimmed, respondedAt, now, id).run();

  return json({ ok: true, id, response: trimmed, responded_at: respondedAt, updated_at: now });
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

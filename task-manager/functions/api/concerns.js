// functions/api/concerns.js
// GET  /api/concerns          — 顧客の投稿一覧（CF Access JWT認証）
// POST /api/concerns          — 投稿作成（CF Access JWT認証）

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const emailResult = await getEmailFromJWT(request);
  if (!emailResult.ok) return json({ error: emailResult.error }, emailResult.status);

  const customerResult = await resolveCustomer(env, emailResult.email);
  if (!customerResult.ok) return json({ error: customerResult.error }, customerResult.status);

  const { customerId, email, customerName } = {
    customerId: customerResult.customerId,
    email: emailResult.email,
    customerName: customerResult.customerName
  };

  if (request.method === 'GET')  return handleGet(env, customerId, new URL(request.url));
  if (request.method === 'POST') return handlePost(context, env, customerId, email, customerName, request);
  return json({ error: 'Method not allowed' }, 405);
}

// ─── GET /api/concerns ───────────────────────────────────────────
async function handleGet(env, customerId, url) {
  // 14日超の未解決投稿を自動クローズ（fire-and-forget）
  env.DB.prepare(
    "UPDATE customer_concerns SET status = 'resolved', resolved_at = datetime('now'), auto_resolved = 1, updated_at = datetime('now') WHERE customer_id = ? AND status = 'open' AND created_at < datetime('now', '-14 days')"
  ).bind(customerId).run().catch(() => {});

  const status = url.searchParams.get('status') || 'all';
  const q = url.searchParams.get('q') || '';

  let sql = 'SELECT id, body, urgency, category, status, resolution, created_at, updated_at, resolved_at, auto_resolved FROM customer_concerns WHERE customer_id = ?';
  const params = [customerId];

  if (status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }

  if (q) {
    sql += ' AND body LIKE ?';
    params.push(`%${q}%`);
  }

  sql += ' ORDER BY created_at DESC';

  const result = await env.DB.prepare(sql).bind(...params).all();
  return json({ concerns: result.results || [] });
}

// ─── POST /api/concerns ──────────────────────────────────────────
async function handlePost(context, env, customerId, email, customerName, request) {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'リクエスト形式が正しくありません' }, 400);
  }

  const { body: text, urgency = 'normal', category = null } = body;

  if (!text || !text.trim()) {
    return json({ error: '内容を入力してください' }, 400);
  }
  if (!['normal', 'urgent'].includes(urgency)) {
    return json({ error: '緊急度の値が無効です' }, 400);
  }
  if (text.trim().length > 2000) {
    return json({ error: '2000文字以内で入力してください' }, 400);
  }
  const validCategories = ['cash_flow', 'no_money', 'expenses', 'hiring', 'marketing', 'repeat', 'anxiety', 'other'];
  if (category !== null && !validCategories.includes(category)) {
    return json({ error: 'カテゴリの値が無効です' }, 400);
  }

  // 重複チェック（force=true またはANTHROPIC_API_KEY未設定の場合はスキップ）
  if (!force && env.ANTHROPIC_API_KEY) {
    const existing = await env.DB.prepare(
      "SELECT id, body FROM customer_concerns WHERE customer_id = ? AND status = 'open'"
    ).bind(customerId).all();

    if (existing.results && existing.results.length > 0) {
      const duplicate = await checkDuplicate(text.trim(), existing.results, env);
      if (duplicate && duplicate.similar_id) {
        const similar = existing.results.find(c => c.id === duplicate.similar_id);
        return json({
          id: null,
          created_at: null,
          duplicate_warning: {
            similar_id: duplicate.similar_id,
            similar_body_preview: similar ? similar.body.slice(0, 100) : '',
          }
        }, 200);
      }
    }
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await env.DB.prepare(
    'INSERT INTO customer_concerns (id, customer_id, email, body, urgency, category, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, customerId, email, text.trim(), urgency, category || null, 'open', now, now).run();

  // 緊急投稿時のSlack通知（waitUntilでレスポンス後も確実に実行）
  if (urgency === 'urgent' && env.SLACK_WEBHOOK_URL) {
    context.waitUntil(notifySlack(env, customerName, email, text.trim()));
  }

  return json({ id, created_at: now, duplicate_warning: null }, 201);
}

// ─── 重複チェック（Claude API）──────────────────────────────────
async function checkDuplicate(newBody, existingConcerns, env) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: `投稿の重複チェックを行います。新しい投稿と既存の未解決投稿を比較し、内容が実質的に同じ（同じ問題・同じ悩み）かどうかを判定してください。JSONのみで応答してください。{"is_duplicate": true/false, "similar_id": "該当ID or null"}`,
        messages: [{
          role: 'user',
          content: `新しい投稿：\n${newBody}\n\n既存の未解決投稿：\n${existingConcerns.map(c => `ID:${c.id}\n${c.body}`).join('\n---\n')}`
        }]
      })
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// ─── Slack通知（Phase 3 stub）────────────────────────────────────
async function notifySlack(env, customerName, email, text) {
  const nameLabel = customerName ? `${customerName}さん（${email}）` : email;
  await fetch(env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `⚡ *緊急の困りごと投稿*\n投稿者: ${nameLabel}\n\n${text.slice(0, 300)}${text.length > 300 ? '…' : ''}`
    })
  });
}

// ─── CF Access JWT デコード ──────────────────────────────────────
// CF Accessが署名を検証済みのため、Workers側ではデコードのみ実施
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
  if (!jwt) {
    return { ok: false, error: '認証が必要です', status: 401 };
  }

  const payload = decodeJWTPayload(jwt);
  if (!payload || !payload.email) {
    return { ok: false, error: '認証情報が無効です', status: 401 };
  }

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: '認証の有効期限が切れています', status: 401 };
  }

  return { ok: true, email: payload.email };
}

// ─── 顧客解決（メール → customer_id）────────────────────────────
async function resolveCustomer(env, email) {
  let row;
  try {
    row = await env.DB.prepare('SELECT value FROM store WHERE key = ?').bind('main').first();
  } catch (e) {
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

// ─── ユーティリティ ──────────────────────────────────────────────
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, CF-Access-JWT-Assertion'
  };
}

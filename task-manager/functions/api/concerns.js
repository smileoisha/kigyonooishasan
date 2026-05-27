// functions/api/concerns.js
// GET  /api/concerns          — 顧客の投稿一覧（CF Access JWT認証）
// POST /api/concerns          — 投稿作成（CF Access JWT認証）

import { sendEmail, escHtml } from '../lib/email.js';

let concernSchemaInitPromise = null;

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
  await ensureConcernResponseColumns(env);

  // 14日超の未解決投稿を自動クローズ（fire-and-forget）
  env.DB.prepare(
    "UPDATE customer_concerns SET status = 'resolved', resolved_at = datetime('now'), auto_resolved = 1, updated_at = datetime('now') WHERE customer_id = ? AND status = 'open' AND created_at < datetime('now', '-14 days')"
  ).bind(customerId).run().catch(() => {});

  const status = url.searchParams.get('status') || 'all';
  const q = url.searchParams.get('q') || '';

  let sql = 'SELECT id, body, urgency, category, status, resolution, response, responded_at, created_at, updated_at, resolved_at, auto_resolved FROM customer_concerns WHERE customer_id = ?';
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
  await ensureConcernResponseColumns(env);

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

  // 通知A：全件メール通知（菊地さんへ）
  if (env.RESEND_API_KEY && env.ADMIN_EMAIL) {
    context.waitUntil(notifyNewConcernEmail(env, customerName, email, text.trim(), urgency));
  }

  return json({ id, created_at: now, duplicate_warning: null }, 201);
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

// ─── 通知A：新規投稿メール（菊地さんへ） ─────────────────────────
async function notifyNewConcernEmail(env, customerName, email, body, urgency) {
  try {
    const nameLabel = customerName ? `${customerName}さん（${email}）` : email;
    const urgencyLabel = urgency === 'urgent' ? '⚡ 今すぐ（緊急）' : '通常';
    const preview = body.slice(0, 200) + (body.length > 200 ? '…' : '');
    const res = await sendEmail(env, {
      to: env.ADMIN_EMAIL,
      subject: `【困りごと投稿】${customerName || email}さんから新しい投稿があります`,
      html: `
        <p><strong>${escHtml(nameLabel)}</strong> さんから困りごとが投稿されました。</p>
        <table style="border-collapse:collapse;width:100%;max-width:560px;">
          <tr><td style="padding:6px 10px;font-weight:bold;background:#f5f5f5;border:1px solid #ddd;width:80px;">緊急度</td>
              <td style="padding:6px 10px;border:1px solid #ddd;">${escHtml(urgencyLabel)}</td></tr>
          <tr><td style="padding:6px 10px;font-weight:bold;background:#f5f5f5;border:1px solid #ddd;">投稿内容</td>
              <td style="padding:6px 10px;border:1px solid #ddd;">${escHtml(preview)}</td></tr>
        </table>
        <p style="margin-top:16px;">
          <a href="https://task-manager-a5x.pages.dev/customers"
             style="background:#c9a84c;color:#fff;padding:8px 18px;border-radius:4px;text-decoration:none;font-weight:bold;">
            管理画面で確認する
          </a>
        </p>
      `.trim(),
    });
    // sendEmail は { status, ok, body } を返す
    return { status: res?.status ?? null, body: res?.body ?? null };
  } catch (e) {
    return { status: null, body: e.message };
  }
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
  try {
    const customer = await env.DB.prepare(
      'SELECT id, name FROM customers WHERE email = ?'
    ).bind(email).first();
    if (!customer) return { ok: false, error: '顧問契約者のみご利用いただけます', status: 403 };
    return { ok: true, customerId: customer.id, customerName: customer.name };
  } catch (e) {
    return { ok: false, error: 'データベースエラー', status: 500 };
  }
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

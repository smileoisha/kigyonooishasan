// functions/api/data.js — Cloudflare Pages Function (D1 backend)

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const result = await env.DB.prepare(
      'SELECT value FROM store WHERE key = ?'
    ).bind('main').first();
    const body = result ? result.value : 'null';
    return new Response(body, {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  return handleSave(context);
}

export async function onRequestPut(context) {
  return handleSave(context);
}

async function handleSave(context) {
  const { env, request } = context;
  try {
    const body = await request.text();
    JSON.parse(body); // バリデーション
    const now = new Date().toISOString();
    await env.DB.prepare(
      'INSERT OR REPLACE INTO store (key, value, updated_at) VALUES (?, ?, ?)'
    ).bind('main', body, now).run();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

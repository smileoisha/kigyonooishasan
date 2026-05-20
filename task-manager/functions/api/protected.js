// functions/api/protected.js
// 保護カテゴリ認証 API
//
// POST /api/protected  ?action=setup   初回パスワード設定
// POST /api/protected  ?action=auth    パスワード認証・セッション発行
// GET  /api/protected  ?action=status  セッション有効確認

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (request.method === 'GET' && action === 'status') return handleStatus(env, request, url);
  if (request.method === 'POST' && action === 'setup')  return handleSetup(env, request);
  if (request.method === 'POST' && action === 'auth')   return handleAuth(env, request);
  return json({ error: 'Not found' }, 404);
}

// ─── POST ?action=setup ───────────────────────────────────────
async function handleSetup(env, request) {
  try {
    const existing = await env.DB.prepare('SELECT id FROM protected_settings WHERE id = 1').first();
    if (existing) return json({ error: 'already_initialized' }, 409);

    const { password } = await request.json();
    if (!password || password.length < 6) return json({ error: 'password must be at least 6 characters' }, 400);

    const hash = await hashPassword(password);
    const now  = new Date().toISOString();

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO protected_settings (id, password_hash, session_ttl_min, created_at, updated_at) VALUES (1, ?, 30, ?, ?)'
      ).bind(hash, now, now),
      env.DB.prepare(
        'INSERT OR IGNORE INTO protected_brute (id, fail_count, locked_until) VALUES (1, 0, NULL)'
      ),
    ]);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── POST ?action=auth ────────────────────────────────────────
async function handleAuth(env, request) {
  try {
    const settings = await env.DB.prepare('SELECT * FROM protected_settings WHERE id = 1').first();
    if (!settings) return json({ error: 'not_initialized' }, 400);

    // ブルートフォースチェック
    const brute = await env.DB.prepare('SELECT * FROM protected_brute WHERE id = 1').first();
    const now = new Date();
    if (brute && brute.locked_until) {
      const lockedUntil = new Date(brute.locked_until);
      if (lockedUntil > now) {
        return json({ error: 'locked', locked_until: brute.locked_until }, 429);
      }
    }

    const { password } = await request.json();
    if (!password) return json({ error: 'password required' }, 400);

    const valid = await verifyPassword(password, settings.password_hash);
    const nowIso = now.toISOString();

    if (!valid) {
      const failCount = (brute ? brute.fail_count : 0) + 1;
      const lockedUntil = failCount >= 5
        ? new Date(now.getTime() + 15 * 60 * 1000).toISOString()
        : null;

      await env.DB.prepare(
        'INSERT OR REPLACE INTO protected_brute (id, fail_count, locked_until) VALUES (1, ?, ?)'
      ).bind(failCount, lockedUntil).run();

      if (lockedUntil) {
        return json({ error: 'locked', locked_until: lockedUntil }, 429);
      }
      return json({ error: 'invalid_password' }, 401);
    }

    // 認証成功：失敗カウントリセット
    await env.DB.prepare(
      'INSERT OR REPLACE INTO protected_brute (id, fail_count, locked_until) VALUES (1, 0, NULL)'
    ).run();

    // セッション発行
    const token = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + settings.session_ttl_min * 60 * 1000).toISOString();

    await env.DB.prepare(
      'INSERT INTO protected_sessions (token, expires_at, created_at) VALUES (?, ?, ?)'
    ).bind(token, expiresAt, nowIso).run();

    // 期限切れセッションを非同期でクリーンアップ（レスポンスには影響しない）
    env.DB.prepare("DELETE FROM protected_sessions WHERE expires_at <= datetime('now')").run().catch(() => {});

    return json({ ok: true, token, expires_at: expiresAt });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── GET ?action=status ───────────────────────────────────────
async function handleStatus(env, request, url) {
  try {
    const settings = await env.DB.prepare('SELECT id FROM protected_settings WHERE id = 1').first();
    if (!settings) return json({ ok: false, error: 'not_initialized' });

    const token = url.searchParams.get('_t') || (request.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!token) return json({ ok: false, error: 'no_token' });

    const row = await env.DB.prepare(
      "SELECT token, expires_at FROM protected_sessions WHERE token = ? AND expires_at > datetime('now')"
    ).bind(token).first();

    if (!row) return json({ ok: false, error: 'expired' });
    return json({ ok: true, expires_at: row.expires_at });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── PBKDF2 パスワードハッシュ（Web Crypto API）─────────────
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256
  );
  const combined = new Uint8Array(48);
  combined.set(salt, 0);
  combined.set(new Uint8Array(bits), 16);
  return btoa(String.fromCharCode(...combined));
}

async function verifyPassword(password, storedHash) {
  try {
    const combined = Uint8Array.from(atob(storedHash), c => c.charCodeAt(0));
    const salt     = combined.slice(0, 16);
    const expected = combined.slice(16);
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256
    );
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

// ─── ユーティリティ ──────────────────────────────────────────
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

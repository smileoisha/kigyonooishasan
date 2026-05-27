// functions/lib/email.js — Resend API 経由メール送信共通モジュール

const RESEND_API = 'https://api.resend.com/emails';

/**
 * メール送信
 * @param {object} env  Cloudflare Workers 環境変数
 * @param {string} to   送信先メールアドレス
 * @param {string} subject 件名
 * @param {string} html HTML本文
 */
export async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) return;
  const from = env.EMAIL_FROM || 'noreply@kigyo-no-oishasan.com';
  let res;
  try {
    res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
  } catch (e) {
    console.error(`[email] fetch失敗: ${e.message}`);
    return;
  }
  const resText = await res.text().catch(() => '');
  if (!res.ok) {
    console.error(`[email] 送信失敗 HTTP ${res.status}: ${resText}`);
  }
  return { status: res.status, ok: res.ok, body: resText };
}

/** HTMLエスケープ */
export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

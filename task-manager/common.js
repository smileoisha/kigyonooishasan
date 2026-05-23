// common.js — 全ページ共通ユーティリティ（index / project / gantt / customers / knowledge）

// ─── HTML エスケープ ─────────────────────────────────────────
function escH(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escA(s) { return String(s || '').replace(/"/g,'&quot;'); }

// ─── モーダル制御 ────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ─── API エラー表示（右下固定・3秒で自動消去） ──────────────
function _showApiError(msg) {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;bottom:60px;right:16px;z-index:9999;background:#dc2626;color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.2);';
  div.textContent = '⚠ ' + msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

// ─── 汎用 fetch ラッパー（エラー時は Error をスロー） ──────
async function _taskApi(method, path, body) {
  const opts = { method };
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `${method} ${path} failed: ${res.status}`);
  }
  return res.json();
}

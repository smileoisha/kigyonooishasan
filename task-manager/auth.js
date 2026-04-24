// auth.js — Phase1: ユーザー選択（将来 Google OAuth に差し替え可能）

const AUTH_KEY = 'tm2_currentUser';

function getCurrentUser(data) {
  const id = localStorage.getItem(AUTH_KEY);
  if (id) return data.users.find(u => u.id === id) || null;
  return null;
}

function setCurrentUser(userId) {
  localStorage.setItem(AUTH_KEY, userId);
}

function clearCurrentUser() {
  localStorage.removeItem(AUTH_KEY);
}

// モーダルHTMLを生成して表示。選択後 callback(user) を呼ぶ
function showUserSelectModal(data, callback) {
  const overlay = document.createElement('div');
  overlay.id = 'authOverlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(15,23,42,0.5);backdrop-filter:blur(4px);
    z-index:1000;display:flex;align-items:center;justify-content:center;
  `;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,0.15);
                padding:36px 40px;width:340px;text-align:center;">
      <div style="margin-bottom:8px;">${icon('user',28,'#1E3A5F')}</div>
      <h2 style="font-size:18px;font-weight:700;color:#1E3A5F;margin-bottom:6px;">タスク管理</h2>
      <p style="font-size:13px;color:#64748b;margin-bottom:24px;">ユーザーを選択してください</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${data.users.map(u => `
          <button onclick="selectUser('${u.id}')"
            style="display:flex;align-items:center;gap:14px;padding:14px 18px;
                   border:2px solid #e2e8f0;border-radius:10px;background:#f8fafc;
                   cursor:pointer;font-family:inherit;font-size:15px;font-weight:600;
                   color:#1E3A5F;transition:all .15s;text-align:left;"
            onmouseover="this.style.borderColor='#1E3A5F';this.style.background='#eff6ff'"
            onmouseout="this.style.borderColor='#e2e8f0';this.style.background='#f8fafc'">
            <span style="width:40px;height:40px;border-radius:50%;background:#1E3A5F;
                         color:#D4AF37;font-size:16px;font-weight:700;display:flex;
                         align-items:center;justify-content:center;">${u.avatar}</span>
            ${u.name}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  window._authCallback = callback;
}

function selectUser(userId) {
  setCurrentUser(userId);
  const overlay = document.getElementById('authOverlay');
  if (overlay) overlay.remove();
  const data = loadData();
  const user = data.users.find(u => u.id === userId);
  if (window._authCallback) window._authCallback(user);
}

// 初期化：ユーザーが未選択なら選択モーダルを出す
function initAuth(data, callback) {
  const user = getCurrentUser(data);
  if (user) {
    callback(user);
  } else {
    showUserSelectModal(data, callback);
  }
}

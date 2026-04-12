// data.js — 初期データ定義 & D1 API CRUD

const STORAGE_KEY = 'tm2_data'; // localStorage移行用（残しておく）

const INITIAL_DATA = {
  users: [
    { id: 'u1', name: '院長', avatar: '院' },
    { id: 'u2', name: 'masami', avatar: 'ま' }
  ],
  projects: [
    { id: 'p1', name: '創業準備', color: '#4A90D9', dueDate: '2026-07-31', status: 'active' },
    { id: 'p2', name: '収支ツール作成', color: '#7C3AED', dueDate: null, status: 'active' },
    { id: 'p3', name: '寝る', color: '#D97706', dueDate: null, status: 'active' }
  ],
  tasks: [
    // 創業準備
    { id: 't1', projectId: 'p1', parentId: null, title: '退職意向を伝える', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], children: [], links: [], customerId: null },
    { id: 't2', projectId: 'p1', parentId: null, title: '事業計画の作成', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], children: [], links: [], customerId: null },
    { id: 't3', projectId: 'p1', parentId: null, title: '開業資金の検討', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], children: [], links: [], customerId: null },
    { id: 't4', projectId: 'p1', parentId: null, title: '法人化', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], children: ['t4a'], links: [], customerId: null },
    { id: 't4a', projectId: 'p1', parentId: 't4', title: '社会保険', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], children: [], links: [], customerId: null },
    { id: 't5', projectId: 'p1', parentId: null, title: 'インボイス把握', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], children: [], links: [], customerId: null },
    { id: 't6', projectId: 'p1', parentId: null, title: '契約書の作成', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], children: [], links: [], customerId: null },
    // 収支ツール作成
    { id: 't7', projectId: 'p2', parentId: null, title: '収支ツールの作成', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], children: [], links: [], customerId: null },
    // 寝る
    { id: 't8', projectId: 'p3', parentId: null, title: '寝る', status: 'review', assigneeId: 'u1', dueDate: null, memo: '', tags: [], children: [], links: [], customerId: null }
  ],
  customers: []
};

const STATUSES = {
  pending:    { label: '未着手',   color: '#94a3b8', bg: '#f1f5f9' },
  inProgress: { label: '進行中',   color: '#3b82f6', bg: '#eff6ff' },
  stuck:      { label: 'スタック', color: '#f59e0b', bg: '#fffbeb' },
  review:     { label: '確認待ち', color: '#eab308', bg: '#fefce8' },
  done:       { label: '完了',     color: '#22c55e', bg: '#f0fdf4' }
};

// ─── Storage (D1 API) ──────────────────────────────────
function migrateData(d) {
  d.tasks.forEach(t => {
    if (!t.links) {
      t.links = t.notionUrl ? [{ label: 'Notion', url: t.notionUrl }] : [];
      delete t.notionUrl;
    }
    if (t.customerId === undefined) t.customerId = null;
    if (t.startDate === undefined) t.startDate = null;
    if (!t.workLog) t.workLog = [];
  });
  if (!d.customers)  d.customers  = [];
  if (!d.locations)  d.locations  = [];
  (d.customers || []).forEach(c => {
    if (c.aiProfile === undefined) c.aiProfile = '';
    if (c.aiProfileUpdatedAt === undefined) c.aiProfileUpdatedAt = null;
    (c.meetings || []).forEach(m => {
      if (m.actionPlan === undefined) m.actionPlan = '';
    });
  });
}

// ─── WorkLog helpers ──────────────────────────────────
// タスクの最新workLogエントリを返す
function getLastWorkLog(task) {
  if (!task.workLog || task.workLog.length === 0) return null;
  return task.workLog[task.workLog.length - 1];
}

// タスクが現在作業中（inProgressかつ最新logがstart）かを返す
function isActivelyWorking(task) {
  if (task.status !== 'inProgress') return false;
  const last = getLastWorkLog(task);
  return last && last.action === 'start';
}

// workLogにエントリを追記するヘルパー
function appendWorkLog(task, action, userId, reason) {
  if (!task.workLog) task.workLog = [];
  const entry = { action, userId, at: new Date().toISOString() };
  if (reason) entry.reason = reason;
  task.workLog.push(entry);
}

// 現在作業中のタスク一覧をユーザー別に返す { userId: [task, ...] }
function getActiveTasksByUser() {
  const result = {};
  if (!data) return result;
  data.tasks.forEach(t => {
    if (!isActivelyWorking(t)) return;
    if (!result[t.assigneeId]) result[t.assigneeId] = [];
    result[t.assigneeId].push(t);
  });
  return result;
}

// 作業セッションの経過時間を「Xh Ym」形式で返す
function getElapsedTime(startAt) {
  const diff = Math.floor((Date.now() - new Date(startAt).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

async function loadData() {
  // D1から取得
  try {
    const res = await fetch('/api/data');
    if (res.ok) {
      const d = await res.json();
      if (d) {
        migrateData(d);
        return d;
      }
    }
  } catch(e) { console.warn('D1 load failed, trying localStorage:', e); }

  // フォールバック：localStorageからD1へ移行
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      migrateData(d);
      await saveData(d); // D1へ移行保存
      localStorage.removeItem(STORAGE_KEY);
      console.log('localStorageからD1へ移行完了');
      return d;
    }
  } catch(e) {}

  return JSON.parse(JSON.stringify(INITIAL_DATA));
}

async function saveData(d) {
  const MAX_RETRY = 2;
  for (let i = 0; i <= MAX_RETRY; i++) {
    try {
      const res = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d)
      });
      if (res.ok) return true;
      console.warn(`saveData attempt ${i + 1} failed: ${res.status}`);
    } catch (e) {
      console.warn(`saveData attempt ${i + 1} error:`, e);
    }
  }
  // 全リトライ失敗 → ローカルバックアップ＋ユーザー通知
  try { localStorage.setItem('tm2_backup', JSON.stringify(d)); } catch(e) {}
  showSaveError();
  return false;
}

function showSaveError() {
  const existing = document.getElementById('saveErrorBanner');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'saveErrorBanner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#dc2626;color:#fff;padding:10px 16px;font-size:13px;text-align:center;';
  banner.innerHTML = '⚠️ データの保存に失敗しました。ローカルにバックアップ済みです。ページを再読み込みしてください。<button onclick="this.parentElement.remove()" style="margin-left:12px;background:none;border:1px solid #fff;color:#fff;padding:2px 8px;border-radius:4px;cursor:pointer;">✕</button>';
  document.body.prepend(banner);
}

// ─── ID generator ──────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── Task helpers ──────────────────────────────────────
function getDescendantIds(data, taskId) {
  const task = data.tasks.find(t => t.id === taskId);
  if (!task) return [];
  return task.children.flatMap(cid => [cid, ...getDescendantIds(data, cid)]);
}

function deleteTaskDeep(data, taskId) {
  const ids = [taskId, ...getDescendantIds(data, taskId)];
  data.tasks = data.tasks.filter(t => !ids.includes(t.id));
  data.tasks.forEach(t => { t.children = t.children.filter(c => !ids.includes(c)); });
}

function isOverdue(task) {
  if (!task.dueDate || task.status === 'done') return false;
  const today = new Date(); today.setHours(0,0,0,0);
  return new Date(task.dueDate + 'T00:00:00') < today;
}

function isStuck(task) {
  return task.status === 'stuck';
}

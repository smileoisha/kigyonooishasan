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
    { id: 't1', projectId: 'p1', parentId: null, title: '退職意向を伝える', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], links: [], customerId: null },
    { id: 't2', projectId: 'p1', parentId: null, title: '事業計画の作成', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], links: [], customerId: null },
    { id: 't3', projectId: 'p1', parentId: null, title: '開業資金の検討', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], links: [], customerId: null },
    { id: 't4', projectId: 'p1', parentId: null, title: '法人化', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], links: [], customerId: null },
    { id: 't4a', projectId: 'p1', parentId: 't4', title: '社会保険', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], links: [], customerId: null },
    { id: 't5', projectId: 'p1', parentId: null, title: 'インボイス把握', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], links: [], customerId: null },
    { id: 't6', projectId: 'p1', parentId: null, title: '契約書の作成', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], links: [], customerId: null },
    // 収支ツール作成
    { id: 't7', projectId: 'p2', parentId: null, title: '収支ツールの作成', status: 'pending', assigneeId: 'u1', dueDate: null, memo: '', tags: [], links: [], customerId: null },
    // 寝る
    { id: 't8', projectId: 'p3', parentId: null, title: '寝る', status: 'review', assigneeId: 'u1', dueDate: null, memo: '', tags: [], links: [], customerId: null }
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

// ─── SWR Cache ─────────────────────────────────────────
const SWR_CACHE_KEY = 'tm2_swr_cache';
const SWR_TTL_MS = 20000; // 20秒

function getSWRCache() {
  try {
    const raw = localStorage.getItem(SWR_CACHE_KEY);
    if (!raw) return null;
    const { d, ts } = JSON.parse(raw);
    if (Date.now() - ts > SWR_TTL_MS) return null;
    return d;
  } catch(e) { return null; }
}

function setSWRCache(d) {
  try {
    localStorage.setItem(SWR_CACHE_KEY, JSON.stringify({ d, ts: Date.now() }));
  } catch(e) {}
}

// ─── 保存中インジケータ ─────────────────────────────────────
let _savingCount = 0;
function _showSavingBadge() {
  _savingCount++;
  let el = document.getElementById('_savingBadge');
  if (!el) {
    el = document.createElement('div');
    el.id = '_savingBadge';
    el.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9999;background:rgba(30,58,95,0.85);color:#fff;padding:5px 14px;border-radius:20px;font-size:12px;pointer-events:none;transition:opacity 0.3s;';
    document.body.appendChild(el);
  }
  el.textContent = '保存中…';
  el.style.opacity = '1';
  clearTimeout(el._hideTimer);
}

function _hideSavingBadge(ok) {
  _savingCount = Math.max(0, _savingCount - 1);
  if (_savingCount > 0) return;
  const el = document.getElementById('_savingBadge');
  if (!el) return;
  if (ok) {
    el.textContent = '✓ 保存';
    el._hideTimer = setTimeout(() => { el.style.opacity = '0'; }, 1500);
  }
}

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
    if (!t.notes) t.notes = []; // ノート機能
  });
  if (!d.customers)  d.customers  = [];
  if (!d.locations)  d.locations  = [];
  (d.customers || []).forEach(c => {
    if (c.aiProfile === undefined) c.aiProfile = '';
    if (c.aiProfileUpdatedAt === undefined) c.aiProfileUpdatedAt = null;
    if (c.meetingsUpdatedAt === undefined) c.meetingsUpdatedAt = null;
    // 姓・名フィールド（既存データには空文字で非破壊追加）
    if (c.sei === undefined) c.sei = '';
    if (c.mei === undefined) c.mei = '';
    // 住所フィールド（既存データには空文字で非破壊追加）
    if (c.address === undefined) c.address = '';
    // マスク対象の別名（配偶者名・ハンドルネーム等）
    if (!c.aliases) c.aliases = [];
    (c.meetings || []).forEach(m => {
      if (m.actionPlan    === undefined) m.actionPlan    = '';
      if (m.financialNote === undefined) m.financialNote = '';
      if (!m.issues)      m.issues      = [];
      if (!m.proposals)   m.proposals   = [];
      if (!m.nextActions) m.nextActions = [];
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

async function loadData(opts = {}) {
  // SWRキャッシュ（force: true の場合はスキップ）
  if (!opts.force) {
    const cached = getSWRCache();
    if (cached) {
      migrateData(cached);
      _initSavedSnapshot(cached);
      return cached;
    }
  }
  // D1から取得
  try {
    const res = await fetch('/api/data');
    if (res.ok) {
      const d = await res.json();
      if (d) {
        migrateData(d);
        setSWRCache(d);
        _initSavedSnapshot(d);
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
      await saveData(d); // D1へ移行保存（saveData内でスナップショット更新される）
      localStorage.removeItem(STORAGE_KEY);
      console.log('localStorageからD1へ移行完了');
      return d;
    }
  } catch(e) {}

  return JSON.parse(JSON.stringify(INITIAL_DATA));
}

// ─── 個別リソース API ──────────────────────────────────────────
// キー → エンドポイント URL のマッピング（users は変更対象外）
const _RESOURCE_APIS = {
  tasks:     '/api/tasks',
  customers: '/api/customers',
  projects:  '/api/projects',
  locations: '/api/locations',
  tagMaster: '/api/tag-master',
};

// 最後に正常保存したデータのスナップショット（JSON文字列、null = 未初期化）
let _savedSnapshot = {
  tasks: null, customers: null, projects: null, locations: null, tagMaster: null,
};

// loadData() 完了後にスナップショットを初期化する
function _initSavedSnapshot(d) {
  _savedSnapshot = {
    tasks:     JSON.stringify(d.tasks     ?? []),
    customers: JSON.stringify(d.customers ?? []),
    projects:  JSON.stringify(d.projects  ?? []),
    locations: JSON.stringify(d.locations ?? []),
    tagMaster: JSON.stringify(d.tagMaster ?? {}),
  };
}

// スナップショットと比較して変更されたキーの配列を返す
function _detectChanges(d) {
  return Object.keys(_RESOURCE_APIS).filter(key => {
    const current = JSON.stringify(d[key] ?? (key === 'tagMaster' ? {} : []));
    return _savedSnapshot[key] === null || _savedSnapshot[key] !== current;
  });
}

// 指定キーのスナップショットを現在値で更新する
function _updateSnapshot(d, keys) {
  for (const key of keys) {
    _savedSnapshot[key] = JSON.stringify(d[key] ?? (key === 'tagMaster' ? {} : []));
  }
}

// 単一リソースを対応 API に PUT（最大2回リトライ）
async function _saveResource(key, d, opts) {
  const url = _RESOURCE_APIS[key];
  const body = JSON.stringify({ [key]: d[key] ?? (key === 'tagMaster' ? {} : []) });
  for (let i = 0; i <= 2; i++) {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
        ...(opts.keepalive ? { keepalive: true } : {}),
      });
      if (res.ok) return { ok: true, key };
      console.warn(`[saveData] ${key} attempt ${i + 1} failed: ${res.status}`);
    } catch (e) {
      console.warn(`[saveData] ${key} attempt ${i + 1} error:`, e);
    }
  }
  return { ok: false, key };
}

async function saveData(d, opts = {}) {
  _showSavingBadge();

  const toSave = _detectChanges(d);

  // 変更なし → バッジを消して即終了
  if (toSave.length === 0) {
    _hideSavingBadge(true);
    return true;
  }

  // 変更のあったリソースだけ並列 PUT
  const results = await Promise.all(toSave.map(key => _saveResource(key, d, opts)));
  const succeeded = results.filter(r => r.ok).map(r => r.key);
  const failed    = results.filter(r => !r.ok).map(r => r.key);

  // 成功分のスナップショットを更新（失敗分は次回も再試行対象に残る）
  if (succeeded.length > 0) _updateSnapshot(d, succeeded);

  if (failed.length === 0) {
    setSWRCache(d);
    _hideSavingBadge(true);
    return true;
  }

  console.error('[saveData] failed resources:', failed);
  _hideSavingBadge(false);
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

// ─── Backup ────────────────────────────────────────────
const BACKUP_DATE_KEY = 'tm2_lastBackupDate';

// ページ読み込み時に自動バックアップ（当日未実施なら静かに実行）
async function autoBackupIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(BACKUP_DATE_KEY) === today) return; // 当日済み
  try {
    const res = await fetch('/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'all' })
    });
    if (res.ok) {
      localStorage.setItem(BACKUP_DATE_KEY, today);
      updateBackupIndicator('ok', today);
    } else {
      updateBackupIndicator('warn', null);
    }
  } catch (e) {
    console.warn('[Backup] 自動バックアップ失敗:', e);
    updateBackupIndicator('warn', null);
  }
}

// 手動バックアップ（バックアップボタンから呼ぶ）
async function manualBackup() {
  const btn = document.getElementById('backupBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = icon('loader', 14, 'currentColor'); }
  try {
    const res = await fetch('/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'all' })
    });
    const result = await res.json();
    const today = new Date().toISOString().slice(0, 10);
    if (result.ok) {
      localStorage.setItem(BACKUP_DATE_KEY, today);
      updateBackupIndicator('ok', today);
      const msgs = [];
      if (result.results?.r2?.ok)     msgs.push('R2 ✓');
      if (result.results?.gdrive?.ok) msgs.push('Google Drive ✓');
      if (result.results?.gdrive && !result.results.gdrive.ok) msgs.push('Google Drive: 未設定');
      alert('バックアップ完了\n' + msgs.join('\n'));
    } else {
      alert('バックアップに失敗しました: ' + (result.error || '不明なエラー'));
      updateBackupIndicator('warn', null);
    }
  } catch (e) {
    alert('バックアップに失敗しました: ' + e.message);
    updateBackupIndicator('warn', null);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = icon('save', 14, 'currentColor'); }
  }
}

// データをJSONファイルとしてデバイスに保存（手動保存用）
function exportDataToFile() {
  if (!data) { alert('データが読み込まれていません'); return; }
  const dataStr = JSON.stringify(data, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `task-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ヘッダーのバックアップインジケータを更新
function updateBackupIndicator(state, date) {
  const btn = document.getElementById('backupBtn');
  if (!btn) return;
  if (state === 'ok') {
    btn.title = `最終バックアップ: ${date}`;
    btn.classList.remove('backup-warn');
    btn.classList.add('backup-ok');
  } else {
    btn.title = 'バックアップ未実施（クリックして実行）';
    btn.classList.remove('backup-ok');
    btn.classList.add('backup-warn');
  }
}

// バックアップ状態を起動時に反映
function initBackupIndicator() {
  const today = new Date().toISOString().slice(0, 10);
  const last = localStorage.getItem(BACKUP_DATE_KEY);
  updateBackupIndicator(last === today ? 'ok' : 'warn', last);
}

// ─── ID generator ──────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── Task helpers ──────────────────────────────────────
function getDescendantIds(data, taskId) {
  const children = data.tasks.filter(t => t.parentId === taskId);
  return children.flatMap(c => [c.id, ...getDescendantIds(data, c.id)]);
}

function deleteTaskDeep(data, taskId) {
  const ids = new Set([taskId, ...getDescendantIds(data, taskId)]);
  data.tasks = data.tasks.filter(t => !ids.has(t.id));
}

function isOverdue(task) {
  if (!task.dueDate || task.status === 'done') return false;
  const today = new Date(); today.setHours(0,0,0,0);
  return new Date(task.dueDate + 'T00:00:00') < today;
}

function isStuck(task) {
  return task.status === 'stuck';
}

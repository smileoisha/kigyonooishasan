#!/usr/bin/env node
// scripts/migrate-local.js
// store JSON → 新リレーショナルテーブルへのマイグレーション
// 実行: node scripts/migrate-local.js
// 前提: task-manager ディレクトリから実行、wrangler 認証済み

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DB = 'task-manager-db';
const BATCH = 40; // SQL文をまとめて実行する件数

// ─── D1 クエリ実行（SQL ファイル経由） ──────────────────────────
function execSqlFile(sqlPath) {
  try {
    execSync(
      `npx wrangler d1 execute ${DB} --remote --file="${sqlPath}"`,
      { stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 }
    );
  } catch (e) {
    throw new Error(`SQL実行エラー: ${e.stderr || e.message}`);
  }
}

// 一時 SQL ファイルを作成して実行
function runSqlBatch(statements) {
  if (statements.length === 0) return;
  const tmp = path.join(os.tmpdir(), `migrate_${Date.now()}.sql`);
  fs.writeFileSync(tmp, statements.join(';\n') + ';', 'utf8');
  try {
    execSqlFile(tmp);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// SQL エスケープ（シングルクォートを二重化）
function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function j(arr) { return esc(JSON.stringify(arr ?? [])); }

// ─── store JSON を取得 ────────────────────────────────────────
console.log('store JSON を取得中...');
let storeJson;
try {
  const out = execSync(
    `npx wrangler d1 execute ${DB} --remote --command "SELECT value FROM store WHERE key = 'main'" --json`,
    { maxBuffer: 50 * 1024 * 1024 }
  ).toString();
  const rows = JSON.parse(out);
  storeJson = rows[0]?.results?.[0]?.value;
} catch (e) {
  console.error('store 取得失敗:', e.message);
  process.exit(1);
}

if (!storeJson) {
  console.error('store データが見つかりません');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(storeJson);
} catch (e) {
  console.error('JSON パース失敗:', e.message);
  process.exit(1);
}

console.log(`取得完了: tasks=${data.tasks?.length}, customers=${data.customers?.length}, projects=${data.projects?.length}`);

const now = new Date().toISOString();

// ─── 1. 既存データ削除（依存順） ─────────────────────────────
console.log('既存データを削除中...');
runSqlBatch([
  'DELETE FROM task_work_logs',
  'DELETE FROM task_links',
  'DELETE FROM task_notes',
  'DELETE FROM tasks',
  'DELETE FROM customer_meetings',
  'DELETE FROM customers',
  'DELETE FROM projects',
  'DELETE FROM users',
  'DELETE FROM locations',
  'DELETE FROM tag_master',
]);
console.log('削除完了');

// ─── 2. projects ─────────────────────────────────────────────
const projects = data.projects || [];
console.log(`projects ${projects.length}件を挿入中...`);
for (let i = 0; i < projects.length; i += BATCH) {
  runSqlBatch(projects.slice(i, i + BATCH).map(p =>
    `INSERT OR REPLACE INTO projects (id,name,color,due_date,status) VALUES (${esc(p.id)},${esc(p.name)},${esc(p.color)},${esc(p.dueDate)},${esc(p.status ?? 'active')})`
  ));
}

// ─── 3. users ────────────────────────────────────────────────
const users = data.users || [];
console.log(`users ${users.length}件を挿入中...`);
for (let i = 0; i < users.length; i += BATCH) {
  runSqlBatch(users.slice(i, i + BATCH).map(u =>
    `INSERT OR REPLACE INTO users (id,name,avatar) VALUES (${esc(u.id)},${esc(u.name)},${esc(u.avatar)})`
  ));
}

// ─── 4. locations ────────────────────────────────────────────
const locations = data.locations || [];
console.log(`locations ${locations.length}件を挿入中...`);
for (let i = 0; i < locations.length; i += BATCH) {
  runSqlBatch(locations.slice(i, i + BATCH).map(l =>
    `INSERT OR REPLACE INTO locations (id,label,start_date,end_date,color) VALUES (${esc(l.id)},${esc(l.label ?? l.name)},${esc(l.startDate ?? l.start_date)},${esc(l.endDate ?? l.end_date)},${esc(l.color)})`
  ));
}

// ─── 5. tag_master ───────────────────────────────────────────
const tagEntries = Object.entries(data.tagMaster || {});
console.log(`tag_master ${tagEntries.length}件を挿入中...`);
for (let i = 0; i < tagEntries.length; i += BATCH) {
  runSqlBatch(tagEntries.slice(i, i + BATCH).map(([k, v]) =>
    `INSERT OR REPLACE INTO tag_master (key,value) VALUES (${esc(k)},${esc(v)})`
  ));
}

// ─── 6. customers ────────────────────────────────────────────
const customers = data.customers || [];
console.log(`customers ${customers.length}件を挿入中...`);
for (let i = 0; i < customers.length; i += BATCH) {
  runSqlBatch(customers.slice(i, i + BATCH).map(c =>
    `INSERT OR REPLACE INTO customers (id,name,sei,mei,aliases,email,phone,company,industry,business_type,contract_status,plan,address,memo,ai_profile,ai_profile_updated_at,meetings_updated_at,created_at,updated_at) VALUES (${esc(c.id)},${esc(c.name)},${esc(c.sei)},${esc(c.mei)},${j(c.aliases)},${esc(c.email)},${esc(c.phone)},${esc(c.company)},${esc(c.industry)},${esc(c.businessType)},${esc(c.contractStatus)},${esc(c.plan)},${esc(c.address)},${esc(c.memo)},${esc(c.aiProfile)},${esc(c.aiProfileUpdatedAt)},${esc(c.meetingsUpdatedAt)},${esc(c.createdAt ?? now)},${esc(c.updatedAt ?? now)})`
  ));
}

// ─── 7. customer_meetings ────────────────────────────────────
const allMeetings = customers.flatMap(c => (c.meetings || []).map(m => ({ ...m, _customerId: c.id })));
console.log(`customer_meetings ${allMeetings.length}件を挿入中...`);
for (let i = 0; i < allMeetings.length; i += BATCH) {
  runSqlBatch(allMeetings.slice(i, i + BATCH).map(m =>
    `INSERT OR REPLACE INTO customer_meetings (id,customer_id,date,conclusion,process,content,ai_summary,financial_note,action_plan,issues,proposals,next_actions,tags,updated_at) VALUES (${esc(m.id)},${esc(m._customerId)},${esc(m.date)},${esc(m.conclusion)},${esc(m.process)},${esc(m.content)},${esc(m.aiSummary)},${esc(m.financialNote)},${esc(m.actionPlan)},${j(m.issues)},${j(m.proposals)},${j(m.nextActions)},${j(m.tags)},${esc(m.updatedAt ?? now)})`
  ));
}

// ─── 8. tasks ────────────────────────────────────────────────
const tasks = data.tasks || [];
console.log(`tasks ${tasks.length}件を挿入中...`);
for (let i = 0; i < tasks.length; i += BATCH) {
  runSqlBatch(tasks.slice(i, i + BATCH).map(t =>
    `INSERT OR REPLACE INTO tasks (id,project_id,parent_id,title,status,assignee_id,start_date,due_date,memo,tags,children,customer_id,created_at,updated_at) VALUES (${esc(t.id)},${esc(t.projectId)},${esc(t.parentId)},${esc(t.title)},${esc(t.status ?? 'pending')},${esc(t.assigneeId)},${esc(t.startDate)},${esc(t.dueDate)},${esc(t.memo)},${j(t.tags)},${j(t.children)},${esc(t.customerId)},${esc(t.createdAt ?? now)},${esc(t.updatedAt ?? now)})`
  ));
}

// ─── 9. task_notes ───────────────────────────────────────────
const allNotes = tasks.flatMap(t => (t.notes || []).map(n => ({ ...n, _taskId: t.id })));
console.log(`task_notes ${allNotes.length}件を挿入中...`);
for (let i = 0; i < allNotes.length; i += BATCH) {
  runSqlBatch(allNotes.slice(i, i + BATCH).map(n =>
    `INSERT OR REPLACE INTO task_notes (id,task_id,content,created_at,updated_at) VALUES (${esc(n.id)},${esc(n._taskId)},${esc(n.content)},${esc(n.at ?? now)},${esc(n.updatedAt ?? n.at ?? now)})`
  ));
}

// ─── 10. task_links ──────────────────────────────────────────
const allLinks = tasks.flatMap(t => (t.links || []).map(l => ({ ...l, _taskId: t.id })));
console.log(`task_links ${allLinks.length}件を挿入中...`);
for (let i = 0; i < allLinks.length; i += BATCH) {
  runSqlBatch(allLinks.slice(i, i + BATCH).map(l =>
    `INSERT OR REPLACE INTO task_links (id,task_id,label,url,type,file_type,created_at) VALUES (${esc(l.id)},${esc(l._taskId)},${esc(l.label)},${esc(l.url)},${esc(l.type)},${esc(l.fileType)},${esc(l.createdAt ?? now)})`
  ));
}

// ─── 11. task_work_logs ──────────────────────────────────────
const allLogs = tasks.flatMap(t => (t.workLog || []).map(w => ({ ...w, _taskId: t.id })));
console.log(`task_work_logs ${allLogs.length}件を挿入中...`);
for (let i = 0; i < allLogs.length; i += BATCH) {
  runSqlBatch(allLogs.slice(i, i + BATCH).map(w =>
    `INSERT INTO task_work_logs (task_id,action,user_id,at,reason) VALUES (${esc(w._taskId)},${esc(w.action)},${esc(w.userId)},${esc(w.at ?? now)},${esc(w.reason)})`
  ));
}

// ─── 完了確認 ────────────────────────────────────────────────
console.log('\n=== マイグレーション完了 ===');
const counts = execSync(
  `npx wrangler d1 execute ${DB} --remote --command "SELECT 'tasks' as tbl, count(*) as n FROM tasks UNION ALL SELECT 'customers', count(*) FROM customers UNION ALL SELECT 'customer_meetings', count(*) FROM customer_meetings UNION ALL SELECT 'task_notes', count(*) FROM task_notes UNION ALL SELECT 'projects', count(*) FROM projects" --json`,
  { maxBuffer: 5 * 1024 * 1024 }
).toString();
const rows = JSON.parse(counts)[0]?.results || [];
rows.forEach(r => console.log(`  ${r.tbl}: ${r.n}件`));

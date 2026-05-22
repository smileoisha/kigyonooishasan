// functions/api/tasks.js
// GET /api/tasks — タスク一覧取得
// PUT /api/tasks — タスク全量保存 + task_note ナレッジ差分同期

export async function onRequestGet(context) {
  const { env } = context;
  try {
    return json({ tasks: await loadTasks(env.DB) });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPut(context) {
  const { env, request } = context;
  try {
    const body = await request.json();
    const tasks = body.tasks ?? [];
    const now = new Date().toISOString();
    await saveTasks(env.DB, tasks, now);
    try { await syncTaskNoteKnowledge(env.DB, tasks, now); } catch (e) { console.error('[knowledge sync]', e.message); }
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── ロード ───────────────────────────────────────────────────────

async function loadTasks(db) {
  const [tasksR, notesR, linksR, logsR] = await db.batch([
    db.prepare('SELECT * FROM tasks ORDER BY created_at'),
    db.prepare('SELECT * FROM task_notes ORDER BY created_at'),
    db.prepare('SELECT * FROM task_links ORDER BY created_at'),
    db.prepare('SELECT * FROM task_work_logs ORDER BY at'),
  ]);

  const notesByTask = {}, linksByTask = {}, logsByTask = {};
  for (const n of (notesR.results || [])) {
    (notesByTask[n.task_id] ||= []).push({ id: n.id, content: n.content, at: n.created_at, updatedAt: n.updated_at });
  }
  for (const l of (linksR.results || [])) {
    (linksByTask[l.task_id] ||= []).push({ id: l.id, label: l.label, url: l.url, type: l.type, fileType: l.file_type });
  }
  for (const w of (logsR.results || [])) {
    (logsByTask[w.task_id] ||= []).push({ action: w.action, userId: w.user_id, at: w.at, reason: w.reason });
  }

  return (tasksR.results || []).map(t => ({
    id: t.id, projectId: t.project_id, parentId: t.parent_id,
    title: t.title, status: t.status, assigneeId: t.assignee_id,
    startDate: t.start_date, dueDate: t.due_date, memo: t.memo || '',
    tags: parseJSON(t.tags, []),
    customerId: t.customer_id,
    notes:   notesByTask[t.id] || [],
    links:   linksByTask[t.id] || [],
    workLog: logsByTask[t.id]  || [],
    createdAt: t.created_at, updatedAt: t.updated_at,
  }));
}

// ─── 保存（全削除→全挿入） ────────────────────────────────────────

async function saveTasks(db, tasks, now) {
  await db.batch([
    db.prepare('DELETE FROM task_work_logs'),
    db.prepare('DELETE FROM task_links'),
    db.prepare('DELETE FROM task_notes'),
    db.prepare('DELETE FROM tasks'),
  ]);

  await batchInsert(db, tasks.map(t => db.prepare(
    'INSERT OR REPLACE INTO tasks (id, project_id, parent_id, title, status, assignee_id, start_date, due_date, memo, tags, customer_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    t.id, t.projectId ?? null, t.parentId ?? null, t.title,
    t.status ?? 'pending', t.assigneeId ?? null,
    t.startDate ?? null, t.dueDate ?? null, t.memo ?? null,
    JSON.stringify(t.tags ?? []),
    t.customerId ?? null,
    t.createdAt ?? now, t.updatedAt ?? now
  )));

  await batchInsert(db, tasks.flatMap(t =>
    (t.notes ?? []).map(n => db.prepare(
      'INSERT OR REPLACE INTO task_notes (id, task_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(n.id, t.id, n.content ?? '', n.at ?? now, n.updatedAt ?? n.at ?? now))
  ));

  await batchInsert(db, tasks.flatMap(t =>
    (t.links ?? []).map(l => db.prepare(
      'INSERT OR REPLACE INTO task_links (id, task_id, label, url, type, file_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(l.id, t.id, l.label ?? '', l.url, l.type ?? null, l.fileType ?? null, l.createdAt ?? now))
  ));

  await batchInsert(db, tasks.flatMap(t =>
    (t.workLog ?? []).map(w => db.prepare(
      'INSERT INTO task_work_logs (task_id, action, user_id, at, reason) VALUES (?, ?, ?, ?, ?)'
    ).bind(t.id, w.action, w.userId ?? null, w.at ?? now, w.reason ?? null))
  ));
}

// ─── task_note ナレッジ差分同期 ───────────────────────────────────

async function syncTaskNoteKnowledge(db, tasks, now) {
  const entries = [];
  for (const task of tasks) {
    for (const note of (task.notes || [])) {
      if (!note.content?.trim()) continue;
      entries.push({
        id:          `task_note_${note.id}`,
        source_type: 'task_note',
        source_id:   note.id,
        title:       (task.title || '').slice(0, 200),
        body:        note.content.slice(0, 5000),
        tags:        JSON.stringify(task.tags || []),
        customer_id: task.customerId || null,
        created_at:  toISO(note.at) || now,
        updated_at:  toISO(note.updatedAt) || toISO(note.at) || now,
      });
    }
  }

  const entryMap = new Map(entries.map(e => [e.id, e]));

  const existing = await db.prepare(
    "SELECT id, updated_at FROM knowledge WHERE source_type = 'task_note'"
  ).all();
  const existingMap = new Map((existing.results || []).map(r => [r.id, r.updated_at]));

  const toUpsert = [...entryMap.values()].filter(e => existingMap.get(e.id) !== e.updated_at);
  const toDelete = [...existingMap.keys()].filter(id => !entryMap.has(id));

  for (let i = 0; i < toUpsert.length; i += 50) {
    await db.batch(toUpsert.slice(i, i + 50).map(e =>
      db.prepare(
        'INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, tags, customer_id, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(e.id, e.source_type, e.source_id, e.title, e.body, e.tags, e.customer_id, 'normal', e.created_at, e.updated_at)
    ));
  }

  for (let i = 0; i < toDelete.length; i += 50) {
    await db.batch(toDelete.slice(i, i + 50).map(id =>
      db.prepare("DELETE FROM knowledge WHERE id = ? AND source_type = 'task_note'").bind(id)
    ));
  }
}

// ─── ユーティリティ ───────────────────────────────────────────────

async function batchInsert(db, stmts) {
  if (!stmts.length) return;
  for (let i = 0; i < stmts.length; i += 50) {
    await db.batch(stmts.slice(i, i + 50));
  }
}

function parseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function toISO(val) {
  if (!val) return null;
  if (typeof val === 'number') return new Date(val).toISOString();
  if (typeof val === 'string' && /^\d{10,13}$/.test(val)) return new Date(Number(val)).toISOString();
  return val;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// functions/api/tasks.js
// GET /api/tasks — タスク一覧取得
// POST /api/tasks — タスク新規作成

export async function onRequestGet(context) {
  const { env } = context;
  try {
    return json({ tasks: await loadTasks(env.DB) });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const now = new Date().toISOString();
    const t = await request.json();

    await env.DB.prepare(
      'INSERT INTO tasks (id, project_id, parent_id, title, status, assignee_id, start_date, due_date, memo, tags, customer_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      t.id, t.projectId ?? null, t.parentId ?? null, t.title,
      t.status ?? 'pending', t.assigneeId ?? null,
      t.startDate ?? null, t.dueDate ?? null, t.memo ?? '',
      JSON.stringify(t.tags ?? []), t.customerId ?? null,
      t.createdAt ?? now, t.updatedAt ?? now
    ).run();

    if (t.notes?.length) {
      await batchInsert(env.DB, t.notes.map(n => env.DB.prepare(
        'INSERT OR REPLACE INTO task_notes (id, task_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(n.id, t.id, n.content ?? '', n.at ?? now, n.updatedAt ?? n.at ?? now)));
    }
    if (t.links?.length) {
      await batchInsert(env.DB, t.links.map(l => env.DB.prepare(
        'INSERT OR REPLACE INTO task_links (id, task_id, label, url, type, file_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(l.id ?? null, t.id, l.label ?? '', l.url, l.type ?? null, l.fileType ?? null, l.createdAt ?? now)));
    }
    if (t.workLog?.length) {
      await batchInsert(env.DB, t.workLog.map(w => env.DB.prepare(
        'INSERT INTO task_work_logs (task_id, action, user_id, at, reason) VALUES (?, ?, ?, ?, ?)'
      ).bind(t.id, w.action, w.userId ?? null, w.at ?? now, w.reason ?? null)));
    }

    return json({ ok: true, id: t.id });
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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

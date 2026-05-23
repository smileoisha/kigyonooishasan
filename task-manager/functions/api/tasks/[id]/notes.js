// functions/api/tasks/[id]/notes.js
// POST /api/tasks/:id/notes — ノート追加 + knowledge 自動同期

export async function onRequestPost(context) {
  const { env, request, params } = context;
  const taskId = params.id;
  try {
    const now = new Date().toISOString();
    const note = await request.json();

    if (!note.id) return json({ error: 'note.id is required' }, 400);

    await env.DB.prepare(
      'INSERT OR REPLACE INTO task_notes (id, task_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(note.id, taskId, note.content ?? '', note.at ?? now, note.updatedAt ?? now).run();

    // knowledge 自動同期（内容があるときのみ）
    if (note.content?.trim()) {
      const task = await env.DB.prepare(
        'SELECT title, tags, customer_id FROM tasks WHERE id = ?'
      ).bind(taskId).first();
      if (task) {
        await env.DB.prepare(
          'INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, tags, customer_id, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          `task_note_${note.id}`, 'task_note', note.id,
          (task.title || '').slice(0, 200),
          note.content.slice(0, 5000),
          task.tags || '[]', task.customer_id || null, 'normal',
          note.at ?? now, note.updatedAt ?? now
        ).run();
      }
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

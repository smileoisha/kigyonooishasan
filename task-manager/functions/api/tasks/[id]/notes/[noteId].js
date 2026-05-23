// functions/api/tasks/[id]/notes/[noteId].js
// PATCH /api/tasks/:id/notes/:noteId — ノート編集 + knowledge 自動同期
// DELETE /api/tasks/:id/notes/:noteId — ノート削除 + knowledge エントリ削除

export async function onRequestPatch(context) {
  const { env, request, params } = context;
  const { id: taskId, noteId } = params;
  try {
    const now = new Date().toISOString();
    const fields = await request.json();

    await env.DB.prepare(
      'UPDATE task_notes SET content = ?, updated_at = ? WHERE id = ? AND task_id = ?'
    ).bind(fields.content ?? '', fields.updatedAt ?? now, noteId, taskId).run();

    // knowledge 自動同期
    if (fields.content?.trim()) {
      const task = await env.DB.prepare(
        'SELECT title, tags, customer_id FROM tasks WHERE id = ?'
      ).bind(taskId).first();
      if (task) {
        await env.DB.prepare(
          'INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, tags, customer_id, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          `task_note_${noteId}`, 'task_note', noteId,
          (task.title || '').slice(0, 200),
          fields.content.slice(0, 5000),
          task.tags || '[]', task.customer_id || null, 'normal',
          fields.createdAt ?? now, fields.updatedAt ?? now
        ).run();
      }
    } else {
      // 内容が空になった場合は knowledge から削除
      await env.DB.prepare(
        "DELETE FROM knowledge WHERE id = ? AND source_type = 'task_note'"
      ).bind(`task_note_${noteId}`).run();
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const { id: taskId, noteId } = params;
  try {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM task_notes WHERE id = ? AND task_id = ?').bind(noteId, taskId),
      env.DB.prepare("DELETE FROM knowledge WHERE id = ? AND source_type = 'task_note'").bind(`task_note_${noteId}`),
    ]);
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

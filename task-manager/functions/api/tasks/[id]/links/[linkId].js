// functions/api/tasks/[id]/links/[linkId].js
// DELETE /api/tasks/:id/links/:linkId — リンク削除

export async function onRequestDelete(context) {
  const { env, params } = context;
  const { id: taskId, linkId } = params;
  try {
    await env.DB.prepare(
      'DELETE FROM task_links WHERE id = ? AND task_id = ?'
    ).bind(linkId, taskId).run();
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

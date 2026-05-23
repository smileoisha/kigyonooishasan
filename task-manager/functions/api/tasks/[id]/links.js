// functions/api/tasks/[id]/links.js
// POST /api/tasks/:id/links — リンク追加

export async function onRequestPost(context) {
  const { env, request, params } = context;
  const taskId = params.id;
  try {
    const now = new Date().toISOString();
    const link = await request.json();

    if (!link.id) return json({ error: 'link.id is required' }, 400);

    await env.DB.prepare(
      'INSERT INTO task_links (id, task_id, label, url, type, file_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      link.id, taskId, link.label ?? '', link.url,
      link.type ?? null, link.fileType ?? null, now
    ).run();

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

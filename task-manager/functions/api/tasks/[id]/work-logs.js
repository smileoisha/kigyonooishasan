// functions/api/tasks/[id]/work-logs.js
// POST /api/tasks/:id/work-logs — 作業ログ追記（append-only）

export async function onRequestPost(context) {
  const { env, request, params } = context;
  const taskId = params.id;
  try {
    const now = new Date().toISOString();
    const entry = await request.json();

    await env.DB.prepare(
      'INSERT INTO task_work_logs (task_id, action, user_id, at, reason) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      taskId,
      entry.action,
      entry.userId ?? null,
      entry.at ?? now,
      entry.reason ?? null
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

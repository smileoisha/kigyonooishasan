// functions/api/projects.js
// GET /api/projects — プロジェクト一覧取得
// POST /api/projects — プロジェクト新規作成

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const p = await request.json();
    await env.DB.prepare(
      'INSERT INTO projects (id, name, color, due_date, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(p.id, p.name, p.color ?? null, p.dueDate ?? null, p.status ?? 'active').run();
    return json({ ok: true, id: p.id });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const result = await env.DB.prepare('SELECT * FROM projects').all();
    const projects = (result.results || []).map(p => ({
      id: p.id, name: p.name, color: p.color, dueDate: p.due_date, status: p.status,
    }));
    return json({ projects });
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

// functions/api/projects.js
// GET /api/projects — プロジェクト一覧取得
// POST /api/projects — プロジェクト新規作成
// PUT /api/projects — プロジェクト全量保存（旧方式・Phase 3 廃止予定）

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

export async function onRequestPut(context) {
  const { env, request } = context;
  try {
    const body = await request.json();
    const projects = body.projects ?? [];

    await env.DB.prepare('DELETE FROM projects').run();

    if (projects.length > 0) {
      const stmts = projects.map(p => env.DB.prepare(
        'INSERT OR REPLACE INTO projects (id, name, color, due_date, status) VALUES (?, ?, ?, ?, ?)'
      ).bind(p.id, p.name, p.color ?? null, p.dueDate ?? null, p.status ?? 'active'));

      for (let i = 0; i < stmts.length; i += 50) {
        await env.DB.batch(stmts.slice(i, i + 50));
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

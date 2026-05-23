// functions/api/projects/[id].js
// PATCH /api/projects/:id — 個別フィールド更新
// DELETE /api/projects/:id — プロジェクト削除（関連タスクの project_id を NULL に）

const ALLOWED = ['name', 'color', 'dueDate', 'status'];
const COL_MAP = { dueDate: 'due_date' };

export async function onRequestPatch(context) {
  const { env, request, params } = context;
  const projectId = params.id;
  try {
    const body = await request.json();
    const sets = [];
    const vals = [];
    for (const key of ALLOWED) {
      if (!(key in body)) continue;
      const col = COL_MAP[key] ?? key;
      sets.push(`${col} = ?`);
      vals.push(body[key]);
    }
    if (!sets.length) return json({ ok: true });
    vals.push(projectId);
    await env.DB.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const projectId = params.id;
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE tasks SET project_id = NULL WHERE project_id = ?').bind(projectId),
      env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(projectId),
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

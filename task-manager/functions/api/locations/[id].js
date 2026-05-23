// functions/api/locations/[id].js
// PATCH  /api/locations/:id — 場所個別更新
// DELETE /api/locations/:id — 場所削除

const ALLOWED = ['label', 'startDate', 'endDate', 'color'];
const COL_MAP  = { startDate: 'start_date', endDate: 'end_date' };

export async function onRequestPatch(context) {
  const { env, request, params } = context;
  const locId = params.id;
  try {
    const fields = await request.json();
    const sets = [], vals = [];
    for (const key of ALLOWED) {
      if (!(key in fields)) continue;
      sets.push(`${COL_MAP[key] ?? key} = ?`);
      vals.push(fields[key] ?? null);
    }
    if (!sets.length) return json({ ok: true });
    vals.push(locId);
    await env.DB.prepare(
      `UPDATE locations SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...vals).run();
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const locId = params.id;
  try {
    await env.DB.prepare('DELETE FROM locations WHERE id = ?').bind(locId).run();
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

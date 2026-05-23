// functions/api/locations.js
// GET /api/locations  — 場所一覧取得
// POST /api/locations — 場所新規作成
// PUT /api/locations  — 場所全量保存（旧API・互換維持）

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const result = await env.DB.prepare('SELECT * FROM locations').all();
    const locations = (result.results || []).map(l => ({
      id: l.id, label: l.label, startDate: l.start_date, endDate: l.end_date, color: l.color,
    }));
    return json({ locations });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const l = await request.json();
    await env.DB.prepare(
      'INSERT OR REPLACE INTO locations (id, label, start_date, end_date, color) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      l.id, l.label ?? '',
      l.startDate ?? null, l.endDate ?? null, l.color ?? null
    ).run();
    return json({ ok: true, id: l.id });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPut(context) {
  const { env, request } = context;
  try {
    const body = await request.json();
    const locations = body.locations ?? [];

    await env.DB.prepare('DELETE FROM locations').run();

    if (locations.length > 0) {
      const stmts = locations.map(l => env.DB.prepare(
        'INSERT OR REPLACE INTO locations (id, label, start_date, end_date, color) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        l.id, l.label ?? l.name ?? '',
        l.startDate ?? l.start_date ?? null,
        l.endDate   ?? l.end_date   ?? null,
        l.color ?? null
      ));

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

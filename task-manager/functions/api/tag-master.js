// functions/api/tag-master.js
// GET /api/tag-master — タグマスター取得
// PUT /api/tag-master — タグマスター全量保存

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const result = await env.DB.prepare('SELECT key, value FROM tag_master').all();
    const tagMaster = {};
    for (const r of (result.results || [])) {
      try { tagMaster[r.key] = JSON.parse(r.value); }
      catch { tagMaster[r.key] = r.value ? r.value.split(',').map(s => s.trim()).filter(Boolean) : []; }
    }
    return json({ tagMaster });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPut(context) {
  const { env, request } = context;
  try {
    const body = await request.json();
    const tagMaster = body.tagMaster ?? {};

    await env.DB.prepare('DELETE FROM tag_master').run();

    const entries = Object.entries(tagMaster);
    if (entries.length > 0) {
      const stmts = entries.map(([key, value]) => env.DB.prepare(
        'INSERT OR REPLACE INTO tag_master (key, value) VALUES (?, ?)'
      ).bind(key, JSON.stringify(Array.isArray(value) ? value : [])));

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

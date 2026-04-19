// functions/api/knowledge/history.js
// GET /api/knowledge/history?id=<knowledge_id>
// → 該当エントリの編集履歴を最大20件返す（新しい順）

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const knowledgeId = url.searchParams.get('id');

  if (!knowledgeId) return json({ error: 'id required' }, 400);

  try {
    const result = await env.DB.prepare(
      'SELECT id, knowledge_id, title, body, tags, saved_at FROM knowledge_history WHERE knowledge_id = ? ORDER BY saved_at DESC LIMIT 20'
    ).bind(knowledgeId).all();

    return json({ ok: true, history: result.results || [] });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

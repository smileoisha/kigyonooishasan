// functions/api/ai-search.js
// ナレッジ横断AI検索
// POST /api/ai-search  { question: "..." }
// → SSEストリーム（Anthropic形式 + 末尾に sources イベント）

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

  let question = '';
  try {
    const body = await request.json();
    question = (body.question || '').trim();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!question) return json({ error: 'question required' }, 400);

  // ─── キーワード検索（最大5語） ─────────────────────────
  const keywords = question.split(/[\s　]+/).filter(Boolean).slice(0, 5);
  let entries = [];
  if (keywords.length > 0) {
    try {
      const conds = keywords.map(() => '(title LIKE ? OR body LIKE ?)').join(' OR ');
      const params = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);
      const result = await env.DB.prepare(
        `SELECT id, source_type, title, body FROM knowledge WHERE ${conds} ORDER BY sort_order ASC, updated_at DESC LIMIT 20`
      ).bind(...params).all();
      entries = result.results || [];
    } catch {}
  }

  // ─── コンテキスト構築 ────────────────────────────────────
  const contextText = entries.map(e => {
    const typeLabel = e.source_type === 'manual' ? 'ナレッジ'
      : e.source_type === 'task_note' ? 'タスクメモ' : '面談記録';
    const bodyPlain = (e.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500);
    return `【${typeLabel}：${e.title}】\n${bodyPlain}`;
  }).join('\n\n---\n\n');

  const systemPrompt = `あなたは「企業のお医者さん」の経営支援AIアシスタントです。以下のナレッジベース（業務記録・メモ・面談記録）を参照して質問に答えてください。

${contextText
  ? `【参照ナレッジ】\n${contextText}`
  : '（関連するナレッジが見つかりませんでした。一般的な知識で回答してください）'}

---
回答ルール:
- 参照した情報はエントリ名を【】で明示する
- 情報がない場合は「該当する記録がありません」と正直に答える
- 結論 → 根拠 → 次の一手 の順で簡潔に
- 日本語で回答`;

  // ─── Anthropic API呼び出し（SSEストリーム） ────────────
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: question }],
      stream: true
    })
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return json({ error: `Anthropic API error: ${anthropicRes.status} ${errText.slice(0, 200)}` }, 500);
  }

  // ─── ストリームをプロキシ + 末尾にsourcesイベント追加 ──
  const sources = entries.map(e => ({ id: e.id, title: e.title, source_type: e.source_type }));
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const reader = anthropicRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          // [DONE]は一旦スキップ（後でsources追加後に送る）
          if (line.trim() === 'data: [DONE]') continue;
          await writer.write(encoder.encode(line + '\n'));
        }
      }
      // sources イベントを追加してから終了
      await writer.write(encoder.encode(
        `data: ${JSON.stringify({ type: 'sources', sources })}\n\n`
      ));
      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (e) {
      await writer.write(encoder.encode(
        `data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`
      ));
    } finally {
      writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      ...CORS_HEADERS
    }
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

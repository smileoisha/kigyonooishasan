// functions/api/meeting-ai.js
// 会議記録保存時にAIで要約とタグを自動生成（事前タグ付け型）

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const { conclusion, process, content, tagMaster } = await request.json();

    const meetingText = [
      conclusion ? `【テーマ】${conclusion}` : '',
      process   ? `【過程・議事】${process}` : '',
      content   ? `【内容・メモ】${content}` : ''
    ].filter(Boolean).join('\n');

    if (!meetingText.trim()) {
      return json({ summary: '', tags: [] });
    }

    const tagList = (tagMaster || []).join('、');

    const prompt = `以下の会議記録を分析してください。

${meetingText}

【指示】
1. この会議記録の要約を1〜2文（日本語・簡潔に）で作成してください
2. 以下のタグリストから最も関連するタグを0〜5個選んでください:
${tagList}

【必須】以下のJSON形式のみで返してください。説明文・前置き・コードブロック不要:
{"summary":"要約文","tags":["タグ1","タグ2"]}`;

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400
    });

    const raw = (response.response || '').trim();

    // JSON部分を抽出
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    let result;
    try {
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      result = null;
    }

    if (!result || typeof result.summary !== 'string') {
      // フォールバック：rawをsummaryに
      result = { summary: raw.replace(/^[^「」\u3040-\u9fff]*/, '').slice(0, 150), tags: [] };
    }

    // タグをマスタ内のものだけに絞る
    const validTags = tagMaster || [];
    result.tags = (result.tags || []).filter(t => validTags.includes(t));

    return json(result);
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

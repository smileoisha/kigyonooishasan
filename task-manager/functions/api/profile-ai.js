// functions/api/profile-ai.js
// 顧客の基本情報・会議記録からAIが人物像を生成

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const { customer, meetings } = await request.json();

    if (!customer) {
      return json({ error: 'customer data required' }, 400);
    }

    // 直近10件の会議記録を構成
    const recentMeetings = (meetings || [])
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 10);

    const meetingTexts = recentMeetings.map((m, i) => {
      const parts = [
        m.conclusion   ? `テーマ：${m.conclusion}` : '',
        m.aiSummary    ? `要約：${m.aiSummary}` : '',
        m.process      ? `過程：${m.process.slice(0, 200)}` : '',
        m.content      ? `メモ：${m.content.slice(0, 200)}` : '',
        m.actionPlan   ? `アクション：${m.actionPlan.slice(0, 200)}` : '',
      ].filter(Boolean).join(' / ');
      return `【会議${i + 1}（${m.date}）】${parts}`;
    }).join('\n');

    const profileText = [
      customer.name ? `氏名：${customer.name}` : '',
      customer.company ? `会社名：${customer.company}` : '',
      customer.industry ? `業態：${customer.industry}` : '',
      customer.contractStatus ? `契約状況：${customer.contractStatus}` : '',
      customer.memo ? `備考：${customer.memo.slice(0, 300)}` : '',
    ].filter(Boolean).join('\n');

    const prompt = `以下の顧客情報と会議記録をもとに、この顧客の人物像を推測してください。

【重要な前提 — 必ず守ること】
この会議記録は、コンサルタントと顧客の対話記録です。
「菊地」「企業のお医者さん」「院長」と表記される人物はコンサルタント（記録者）です。
それ以外の発言者はすべて顧客側の人物です（顧客名と表記が異なる場合があります）。
人物像の根拠にしてよいのは、コンサルタント以外の発言・反応・態度・行動のみです。
コンサルタントの助言・提案・分析・質問は顧客の特徴に含めないでください。

【顧客基本情報】
${profileText}

【会議記録（直近${recentMeetings.length}件）】
${meetingTexts || '（記録なし）'}

【指示】
この顧客の人物像を3〜5文の日本語で記述してください。以下の観点を含めること：
- 性格・思考スタイル（合理的/感情的、慎重/積極的など）
- 主な関心事・課題
- コミュニケーション上の特徴や注意点
- 担当者交代時に引き継ぐべき重要事項

必ず「AIによる推測です」という前提で、断定を避け「〜と思われる」「〜傾向がある」などの表現を使ってください。
JSON形式で返してください：{"profile":"人物像テキスト"}`;

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600
    });

    const raw = (response.response || '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    let result;
    try {
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      result = null;
    }

    if (!result || typeof result.profile !== 'string' || !result.profile.trim()) {
      // フォールバック：生テキストをそのまま使用
      const fallback = raw.replace(/^[^ぁ-んァ-ン一-龥a-zA-Z]*/, '').slice(0, 500);
      result = { profile: fallback || '人物像を生成できませんでした。' };
    }

    return json({ profile: result.profile.trim() });
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

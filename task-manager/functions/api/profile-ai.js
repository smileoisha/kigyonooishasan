// functions/api/profile-ai.js
// 顧客の基本情報・会議記録からAIが人物像を生成

// コンサルタント発言セクションを除去する前処理
// 話者ラベル（**菊地...** / ## 菊地... 等）以降、次の話者ラベルまでを削除
function removeConsultantSections(text) {
  if (!text) return '';
  const consultantRe = /菊地|企業のお医者さん|院長/;
  // 話者ラベルとみなすパターン：**〜** / ##+ 〜 / 【〜】で始まる行
  const speakerHeaderRe = /^(\*{1,2}|\#{1,3}\s|【|「)/;

  const lines = text.split('\n');
  const result = [];
  let skipping = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeader = speakerHeaderRe.test(trimmed);

    if (isHeader && consultantRe.test(trimmed)) {
      // コンサルタントの話者ヘッダー → スキップ開始
      skipping = true;
      continue;
    }

    if (isHeader && !consultantRe.test(trimmed) && trimmed.length > 0) {
      // 別の話者ヘッダー → スキップ終了
      skipping = false;
    }

    if (!skipping) {
      result.push(line);
    }
  }

  // インライン参照もざっくり除去（括弧内でコンサルタント名が言及されるケース）
  return result
    .join('\n')
    .replace(/（[^）]*(?:菊地|企業のお医者さん|院長)[^）]*）/g, '')
    .replace(/\([^)]*(?:菊地|企業のお医者さん|院長)[^)]*\)/g, '')
    .trim();
}

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const { customer, meetings } = await request.json();

    if (!customer) {
      return json({ error: 'customer data required' }, 400);
    }

    // 直近10件の会議記録を構成（コンサルタント発言を前処理で除去）
    const recentMeetings = (meetings || [])
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 10);

    const meetingTexts = recentMeetings.map((m, i) => {
      // 話者別テキスト（process/content）からコンサルタントセクションを除去
      const cleanProcess  = removeConsultantSections(m.process  || '');
      const cleanContent  = removeConsultantSections(m.content  || '');
      const cleanSummary  = removeConsultantSections(m.aiSummary|| '');

      const parts = [
        m.conclusion   ? `テーマ：${m.conclusion}` : '',
        cleanSummary   ? `要約：${cleanSummary.slice(0, 200)}` : '',
        cleanProcess   ? `過程：${cleanProcess.slice(0, 300)}` : '',
        cleanContent   ? `メモ：${cleanContent.slice(0, 200)}` : '',
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

    const prompt = `以下の会議記録から、この顧客の人物像を3〜5文で書いてください。
※コンサルタントの発言は除去済みです。残っている内容は顧客側の発言・行動です。

【顧客】
${profileText}

【会議記録（直近${recentMeetings.length}件）】
${meetingTexts || '（記録なし）'}

以下を含めてください：
- 性格（慎重か積極的か等）
- 主な関心事
- コミュニケーションの特徴
- 引き継ぎ時の注意点

断定せず「〜と思われる」「〜傾向がある」等の表現を使ってください。
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

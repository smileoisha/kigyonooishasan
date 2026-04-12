// functions/api/profile-ai.js
// 顧客の基本情報・会議記録からAIが人物像を生成（Claude Haiku）

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
      skipping = true;
      continue;
    }

    if (isHeader && !consultantRe.test(trimmed) && trimmed.length > 0) {
      skipping = false;
    }

    if (!skipping) {
      result.push(line);
    }
  }

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

    const prompt = `以下の会議記録をもとに、この顧客の人物像を3〜5文で記述してください。

【重要な前提】
この会議記録はコンサルタントの発言を除去済みです。残っている内容は顧客側の発言・行動のみです。
記録の内容をすべて顧客の特徴として分析してください。

【顧客基本情報】
${profileText}

【会議記録（直近${recentMeetings.length}件）】
${meetingTexts || '（記録なし）'}

【分析の観点】
1. 顧客が自ら提起した課題や自発的に行動した事実から読み取れる性格・思考スタイル
2. 主な関心事・課題
3. コミュニケーション上の特徴や注意点
4. 担当者交代時に引き継ぐべき重要事項

断定を避け「〜と思われる」「〜傾向がある」などの表現を使ってください。
JSON形式で返してください：{"profile":"人物像テキスト"}`;

    // Claude Haiku API 呼び出し
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return json({ error: `Anthropic API error: ${response.status} ${errText}` }, 500);
    }

    const apiResult = await response.json();
    const raw = (apiResult.content?.[0]?.text || '').trim();

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

// functions/api/issues-ai.js
// 顧客の全面談記録・コミュニケーション履歴をもとにAIが課題を分析（Claude Haiku）

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const { customer, meetings, communications } = await request.json();

    if (!customer) {
      return json({ error: 'customer data required' }, 400);
    }

    // 全面談を新しい順に並べる
    const sortedMeetings = (meetings || [])
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // 課題のある面談だけ抽出して頻度集計
    const meetingsWithIssues = sortedMeetings.filter(m => (m.issues || []).length > 0);

    const issueCount = {};
    for (const m of meetingsWithIssues) {
      for (const issue of (m.issues || [])) {
        const key = issue.trim();
        if (key) issueCount[key] = (issueCount[key] || 0) + 1;
      }
    }
    const rankedIssues = Object.entries(issueCount)
      .sort((a, b) => b[1] - a[1]);

    // 面談が0件かつコミュニケーション履歴も0件なら空を返す
    const sortedComms = (communications || [])
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (rankedIssues.length === 0 && sortedComms.length === 0 && sortedMeetings.length === 0) {
      return json({ summary: '' });
    }

    // ── 面談記録テキスト（全件、最大20件）────────────────────────────
    const meetingTexts = sortedMeetings
      .slice(0, 20)
      .map((m, i) => {
        const parts = [
          m.conclusion    ? `テーマ：${m.conclusion}` : '',
          m.aiSummary     ? `要約：${m.aiSummary.slice(0, 150)}` : '',
          m.content       ? `メモ：${m.content.slice(0, 150)}` : '',
          m.process       ? `過程：${m.process.slice(0, 150)}` : '',
          m.financialNote ? `財務メモ：${m.financialNote.slice(0, 150)}` : '',
          m.actionPlan    ? `アクションプラン：${m.actionPlan.slice(0, 100)}` : '',
          (m.issues || []).length   ? `経営課題：${m.issues.join('、')}` : '',
          (m.nextActions || []).length ? `次のアクション：${m.nextActions.join('、')}` : '',
        ].filter(Boolean).join(' / ');
        return `【面談${i + 1}（${m.date}）】${parts}`;
      })
      .join('\n');

    // ── コミュニケーション履歴テキスト（最大10件）────────────────────
    const commTexts = sortedComms.length > 0
      ? sortedComms
          .slice(0, 10)
          .map((c, i) => {
            const parts = [
              c.type    ? `種類：${c.type}` : '',
              c.summary ? `内容：${c.summary.slice(0, 200)}` : '',
            ].filter(Boolean).join(' / ');
            return `【連絡${i + 1}（${c.date}）】${parts}`;
          })
          .join('\n')
      : '';

    // ── 課題の頻度サマリー ───────────────────────────────────────────
    const rankedText = rankedIssues.length > 0
      ? rankedIssues
          .slice(0, 10)
          .map(([issue, count]) => count > 1 ? `${issue}（${count}回）` : issue)
          .join('、')
      : '（課題の明示的な記録なし）';

    const profileText = [
      customer.name         ? `氏名：${customer.name}` : '',
      customer.company      ? `会社名：${customer.company}` : '',
      customer.industry     ? `業態：${customer.industry}` : '',
      customer.businessType ? `業種：${customer.businessType}` : '',
    ].filter(Boolean).join('、');

    const prompt = `以下の顧客の面談記録とコミュニケーション履歴をもとに、経営課題を分析してください。

【顧客情報】
${profileText}

【課題の出現頻度（多い順）】
${rankedText}

【面談記録（新しい順・最大20件）】
${meetingTexts || '（記録なし）'}

${commTexts ? `【コミュニケーション履歴（新しい順・最大10件）】\n${commTexts}` : ''}

【分析の指示】
1. 面談・連絡の内容全体から顧客が抱える経営課題を読み取る（明示されていなくても文脈から推察する）
2. 繰り返し登場する課題を最重要課題として特定する
3. 課題の傾向や関連性（例：人手不足→業務過多→収益悪化のような連鎖）を読み解く
4. 課題の変化の方向性（改善・悪化・新規発生）があれば言及する
5. 支援上の優先度・注意点を1〜2点示す

結論→根拠→次の一手 の順で3〜5文で簡潔にまとめてください。
断定を避け「〜と推察される」「〜傾向が見られる」等の表現を使ってください。
JSON形式で返してください：{"summary":"課題分析テキスト"}`;

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
        max_tokens: 700,
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

    if (!result || typeof result.summary !== 'string' || !result.summary.trim()) {
      const fallback = raw.replace(/^[^ぁ-んァ-ン一-龥a-zA-Z]*/, '').slice(0, 500);
      result = { summary: fallback || '課題分析を生成できませんでした。' };
    }

    return json({ summary: result.summary.trim() });
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

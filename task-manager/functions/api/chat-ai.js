// functions/api/chat-ai.js
// 顧客別AIチャット（Claude Haiku + SSEストリーミング）

function buildSystemPrompt(ctx) {
  const basicInfo = [
    ctx.name         ? `名前: ${ctx.name}` : '',
    ctx.company      ? `会社名: ${ctx.company}` : '',
    ctx.businessType ? `業態: ${ctx.businessType}` : '',
    ctx.entityType   ? `法人種別: ${ctx.entityType}` : '',
    ctx.plan         ? `契約プラン: ${ctx.plan}` : '',
    ctx.contractStart ? `契約開始: ${ctx.contractStart}` : '',
    ctx.memo         ? `備考: ${ctx.memo.slice(0, 200)}` : '',
  ].filter(Boolean).join('\n');

  const meetingsText = (ctx.recentMeetings || []).map((m, i) => {
    const parts = [
      m.conclusion    ? `テーマ: ${m.conclusion}` : '',
      m.aiSummary     ? `要約: ${m.aiSummary.slice(0, 200)}` : '',
      m.financialNote ? `財務メモ: ${m.financialNote.slice(0, 200)}` : '',
      (m.issues || []).length      ? `経営課題: ${m.issues.join(', ')}` : '',
      (m.nextActions || []).length ? `次回アクション: ${m.nextActions.join(', ')}` : '',
      m.actionPlan    ? `アクションプラン: ${m.actionPlan.slice(0, 150)}` : '',
    ].filter(Boolean).join(' / ');
    return `【面談${i + 1}（${m.date}）】${parts}`;
  }).join('\n') || '（記録なし）';

  const tasksText = (ctx.relatedTasks || []).map(t => {
    const statusLabel = { inProgress: '進行中', pending: '未着手', stuck: 'スタック', review: '確認待ち', done: '完了' }[t.status] || t.status;
    return `- ${t.title}（${statusLabel}${t.dueDate ? `・期限: ${t.dueDate}` : ''}）`;
  }).join('\n') || '（なし）';

  return `あなたは「企業のお医者さん」の経営支援AIアシスタントです。
コンサルタント（菊地）が顧客への支援方針を検討するための壁打ち相手として機能してください。

【あなたの役割】
- 経営課題の分析・構造化
- 次回面談の論点・提案の整理
- 財務データの解釈補助
- 支援方針の壁打ち（選択肢を示す）

【禁止事項】
- 顧客を囲い込む提案（自立支援・卒業設計が基本方針）
- 断定的な税務・法務アドバイス（「専門家に確認を」と促す）
- 院長の権威を過度に強化する表現（宗教化防止）

【顧客情報】
${basicInfo || '（情報なし）'}
${ctx.aiProfile ? `\n【AI人物像】\n${ctx.aiProfile.slice(0, 400)}` : ''}

【直近の面談記録（新しい順・最大10件）】
${meetingsText}

【関連タスク】
${tasksText}

日本語で簡潔に回答してください。結論→理由→次の一手 の順。不確実なことは断定せず選択肢を示す。`;
}

export async function onRequestPost(context) {
  const { env, request } = context;

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { messages, customerContext } = await request.json();
    const systemPrompt = buildSystemPrompt(customerContext || {});

    const response = await fetch('https://api.anthropic.com/v1/messages', {
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
        messages: (messages || []).slice(-20), // 直近20件のみ送る
        stream: true
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `Anthropic API error: ${response.status} ${errText.slice(0, 200)}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // AnthropicのSSEストリームをそのままブラウザへproxy
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

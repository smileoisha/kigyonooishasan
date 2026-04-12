// functions/api/task-ai.js
// タスク管理AIアシスタント（Claude Haiku）
// Phase 1: 一問一答  Phase 2: JS前処理済みデータ受信  Phase 3: アクション実行

const STATUS_LABELS = {
  pending: '未着手',
  inProgress: '進行中',
  stuck: 'スタック',
  review: '確認待ち',
  done: '完了'
};

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const { question, tasks, projects, users, currentUser, today } = await request.json();

    if (!question?.trim()) return json({ error: 'question required' }, 400);

    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

    // タスクデータをテキスト化
    const projectMap = Object.fromEntries((projects || []).map(p => [p.id, p.name]));
    const userMap    = Object.fromEntries((users    || []).map(u => [u.id, u.name]));

    const taskLines = (tasks || []).map(t => {
      const parts = [
        `ID:${t.id}`,
        `タイトル:${t.title}`,
        `状態:${STATUS_LABELS[t.status] || t.status}`,
        t.dueDate    ? `期限:${t.dueDate}` : '期限:なし',
        t.projectId  ? `PJ:${projectMap[t.projectId] || t.projectId}` : '',
        t.assigneeId ? `担当:${userMap[t.assigneeId] || t.assigneeId}` : '担当:未設定',
        t.memo       ? `メモ:${t.memo.slice(0, 80)}` : '',
      ].filter(Boolean).join(' | ');
      // サブタスク
      const subs = (t.children || []).map(s =>
        `  └ ${s.title}（${STATUS_LABELS[s.status] || s.status}）`
      ).join('\n');
      return parts + (subs ? '\n' + subs : '');
    }).join('\n');

    const userName = currentUser?.name || 'ユーザー';
    const todayStr = today || new Date().toISOString().slice(0, 10);

    const systemPrompt = `あなたはタスク管理AIアシスタントです。${userName}さんのタスクデータをもとに、質問に日本語で簡潔に答えてください。

【今日の日付】${todayStr}

【タスクデータ】
${taskLines || '（タスクなし）'}

【回答のルール】
- 日本語で簡潔に答えること
- タスクが複数あるときは箇条書きで列挙すること
- 期限が過ぎているタスクには「⚠️ 期限超過」を付けること
- 担当者変更・期限変更・ステータス変更の依頼には必ずアクションを含めること

【変更指示への対応 — Phase 3】
タスクの変更依頼がある場合は、以下のJSON形式で返してください。
変更なし：{"answer":"回答文","action":null}
変更あり：{"answer":"回答文","action":{"type":"updateTask","taskId":"タスクのID","changes":{"dueDate":"YYYY-MM-DD"}}}
changesには変更するフィールドのみ含める。
変更可能フィールド：status（pending/inProgress/done/stuck/review）、dueDate（YYYY-MM-DD）、assigneeId（ユーザーID）

必ずJSON形式のみで返してください。説明文・コードブロック不要。`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return json({ error: `Anthropic API error: ${response.status} ${err}` }, 500);
    }

    const apiResult = await response.json();
    const raw = (apiResult.content?.[0]?.text || '').trim();

    // JSON抽出
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    let result;
    try {
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      result = null;
    }

    if (!result || typeof result.answer !== 'string') {
      result = { answer: raw || '回答を取得できませんでした。', action: null };
    }

    return json({ answer: result.answer.trim(), action: result.action || null });
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

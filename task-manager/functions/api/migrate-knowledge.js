// functions/api/migrate-knowledge.js
// 既存のD1データからknowledgeテーブルを一括同期する
// 使い方: POST /api/migrate-knowledge（ブラウザのコンソールから1回だけ実行）
// 実行後このファイルは削除してOK

export async function onRequestPost(context) {
  const { env } = context;
  try {
    const row = await env.DB.prepare('SELECT value FROM store WHERE key = ?').bind('main').first();
    if (!row) return json({ error: 'No data found' }, 404);

    const data = JSON.parse(row.value);
    const now = new Date().toISOString();
    const entries = [];

    // タスクノート
    for (const task of (data.tasks || [])) {
      for (const note of (task.notes || [])) {
        if (!note.content?.trim()) continue;
        entries.push({
          id: `task_note_${note.id}`,
          source_type: 'task_note',
          source_id: note.id,
          title: (task.title || '').slice(0, 200),
          body: note.content.slice(0, 5000),
          tags: JSON.stringify(task.tags || []),
          customer_id: task.customerId || null,
          created_at: note.at || now,
          updated_at: note.at || now
        });
      }
    }

    // 顧客面談記録
    for (const customer of (data.customers || [])) {
      for (const m of (customer.meetings || [])) {
        const bodyParts = [
          m.aiSummary     ? `要約: ${m.aiSummary}` : '',
          m.financialNote ? `財務: ${m.financialNote}` : '',
          (m.issues      || []).length ? `課題: ${m.issues.join(', ')}` : '',
          (m.nextActions || []).length ? `アクション: ${m.nextActions.join(', ')}` : '',
          m.actionPlan    ? `アクションプラン: ${m.actionPlan}` : ''
        ].filter(Boolean);
        if (!bodyParts.length) continue;

        entries.push({
          id: `meeting_${m.id}`,
          source_type: 'customer_meeting',
          source_id: m.id,
          title: (m.conclusion || `${customer.name} 面談 ${m.date}`).slice(0, 200),
          body: bodyParts.join('\n').slice(0, 5000),
          tags: JSON.stringify(m.tags || []),
          customer_id: customer.id,
          created_at: m.date ? `${m.date}T00:00:00Z` : now,
          updated_at: now
        });
      }
    }

    if (entries.length === 0) {
      return json({ ok: true, message: '同期するエントリがありませんでした', count: 0 });
    }

    // 50件ずつバッチupsert
    let synced = 0;
    for (let i = 0; i < entries.length; i += 50) {
      const chunk = entries.slice(i, i + 50);
      const stmts = chunk.map(e =>
        env.DB.prepare(
          'INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, tags, customer_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(e.id, e.source_type, e.source_id, e.title, e.body, e.tags, e.customer_id, e.created_at, e.updated_at)
      );
      await env.DB.batch(stmts);
      synced += chunk.length;
    }

    return json({ ok: true, count: synced, message: `${synced}件を同期しました` });
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

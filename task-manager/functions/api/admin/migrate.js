// functions/api/admin/migrate.js
// POST /api/admin/migrate — store JSON から新リレーショナルテーブルへの一回限りのマイグレーション
// デプロイ後に1回だけ呼ぶ。?force=true を付けると既存データを上書きして再実行できる。

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

  // 二重実行防止（force=true で上書き許可）
  if (!force) {
    const count = await env.DB.prepare('SELECT COUNT(*) as n FROM tasks').first();
    if (count && count.n > 0) {
      return json({
        error: 'テーブルにデータが既に存在します。二重実行を防ぐため中止しました。強制実行: ?force=true'
      }, 409);
    }
  }

  const row = await env.DB.prepare('SELECT value FROM store WHERE key = ?').bind('main').first();
  if (!row) return json({ error: 'store にデータが見つかりません' }, 404);

  let data;
  try { data = JSON.parse(row.value); } catch { return json({ error: 'store JSON 解析エラー' }, 500); }

  const now = new Date().toISOString();
  const stats = {};

  try {
    // force 時は既存データを全削除（依存順）
    if (force) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM task_work_logs'),
        env.DB.prepare('DELETE FROM task_links'),
        env.DB.prepare('DELETE FROM task_notes'),
        env.DB.prepare('DELETE FROM tasks'),
        env.DB.prepare('DELETE FROM customer_meetings'),
        env.DB.prepare('DELETE FROM customers'),
        env.DB.prepare('DELETE FROM projects'),
        env.DB.prepare('DELETE FROM users'),
        env.DB.prepare('DELETE FROM locations'),
        env.DB.prepare('DELETE FROM tag_master'),
      ]);
    }

    // 1. projects
    const projects = data.projects || [];
    await batchExec(env.DB, projects.map(p => env.DB.prepare(
      'INSERT OR REPLACE INTO projects (id, name, color, due_date, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(p.id, p.name, p.color ?? null, p.dueDate ?? null, p.status ?? 'active')));
    stats.projects = projects.length;

    // 2. users
    const users = data.users || [];
    await batchExec(env.DB, users.map(u => env.DB.prepare(
      'INSERT OR REPLACE INTO users (id, name, avatar) VALUES (?, ?, ?)'
    ).bind(u.id, u.name, u.avatar ?? null)));
    stats.users = users.length;

    // 3. locations
    const locations = data.locations || [];
    await batchExec(env.DB, locations.map(l => env.DB.prepare(
      'INSERT OR REPLACE INTO locations (id, label, start_date, end_date, color) VALUES (?, ?, ?, ?, ?)'
    ).bind(l.id, l.label ?? l.name ?? '', l.startDate ?? l.start_date ?? null, l.endDate ?? l.end_date ?? null, l.color ?? null)));
    stats.locations = locations.length;

    // 4. tag_master
    const tagMaster = data.tagMaster || {};
    const tagEntries = Object.entries(tagMaster);
    await batchExec(env.DB, tagEntries.map(([key, value]) => env.DB.prepare(
      'INSERT OR REPLACE INTO tag_master (key, value) VALUES (?, ?)'
    ).bind(key, value)));
    stats.tagMaster = tagEntries.length;

    // 5. customers
    const customers = data.customers || [];
    await batchExec(env.DB, customers.map(c => env.DB.prepare(
      'INSERT OR REPLACE INTO customers (id, name, sei, mei, aliases, email, phone, company, industry, business_type, contract_status, plan, address, memo, ai_profile, ai_profile_updated_at, meetings_updated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      c.id, c.name, c.sei ?? null, c.mei ?? null,
      JSON.stringify(c.aliases ?? []),
      c.email ?? null, c.phone ?? null, c.company ?? null,
      c.industry ?? null, c.businessType ?? null,
      c.contractStatus ?? c.contract_status ?? null,
      c.plan ?? null, c.address ?? null, c.memo ?? null,
      c.aiProfile ?? c.ai_profile ?? null,
      c.aiProfileUpdatedAt ?? c.ai_profile_updated_at ?? null,
      c.meetingsUpdatedAt ?? c.meetings_updated_at ?? null,
      c.createdAt ?? c.created_at ?? now,
      c.updatedAt ?? c.updated_at ?? now
    )));
    stats.customers = customers.length;

    // 6. customer_meetings（全顧客分を一括）
    const allMeetingStmts = customers.flatMap(c =>
      (c.meetings ?? []).map(m => env.DB.prepare(
        'INSERT OR REPLACE INTO customer_meetings (id, customer_id, date, conclusion, process, content, ai_summary, financial_note, action_plan, issues, proposals, next_actions, tags, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        m.id, c.id, m.date,
        m.conclusion ?? null, m.process ?? null, m.content ?? null,
        m.aiSummary ?? m.ai_summary ?? null,
        m.financialNote ?? m.financial_note ?? null,
        m.actionPlan ?? m.action_plan ?? null,
        JSON.stringify(m.issues ?? []),
        JSON.stringify(m.proposals ?? []),
        JSON.stringify(m.nextActions ?? m.next_actions ?? []),
        JSON.stringify(m.tags ?? []),
        m.updatedAt ?? m.updated_at ?? now
      ))
    );
    await batchExec(env.DB, allMeetingStmts);
    stats.customer_meetings = allMeetingStmts.length;

    // 7. tasks
    const tasks = data.tasks ?? [];
    await batchExec(env.DB, tasks.map(t => env.DB.prepare(
      'INSERT OR REPLACE INTO tasks (id, project_id, parent_id, title, status, assignee_id, start_date, due_date, memo, tags, children, customer_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      t.id, t.projectId ?? null, t.parentId ?? null, t.title,
      t.status ?? 'pending', t.assigneeId ?? null,
      t.startDate ?? null, t.dueDate ?? null, t.memo ?? null,
      JSON.stringify(t.tags ?? []), JSON.stringify(t.children ?? []),
      t.customerId ?? null, t.createdAt ?? now, t.updatedAt ?? now
    )));
    stats.tasks = tasks.length;

    // 8. task_notes
    const allNoteStmts = tasks.flatMap(t =>
      (t.notes ?? []).map(n => env.DB.prepare(
        'INSERT OR REPLACE INTO task_notes (id, task_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(n.id, t.id, n.content ?? '', n.at ?? now, n.updatedAt ?? n.at ?? now))
    );
    await batchExec(env.DB, allNoteStmts);
    stats.task_notes = allNoteStmts.length;

    // 9. task_links
    const allLinkStmts = tasks.flatMap(t =>
      (t.links ?? []).map(l => env.DB.prepare(
        'INSERT OR REPLACE INTO task_links (id, task_id, label, url, type, file_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(l.id, t.id, l.label ?? '', l.url, l.type ?? null, l.fileType ?? null, l.createdAt ?? now))
    );
    await batchExec(env.DB, allLinkStmts);
    stats.task_links = allLinkStmts.length;

    // 10. task_work_logs
    const allLogStmts = tasks.flatMap(t =>
      (t.workLog ?? []).map(w => env.DB.prepare(
        'INSERT INTO task_work_logs (task_id, action, user_id, at, reason) VALUES (?, ?, ?, ?, ?)'
      ).bind(t.id, w.action, w.userId ?? null, w.at ?? now, w.reason ?? null))
    );
    await batchExec(env.DB, allLogStmts);
    stats.task_work_logs = allLogStmts.length;

    return json({ ok: true, stats });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

async function batchExec(db, stmts) {
  if (stmts.length === 0) return;
  for (let i = 0; i < stmts.length; i += 50) {
    await db.batch(stmts.slice(i, i + 50));
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

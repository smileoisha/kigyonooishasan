// functions/api/data.js — Cloudflare Pages Function (D1 backend)
// Phase 2: GET/PUT ともに relational tables のみ。store テーブルへの読み書きなし。

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const [knowledgeResult, storeData] = await Promise.all([
      env.DB.prepare(
        "SELECT id, source_type, source_id, title, body, structured, tags, customer_id, parent_id, category, sort_order, created_at, updated_at FROM knowledge WHERE source_type = 'manual' ORDER BY created_at"
      ).all(),
      assembleFromTables(env.DB),
    ]);
    storeData._manualKnowledge = knowledgeResult.results || [];
    return new Response(JSON.stringify(storeData), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  return handleSave(context);
}

export async function onRequestPut(context) {
  return handleSave(context);
}

async function handleSave(context) {
  const { env, request } = context;
  try {
    const body = await request.text();
    const data = JSON.parse(body);
    const now = new Date().toISOString();

    // _manualKnowledge は relational tables とは別管理（knowledge テーブル）
    const manualKnowledge = data._manualKnowledge;
    delete data._manualKnowledge;

    // 1. リレーショナルテーブルに保存
    await syncToRelationalTables(env.DB, data, now);

    // 2. ナレッジ同期
    try { await syncKnowledge(env.DB, data); } catch (e) { console.error('[knowledge sync]', e.message); }

    // 3. manual ナレッジ復元（リストア時）
    if (Array.isArray(manualKnowledge) && manualKnowledge.length > 0) {
      try { await restoreManualKnowledge(env.DB, manualKnowledge); } catch (e) { console.error('[manual knowledge restore]', e.message); }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ─── リレーショナルテーブルからデータを組み立て（旧 JSON 形式で返す） ───

async function assembleFromTables(db) {
  const results = await db.batch([
    db.prepare('SELECT * FROM tasks ORDER BY created_at'),
    db.prepare('SELECT * FROM task_notes ORDER BY created_at'),
    db.prepare('SELECT * FROM task_links ORDER BY created_at'),
    db.prepare('SELECT * FROM task_work_logs ORDER BY at'),
    db.prepare('SELECT * FROM customers ORDER BY created_at'),
    db.prepare('SELECT * FROM customer_meetings ORDER BY date'),
    db.prepare('SELECT * FROM projects'),
    db.prepare('SELECT * FROM users'),
    db.prepare('SELECT * FROM locations'),
    db.prepare('SELECT * FROM tag_master'),
  ]);

  const [tasksR, notesR, linksR, logsR, customersR, meetingsR, projectsR, usersR, locationsR, tagMasterR] = results;
  const tasks     = tasksR.results     || [];
  const notes     = notesR.results     || [];
  const links     = linksR.results     || [];
  const logs      = logsR.results      || [];
  const customers = customersR.results || [];
  const meetings  = meetingsR.results  || [];
  const projects  = projectsR.results  || [];
  const users     = usersR.results     || [];
  const locations = locationsR.results || [];
  const tagRows   = tagMasterR.results || [];

  // task_id インデックス
  const notesByTask = {}, linksByTask = {}, logsByTask = {};
  for (const n of notes) {
    (notesByTask[n.task_id] ||= []).push({
      id: n.id, content: n.content, at: n.created_at, updatedAt: n.updated_at
    });
  }
  for (const l of links) {
    (linksByTask[l.task_id] ||= []).push({
      id: l.id, label: l.label, url: l.url, type: l.type, fileType: l.file_type
    });
  }
  for (const w of logs) {
    (logsByTask[w.task_id] ||= []).push({
      action: w.action, userId: w.user_id, at: w.at, reason: w.reason
    });
  }

  // customer_id インデックス
  const meetingsByCustomer = {};
  for (const m of meetings) {
    (meetingsByCustomer[m.customer_id] ||= []).push({
      id: m.id, date: m.date, conclusion: m.conclusion,
      process: m.process || '', content: m.content || '',
      aiSummary: m.ai_summary || '', financialNote: m.financial_note || '',
      actionPlan: m.action_plan || '',
      issues:      parseJSON(m.issues, []),
      proposals:   parseJSON(m.proposals, []),
      nextActions: parseJSON(m.next_actions, []),
      tags:        parseJSON(m.tags, []),
      updatedAt: m.updated_at,
    });
  }

  // tag_master values: migration stored as comma-separated strings, future PUTs store as JSON
  const tagMaster = {};
  for (const r of tagRows) {
    try { tagMaster[r.key] = JSON.parse(r.value); }
    catch { tagMaster[r.key] = r.value ? r.value.split(',').map(s => s.trim()).filter(Boolean) : []; }
  }

  return {
    tasks: tasks.map(t => ({
      id: t.id, projectId: t.project_id, parentId: t.parent_id,
      title: t.title, status: t.status, assigneeId: t.assignee_id,
      startDate: t.start_date, dueDate: t.due_date, memo: t.memo || '',
      tags:     parseJSON(t.tags, []),
      children: parseJSON(t.children, []),
      customerId: t.customer_id,
      notes:   notesByTask[t.id] || [],
      links:   linksByTask[t.id] || [],
      workLog: logsByTask[t.id]  || [],
      createdAt: t.created_at, updatedAt: t.updated_at,
    })),
    customers: customers.map(c => ({
      id: c.id, name: c.name, sei: c.sei, mei: c.mei,
      aliases:      parseJSON(c.aliases, []),
      email: c.email, phone: c.phone, company: c.company,
      industry: c.industry, businessType: c.business_type,
      contractStatus: c.contract_status, plan: c.plan,
      address: c.address, memo: c.memo || '',
      aiProfile: c.ai_profile, aiProfileUpdatedAt: c.ai_profile_updated_at,
      meetingsUpdatedAt: c.meetings_updated_at,
      createdAt: c.created_at, updatedAt: c.updated_at,
      meetings: meetingsByCustomer[c.id] || [],
    })),
    projects: projects.map(p => ({
      id: p.id, name: p.name, color: p.color, dueDate: p.due_date, status: p.status
    })),
    users: users.map(u => ({ id: u.id, name: u.name, avatar: u.avatar })),
    locations: locations.map(l => ({
      id: l.id, label: l.label, startDate: l.start_date, endDate: l.end_date, color: l.color
    })),
    tagMaster,
  };
}

// ─── リレーショナルテーブルへの全量同期（PUT のたびに呼ぶ） ──────

async function syncToRelationalTables(db, data, now) {
  // 既存データを全削除（FK未強制のため依存順に削除）
  await db.batch([
    db.prepare('DELETE FROM task_work_logs'),
    db.prepare('DELETE FROM task_links'),
    db.prepare('DELETE FROM task_notes'),
    db.prepare('DELETE FROM tasks'),
    db.prepare('DELETE FROM customer_meetings'),
    db.prepare('DELETE FROM customers'),
    db.prepare('DELETE FROM projects'),
    db.prepare('DELETE FROM users'),
    db.prepare('DELETE FROM locations'),
    db.prepare('DELETE FROM tag_master'),
  ]);

  const projects = data.projects || [];
  await batchInsert(db, projects.map(p => db.prepare(
    'INSERT OR REPLACE INTO projects (id, name, color, due_date, status) VALUES (?, ?, ?, ?, ?)'
  ).bind(p.id, p.name, p.color ?? null, p.dueDate ?? null, p.status ?? 'active')));

  const users = data.users || [];
  await batchInsert(db, users.map(u => db.prepare(
    'INSERT OR REPLACE INTO users (id, name, avatar) VALUES (?, ?, ?)'
  ).bind(u.id, u.name, u.avatar ?? null)));

  const locations = data.locations || [];
  await batchInsert(db, locations.map(l => db.prepare(
    'INSERT OR REPLACE INTO locations (id, label, start_date, end_date, color) VALUES (?, ?, ?, ?, ?)'
  ).bind(
    l.id, l.label ?? l.name ?? '',
    l.startDate ?? l.start_date ?? null,
    l.endDate   ?? l.end_date   ?? null,
    l.color ?? null
  )));

  const tagMaster = data.tagMaster || {};
  await batchInsert(db, Object.entries(tagMaster).map(([key, value]) => db.prepare(
    'INSERT OR REPLACE INTO tag_master (key, value) VALUES (?, ?)'
  ).bind(key, JSON.stringify(Array.isArray(value) ? value : []))));

  const customers = data.customers || [];
  await batchInsert(db, customers.map(c => db.prepare(
    'INSERT OR REPLACE INTO customers (id, name, sei, mei, aliases, email, phone, company, industry, business_type, contract_status, plan, address, memo, ai_profile, ai_profile_updated_at, meetings_updated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    c.id, c.name, c.sei ?? null, c.mei ?? null,
    JSON.stringify(c.aliases ?? []),
    c.email ?? null, c.phone ?? null, c.company ?? null,
    c.industry ?? null, c.businessType ?? c.business_type ?? null,
    c.contractStatus ?? c.contract_status ?? null,
    c.plan ?? null, c.address ?? null, c.memo ?? null,
    c.aiProfile ?? c.ai_profile ?? null,
    c.aiProfileUpdatedAt ?? c.ai_profile_updated_at ?? null,
    c.meetingsUpdatedAt  ?? c.meetings_updated_at  ?? null,
    c.createdAt ?? c.created_at ?? now,
    c.updatedAt ?? c.updated_at ?? now
  )));

  const allMeetingStmts = customers.flatMap(c =>
    (c.meetings ?? []).map(m => db.prepare(
      'INSERT OR REPLACE INTO customer_meetings (id, customer_id, date, conclusion, process, content, ai_summary, financial_note, action_plan, issues, proposals, next_actions, tags, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      m.id, c.id, m.date,
      m.conclusion ?? null, m.process ?? null, m.content ?? null,
      m.aiSummary  ?? m.ai_summary   ?? null,
      m.financialNote ?? m.financial_note ?? null,
      m.actionPlan ?? m.action_plan  ?? null,
      JSON.stringify(m.issues     ?? []),
      JSON.stringify(m.proposals  ?? []),
      JSON.stringify(m.nextActions ?? m.next_actions ?? []),
      JSON.stringify(m.tags ?? []),
      m.updatedAt ?? m.updated_at ?? now
    ))
  );
  await batchInsert(db, allMeetingStmts);

  const tasks = data.tasks ?? [];
  await batchInsert(db, tasks.map(t => db.prepare(
    'INSERT OR REPLACE INTO tasks (id, project_id, parent_id, title, status, assignee_id, start_date, due_date, memo, tags, children, customer_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    t.id, t.projectId ?? null, t.parentId ?? null, t.title,
    t.status ?? 'pending', t.assigneeId ?? null,
    t.startDate ?? null, t.dueDate ?? null, t.memo ?? null,
    JSON.stringify(t.tags     ?? []),
    JSON.stringify(t.children ?? []),
    t.customerId ?? null,
    t.createdAt ?? now, t.updatedAt ?? now
  )));

  await batchInsert(db, tasks.flatMap(t =>
    (t.notes ?? []).map(n => db.prepare(
      'INSERT OR REPLACE INTO task_notes (id, task_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(n.id, t.id, n.content ?? '', n.at ?? now, n.updatedAt ?? n.at ?? now))
  ));

  await batchInsert(db, tasks.flatMap(t =>
    (t.links ?? []).map(l => db.prepare(
      'INSERT OR REPLACE INTO task_links (id, task_id, label, url, type, file_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(l.id, t.id, l.label ?? '', l.url, l.type ?? null, l.fileType ?? null, l.createdAt ?? now))
  ));

  await batchInsert(db, tasks.flatMap(t =>
    (t.workLog ?? []).map(w => db.prepare(
      'INSERT INTO task_work_logs (task_id, action, user_id, at, reason) VALUES (?, ?, ?, ?, ?)'
    ).bind(t.id, w.action, w.userId ?? null, w.at ?? now, w.reason ?? null))
  ));
}

async function batchInsert(db, stmts) {
  if (stmts.length === 0) return;
  for (let i = 0; i < stmts.length; i += 50) {
    await db.batch(stmts.slice(i, i + 50));
  }
}

function parseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ─── manual ナレッジ復元（リストア時） ──────────────────────────

async function restoreManualKnowledge(db, entries) {
  for (let i = 0; i < entries.length; i += 50) {
    const chunk = entries.slice(i, i + 50);
    const stmts = chunk.map(e =>
      db.prepare(
        'INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, structured, tags, customer_id, parent_id, category, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        e.id, e.source_type, e.source_id ?? null, e.title, e.body ?? null,
        e.structured ?? null, e.tags ?? null, e.customer_id ?? null,
        e.parent_id ?? null, e.category ?? 'normal', e.sort_order ?? 0, e.created_at, e.updated_at
      )
    );
    await db.batch(stmts);
  }
}

// ─── ナレッジ差分同期 ────────────────────────────────────────────
// PUT のたびに呼ばれるが、updated_at が変わったレコードだけ書き込む。
// 削除済みのノート・面談に対応する knowledge 行は DELETE する。

function toISO(val) {
  if (!val) return null;
  if (typeof val === 'number') return new Date(val).toISOString();
  if (typeof val === 'string' && /^\d{10,13}$/.test(val)) return new Date(Number(val)).toISOString();
  return val;
}

// 同期対象エントリを data から構築（純粋関数）
function buildKnowledgeEntries(data, now) {
  const entries = [];

  for (const task of (data.tasks || [])) {
    for (const note of (task.notes || [])) {
      if (!note.content?.trim()) continue;
      entries.push({
        id:          `task_note_${note.id}`,
        source_type: 'task_note',
        source_id:   note.id,
        title:       (task.title || '').slice(0, 200),
        body:        note.content.slice(0, 5000),
        tags:        JSON.stringify(task.tags || []),
        customer_id: task.customerId || null,
        created_at:  toISO(note.at) || now,
        updated_at:  toISO(note.updatedAt) || toISO(note.at) || now,
      });
    }
  }

  for (const customer of (data.customers || [])) {
    for (const m of (customer.meetings || [])) {
      const bodyParts = [
        m.process       ? `【過程・議事】\n${m.process}` : '',
        m.content       ? `【メモ】\n${m.content}` : '',
        m.aiSummary     ? `【要約】${m.aiSummary}` : '',
        m.financialNote ? `【財務】${m.financialNote}` : '',
        m.actionPlan    ? `【アクションプラン】${m.actionPlan}` : '',
        (m.issues      || []).length ? `【経営課題】${m.issues.join('、')}`           : '',
        (m.nextActions || []).length ? `【次回アクション】${m.nextActions.join('、')}` : '',
      ].filter(Boolean);
      const body = bodyParts.join('\n\n').slice(0, 5000);
      if (!body.trim()) continue;

      entries.push({
        id:          `meeting_${m.id}`,
        source_type: 'customer_meeting',
        source_id:   m.id,
        title:       (m.conclusion || `${customer.name} 面談 ${m.date}`).slice(0, 200),
        body,
        structured: JSON.stringify({
          process:       m.process       || '',
          content:       m.content       || '',
          aiSummary:     m.aiSummary     || '',
          financialNote: m.financialNote || '',
          actionPlan:    m.actionPlan    || '',
          issues:        m.issues        || [],
          nextActions:   m.nextActions   || [],
        }),
        tags:        JSON.stringify(m.tags || []),
        customer_id: customer.id,
        created_at:  m.date ? `${m.date}T00:00:00Z` : now,
        updated_at:  toISO(m.updatedAt) || (m.date ? `${m.date}T00:00:00Z` : now),
      });
    }
  }

  return entries;
}

async function syncKnowledge(db, data) {
  const now = new Date().toISOString();

  // 1. 同期対象エントリを構築
  const entries = buildKnowledgeEntries(data, now);
  const entryMap = new Map(entries.map(e => [e.id, e]));

  // 2. 既存の自動同期レコードを取得（id と updated_at のみ）
  const existing = await db.prepare(
    "SELECT id, updated_at FROM knowledge WHERE source_type IN ('task_note', 'customer_meeting') AND deleted_at IS NULL"
  ).all();
  const existingMap = new Map((existing.results || []).map(r => [r.id, r.updated_at]));

  // 3. 差分計算
  const toUpsert = [];
  for (const [id, entry] of entryMap) {
    // updated_at が一致していれば変更なし → スキップ
    if (existingMap.get(id) === entry.updated_at) continue;
    toUpsert.push(entry);
  }

  const toDelete = [];
  for (const id of existingMap.keys()) {
    if (!entryMap.has(id)) toDelete.push(id); // ソース削除済み
  }

  // 4. UPSERT（新規 + 変更分のみ）
  for (let i = 0; i < toUpsert.length; i += 50) {
    await db.batch(toUpsert.slice(i, i + 50).map(e =>
      db.prepare(
        'INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, structured, tags, customer_id, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(e.id, e.source_type, e.source_id, e.title, e.body, e.structured || null, e.tags, e.customer_id, 'normal', e.created_at, e.updated_at)
    ));
  }

  // 5. 削除済みソースに対応する knowledge 行を消す
  for (let i = 0; i < toDelete.length; i += 50) {
    await db.batch(toDelete.slice(i, i + 50).map(id =>
      db.prepare(
        "DELETE FROM knowledge WHERE id = ? AND source_type IN ('task_note', 'customer_meeting')"
      ).bind(id)
    ));
  }
}

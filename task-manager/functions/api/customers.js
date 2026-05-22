// functions/api/customers.js
// GET /api/customers — 顧客一覧取得
// PUT /api/customers — 顧客全量保存 + customer_meeting ナレッジ差分同期

export async function onRequestGet(context) {
  const { env } = context;
  try {
    return json({ customers: await loadCustomers(env.DB) });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPut(context) {
  const { env, request } = context;
  try {
    const body = await request.json();
    const customers = body.customers ?? [];
    const now = new Date().toISOString();
    await saveCustomers(env.DB, customers, now);
    try { await syncMeetingKnowledge(env.DB, customers, now); } catch (e) { console.error('[knowledge sync]', e.message); }
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── ロード ───────────────────────────────────────────────────────

async function loadCustomers(db) {
  const [customersR, meetingsR] = await db.batch([
    db.prepare('SELECT * FROM customers ORDER BY created_at'),
    db.prepare('SELECT * FROM customer_meetings ORDER BY date'),
  ]);

  const meetingsByCustomer = {};
  for (const m of (meetingsR.results || [])) {
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

  return (customersR.results || []).map(c => ({
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
  }));
}

// ─── 保存（全削除→全挿入） ────────────────────────────────────────

async function saveCustomers(db, customers, now) {
  await db.batch([
    db.prepare('DELETE FROM customer_meetings'),
    db.prepare('DELETE FROM customers'),
  ]);

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

  await batchInsert(db, customers.flatMap(c =>
    (c.meetings ?? []).map(m => db.prepare(
      'INSERT OR REPLACE INTO customer_meetings (id, customer_id, date, conclusion, process, content, ai_summary, financial_note, action_plan, issues, proposals, next_actions, tags, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      m.id, c.id, m.date,
      m.conclusion ?? null, m.process ?? null, m.content ?? null,
      m.aiSummary  ?? m.ai_summary    ?? null,
      m.financialNote ?? m.financial_note ?? null,
      m.actionPlan ?? m.action_plan   ?? null,
      JSON.stringify(m.issues     ?? []),
      JSON.stringify(m.proposals  ?? []),
      JSON.stringify(m.nextActions ?? m.next_actions ?? []),
      JSON.stringify(m.tags ?? []),
      m.updatedAt ?? m.updated_at ?? now
    ))
  ));
}

// ─── customer_meeting ナレッジ差分同期 ────────────────────────────

async function syncMeetingKnowledge(db, customers, now) {
  const entries = [];
  for (const customer of customers) {
    for (const m of (customer.meetings || [])) {
      const bodyParts = [
        m.process       ? `【過程・議事】\n${m.process}`       : '',
        m.content       ? `【メモ】\n${m.content}`             : '',
        m.aiSummary     ? `【要約】${m.aiSummary}`             : '',
        m.financialNote ? `【財務】${m.financialNote}`          : '',
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

  const entryMap = new Map(entries.map(e => [e.id, e]));

  const existing = await db.prepare(
    "SELECT id, updated_at FROM knowledge WHERE source_type = 'customer_meeting'"
  ).all();
  const existingMap = new Map((existing.results || []).map(r => [r.id, r.updated_at]));

  const toUpsert = [...entryMap.values()].filter(e => existingMap.get(e.id) !== e.updated_at);
  const toDelete = [...existingMap.keys()].filter(id => !entryMap.has(id));

  for (let i = 0; i < toUpsert.length; i += 50) {
    await db.batch(toUpsert.slice(i, i + 50).map(e =>
      db.prepare(
        'INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, structured, tags, customer_id, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(e.id, e.source_type, e.source_id, e.title, e.body, e.structured, e.tags, e.customer_id, 'normal', e.created_at, e.updated_at)
    ));
  }

  for (let i = 0; i < toDelete.length; i += 50) {
    await db.batch(toDelete.slice(i, i + 50).map(id =>
      db.prepare("DELETE FROM knowledge WHERE id = ? AND source_type = 'customer_meeting'").bind(id)
    ));
  }
}

// ─── ユーティリティ ───────────────────────────────────────────────

async function batchInsert(db, stmts) {
  if (!stmts.length) return;
  for (let i = 0; i < stmts.length; i += 50) {
    await db.batch(stmts.slice(i, i + 50));
  }
}

function parseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function toISO(val) {
  if (!val) return null;
  if (typeof val === 'number') return new Date(val).toISOString();
  if (typeof val === 'string' && /^\d{10,13}$/.test(val)) return new Date(Number(val)).toISOString();
  return val;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

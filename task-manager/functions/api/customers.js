// functions/api/customers.js
// GET  /api/customers — 顧客一覧取得
// POST /api/customers — 顧客新規作成

export async function onRequestGet(context) {
  const { env } = context;
  try {
    return json({ customers: await loadCustomers(env.DB) });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const c = await request.json();
    const now = new Date().toISOString();
    await env.DB.prepare(
      'INSERT OR REPLACE INTO customers (id, name, sei, mei, aliases, email, phone, company, industry, business_type, contract_status, plan, address, memo, ai_profile, ai_profile_updated_at, meetings_updated_at, created_at, updated_at, fee, contract_start, birthday, entity_type, founding_date, admin_staff, family_structure, family_birthdays, years_in_business, career_history, bank, fiscal_year_end_month, contract_policy, tax_accountant, experts, communications, tags, ai_issues, ai_issues_updated_at, manual_issues) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      c.id, c.name ?? '', c.sei ?? null, c.mei ?? null,
      JSON.stringify(c.aliases ?? []),
      c.email ?? null, c.phone ?? null, c.company ?? null,
      c.industry ?? null, c.businessType ?? null,
      c.contractStatus ?? null, c.plan ?? null, c.address ?? null, c.memo ?? null,
      c.aiProfile ?? null, c.aiProfileUpdatedAt ?? null, c.meetingsUpdatedAt ?? null,
      c.createdAt ?? now, c.updatedAt ?? now,
      c.fee != null ? String(c.fee) : null,
      c.contractStart ?? null, c.birthday ?? null,
      c.entityType ?? null, c.foundingDate ?? null,
      c.adminStaff ?? null, c.familyStructure ?? null,
      c.familyBirthdays ?? null, c.yearsInBusiness ?? null,
      c.careerHistory ?? null, c.bank ?? null,
      c.fiscalYearEndMonth != null ? String(c.fiscalYearEndMonth) : null,
      c.contractPolicy ?? null,
      JSON.stringify(c.taxAccountant ?? {}),
      JSON.stringify(c.experts ?? []),
      JSON.stringify(c.communications ?? []),
      JSON.stringify(c.tags ?? []),
      c.aiIssues ?? null, c.aiIssuesUpdatedAt ?? null,
      JSON.stringify(c.manualIssues ?? [])
    ).run();
    return json({ ok: true, id: c.id });
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
    fee: c.fee != null ? Number(c.fee) : null,
    contractStart: c.contract_start ?? null,
    birthday: c.birthday ?? null,
    entityType: c.entity_type ?? null,
    foundingDate: c.founding_date ?? null,
    adminStaff: c.admin_staff ?? '',
    familyStructure: c.family_structure ?? '',
    familyBirthdays: c.family_birthdays ?? '',
    yearsInBusiness: c.years_in_business ?? '',
    careerHistory: c.career_history ?? '',
    bank: c.bank ?? '',
    fiscalYearEndMonth: c.fiscal_year_end_month != null ? Number(c.fiscal_year_end_month) : null,
    contractPolicy: c.contract_policy ?? '',
    taxAccountant: parseJSON(c.tax_accountant, {}),
    experts:       parseJSON(c.experts, []),
    communications: parseJSON(c.communications, []),
    tags:          parseJSON(c.tags, []),
    aiIssues: c.ai_issues ?? '',
    aiIssuesUpdatedAt: c.ai_issues_updated_at ?? null,
    manualIssues: parseJSON(c.manual_issues, []),
    aiProfile: c.ai_profile, aiProfileUpdatedAt: c.ai_profile_updated_at,
    meetingsUpdatedAt: c.meetings_updated_at,
    createdAt: c.created_at, updatedAt: c.updated_at,
    meetings: meetingsByCustomer[c.id] || [],
  }));
}

// ─── ユーティリティ ───────────────────────────────────────────────

function parseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

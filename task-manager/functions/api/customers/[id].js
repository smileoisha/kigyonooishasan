// functions/api/customers/[id].js
// PATCH  /api/customers/:id — 顧客個別更新（変更フィールドのみ動的SET）
// DELETE /api/customers/:id — 顧客削除（会議・knowledge・関連データも連鎖削除）

const FIELD_MAP = {
  name:               'name',
  sei:                'sei',
  mei:                'mei',
  aliases:            'aliases',
  email:              'email',
  phone:              'phone',
  company:            'company',
  industry:           'industry',
  businessType:       'business_type',
  contractStatus:     'contract_status',
  plan:               'plan',
  address:            'address',
  memo:               'memo',
  aiProfile:          'ai_profile',
  aiProfileUpdatedAt: 'ai_profile_updated_at',
  meetingsUpdatedAt:  'meetings_updated_at',
  updatedAt:          'updated_at',
  fee:                'fee',
  contractStart:      'contract_start',
  birthday:           'birthday',
  entityType:         'entity_type',
  foundingDate:       'founding_date',
  adminStaff:         'admin_staff',
  familyStructure:    'family_structure',
  familyBirthdays:    'family_birthdays',
  yearsInBusiness:    'years_in_business',
  careerHistory:      'career_history',
  bank:               'bank',
  fiscalYearEndMonth: 'fiscal_year_end_month',
  contractPolicy:     'contract_policy',
  taxAccountant:      'tax_accountant',
  experts:            'experts',
  communications:     'communications',
  tags:               'tags',
  aiIssues:           'ai_issues',
  aiIssuesUpdatedAt:  'ai_issues_updated_at',
  manualIssues:       'manual_issues',
};

const JSON_FIELDS = new Set(['aliases', 'taxAccountant', 'experts', 'communications', 'tags', 'manualIssues']);
const NUM_FIELDS  = new Set(['fee', 'fiscalYearEndMonth']);

export async function onRequestPatch(context) {
  const { env, request, params } = context;
  const customerId = params.id;
  try {
    const fields = await request.json();
    const sets = [], vals = [];
    for (const [jsKey, col] of Object.entries(FIELD_MAP)) {
      if (!(jsKey in fields)) continue;
      const v = fields[jsKey];
      sets.push(`${col} = ?`);
      if (NUM_FIELDS.has(jsKey)) {
        vals.push(v != null ? String(v) : null);
      } else if (JSON_FIELDS.has(jsKey)) {
        vals.push(JSON.stringify(v ?? (jsKey === 'taxAccountant' ? {} : [])));
      } else {
        vals.push(v ?? null);
      }
    }
    if (!sets.length) return json({ ok: true });
    // updatedAt が未指定なら自動セット
    if (!('updatedAt' in fields)) {
      sets.push('updated_at = ?');
      vals.push(new Date().toISOString());
    }
    vals.push(customerId);
    await env.DB.prepare(
      `UPDATE customers SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...vals).run();
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const customerId = params.id;
  try {
    // 面談ID・タスクIDを事前取得（孫レコード削除に必要）
    const [meetingsR, tasksR] = await Promise.all([
      env.DB.prepare('SELECT id FROM customer_meetings WHERE customer_id = ?').bind(customerId).all(),
      env.DB.prepare('SELECT id FROM tasks WHERE customer_id = ?').bind(customerId).all(),
    ]);
    const meetingIds = (meetingsR.results || []).map(m => m.id);
    const taskIds    = (tasksR.results   || []).map(t => t.id);

    // 1. task_notes / task_links / task_work_logs（孫）
    for (let i = 0; i < taskIds.length; i += 50) {
      const chunk = taskIds.slice(i, i + 50);
      const ph = chunk.map(() => '?').join(',');
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM task_notes     WHERE task_id IN (${ph})`).bind(...chunk),
        env.DB.prepare(`DELETE FROM task_links     WHERE task_id IN (${ph})`).bind(...chunk),
        env.DB.prepare(`DELETE FROM task_work_logs WHERE task_id IN (${ph})`).bind(...chunk),
      ]);
    }

    // 2. knowledge（子：面談に紐づく）
    for (let i = 0; i < meetingIds.length; i += 50) {
      const chunk = meetingIds.slice(i, i + 50);
      const ph = chunk.map(() => '?').join(',');
      await env.DB.prepare(
        `DELETE FROM knowledge WHERE source_id IN (${ph}) AND source_type = 'customer_meeting'`
      ).bind(...chunk).run();
    }

    // 3. customer_meetings / 4. customer_concerns / 5. tasks の customer_id detach
    await env.DB.batch([
      env.DB.prepare('DELETE FROM customer_meetings WHERE customer_id = ?').bind(customerId),
      env.DB.prepare('DELETE FROM customer_concerns WHERE customer_id = ?').bind(customerId),
      env.DB.prepare('UPDATE tasks SET customer_id = NULL WHERE customer_id = ?').bind(customerId),
    ]);

    // 6. customers（親）を最後に削除：途中失敗時も親が残りリトライで整合性回復可能
    await env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(customerId).run();

    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// functions/api/tasks/[id].js
// PATCH /api/tasks/:id — タスク個別更新（変更フィールドのみ）
// DELETE /api/tasks/:id — タスク削除（子孫 + 関連テーブル + knowledge エントリも連鎖削除）

export async function onRequestPatch(context) {
  const { env, request, params } = context;
  const taskId = params.id;
  try {
    const now = new Date().toISOString();
    const fields = await request.json();

    const fieldMap = {
      title:      'title',
      status:     'status',
      assigneeId: 'assignee_id',
      projectId:  'project_id',
      parentId:   'parent_id',
      startDate:  'start_date',
      dueDate:    'due_date',
      memo:       'memo',
      tags:       'tags',
      customerId: 'customer_id',
    };

    const setClauses = [];
    const binds = [];

    for (const [jsKey, colKey] of Object.entries(fieldMap)) {
      if (jsKey in fields) {
        setClauses.push(`${colKey} = ?`);
        binds.push(jsKey === 'tags' ? JSON.stringify(fields[jsKey] ?? []) : (fields[jsKey] ?? null));
      }
    }

    if (setClauses.length === 0) return json({ ok: true });

    setClauses.push('updated_at = ?');
    binds.push(fields.updatedAt ?? now);
    binds.push(taskId);

    await env.DB.prepare(
      `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`
    ).bind(...binds).run();

    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const taskId = params.id;
  try {
    // 子孫タスク ID を収集（再帰）
    const descendantIds = await collectDescendantIds(env.DB, taskId);
    const allIds = [...descendantIds, taskId];

    for (const id of allIds) {
      // knowledge エントリ削除（task_notes 削除前に note ID を取得）
      const notesR = await env.DB.prepare('SELECT id FROM task_notes WHERE task_id = ?').bind(id).all();
      const noteIds = (notesR.results || []).map(n => n.id).filter(Boolean);
      if (noteIds.length) {
        for (let i = 0; i < noteIds.length; i += 50) {
          const batch = noteIds.slice(i, i + 50);
          const ph = batch.map(() => '?').join(',');
          await env.DB.prepare(
            `DELETE FROM knowledge WHERE source_type = 'task_note' AND source_id IN (${ph})`
          ).bind(...batch).run();
        }
      }

      // 関連テーブル + タスク本体を削除
      await env.DB.batch([
        env.DB.prepare('DELETE FROM task_work_logs WHERE task_id = ?').bind(id),
        env.DB.prepare('DELETE FROM task_links WHERE task_id = ?').bind(id),
        env.DB.prepare('DELETE FROM task_notes WHERE task_id = ?').bind(id),
        env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id),
      ]);
    }

    return json({ ok: true, deleted: allIds.length });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

async function collectDescendantIds(db, taskId) {
  const result = [];
  const childrenR = await db.prepare('SELECT id FROM tasks WHERE parent_id = ?').bind(taskId).all();
  for (const child of (childrenR.results || [])) {
    result.push(child.id);
    const grandChildren = await collectDescendantIds(db, child.id);
    result.push(...grandChildren);
  }
  return result;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

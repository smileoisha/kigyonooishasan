// functions/api/backup.js
// R2 + Google Drive へのバックアップ API
// GET  /api/backup       → バックアップ状態・一覧取得
// POST /api/backup       → バックアップ実行 { target: "r2" | "gdrive" | "all" }
// GET  /api/backup?download=YYYY-MM-DD → 指定日のバックアップをダウンロード

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  // ─── GET: バックアップ状態・一覧 or ダウンロード ───────────
  if (method === 'GET') {
    const downloadDate = url.searchParams.get('download');

    // 指定日付のバックアップをダウンロード
    if (downloadDate) {
      try {
        const key = `backup/${downloadDate}.json`;
        const obj = await env.FILES.get(key);
        if (!obj) {
          return new Response(JSON.stringify({ error: 'Backup not found' }), {
            status: 404,
            headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }
        const content = await obj.text();
        return new Response(content, {
          headers: {
            ...cors,
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="task-manager-backup-${downloadDate}.json"`
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
    }

    // バックアップ一覧とステータス取得
    try {
      const statusRow = await env.DB.prepare('SELECT value FROM store WHERE key = ?')
        .bind('backup-status').first();
      const status = statusRow ? JSON.parse(statusRow.value) : null;

      const r2List = await env.FILES.list({ prefix: 'backup/' });
      const backups = (r2List.objects || [])
        .map(o => ({
          key: o.key,
          date: o.key.replace('backup/', '').replace('.json', ''),
          size: o.size,
          uploaded: o.uploaded
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30);

      const gdriveConfigured = !!(env.GOOGLE_CREDENTIALS && env.GOOGLE_DRIVE_FOLDER_ID);

      return new Response(JSON.stringify({ ok: true, status, backups, gdriveConfigured }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
  }

  // ─── POST: バックアップ実行 ────────────────────────────────
  if (method === 'POST') {
    try {
      const body = await request.json().catch(() => ({}));
      const target = body.target || 'r2';

      // リレーショナルテーブルからデータ組み立て（manualナレッジも含める）
      const [storeData, knowledgeResult] = await Promise.all([
        assembleDataForBackup(env.DB),
        env.DB.prepare(
          "SELECT id, source_type, source_id, title, body, structured, tags, customer_id, parent_id, category, sort_order, created_at, updated_at FROM knowledge WHERE source_type = 'manual' ORDER BY created_at"
        ).all(),
      ]);
      storeData._manualKnowledge = knowledgeResult.results || [];
      const dataStr = JSON.stringify(storeData);
      const date = new Date().toISOString().slice(0, 10);
      const filename = `backup-${date}.json`;
      const results = {};

      // ── R2バックアップ ──────────────────────────────────
      if (target === 'r2' || target === 'all') {
        try {
          await env.FILES.put(`backup/${filename}`, dataStr, {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { createdAt: new Date().toISOString(), source: 'auto' }
          });
          results.r2 = { ok: true, key: `backup/${filename}` };

          // 30日より古いバックアップを削除
          const list = await env.FILES.list({ prefix: 'backup/' });
          const sorted = (list.objects || [])
            .sort((a, b) => b.key.localeCompare(a.key));
          if (sorted.length > 30) {
            for (const obj of sorted.slice(30)) {
              await env.FILES.delete(obj.key);
            }
          }
        } catch (e) {
          results.r2 = { ok: false, error: e.message };
        }
      }

      // ── Google Driveバックアップ ────────────────────────
      if (target === 'gdrive' || target === 'all') {
        if (!env.GOOGLE_CREDENTIALS) {
          results.gdrive = { ok: false, error: 'GOOGLE_CREDENTIALS not configured' };
        } else {
          try {
            const credentials = JSON.parse(env.GOOGLE_CREDENTIALS);
            const token = await getGoogleAccessToken(credentials);
            const folderId = env.GOOGLE_DRIVE_FOLDER_ID || null;
            await uploadToGoogleDrive(token, filename, dataStr, folderId);
            results.gdrive = { ok: true };
          } catch (e) {
            results.gdrive = { ok: false, error: e.message };
          }
        }
      }

      // バックアップ状態をD1に保存
      const statusData = {
        lastBackup: new Date().toISOString(),
        lastBackupDate: date,
        results
      };
      await env.DB.prepare(
        'INSERT OR REPLACE INTO store (key, value, updated_at) VALUES (?, ?, ?)'
      ).bind('backup-status', JSON.stringify(statusData), new Date().toISOString()).run();

      return new Response(JSON.stringify({ ok: true, date, results }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}

// ─── Google Drive ヘルパー ──────────────────────────────────

// PEM形式の秘密鍵をArrayBufferに変換
function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buffer;
}

// Base64URL エンコード
function b64url(obj) {
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// サービスアカウント JWT で Google アクセストークンを取得
async function getGoogleAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'RS256', typ: 'JWT' });
  const claim  = b64url({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  });

  const signingInput = `${header}.${claim}`;
  const keyData = pemToArrayBuffer(credentials.private_key);
  const key = await crypto.subtle.importKey(
    'pkcs8', keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key,
    new TextEncoder().encode(signingInput)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${signingInput}.${sigB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token error: ${err}`);
  }
  const { access_token } = await tokenRes.json();
  return access_token;
}

// Google Drive にファイルをアップロード（同名ファイルは上書き）
async function uploadToGoogleDrive(token, filename, content, folderId) {
  // 同名ファイルを検索（当日分は上書き）
  const q = `name='${filename}'${folderId ? ` and '${folderId}' in parents` : ''} and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!searchRes.ok) throw new Error(`Drive search error: ${await searchRes.text()}`);
  const { files } = await searchRes.json();

  let res;
  if (files && files.length > 0) {
    // 既存ファイルを更新（メタデータ不要）
    res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: content
      }
    );
  } else {
    // 新規作成（multipart）
    const boundary = 'backup_boundary_20250415';
    const meta = JSON.stringify({
      name: filename,
      mimeType: 'application/json',
      ...(folderId ? { parents: [folderId] } : {})
    });
    const multipart = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      meta,
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      content,
      `--${boundary}--`
    ].join('\r\n');

    res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`
        },
        body: multipart
      }
    );
  }

  if (!res.ok) throw new Error(`Drive upload error: ${await res.text()}`);
  return await res.json();
}

// ─── リレーショナルテーブルからバックアップ用データを組み立て ──
async function assembleDataForBackup(db) {
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

  const notesByTask = {}, linksByTask = {}, logsByTask = {};
  for (const n of notes) (notesByTask[n.task_id] ||= []).push({ id: n.id, content: n.content, at: n.created_at, updatedAt: n.updated_at });
  for (const l of links) (linksByTask[l.task_id] ||= []).push({ id: l.id, label: l.label, url: l.url, type: l.type, fileType: l.file_type });
  for (const w of logs)  (logsByTask[w.task_id]  ||= []).push({ action: w.action, userId: w.user_id, at: w.at, reason: w.reason });

  const meetingsByCustomer = {};
  for (const m of meetings) {
    (meetingsByCustomer[m.customer_id] ||= []).push({
      id: m.id, date: m.date, conclusion: m.conclusion,
      process: m.process || '', content: m.content || '',
      aiSummary: m.ai_summary || '', financialNote: m.financial_note || '',
      actionPlan: m.action_plan || '',
      issues:      _parseJSON(m.issues, []),
      proposals:   _parseJSON(m.proposals, []),
      nextActions: _parseJSON(m.next_actions, []),
      tags:        _parseJSON(m.tags, []),
      updatedAt: m.updated_at,
    });
  }

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
      tags: _parseJSON(t.tags, []), children: _parseJSON(t.children, []),
      customerId: t.customer_id,
      notes: notesByTask[t.id] || [], links: linksByTask[t.id] || [], workLog: logsByTask[t.id] || [],
      createdAt: t.created_at, updatedAt: t.updated_at,
    })),
    customers: customers.map(c => ({
      id: c.id, name: c.name, sei: c.sei, mei: c.mei,
      aliases: _parseJSON(c.aliases, []),
      email: c.email, phone: c.phone, company: c.company,
      industry: c.industry, businessType: c.business_type,
      contractStatus: c.contract_status, plan: c.plan,
      address: c.address, memo: c.memo || '',
      aiProfile: c.ai_profile, aiProfileUpdatedAt: c.ai_profile_updated_at,
      meetingsUpdatedAt: c.meetings_updated_at,
      createdAt: c.created_at, updatedAt: c.updated_at,
      meetings: meetingsByCustomer[c.id] || [],
    })),
    projects: projects.map(p => ({ id: p.id, name: p.name, color: p.color, dueDate: p.due_date, status: p.status })),
    users: users.map(u => ({ id: u.id, name: u.name, avatar: u.avatar })),
    locations: locations.map(l => ({ id: l.id, label: l.label, startDate: l.start_date, endDate: l.end_date, color: l.color })),
    tagMaster,
  };
}

function _parseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

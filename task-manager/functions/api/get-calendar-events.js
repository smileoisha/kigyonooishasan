// functions/api/get-calendar-events.js
// 指定日のGoogleカレンダー予定一覧を取得（ダブルブッキング防止用）
// 認証: OAuth2 リフレッシュトークン方式（schedule-meeting.js と同じシークレットを使用）

export async function onRequestGet(context) {
  const { env, request } = context;
  try {
    const url = new URL(request.url);
    const date = url.searchParams.get('date'); // YYYY-MM-DD

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json({ error: '日付パラメータが不正です（YYYY-MM-DD 形式で指定）' }, 400);
    }

    const clientId     = env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
    const refreshToken = env.GOOGLE_OAUTH_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken) {
      return json({ error: 'OAuth認証情報が設定されていません' }, 500);
    }

    const accessToken = await getAccessTokenFromRefresh(clientId, clientSecret, refreshToken);
    const events = await listDayEvents(accessToken, date);

    return json({ events });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

async function getAccessTokenFromRefresh(clientId, clientSecret, refreshToken) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await resp.json();
  if (!data.access_token) {
    throw new Error(`アクセストークン取得失敗: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function listDayEvents(accessToken, date) {
  const timeMin = `${date}T00:00:00+09:00`;
  const timeMax = `${date}T23:59:59+09:00`;
  const headers = { Authorization: `Bearer ${accessToken}` };

  // 全カレンダー一覧を取得
  const calListResp = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?fields=items(id,summary,accessRole)',
    { headers }
  );
  const calListData = await calListResp.json();
  if (!calListResp.ok) {
    throw new Error(`CalendarList API エラー: ${JSON.stringify(calListData?.error || calListData)}`);
  }

  // 読み取り権限があるカレンダーのみ対象
  const calendars = (calListData.items || []).filter(c =>
    ['owner', 'writer', 'reader', 'freeBusyReader'].includes(c.accessRole)
  );

  // 全カレンダーの予定を並列取得
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
    fields: 'items(summary,start,end,status)',
  });

  const results = await Promise.all(
    calendars.map(async cal => {
      try {
        const resp = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
          { headers }
        );
        const data = await resp.json();
        if (!resp.ok) return [];
        return (data.items || [])
          .filter(e => e.status !== 'cancelled')
          .map(e => ({
            summary: e.summary || '（タイトルなし）',
            start: e.start?.dateTime || e.start?.date || '',
            end:   e.end?.dateTime   || e.end?.date   || '',
            allDay: !e.start?.dateTime,
          }));
      } catch {
        return [];
      }
    })
  );

  // マージして開始時刻順にソート（終日予定は末尾）
  const all = results.flat();
  all.sort((a, b) => {
    if (a.allDay && !b.allDay) return 1;
    if (!a.allDay && b.allDay) return -1;
    return a.start.localeCompare(b.start);
  });

  // 重複除去（同一summary+start が複数カレンダーに入ることがある）
  const seen = new Set();
  return all.filter(e => {
    const key = `${e.summary}|${e.start}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

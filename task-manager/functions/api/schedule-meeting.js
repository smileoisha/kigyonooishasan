// functions/api/schedule-meeting.js
// Google Calendar イベント作成（Google Meet付き）+ 顧客へ招待メール
// 認証: OAuth2 リフレッシュトークン方式
//   必要なWorkersシークレット:
//     - GOOGLE_OAUTH_CLIENT_ID
//     - GOOGLE_OAUTH_CLIENT_SECRET
//     - GOOGLE_OAUTH_REFRESH_TOKEN

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const { customerEmail, customerName, title, startDateTime, endDateTime, description } =
      await request.json();

    if (!customerEmail || !startDateTime || !endDateTime) {
      return json({ error: '必須項目が不足しています（customerEmail / startDateTime / endDateTime）' }, 400);
    }

    const clientId     = env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
    const refreshToken = env.GOOGLE_OAUTH_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken) {
      return json({ error: 'OAuth認証情報（CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN）が設定されていません' }, 500);
    }

    const accessToken = await getAccessTokenFromRefresh(clientId, clientSecret, refreshToken);
    const result = await createCalendarEvent(accessToken, {
      title: title || `${customerName || customerEmail} との面談`,
      startDateTime,
      endDateTime,
      description: description || '',
      attendeeEmail: customerEmail,
      calendarId: 'primary',
    });

    return json({ success: true, eventLink: result.htmlLink, meetLink: result.meetLink });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── Refresh Token → Access Token ────────────────────────────────────────

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

// ─── Google Calendar イベント作成 ─────────────────────────────────────────

async function createCalendarEvent(accessToken, { title, startDateTime, endDateTime, description, attendeeEmail, calendarId }) {
  const body = {
    summary: title,
    description,
    start: { dateTime: startDateTime, timeZone: 'Asia/Tokyo' },
    end: { dateTime: endDateTime, timeZone: 'Asia/Tokyo' },
    attendees: [{ email: attendeeEmail }],
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: { useDefault: true },
    guestsCanModify: false,
    guestsCanInviteOthers: false,
  };

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Calendar API エラー: ${JSON.stringify(data?.error || data)}`);
  }

  const meetLink =
    data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null;

  return { htmlLink: data.htmlLink, meetLink };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

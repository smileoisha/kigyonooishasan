// functions/api/file/[key].js — R2 ファイル取得 API

export async function onRequestGet(context) {
  const { env, params } = context;
  const key = params.key;

  try {
    const object = await env.FILES.get(key);
    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    // 元のファイル名があればダウンロード用に設定
    const originalName = object.customMetadata?.originalName;
    if (originalName) {
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
    }

    return new Response(object.body, { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

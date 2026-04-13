// functions/api/upload.js — R2 ファイルアップロード API

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return new Response(JSON.stringify({ error: 'ファイルが見つかりません' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 10MB上限
    if (file.size > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: '10MB以内のファイルを選択してください' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ユニークキー生成
    const key = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const ext = file.name.split('.').pop() || '';
    const fullKey = ext ? `${key}.${ext}` : key;

    // R2に保存
    await env.FILES.put(fullKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: file.name }
    });

    return new Response(JSON.stringify({
      ok: true,
      key: fullKey,
      name: file.name,
      type: file.type,
      size: file.size
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

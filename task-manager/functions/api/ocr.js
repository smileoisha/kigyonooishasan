// functions/api/ocr.js — 契約書から契約締結日をAI抽出

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return new Response(JSON.stringify({ error: 'ファイルがありません' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // base64エンコード
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8.slice(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    const response = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: base64 },
            {
              type: 'text',
              text: 'この契約書から契約締結日（契約日）を探してください。YYYY-MM-DD形式のみで返してください。例：2024-04-01。和暦（令和、平成など）は西暦に変換してください。日付が見つからない場合のみ not_found と返してください。日付だけを返し、他の文字は一切不要です。'
            }
          ]
        }
      ]
    });

    const raw = (response.response || '').trim();
    // YYYY-MM-DD形式かチェック
    const match = raw.match(/\d{4}-\d{2}-\d{2}/);
    const date = match ? match[0] : 'not_found';

    return new Response(JSON.stringify({ date }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

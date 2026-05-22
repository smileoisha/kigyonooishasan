// functions/api/mcp.js — MCP Streamable HTTP サーバー（読み取り専用）
// Claude Desktop カスタムコネクターから POST /api/mcp で呼ばれる

const STATUS_LABEL = {
  pending: '未着手', inProgress: '進行中', stuck: 'スタック',
  review: '確認待ち', done: '完了'
};

// ─── HP読み取り用定数 ──────────────────────────────────────────
const HP_BASE = 'https://kigyonooishasan-hp.pages.dev';

function hpFetchHeaders(env) {
  const h = { 'User-Agent': 'MCP-HPReader/1.0' };
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    h['CF-Access-Client-Id'] = env.CF_ACCESS_CLIENT_ID;
    h['CF-Access-Client-Secret'] = env.CF_ACCESS_CLIENT_SECRET;
  }
  return h;
}

const HP_MAIN_PAGES = [
  { path: 'index.html',           label: 'トップページ' },
  { path: 'service.html',         label: 'サービス・料金' },
  { path: 'contact.html',         label: 'お問い合わせ' },
  { path: 'library.html',         label: '講習会（全6回インライン・約1939行）' },
  { path: 'chukyu-1.html',        label: '中級編 第1回' },
  { path: 'chukyu-2.html',        label: '中級編 第2回' },
  { path: 'chukyu-3.html',        label: '中級編 第3回' },
  { path: 'shoshinsha.html',      label: '初心者向け' },
  { path: 'shindan.html',         label: '診断' },
  { path: 'blog/index.html',      label: 'ブログ一覧' },
  { path: 'materials/index.html', label: '資料ライブラリ一覧' },
];

// ─── ツール定義 ──────────────────────────────────────────────
const TOOLS = [
  {
    name: 'search_knowledge',
    description: 'ナレッジ（タスクメモ・面談記録・手動ナレッジ）を全文検索します。「○○について過去に何を書いた？」などに使います。',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string', description: '検索キーワード' },
        source_type: { type: 'string', enum: ['task_note', 'customer_meeting', 'manual'], description: 'ソース絞り込み（省略可）' },
        customer_id: { type: 'string', description: '顧客ID絞り込み（省略可）' },
        tags:        { type: 'string', description: 'タグで絞り込み（カンマ区切りで複数指定可。例: "財務,戦略"）' },
        category:    { type: 'string', enum: ['normal', 'protected'], description: 'カテゴリ絞り込み（省略時は全カテゴリ）' },
        limit:       { type: 'number', description: '最大件数（デフォルト10、最大20）' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_customer',
    description: '顧客情報と直近の面談記録を取得します。',
    inputSchema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: '顧客ID' },
        name:        { type: 'string', description: '顧客名（部分一致）' }
      }
    }
  },
  {
    name: 'list_customers',
    description: '顧客の一覧を取得します。',
    inputSchema: {
      type: 'object',
      properties: {
        tier:  { type: 'string', description: '契約プランで絞り込み' },
        limit: { type: 'number', description: '最大件数（デフォルト20）' }
      }
    }
  },
  {
    name: 'get_tasks',
    description: 'タスク一覧を取得します。',
    inputSchema: {
      type: 'object',
      properties: {
        status:      { type: 'string', enum: ['pending', 'inProgress', 'stuck', 'review', 'done'], description: 'ステータス絞り込み' },
        customer_id: { type: 'string', description: '顧客ID絞り込み' },
        limit:       { type: 'number', description: '最大件数（デフォルト20）' }
      }
    }
  },
  {
    name: 'get_customer_summary',
    description: '顧客の現状サマリーを返します。経営課題・次回アクション・直近面談の要約を集約します。',
    inputSchema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: '顧客ID' }
      },
      required: ['customer_id']
    }
  },
  {
    name: 'get_customer_concerns',
    description: '顧客の困りごと投稿を取得します。面談前の準備に使用します。未解決の投稿を事前に把握できます。',
    inputSchema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: '顧客ID（必須）' },
        status: { type: 'string', enum: ['open', 'resolved', 'all'], description: '絞り込み（デフォルト: open）' }
      },
      required: ['customer_id']
    }
  },
  {
    name: 'create_knowledge',
    description: '手動ナレッジを新規作成します。【重要】作成前に必ず search_knowledge で既存エントリと重複していないか確認し、重複していた場合は作成せず院長に報告してください。\n\n【body の書式テンプレート（必ず守ること）】\n```\n## 概要\n（一言サマリー）\n\n## 内容\n（詳細・箇条書き・表など）\n\n## 備考\n（補足情報・出典・関連リンクなど。不要な場合は省略可）\n```\nMarkdown（## 見出し / - リスト / **太字** / | 表 |）を使うこと。body はサーバー側で自動的に HTML に変換されるため、HTML タグは書かないこと。',
    inputSchema: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'ナレッジのタイトル' },
        body:        { type: 'string', description: '本文（Markdown形式。## 見出し / - リスト / **太字** / | 表 | を使い、上記テンプレートに従って記述）' },
        tags:        { type: 'string', description: 'タグ（カンマ区切り、省略可）' },
        customer_id: { type: 'string', description: '顧客ID（顧客ひもづけする場合のみ、省略可）' },
        parent_id:   { type: 'string', description: '親ナレッジのID（省略時はルートに作成）' },
        category:    { type: 'string', enum: ['normal', 'protected'], description: 'カテゴリ（省略時は normal）' }
      },
      required: ['title', 'body']
    }
  },
  {
    name: 'update_knowledge',
    description: '既存の手動ナレッジを部分更新します。指定したフィールドのみ変更され、省略したフィールドは現在の値を保持します。\n\n【更新可能フィールド】\n- title: タイトル\n- body: 本文全体を置き換え（Markdown形式。必ず事前に read_knowledge で全文確認すること）\n- append_body: 本文末尾に追記（body との同時指定不可。既存本文は保持される）\n- tags: タグ（カンマ区切り）\n- customer_id: 顧客紐づけ（空文字 "" で紐づけ解除）\n- parent_id: 親ナレッジ（空文字 "" でルートに移動）\n\n【重要】source_type が manual のエントリのみ変更可能。\n【重要】body で本文全体を置き換える前に、必ず read_knowledge で全文を確認し、変更理由と変更範囲を院長に報告すること。\n【重要】内容を追記するだけなら append_body を使う（既存本文が保持されるため安全）。',
    inputSchema: {
      type: 'object',
      properties: {
        id:          { type: 'string', description: '変更対象のナレッジID（必須）' },
        title:       { type: 'string', description: '新しいタイトル（省略時は変更しない）' },
        body:        { type: 'string', description: '新しい本文（Markdown形式。全体を置き換える。事前に read_knowledge で全文確認必須）' },
        append_body: { type: 'string', description: '本文末尾に追記するMarkdown（body と同時指定不可。既存本文は保持される。<hr>で区切られて追加）' },
        tags:        { type: 'string', description: '新しいタグ（カンマ区切り。空文字で全タグ削除。省略時は変更しない）' },
        customer_id: { type: 'string', description: '新しい顧客ID（空文字 "" で紐づけ解除。省略時は変更しない）' },
        parent_id:   { type: 'string', description: '新しい親ナレッジID（空文字 "" でルートへ移動。省略時は変更しない）' },
        category:    { type: 'string', enum: ['normal', 'protected'], description: 'カテゴリ変更（省略時は変更しない）' }
      },
      required: ['id']
    }
  },
  {
    name: 'read_knowledge',
    description: 'ナレッジの全文（完全な本文）を取得します。search_knowledge は300文字の抜粋しか返しませんが、このツールはIDを指定して1件の全文を返します。\n【重要】update_knowledge の body を変更する前に必ずこのツールで全文を確認してください。内容の欠落を防ぐために設けられています。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ナレッジID（必須）' }
      },
      required: ['id']
    }
  },
  {
    name: 'list_hp_pages',
    description: 'HPの全ページ一覧を返します。メインページ（固定11本）＋ブログ記事＋資料一覧を動的取得。read_hp_page / search_hp_content で使う path を確認するのに使います。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'read_hp_page',
    description: 'HPの指定ページをフェッチしテキスト抽出して返します（5000文字ずつ取得）。offsetで続きを読めます。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'ページのパス（例: service.html / blog/cashflow-basics.html）先頭スラッシュ不要' },
        offset: { type: 'number', description: '読み取り開始位置（文字数）。省略時は0。続きを読む場合: offset=5000, 10000...' }
      },
      required: ['path']
    }
  },
  {
    name: 'search_hp_content',
    description: 'HPのメインページ11本をキーワード横断検索します。各ページをfetchしてテキスト抽出後に前後50文字のスニペットを返します（ブログ個別記事・スライドは対象外）。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '検索キーワード（部分一致・大文字小文字区別なし）' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_hp_design_tokens',
    description: 'HPのCSSとTailwind設定からデザイントークン（カラー・フォント・spacing・シャドウ等）をJSON形式で返します。提案書・スライド・資料をHPと色味・トーンで統一する際に使います。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'read_hp_source',
    description: 'HPの指定ファイルのソースコード（HTML/CSS/JS）をそのまま返します（10000文字ずつ、offsetで続きを取得可）。デザイン再現やCodeへの実装指示時の正確な参照に使います。',
    inputSchema: {
      type: 'object',
      properties: {
        path:   { type: 'string', description: 'ファイルパス（例: index.html, css/style.css）先頭スラッシュ不要。.html/.css/.js/.json のみ許可。' },
        offset: { type: 'number', description: '読み取り開始位置（文字数）。省略時は0。' }
      },
      required: ['path']
    }
  }
];

// ─── CORS ────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id',
};

// ─── エントリポイント ─────────────────────────────────────────
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { env, request } = context;

  // 認証チェック
  const authErr = checkAuth(request, env);
  if (authErr) return authErr;

  // JSON-RPC パース
  let rpc;
  try { rpc = await request.json(); }
  catch { return rpcError(-32700, 'Parse error', null); }

  const { method, params, id } = rpc;
  console.log('[MCP]', method, JSON.stringify(params || {}).slice(0, 200));

  try {
    switch (method) {
      case 'initialize':
        return rpcResult(handleInitialize(), id);
      case 'initialized':
        return rpcResult({}, id);
      case 'tools/list':
        return rpcResult({ tools: TOOLS }, id);
      case 'tools/call':
        return rpcResult(await handleToolCall(params, env), id);
      default:
        return rpcError(-32601, `Method not found: ${method}`, id);
    }
  } catch (e) {
    console.error('[MCP error]', e.message);
    return rpcError(-32603, e.message, id);
  }
}

export async function onRequestGet() {
  return new Response(JSON.stringify({
    name: '企業のお医者さん MCP',
    version: '1.0',
    protocolVersion: '2024-11-05',
    status: 'running'
  }), {
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

// ─── 認証 ───────────────────────────────────────────────────
function checkAuth(request, env) {
  const apiKey = env.MCP_API_KEY;
  if (!apiKey) return null; // 未設定時はスキップ（ローカル開発用）

  // ヘッダー認証（mcp-remote 等の CLI 経由）
  const auth = request.headers.get('Authorization') || '';
  if (auth === `Bearer ${apiKey}`) return null;

  // URL クエリパラメータ認証（claude.ai UI 経由）
  const url = new URL(request.url);
  if (url.searchParams.get('key') === apiKey) return null;

  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401, headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

// ─── initialize ──────────────────────────────────────────────
function handleInitialize() {
  return {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: { name: '企業のお医者さん MCP', version: '1.0' }
  };
}

// ─── ツール呼び出しルーター ───────────────────────────────────
async function handleToolCall(params, env) {
  const { name, arguments: args = {} } = params || {};
  switch (name) {
    case 'search_knowledge':    return await toolSearchKnowledge(args, env);
    case 'get_customer':        return await toolGetCustomer(args, env);
    case 'list_customers':      return await toolListCustomers(args, env);
    case 'get_tasks':           return await toolGetTasks(args, env);
    case 'get_customer_summary':       return await toolGetCustomerSummary(args, env);
    case 'get_customer_concerns':      return await toolGetCustomerConcerns(args, env);
    case 'create_knowledge':    return await toolCreateKnowledge(args, env);
    case 'update_knowledge':    return await toolUpdateKnowledge(args, env);
    case 'read_knowledge':      return await toolReadKnowledge(args, env);
    case 'list_hp_pages':        return await toolListHpPages(args, env);
    case 'read_hp_page':         return await toolReadHpPage(args, env);
    case 'search_hp_content':    return await toolSearchHpContent(args, env);
    case 'get_hp_design_tokens': return await toolGetHpDesignTokens(args, env);
    case 'read_hp_source':       return await toolReadHpSource(args, env);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── D1 store から全データ取得（共通） ───────────────────────
async function loadData(env) {
  const row = await env.DB.prepare('SELECT value FROM store WHERE key = ?').bind('main').first();
  if (!row) return { tasks: [], customers: [] };
  return JSON.parse(row.value);
}

// ─── ツール: search_knowledge ────────────────────────────────
async function toolSearchKnowledge({ query, source_type, customer_id, tags, category, limit = 10 }, env) {
  limit = Math.min(Number(limit) || 10, 20);

  const SELECT = 'id, source_type, source_id, title, SUBSTR(body,1,300) AS excerpt, tags, customer_id, parent_id, updated_at';
  let sql;
  const params = [];
  let hasScore = false;

  if (query && query.trim()) {
    const tokens = query.trim().split(/\s+/).filter(Boolean);
    const scoreParams = [];
    const filterParams = [];

    const scoreParts = tokens.map(t => {
      const like = `%${t}%`;
      scoreParams.push(like, like, like);
      return '(CASE WHEN title LIKE ? THEN 2 ELSE 0 END + CASE WHEN body LIKE ? THEN 1 ELSE 0 END + CASE WHEN tags LIKE ? THEN 1 ELSE 0 END)';
    });
    const filterParts = tokens.map(t => {
      const like = `%${t}%`;
      filterParams.push(like, like, like);
      return '(title LIKE ? OR body LIKE ? OR tags LIKE ?)';
    });

    sql = `SELECT ${SELECT}, (${scoreParts.join(' + ')}) AS _score FROM knowledge WHERE deleted_at IS NULL`;
    sql += ` AND (${filterParts.join(' OR ')})`;
    params.push(...scoreParams, ...filterParams);
    hasScore = true;
  } else {
    sql = `SELECT ${SELECT} FROM knowledge WHERE deleted_at IS NULL`;
  }

  if (source_type) { sql += ' AND source_type = ?'; params.push(source_type); }
  if (customer_id) { sql += ' AND customer_id = ?'; params.push(customer_id); }
  if (category && ['normal', 'protected'].includes(category)) {
    sql += ' AND category = ?'; params.push(category);
  }
  if (tags && tags.trim()) {
    // カンマ区切りのタグをそれぞれ LIKE 検索（OR条件）
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      const tagConds = tagList.map(() => 'tags LIKE ?').join(' OR ');
      sql += ` AND (${tagConds})`;
      tagList.forEach(t => params.push(`%"${t}"%`));
    }
  }
  const orderBy = hasScore ? '_score DESC, updated_at DESC' : 'updated_at DESC';
  sql += ` ORDER BY ${orderBy} LIMIT ?`;
  params.push(limit);

  const rows = await env.DB.prepare(sql).bind(...params).all();
  if (!rows.results.length) return mcpText('該当するナレッジが見つかりませんでした。');

  // 顧客名マスキング + 全顧客辞書を構築
  const data = await loadData(env);
  const dict = buildMaskDict(data.customers || []);
  const custMap = Object.fromEntries((data.customers || []).map(c => [c.id, maskName(c.name, c.sei)]));

  const lines = rows.results.map(r => {
    const type = { task_note: 'タスクメモ', customer_meeting: '面談記録', manual: 'ナレッジ' }[r.source_type] || r.source_type;
    const cust = r.customer_id ? `【顧客: ${custMap[r.customer_id] || r.customer_id}】` : '';
    const title   = maskText(r.title || '', dict);
    const excerpt = maskText(stripHtml(r.excerpt), dict);
    let tagArr = [];
    try { tagArr = JSON.parse(r.tags || '[]'); } catch (_) {}
    if (!Array.isArray(tagArr)) tagArr = [];
    const tagStr    = tagArr.length ? `タグ: ${tagArr.join(', ')}\n` : '';
    const parentStr = r.parent_id ? `parent_id: ${r.parent_id}\n` : '';
    return `### ${title}\nID: ${r.id}\n${parentStr}${tagStr}種別: ${type}${cust}　更新: ${r.updated_at?.slice(0, 10) || ''}\n${excerpt}`;
  });

  const truncated = rows.results.length === limit ? `\n（最大${limit}件表示。より絞り込む場合は source_type や customer_id を指定してください）` : '';
  return mcpText(lines.join('\n\n---\n\n') + truncated);
}

// ─── ツール: get_customer ────────────────────────────────────
async function toolGetCustomer({ customer_id, name }, env) {
  const data = await loadData(env);
  let customer = null;
  if (customer_id) {
    customer = (data.customers || []).find(c => c.id === customer_id);
  } else if (name) {
    customer = (data.customers || []).find(c => (c.name || '').includes(name));
  }
  if (!customer) return mcpText('顧客が見つかりませんでした。');

  const dict = buildMaskDict(data.customers || []);
  const meetings = (customer.meetings || [])
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 3)
    .map(m => formatMeeting(m, dict));

  const lines = [
    `## ${maskName(customer.name, customer.sei)}`,
    customer.company      ? `会社名: ${maskCompany(customer.company)}` : '',
    customer.plan         ? `契約プラン: ${customer.plan}` : '',
    customer.email        ? `メール: ${maskEmail(customer.email)}` : '',
    customer.phone        ? `電話: ${maskPhone(customer.phone)}` : '',
    customer.address      ? `住所: ${maskAddress(customer.address)}` : '',
    customer.businessType ? `業種: ${customer.businessType}` : '',
    customer.memo         ? `メモ: ${maskText(customer.memo, dict)}` : '',
    meetings.length ? `\n### 直近面談（${meetings.length}件）\n` + meetings.join('\n\n') : '面談記録なし'
  ].filter(Boolean);

  return mcpText(lines.join('\n'));
}

// ─── ツール: list_customers ───────────────────────────────────
async function toolListCustomers({ tier, limit = 20 }, env) {
  const data = await loadData(env);
  let list = data.customers || [];
  if (tier) list = list.filter(c => (c.plan || '') === tier);
  list = list.slice(0, Math.min(Number(limit) || 20, 50));
  if (!list.length) return mcpText('顧客が見つかりませんでした。');

  const lines = list.map(c => {
    const lastMeeting = (c.meetings || []).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    const company = c.company ? ` / ${maskCompany(c.company)}` : '';
    return `- **${maskName(c.name, c.sei)}**${company}  ID: ${c.id}  プラン: ${c.plan || '未設定'}  最終面談: ${lastMeeting?.date || 'なし'}`;
  });
  return mcpText(`顧客一覧（${list.length}件）\n\n` + lines.join('\n'));
}

// ─── ツール: get_tasks ────────────────────────────────────────
async function toolGetTasks({ status, customer_id, limit = 20 }, env) {
  const data = await loadData(env);
  let tasks = (data.tasks || []).flatMap(t => {
    const isTop = matchTask(t, status, customer_id);
    const subs = (t.subtasks || []).filter(s => matchTask(s, status, customer_id)).map(s => ({ ...s, _parent: t.title }));
    return [...(isTop ? [t] : []), ...subs];
  });
  tasks = tasks.slice(0, Math.min(Number(limit) || 20, 50));
  if (!tasks.length) return mcpText('タスクが見つかりませんでした。');

  const custMap = Object.fromEntries((data.customers || []).map(c => [c.id, c.name]));
  const lines = tasks.map(t => {
    const st = STATUS_LABEL[t.status] || t.status || '';
    const due = t.dueDate ? `期日: ${t.dueDate}` : '';
    const cust = t.customerId ? `顧客: ${custMap[t.customerId] || t.customerId}` : '';
    const parent = t._parent ? `（親: ${t._parent}）` : '';
    return `- **${t.title}**${parent}  [${st}]  ${due}  ${cust}`.trim();
  });
  return mcpText(`タスク一覧（${tasks.length}件）\n\n` + lines.join('\n'));
}

function matchTask(t, status, customer_id) {
  if (status && t.status !== status) return false;
  if (customer_id && t.customerId !== customer_id) return false;
  return true;
}

// ─── ツール: get_customer_summary ────────────────────────────
async function toolGetCustomerSummary({ customer_id }, env) {
  const data = await loadData(env);
  const customer = (data.customers || []).find(c => c.id === customer_id);
  if (!customer) return mcpText('顧客が見つかりませんでした。');

  const dict = buildMaskDict(data.customers || []);
  const meetings = (customer.meetings || []).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const latest = meetings[0];

  const allIssues = [...new Set(meetings.flatMap(m => m.issues || []))].slice(0, 5);
  const allNextActions = [...new Set(meetings.flatMap(m => m.nextActions || []))].slice(0, 5);

  const lines = [
    `## ${maskName(customer.name, customer.sei)} — サマリー`,
    customer.plan ? `契約プラン: ${customer.plan}` : '',
    '',
    allIssues.length     ? `### 経営課題\n${allIssues.map(i => `- ${maskText(i, dict)}`).join('\n')}` : '',
    allNextActions.length? `### 次回アクション\n${allNextActions.map(a => `- ${maskText(a, dict)}`).join('\n')}` : '',
    latest ? `### 直近面談（${latest.date}）\n${formatMeeting(latest, dict)}` : '面談記録なし'
  ].filter(Boolean);

  return mcpText(lines.join('\n\n'));
}

// ─── ツール: get_customer_concerns ──────────────────────────
async function toolGetCustomerConcerns({ customer_id, status = 'open' }, env) {
  if (!customer_id) return mcpText('エラー: customer_id は必須です。');

  // 顧客名を取得
  const data = await loadData(env);
  const customer = (data.customers || []).find(c => c.id === customer_id);
  if (!customer) return mcpText('顧客が見つかりませんでした。list_customers で customer_id を確認してください。');

  let sql = 'SELECT id, body, urgency, category, status, resolution, created_at, resolved_at, auto_resolved FROM customer_concerns WHERE customer_id = ?';
  const params = [customer_id];
  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC LIMIT 50';

  const result = await env.DB.prepare(sql).bind(...params).all();
  const concerns = result.results || [];

  if (!concerns.length) {
    const label = status === 'open' ? '未解決' : status === 'resolved' ? '解決済み' : '';
    return mcpText(`${maskName(customer.name, customer.sei)} さんの${label}投稿はありません。`);
  }

  const lines = [
    `## ${maskName(customer.name, customer.sei)} さんの困りごと投稿（${concerns.length}件）`,
    ''
  ];

  for (const c of concerns) {
    const urgencyLabel = c.urgency === 'urgent' ? '⚡ 今すぐ' : '通常';
    const statusLabel = c.status === 'resolved'
      ? (c.auto_resolved ? '自動解決済み' : '✓ 解決済み')
      : '未解決';
    const categoryLabels = { cash_flow:'お金の流れ', no_money:'お金が残らない', expenses:'経費・領収書', hiring:'採用', marketing:'集客', repeat:'リピーター', anxiety:'漠然とした不安', other:'その他' };
    const categoryLabel = c.category ? (categoryLabels[c.category] || c.category) : null;
    const date = (c.created_at || '').slice(0, 10);
    const header = [date, urgencyLabel, statusLabel, categoryLabel].filter(Boolean).join('　');
    lines.push(`### ${header}`);
    lines.push(`ID: ${c.id}`);
    lines.push(c.body || '');
    if (c.resolution) {
      lines.push('');
      lines.push(`💬 **解決内容:** ${c.resolution}`);
    }
    lines.push('');
  }

  return mcpText(lines.join('\n'));
}

// ─── ツール: create_knowledge ────────────────────────────────
async function toolCreateKnowledge({ title, body, tags, customer_id, parent_id, category }, env) {
  if (!title || !title.trim()) return mcpText('エラー: title は必須です。');
  if (!body  || !body.trim())  return mcpText('エラー: body は必須です。');

  // customer_id / parent_id の存在チェック（指定された場合のみ）
  if (customer_id || parent_id) {
    const data = await loadData(env);
    if (customer_id) {
      const exists = (data.customers || []).some(c => c.id === customer_id);
      if (!exists) return mcpText(`エラー: customer_id "${customer_id}" が見つかりません。list_customers で正しいIDを確認してください。`);
    }
    if (parent_id) {
      const parentRow = await env.DB.prepare('SELECT id FROM knowledge WHERE id = ?').bind(parent_id).first();
      if (!parentRow) return mcpText(`エラー: parent_id "${parent_id}" が見つかりません。search_knowledge で正しいIDを確認してください。`);
    }
  }

  // ID 生成: man_ + タイムスタンプ + ランダム4桁
  const now = new Date();
  const ts = now.getTime();
  const rand = Math.random().toString(36).slice(2, 6);
  const id = `man_${ts}_${rand}`;
  const isoNow = now.toISOString();

  // tags をカンマ区切り → JSON 配列文字列に変換（既存データと互換）
  const tagsArr = (() => {
    if (!tags || !tags.trim()) return [];
    return tags.split(',').map(t => t.trim()).filter(Boolean);
  })();
  const tagsJson = JSON.stringify(tagsArr);

  // Markdown → HTML 変換（knowledge.html 手動保存と同じ方式で整形）
  const htmlBody = convertMdToHtml(body.trim());

  // tags に "protected" が含まれれば自動的に protected カテゴリに設定（明示 category より優先）
  const hasProtectedTag = tagsArr.includes('protected');
  const categoryVal = hasProtectedTag
    ? 'protected'
    : (['normal', 'protected'].includes(category) ? category : 'normal');

  // knowledge テーブルに INSERT（既存 knowledge.js と同じ列順）
  await env.DB.prepare(`
    INSERT INTO knowledge (id, source_type, source_id, title, body, tags, customer_id, parent_id, category, created_at, updated_at)
    VALUES (?, 'manual', NULL, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, title.trim(), htmlBody, tagsJson, customer_id || null, parent_id || null, categoryVal, isoNow, isoNow).run();

  // knowledge_history にも記録（id は AUTOINCREMENT なので指定しない）
  await env.DB.prepare(`
    INSERT INTO knowledge_history (knowledge_id, title, body, tags, saved_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, title.trim(), htmlBody, tagsJson, isoNow).run();

  const custPart   = customer_id ? `　顧客ID: ${customer_id}` : '';
  const parentPart = parent_id   ? `　親ID: ${parent_id}` : '';
  return mcpText(`✅ 登録完了\nID: ${id}\nタイトル: ${title.trim()}${custPart}${parentPart}\n\n knowledge.html で確認できます。`);
}

// ─── ツール: update_knowledge ────────────────────────────────
// 部分更新：指定したフィールドのみ変更、未指定は現在値を保持
async function toolUpdateKnowledge(args, env) {
  const { id, title, body, tags } = args;
  // customer_id / parent_id / category は「未指定」と「明示的空文字」の区別が必要なので args から直接参照
  const hasCustId    = 'customer_id' in args;
  const hasParentId  = 'parent_id'   in args;
  const hasAppendBody = 'append_body' in args;
  const hasCategory  = 'category' in args;

  if (!id || !id.trim()) return mcpText('エラー: id は必須です。');

  // body と append_body の同時指定チェック
  if (body !== undefined && hasAppendBody) {
    return mcpText('エラー: body と append_body は同時に指定できません。本文全体を置き換える場合は body、末尾に追記する場合は append_body を使ってください。');
  }

  // id のみで他フィールドがすべて未指定はエラー
  if (title === undefined && body === undefined && tags === undefined && !hasCustId && !hasParentId && !hasAppendBody && !hasCategory) {
    return mcpText('エラー: 変更するフィールドを少なくとも1つ指定してください（title / body / append_body / tags / customer_id / parent_id / category）。');
  }

  // 既存エントリ取得（全カラム）
  const entry = await env.DB.prepare(
    'SELECT id, source_type, title, body, tags, customer_id, parent_id FROM knowledge WHERE id = ? AND deleted_at IS NULL'
  ).bind(id.trim()).first();
  if (!entry) return mcpText(`エラー: ID "${id}" のナレッジが見つかりません（ゴミ箱内または存在しない）。search_knowledge でIDを確認してください。`);
  if (entry.source_type !== 'manual') return mcpText(`エラー: source_type が "${entry.source_type}" のエントリは変更できません。manual エントリのみ対応しています。`);

  // ─── 各フィールドを処理して動的 SET 句を構築 ────────────
  const sets  = [];
  const binds = [];
  const changedFields = [];

  // title
  if (title !== undefined) {
    if (!title.trim()) return mcpText('エラー: title を空にはできません。');
    sets.push('title = ?'); binds.push(title.trim()); changedFields.push('title');
  }

  // body（Markdown → HTML 変換・全体置き換え）
  let htmlBody;
  if (body !== undefined) {
    htmlBody = convertMdToHtml(body.trim());
    sets.push('body = ?'); binds.push(htmlBody); changedFields.push('body');
  }

  // append_body（既存本文の末尾に <hr> 区切りで追記）
  if (hasAppendBody) {
    const appendContent = (args.append_body || '').trim();
    if (appendContent) {
      const appendHtml = convertMdToHtml(appendContent);
      htmlBody = (entry.body || '') + '\n<hr>\n' + appendHtml;
      sets.push('body = ?'); binds.push(htmlBody); changedFields.push('body（追記）');
    }
    // append_body が空の場合は追記なし（body フィールドは変更対象外）
  }

  // tags（カンマ区切り → JSON配列文字列）
  let newTagsJson;
  if (tags !== undefined) {
    const newTagsArr = !tags || !tags.trim() ? []
      : tags.split(',').map(t => t.trim()).filter(Boolean);
    newTagsJson = JSON.stringify(newTagsArr);
    sets.push('tags = ?'); binds.push(newTagsJson); changedFields.push('tags');

  }

  // customer_id（空文字でクリア）
  if (hasCustId) {
    const newCustId = (args.customer_id && args.customer_id.trim()) ? args.customer_id.trim() : null;
    if (newCustId) {
      const data = await loadData(env);
      const exists = (data.customers || []).some(c => c.id === newCustId);
      if (!exists) return mcpText(`エラー: customer_id "${newCustId}" が見つかりません。list_customers で正しいIDを確認してください。`);
    }
    sets.push('customer_id = ?'); binds.push(newCustId); changedFields.push('customer_id');
  }

  // parent_id（空文字でルートに移動）
  if (hasParentId) {
    const newParentId = (args.parent_id && args.parent_id.trim()) ? args.parent_id.trim() : null;
    if (newParentId) {
      if (newParentId === id.trim()) return mcpText('エラー: 自分自身を親には設定できません。');
      const parentRow = await env.DB.prepare('SELECT id FROM knowledge WHERE id = ?').bind(newParentId).first();
      if (!parentRow) return mcpText(`エラー: parent_id "${newParentId}" が見つかりません。search_knowledge で正しいIDを確認してください。`);
      const isCycle = await isAncestorMcp(env, id.trim(), newParentId);
      if (isCycle) return mcpText('エラー: 循環参照になります（指定先はこのエントリの子孫です）。');
    }
    sets.push('parent_id = ?'); binds.push(newParentId); changedFields.push('parent_id');
  }

  // category
  if (hasCategory) {
    const newCat = args.category;
    if (!['normal', 'protected'].includes(newCat)) {
      return mcpText('エラー: category は normal または protected のみ指定可能です。');
    }
    sets.push('category = ?'); binds.push(newCat); changedFields.push('category');
  }

  // ─── history 保存（title/body/tags のいずれかが変わる場合のみ）──
  const nextTitle = title !== undefined ? title.trim()    : (entry.title || '');
  const nextBody  = htmlBody !== undefined ? htmlBody     : (entry.body  || '');
  const nextTags  = tags  !== undefined ? newTagsJson     : (entry.tags  || '[]');
  const histChanged =
    nextTitle !== (entry.title || '') ||
    nextBody  !== (entry.body  || '') ||
    nextTags  !== (entry.tags  || '[]');

  const now = new Date().toISOString();
  if (histChanged) {
    await env.DB.prepare(
      'INSERT INTO knowledge_history (knowledge_id, title, body, tags, saved_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id.trim(), entry.title, entry.body || '', entry.tags || '[]', now).run();
    // 21件目以降を削除（直近20件のみ保持）
    await env.DB.prepare(
      `DELETE FROM knowledge_history WHERE knowledge_id = ? AND id NOT IN (
        SELECT id FROM knowledge_history WHERE knowledge_id = ? ORDER BY saved_at DESC LIMIT 20
      )`
    ).bind(id.trim(), id.trim()).run();
  }

  // ─── UPDATE 実行 ─────────────────────────────────────────
  sets.push('updated_at = ?'); binds.push(now);
  binds.push(id.trim()); // WHERE id = ?
  await env.DB.prepare(`UPDATE knowledge SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds).run();

  // ─── Phase C: 本文削減ウォーニング（body 全体置き換えのみ対象）──
  let reductionWarning = '';
  if (body !== undefined && htmlBody !== undefined) {
    const existingLen = (entry.body || '').length;
    const newLen = htmlBody.length;
    if (existingLen > 100 && newLen < existingLen * 0.5) {
      reductionWarning = `\n\n⚠️ 警告: 本文が大幅に削減されました（更新前: ${existingLen}文字 → 更新後: ${newLen}文字、約${Math.round(newLen / existingLen * 100)}%）。内容の欠落がないか knowledge.html で確認してください。`;
    }
  }

  // ─── 返却メッセージ ───────────────────────────────────────
  const bodyWarning = (body !== undefined)
    ? '\n\n⚠️ 本文を変更しました。変更理由と変更範囲を院長に必ず報告してください。'
    : '';
  const histNote = histChanged ? '（履歴に保存済み）' : '';
  return mcpText(
    `✅ 更新完了 ${histNote}\nID: ${id.trim()}\nタイトル: ${nextTitle}\n変更フィールド: ${changedFields.join(', ')}\n\nknowledge.html で確認できます。${bodyWarning}${reductionWarning}`
  );
}

// ─── ツール: read_knowledge ──────────────────────────────────
// 1件の全文取得（search_knowledge は300文字抜粋のみなので、全文が必要な場合に使う）
async function toolReadKnowledge({ id }, env) {
  if (!id || !id.trim()) return mcpText('エラー: id は必須です。');

  const row = await env.DB.prepare(
    'SELECT id, source_type, title, body, tags, customer_id, parent_id, category, created_at, updated_at FROM knowledge WHERE id = ?'
  ).bind(id.trim()).first();
  if (!row) return mcpText(`エラー: ID "${id}" のナレッジが見つかりません。search_knowledge でIDを確認してください。`);

  const tags = (() => { try { return JSON.parse(row.tags || '[]'); } catch { return []; } })();
  const type = { task_note: 'タスクメモ', customer_meeting: '面談記録', manual: 'ナレッジ' }[row.source_type] || row.source_type;
  const bodyText = stripHtml(row.body || '');
  const catLabel = row.category === 'protected' ? '🔒 保護' : '通常';

  const lines = [
    `## ${row.title || '（タイトルなし）'}`,
    `種別: ${type}　ID: ${row.id}　カテゴリ: ${catLabel}`,
    row.customer_id ? `顧客ID: ${row.customer_id}` : null,
    row.parent_id   ? `親ID: ${row.parent_id}` : null,
    tags.length     ? `タグ: ${tags.join(', ')}` : null,
    `更新: ${(row.updated_at || '').slice(0, 16)}　作成: ${(row.created_at || '').slice(0, 16)}`,
    `本文の文字数（HTML）: ${(row.body || '').length} 文字`,
    '',
    '### 本文（全文・HTMLタグ除去済み）',
    bodyText || '（本文なし）'
  ].filter(s => s !== null);

  return mcpText(lines.join('\n'));
}

// ─── ツール: get_hp_design_tokens ───────────────────────────
async function toolGetHpDesignTokens(_args, env) {
  const [cssRes, htmlRes] = await Promise.allSettled([
    fetch(`${HP_BASE}/css/style.css`, { headers: hpFetchHeaders(env) }),
    fetch(`${HP_BASE}/index.html`,    { headers: hpFetchHeaders(env) }),
  ]);

  const tokens = { css_variables: {}, tailwind_config: {}, inline_tokens: {} };
  const notes = [];

  if (cssRes.status === 'fulfilled' && cssRes.value.ok) {
    const css = await cssRes.value.text();
    const rootMatch = css.match(/:root\s*\{([^}]+)\}/);
    if (rootMatch) {
      for (const m of rootMatch[1].matchAll(/--[\w-]+\s*:[^;]+;/g)) {
        const colonIdx = m[0].indexOf(':');
        const name = m[0].slice(0, colonIdx).trim();
        const value = m[0].slice(colonIdx + 1).replace(/;$/, '').trim();
        tokens.css_variables[name] = value;
      }
    }
  } else {
    notes.push('css/style.css の取得に失敗しました。');
  }

  if (htmlRes.status === 'fulfilled' && htmlRes.value.ok) {
    const html = await htmlRes.value.text();
    const twMatch = html.match(/tailwind\.config\s*=\s*(\{[\s\S]+?\})\s*(?:;)?\s*<\/script>/);
    if (twMatch) {
      try {
        const jsonStr = twMatch[1]
          .replace(/\/\/[^\n]*/g, '')
          .replace(/(['"])?([a-zA-Z_][a-zA-Z0-9_]*)(['"])?\s*:/g, '"$2":')
          .replace(/'/g, '"');
        tokens.tailwind_config = JSON.parse(jsonStr);
      } catch (_) {
        tokens.tailwind_config = { _raw: twMatch[1].slice(0, 500) };
      }
    }
    tokens.inline_tokens = {
      navy_cta_button: '#1E3A5F',
      gold_gradient:   '#C08010',
      gold_materials:  '#c9a84c',
      bg_warm_white:   '#FFFAF6',
      text_dark:       '#0f172a',
      note: '上記はHPのインラインstyle属性・各HTML内:rootから収集した固定値です。'
    };
  } else {
    notes.push('index.html の取得に失敗しました。');
  }

  let out = JSON.stringify(tokens, null, 2);
  if (notes.length) out += '\n\n【警告】\n' + notes.join('\n');
  return mcpText(out);
}

// ─── ツール: read_hp_source ──────────────────────────────────
async function toolReadHpSource({ path, offset }, env) {
  const err = validateHpPath(path);
  if (err) return mcpText(`エラー: ${err}`);

  const p = path.trim();
  const allowedExts = ['.html', '.css', '.js', '.json'];
  if (!allowedExts.some(ext => p.endsWith(ext))) {
    return mcpText(`エラー: 取得できるのは ${allowedExts.join(' / ')} のみです。`);
  }

  const url = `${HP_BASE}/${p}`;
  let res;
  try {
    res = await fetch(url, { headers: hpFetchHeaders(env) });
  } catch (e) {
    return mcpText(`エラー: fetchに失敗しました（${e.message}）`);
  }
  if (!res.ok) return mcpText(`エラー: ${url} を取得できませんでした（HTTP ${res.status}）`);

  const source = await res.text();
  const contentType = res.headers.get('content-type') || '不明';
  const LIMIT = 10000;
  const start = offset || 0;
  const output = source.slice(start, start + LIMIT);
  const remaining = source.length - start - output.length;

  let suffix = '';
  if (remaining > 0) {
    suffix = `\n\n---\n（全${source.length}文字中 ${start}〜${start + output.length} を表示。続き: offset=${start + LIMIT}）`;
  } else if (start > 0) {
    suffix = `\n\n---\n（全${source.length}文字中 ${start}〜${start + output.length} を表示。最後まで到達）`;
  }

  return mcpText(`【ソース: ${p}】\nURL: ${url}\nContent-Type: ${contentType}\nファイルサイズ: ${source.length}文字\n\n${output}${suffix}`);
}

// ─── ツール: list_hp_pages ───────────────────────────────────
async function toolListHpPages(_args, env) {
  const lines = HP_MAIN_PAGES.map(p => `${p.path} — ${p.label}`);

  const [blogRes, matRes] = await Promise.allSettled([
    fetch(`${HP_BASE}/blog/data.json`, { headers: hpFetchHeaders(env) }),
    fetch(`${HP_BASE}/materials/data.json`, { headers: hpFetchHeaders(env) }),
  ]);

  if (blogRes.status === 'fulfilled' && blogRes.value.ok) {
    try {
      const articles = await blogRes.value.json();
      lines.push('\n【ブログ記事】');
      for (const a of articles) {
        const pathStr = a.url ? `blog/${a.url}` : '（未公開・URLなし）';
        lines.push(`${pathStr} — ${a.title}（${a.date || ''}）`);
      }
    } catch (_) {}
  }

  if (matRes.status === 'fulfilled' && matRes.value.ok) {
    try {
      const materials = await matRes.value.json();
      lines.push('\n【資料ライブラリ】');
      for (const m of materials) {
        const pathStr = m.url ? `materials/${m.url}` : '（URLなし）';
        lines.push(`${pathStr} — ${m.title}（${m.description || ''}）`);
      }
    } catch (_) {}
  }

  return mcpText(lines.join('\n'));
}

// ─── ツール: read_hp_page ────────────────────────────────────
async function toolReadHpPage({ path, offset }, env) {
  const err = validateHpPath(path);
  if (err) return mcpText(`エラー: ${err}`);

  const url = `${HP_BASE}/${path.trim()}`;
  let res;
  try {
    res = await fetch(url, { headers: hpFetchHeaders(env) });
  } catch (e) {
    return mcpText(`エラー: fetchに失敗しました（${e.message}）`);
  }
  if (!res.ok) return mcpText(`エラー: ${url} を取得できませんでした（HTTP ${res.status}）`);

  const text = stripHtmlForHp(await res.text());
  const LIMIT = 5000;
  const start = offset || 0;
  const output = text.slice(start, start + LIMIT);
  const remaining = text.length - start - output.length;
  let suffix = '';
  if (remaining > 0) {
    suffix = `\n\n---\n（全${text.length}文字中 ${start}〜${start + output.length} を表示。続き: offset=${start + LIMIT}）`;
  } else if (start > 0) {
    suffix = `\n\n---\n（全${text.length}文字中 ${start}〜${start + output.length} を表示。最後まで到達）`;
  }
  return mcpText(`【${path.trim()}】\nURL: ${url}\n\n${output}${suffix}`);
}

// ─── ツール: search_hp_content ──────────────────────────────
async function toolSearchHpContent({ query }, env) {
  if (!query || !query.trim()) return mcpText('エラー: queryは必須です。');
  const q = query.trim();

  const results = await Promise.allSettled(
    HP_MAIN_PAGES.map(async (page) => {
      const res = await fetch(`${HP_BASE}/${page.path}`, { headers: hpFetchHeaders(env) });
      if (!res.ok) return { page, snippets: [], error: `HTTP ${res.status}` };
      const text = stripHtmlForHp(await res.text());
      return { page, snippets: extractSnippets(text, q, 50, 3), error: null };
    })
  );

  const hitLines = [];
  const errorLines = [];
  for (const r of results) {
    if (r.status === 'rejected') { errorLines.push('- fetch失敗（原因不明）'); continue; }
    const { page, snippets, error } = r.value;
    if (error) { errorLines.push(`- ${page.path}（${page.label}）: ${error}`); continue; }
    if (!snippets.length) continue;
    hitLines.push(`### ${page.label}（${page.path}）— ${snippets.length}件`);
    snippets.forEach((s, i) => hitLines.push(`${i + 1}. ...${s}...`));
  }

  if (!hitLines.length) {
    const errNote = errorLines.length ? `\n\nfetchエラー:\n${errorLines.join('\n')}` : '';
    return mcpText(`「${q}」はHPのメインページに見つかりませんでした。${errNote}`);
  }
  const errNote = errorLines.length ? `\n\n（一部ページでfetchエラー）\n${errorLines.join('\n')}` : '';
  return mcpText(`「${q}」の検索結果\n\n${hitLines.join('\n')}${errNote}`);
}

// 循環参照チェック（ancestor が target の祖先か）
async function isAncestorMcp(env, ancestor, target) {
  let current = target;
  const visited = new Set();
  while (current) {
    if (visited.has(current)) return false;
    if (current === ancestor) return true;
    visited.add(current);
    const row = await env.DB.prepare('SELECT parent_id FROM knowledge WHERE id = ?').bind(current).first();
    if (!row || !row.parent_id) return false;
    current = row.parent_id;
  }
  return false;
}

// ─── マスキング関数 ───────────────────────────────────────────

const LEGAL_PREFIXES = ['特定非営利活動法人', '一般社団法人', '公益財団法人', '社会福祉法人', '医療法人', '農業協同組合', '合同会社', '有限会社', '株式会社', 'NPO法人'];
const LEGAL_SUFFIXES = ['合同会社', '有限会社', '株式会社'];
// スタッフ固定マスク辞書（院長・スタッフの名前。長い形式を先に並べること）
const STAFF_NAMES = ['菊地企業のお医者さん', '菊地'];

function maskName(fullName, sei) {
  // sei が明示的にあれば最優先（姓・名が分離登録済みの顧客）
  if (sei && sei.trim()) return sei.trim();
  if (!fullName) return '';
  const parts = fullName.trim().split(/[\s　]+/);
  if (parts.length >= 2) return parts[0];
  // スペース無し：先頭1文字のみ返す（アスタリスク無し）
  return fullName.trim()[0] || '';
}

function maskCompany(company) {
  if (!company) return '';
  for (const prefix of LEGAL_PREFIXES) {
    if (company.startsWith(prefix)) {
      const body = company.slice(prefix.length);
      return body.length ? prefix + body[0] + '***' : company;
    }
  }
  for (const suffix of LEGAL_SUFFIXES) {
    if (company.endsWith(suffix) && company.length > suffix.length) {
      const body = company.slice(0, company.length - suffix.length);
      return body[0] + '***' + suffix;
    }
  }
  return company.length >= 2 ? company[0] + '***' : company;
}

function maskEmail(email) {
  if (!email) return '';
  const at = email.lastIndexOf('@');
  if (at < 0) return '***';
  const parts = email.slice(at + 1).split('.');
  const tld = parts[parts.length - 1];
  return `***@***.${tld}`;
}

function maskPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***-****-${digits.slice(-4)}`;
}

// 住所マスキング：都道府県のみ返す（「東京都渋谷区〇〇1-2-3」→「東京都」）
function maskAddress(address) {
  if (!address) return '';
  const m = address.match(/^\s*(.+?[都道府県])/);
  return m ? m[1] : '***';
}

// 全顧客から文字列置換辞書を構築（長い順にソート）
function buildMaskDict(customers) {
  const patterns = [];
  for (const c of customers) {
    if (c.company) {
      const masked = maskCompany(c.company);
      if (masked !== c.company) patterns.push({ from: c.company, to: masked });
      // 法人格なし版も追加
      for (const prefix of LEGAL_PREFIXES) {
        if (c.company.startsWith(prefix)) {
          const body = c.company.slice(prefix.length);
          if (body) { const mb = maskCompany(body); if (mb !== body) patterns.push({ from: body, to: mb }); }
          break;
        }
      }
      for (const suffix of LEGAL_SUFFIXES) {
        if (c.company.endsWith(suffix) && c.company.length > suffix.length) {
          const body = c.company.slice(0, c.company.length - suffix.length);
          if (body) { const mb = maskCompany(body); if (mb !== body) patterns.push({ from: body, to: mb }); }
          break;
        }
      }
    }
    if (c.name) {
      // sei フィールドが明示登録済みの場合はそちらを優先
      const seiStr = (c.sei && c.sei.trim()) ? c.sei.trim() : null;
      const parts = c.name.trim().split(/[\s　]+/);
      if (seiStr) {
        // sei/mei 分離済み：フルネーム・連結形を sei に置換、名だけは *** に
        const mei = c.mei && c.mei.trim() ? c.mei.trim() : parts.slice(1).join('');
        const meiSp = parts.length >= 2 ? parts.slice(1).join(' ') : '';
        patterns.push({ from: c.name, to: seiStr });
        if (seiStr + mei !== c.name) patterns.push({ from: seiStr + mei, to: seiStr });
        if (meiSp && meiSp.length >= 2) patterns.push({ from: meiSp, to: '***' });
        if (mei && mei.length >= 2 && mei !== meiSp) patterns.push({ from: mei, to: '***' });
      } else if (parts.length >= 2) {
        const sei = parts[0];
        const mei = parts.slice(1).join('');
        const meiSp = parts.slice(1).join(' ');
        // 旧パス（sei未登録）も新パスと同じくsei のみ表示（アスタリスクなし）
        patterns.push({ from: c.name, to: sei });
        if (sei + mei !== c.name) patterns.push({ from: sei + mei, to: sei });
        if (meiSp && meiSp.length >= 2) patterns.push({ from: meiSp, to: '***' });
        if (mei && mei.length >= 2 && mei !== meiSp) patterns.push({ from: mei, to: '***' });
      }
      // スペース無し1トークン名は先頭1文字に置換（案A）
      else if (c.name.trim().length >= 2) {
        patterns.push({ from: c.name, to: c.name.trim()[0] });
      }
    }
    // 住所：本文に出たら都道府県まで削る
    if (c.address && c.address.trim()) {
      const masked = maskAddress(c.address);
      if (masked && masked !== c.address) patterns.push({ from: c.address.trim(), to: masked });
    }
    // aliases（配偶者名・ハンドルネーム等）→ *** に置換
    (c.aliases || []).forEach(a => {
      if (a && a.trim()) patterns.push({ from: a.trim(), to: '***' });
    });
  }
  // スタッフ固定辞書（院長・スタッフ名。長い形式が先に来るよう定数側で管理）
  STAFF_NAMES.forEach(n => patterns.push({ from: n, to: '***' }));

  const seen = new Set();
  return patterns
    .filter(p => { if (!p.from || p.from === p.to || seen.has(p.from)) return false; seen.add(p.from); return true; })
    .sort((a, b) => b.from.length - a.from.length);
}

// テキストに辞書を適用（全箇所置換・英字は大小文字を区別しない）
function maskText(text, dict) {
  if (!text || !dict || !dict.length) return text || '';
  let result = text;
  for (const { from, to } of dict) {
    // 正規表現特殊文字をエスケープしてから gi フラグで置換（日本語は影響なし）
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), to);
  }
  return result;
}

// ─── ユーティリティ ──────────────────────────────────────────
function formatMeeting(m, dict = []) {
  // content / process / financialNote は返さない（生テキストに個人情報リスク大）
  const parts = [
    `**${m.date || '日付不明'}** ${maskText(m.conclusion || '', dict)}`,
    m.aiSummary     ? `要約: ${maskText(m.aiSummary.slice(0, 300), dict)}` : '',
    (m.issues || []).length      ? `経営課題: ${m.issues.map(i => maskText(i, dict)).join('、')}` : '',
    (m.nextActions || []).length ? `次回アクション: ${m.nextActions.map(a => maskText(a, dict)).join('、')}` : '',
    m.actionPlan    ? `アクションプラン: ${maskText(m.actionPlan.slice(0, 200), dict)}` : ''
  ].filter(Boolean);
  return parts.join('\n');
}

function stripHtml(s) {
  if (!s) return '';
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
}

// ─── HP用ヘルパー ──────────────────────────────────────────────
function stripHtmlForHp(html) {
  if (!html) return '';
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  t = t
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n');
  t = t.replace(/<[^>]*>/g, '');
  t = t
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return t.replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n')
           .replace(/\n{3,}/g, '\n\n').trim();
}

function validateHpPath(path) {
  if (!path || typeof path !== 'string') return 'pathは必須です。';
  const p = path.trim();
  if (p.includes('..'))         return 'pathに「..」を含めることはできません。';
  if (/^https?:\/\//i.test(p)) return 'pathにURLスキームを含めることはできません。';
  if (p.startsWith('/'))        return 'pathは先頭スラッシュなしで指定してください。';
  if (p.length > 200)           return 'pathが長すぎます（200文字以内）。';
  if (/[<>"\\|?*]/.test(p))    return 'pathに使用できない文字が含まれています。';
  return null;
}

function extractSnippets(text, query, context = 50, maxCount = 3) {
  const snippets = [];
  const lower = text.toLowerCase();
  const lq = query.toLowerCase();
  let pos = 0;
  while (snippets.length < maxCount) {
    const idx = lower.indexOf(lq, pos);
    if (idx === -1) break;
    const start = Math.max(0, idx - context);
    const end = Math.min(text.length, idx + lq.length + context);
    snippets.push(text.slice(start, end).replace(/\n/g, ' ').trim());
    pos = idx + lq.length;
  }
  return snippets;
}

function mcpText(text) {
  return { content: [{ type: 'text', text }] };
}

function rpcResult(result, id) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', result, id: id ?? null }), {
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

function rpcError(code, message, id) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: id ?? null }), {
    status: 200, headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

// ─── Markdown → HTML（create_knowledge で本文を整形して保存）────
// knowledge.html の convertMdToHtml と同一ロジックを移植

function mdEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function splitTableRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
}

function parseGFMTables(text) {
  const lines = text.split('\n'); const out = []; let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim(); const next = (lines[i + 1] || '').trim();
    if (/^\|.+\|$/.test(line) && /^\|[-:\s|]+\|$/.test(next)) {
      const headers = splitTableRow(lines[i]); i += 2; const rows = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) { rows.push(splitTableRow(lines[i])); i++; }
      const th = headers.map(h => `<th>${h}</th>`).join('');
      const tb = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`);
    } else { out.push(lines[i]); i++; }
  }
  return out.join('\n');
}

function convertMdToHtml(text) {
  if (!text) return '';
  // すでに HTML タグを含む場合はそのまま返す（二重変換防止）
  if (/<[a-z][^>]*>/i.test(text)) return text;
  text = text.replace(/\[\[id:([^\]|]+)\|([^\]]*)\]\]/g, (_, id, display) =>
    `<a class="kn-wiki" data-id="${id}" href="#">${mdEsc(display)}</a>`);
  text = parseGFMTables(text);
  let html = text
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^---+$/gm, '<hr>').replace(/^[-*] (.+)$/gm, '<li>$1</li>').replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]+?<\/li>)(\n|$)/g, m => '<ul>' + m.trim() + '</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  html = html.split(/\n\n+/).map(block => {
    block = block.trim(); if (!block) return '';
    if (/^<(h[1-6]|ul|ol|pre|blockquote|hr|table|a )/.test(block)) return block;
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  return html;
}

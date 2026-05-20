/**
 * 神成 裕輝の contractPolicy を Notion内容（HTML）で更新するスクリプト
 * 実行: node scripts/set-contract-policy.js
 */

const BASE_URL = 'https://task-manager-a5x.pages.dev';

const CONTRACT_POLICY_HTML = `<p>■結論</p>
<ul>
<li>税理士を、申告のみにしてコスト節減（30万程度）</li>
<li>決算月を税理士の閑散期に設定し単価設定を抑えるもらう</li>
</ul>
<p></p>
<p><strong>月商286万円ベース（年間3,420万円）</strong></p>
<table>
<thead><tr><th>項目</th><th>月次</th><th>年間</th></tr></thead>
<tbody>
<tr><td>売上</td><td>286万</td><td>3,420万</td></tr>
<tr><td>売上原価</td><td>24万</td><td>288万</td></tr>
<tr><td>人件費（外注費含む）</td><td>176万</td><td>2,112万</td></tr>
<tr><td>販管費（人件費除く）</td><td>59万</td><td>712万</td></tr>
<tr><td><strong>営業利益</strong></td><td><strong>27万</strong></td><td><strong>320万</strong></td></tr>
</tbody>
</table>
<hr>
<h2>顧問料の余裕</h2>
<table>
<thead><tr><th>追加負担</th><th>月次</th><th>年間</th></tr></thead>
<tbody>
<tr><td>顧問料（売上×3%）</td><td>8.6万</td><td>103万</td></tr>
<tr><td>社保追加（給与化時）</td><td>ー</td><td>ー（外注継続のため不要）</td></tr>
<tr><td><strong>顧問料後の余裕</strong></td><td><strong>約18万</strong></td><td><strong>約217万</strong></td></tr>
</tbody>
</table>
<hr>
<h2>結論</h2>
<p><strong>払える。ただし薄い。</strong><br>
営業利益320万に対して顧問料103万は<strong>利益の約32%を持っていく</strong>計算。<br>
コンサル契約の価値を出すには「顧問料以上のコスト削減か売上増加」が条件になる。<br>
具体的には<strong>年間103万以上の改善効果</strong>を出せるかがポイント。現状の数字で改善余地があるとすれば、賃借料・リース料・消耗品費あたりが候補。顧客と一緒に確認する価値はある。</p>`;

async function run() {
  // 1. 現在のデータ取得
  console.log('データ取得中...');
  const res = await fetch(`${BASE_URL}/api/data`);
  if (!res.ok) throw new Error(`GET /api/data failed: ${res.status}`);
  const data = await res.json();

  // 2. 神成を検索
  const customers = data.customers || [];
  const customer = customers.find(c =>
    (c.name || '').includes('神成') || (c.sei || '').includes('神成')
  );
  if (!customer) {
    console.error('神成が見つかりません。顧客一覧:');
    customers.forEach(c => console.log(` - ${c.name} (${c.id})`));
    process.exit(1);
  }

  console.log(`対象顧客: ${customer.name} (ID: ${customer.id})`);
  console.log(`現在のcontractPolicy: "${(customer.contractPolicy || '').slice(0, 50)}"`);

  // 3. contractPolicy を更新
  customer.contractPolicy = CONTRACT_POLICY_HTML;

  // 4. PUT で保存
  console.log('保存中...');
  const putRes = await fetch(`${BASE_URL}/api/data`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!putRes.ok) throw new Error(`PUT /api/data failed: ${putRes.status}`);
  const result = await putRes.json();
  console.log('✅ 保存完了:', JSON.stringify(result));
}

run().catch(err => { console.error('❌ エラー:', err); process.exit(1); });

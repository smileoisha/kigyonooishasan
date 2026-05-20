import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

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

// D1からデータ取得
console.log('D1からデータ取得中...');
const raw = execSync(
  'npx wrangler d1 execute task-manager-db --remote --command "SELECT value FROM store WHERE key=\'main\'" --json',
  { maxBuffer: 10 * 1024 * 1024 }
).toString();

const queryResult = JSON.parse(raw);
const jsonStr = queryResult[0].results[0].value;
const data = JSON.parse(jsonStr);

// 神成を検索
const customer = (data.customers || []).find(c =>
  (c.name || '').includes('神成') || (c.sei || '').includes('神成')
);
if (!customer) {
  console.error('神成が見つかりません');
  process.exit(1);
}
console.log(`対象: ${customer.name} (${customer.id})`);

// contractPolicy を設定
customer.contractPolicy = CONTRACT_POLICY_HTML;

// SQL UPDATE 用にエスケープ
const updated = JSON.stringify(data).replace(/'/g, "''");

// SQLファイルに書き出し（長文対策）
const sqlPath = join(tmpdir(), 'update-cp.sql');
writeFileSync(sqlPath, `UPDATE store SET value = '${updated}' WHERE key = 'main';`);
console.log(`SQLファイル: ${sqlPath} (${Math.round(updated.length/1024)}KB)`);

// D1へ書き込み
console.log('D1へ書き込み中...');
execSync(
  `npx wrangler d1 execute task-manager-db --remote --file "${sqlPath}"`,
  { stdio: 'inherit', maxBuffer: 20 * 1024 * 1024 }
);
console.log('✅ 完了');

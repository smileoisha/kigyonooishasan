/**
 * 収支ツール検証スクリプト
 * xlsxを読まず、ビルドスクリプトと同じロジックでダッシュボードの期待値を計算する
 */

// マッピングテーブル（ビルドスクリプトと同一）
const MAPPINGS = [
  ['売上高', '商品の売上', '入'],
  ['雑収入', 'その他の収入', '入'],
  ['仕入高', '材料・仕入れ', '出'],
  ['地代家賃', '家賃・場所代', '出'],
  ['通信費', '通信費（スマホ・ネット）', '出'],
  ['荷造運賃', '送料・配送', '出'],
  ['旅費交通費', '交通費', '出'],
  ['車両費', '交通費', '出'],
  ['広告宣伝費', '広告・宣伝', '出'],
  ['研修費', '勉強・セミナー', '出'],
  ['新聞図書費', '勉強・セミナー', '出'],
  ['消耗品費', '道具・備品', '出'],
  ['減価償却費', '道具・備品', '出'],
  ['諸会費', '月額サービス（サブスク）', '出'],
  ['支払手数料', 'その他', '出'],
  ['外注費', 'その他', '出'],
  ['接待交際費', 'その他', '出'],
  ['福利厚生費', 'その他', '出'],
  ['租税公課', 'その他', '出'],
  ['保険料', 'その他', '出'],
  ['水道光熱費', 'その他', '出'],
  ['給料賃金', 'その他', '出'],
];

const mapByName = new Map(MAPPINGS.map(([k, cat, io]) => [k, { cat, io }]));

// freee CSVサンプルデータ（12行）
const freeeRows = [
  { date: '2026-01-01', kariKamoku: '事業主借', kariKingaku: 294150, kashiKamoku: '元入金', kashiKingaku: 294150, kessan: '1' },
  { date: '2026-01-01', kariKamoku: '受取利息', kariKingaku: 34, kashiKamoku: '元入金', kashiKingaku: 34, kessan: '1' },
  { date: '2026-01-01', kariKamoku: '損益', kariKingaku: 5499, kashiKamoku: '元入金', kashiKingaku: 5499, kessan: '1' },
  { date: '2026-01-20', kariKamoku: '消耗品費', kariKingaku: 5204, kashiKamoku: '事業主借', kashiKingaku: 5204, kessan: '0' },
  { date: '2026-01-23', kariKamoku: '消耗品費', kariKingaku: 1500, kashiKamoku: '未払金', kashiKingaku: 1500, kessan: '0' },
  { date: '2026-01-25', kariKamoku: '車両費', kariKingaku: 3062, kashiKamoku: '事業主借', kashiKingaku: 3062, kessan: '0' },
  { date: '2026-01-31', kariKamoku: '消耗品費', kariKingaku: 30888, kashiKamoku: '未払金', kashiKingaku: 30888, kessan: '0' },
  { date: '2026-02-06', kariKamoku: '車両費', kariKingaku: 5136, kashiKamoku: '現金', kashiKingaku: 5136, kessan: '0' },
  { date: '2026-02-20', kariKamoku: '消耗品費', kariKingaku: 10073, kashiKamoku: '事業主借', kashiKingaku: 10073, kessan: '0' },
  { date: '2026-02-24', kariKamoku: '車両費', kariKingaku: 4763, kashiKamoku: '現金', kashiKingaku: 4763, kessan: '0' },
  { date: '2026-03-07', kariKamoku: '消耗品費', kariKingaku: 14967, kashiKamoku: '事業主借', kashiKingaku: 14967, kessan: '0' },
  { date: '2026-03-07', kariKamoku: '消耗品費', kariKingaku: 5600, kashiKamoku: '事業主借', kashiKingaku: 5600, kessan: '0' },
];

// 手動入力サンプル
const manualRows = [
  { date: '2026-01-15', inout: '入', content: 'テスト売上', category: '商品の売上', amount: 100000 },
];

// === _入出 判定ロジック（CY列の数式シミュレーション） ===
function determineInOut(row) {
  // 決算仕訳はスキップ
  if (row.kessan === '1') return null;
  // 借方科目がマッピング表にあれば → その入/出を返す
  if (mapByName.has(row.kariKamoku)) return mapByName.get(row.kariKamoku).io;
  // 貸方科目がマッピング表にあれば → その入/出を返す
  if (mapByName.has(row.kashiKamoku)) return mapByName.get(row.kashiKamoku).io;
  // どちらもなければスキップ
  return null;
}

// === _勘定科目名（CZ列） ===
function determineKamokuName(row, inout) {
  if (!inout) return null;
  return inout === '出' ? row.kariKamoku : row.kashiKamoku;
}

// === _分類（DA列） ===
function determineBunrui(kamokuName) {
  if (!kamokuName) return null;
  const m = mapByName.get(kamokuName);
  return m ? m.cat : '★未分類';
}

// === _金額（DB列） ===
function determineKingaku(row, inout) {
  if (!inout) return 0;
  return inout === '出' ? row.kariKingaku : row.kashiKingaku;
}

// === 統合データ構築 ===
const unified = [];

// 手動入力ブロック
for (const row of manualRows) {
  const d = new Date(row.date);
  unified.push({
    date: row.date,
    inout: row.inout,
    content: row.content,
    category: row.category,
    amount: row.amount,
    yearMonth: `${d.getFullYear()}年${d.getMonth() + 1}月`,
    source: '手入力',
  });
}

// freeeブロック
console.log('\n=== freee取込 行別判定 ===');
for (let i = 0; i < freeeRows.length; i++) {
  const row = freeeRows[i];
  const inout = determineInOut(row);
  const kamoku = determineKamokuName(row, inout);
  const bunrui = determineBunrui(kamoku);
  const kingaku = determineKingaku(row, inout);

  const status = inout ? `${inout} / ${bunrui} / ¥${kingaku.toLocaleString()}` : 'スキップ';
  console.log(`  Row ${i + 1}: ${row.date} | 借方=${row.kariKamoku} | 貸方=${row.kashiKamoku} | 決算=${row.kessan} → ${status}`);

  if (inout && bunrui) {
    const d = new Date(row.date);
    unified.push({
      date: row.date,
      inout,
      content: '',
      category: bunrui,
      amount: kingaku,
      yearMonth: `${d.getFullYear()}年${d.getMonth() + 1}月`,
      source: 'freee',
    });
  }
}

// === 月別集計 ===
console.log('\n=== 統合データ ===');
unified.forEach((r, i) => {
  console.log(`  ${i + 1}: ${r.yearMonth} | ${r.inout} | ${r.category} | ¥${r.amount.toLocaleString()} | ${r.source}`);
});

const months = [...new Set(unified.map(r => r.yearMonth))].sort();
console.log('\n=== ダッシュボード検証 ===');

const FIXED_COST_CATS = ['家賃・場所代', '通信費（スマホ・ネット）', '月額サービス（サブスク）'];

for (const month of months) {
  const monthData = unified.filter(r => r.yearMonth === month);
  const sales = monthData.filter(r => r.inout === '入').reduce((s, r) => s + r.amount, 0);
  const expenses = monthData.filter(r => r.inout === '出').reduce((s, r) => s + r.amount, 0);
  const fixedCosts = monthData.filter(r => r.inout === '出' && FIXED_COST_CATS.includes(r.category)).reduce((s, r) => s + r.amount, 0);

  console.log(`\n  【${month}】`);
  console.log(`    売上合計:     ¥${sales.toLocaleString()}`);
  console.log(`    費用合計:     ¥${expenses.toLocaleString()}`);
  console.log(`    手残り:       ¥${(sales - expenses).toLocaleString()}`);
  console.log(`    損益分岐点:   ¥${fixedCosts.toLocaleString()}`);
  console.log(`    あといくら？: ¥${(fixedCosts - sales).toLocaleString()}`);

  // 費用内訳
  const expByCategory = {};
  monthData.filter(r => r.inout === '出').forEach(r => {
    expByCategory[r.category] = (expByCategory[r.category] || 0) + r.amount;
  });
  if (Object.keys(expByCategory).length > 0) {
    console.log('    費用内訳:');
    for (const [cat, amt] of Object.entries(expByCategory)) {
      console.log(`      ${cat}: ¥${amt.toLocaleString()}`);
    }
  }
}

// === 期待値チェック ===
console.log('\n=== 期待値との照合 ===');
const expected = {
  '2026年1月': { sales: 100000, expenses: 40654, categories: { '道具・備品': 37592, '交通費': 3062 } },
  '2026年2月': { sales: 0, expenses: 19972, categories: { '道具・備品': 10073, '交通費': 9899 } },
  '2026年3月': { sales: 0, expenses: 20567, categories: { '道具・備品': 20567 } },
};

let allPass = true;
for (const [month, exp] of Object.entries(expected)) {
  const monthData = unified.filter(r => r.yearMonth === month);
  const actualSales = monthData.filter(r => r.inout === '入').reduce((s, r) => s + r.amount, 0);
  const actualExpenses = monthData.filter(r => r.inout === '出').reduce((s, r) => s + r.amount, 0);

  const salesOk = actualSales === exp.sales;
  const expensesOk = actualExpenses === exp.expenses;

  console.log(`  ${month}: 売上 ${salesOk ? '✓' : '✗'}(${actualSales} vs ${exp.sales}) 費用 ${expensesOk ? '✓' : '✗'}(${actualExpenses} vs ${exp.expenses})`);

  if (!salesOk || !expensesOk) allPass = false;

  for (const [cat, amt] of Object.entries(exp.categories)) {
    const actual = monthData.filter(r => r.inout === '出' && r.category === cat).reduce((s, r) => s + r.amount, 0);
    const ok = actual === amt;
    console.log(`    ${cat}: ${ok ? '✓' : '✗'}(${actual} vs ${amt})`);
    if (!ok) allPass = false;
  }
}

console.log(`\n=== 結果: ${allPass ? '全テスト合格 ✓' : 'テスト失敗 ✗'} ===`);
process.exit(allPass ? 0 : 1);

const ExcelJS = require('exceljs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', '収支ツール_v2.xlsx');
const MANUAL_ROWS = 10;
const FREEE_ROWS = 20;
const FREEE_DATA_START = MANUAL_ROWS + 2; // row 12

// Category definitions
const INCOME_CATS = ['商品の売上', 'その他の収入'];
const EXPENSE_CATS = ['材料・仕入れ', '家賃・場所代', '通信費（スマホ・ネット）', '送料・配送', '交通費', '広告・宣伝', '勉強・セミナー', '道具・備品', '月額サービス（サブスク）', 'その他'];
const FIXED_COST_CATS = ['家賃・場所代', '通信費（スマホ・ネット）', '月額サービス（サブスク）'];

// Mapping table: freee account name -> [category, in/out]
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

// freee CSV sample data (from Google Sheets read)
const SAMPLE_DATA = [
  ['1','2026-01-01','','事業主借','事業主借','JIGYOU','390','294150','対象外','0','内税','0','0','','','','','','','','','','','','','','','','','','','','','','','','元入金','元入金','MOTOIRE','400','294150','対象外','0','内税','0','0','','','','','','','','','','','','','','','','','','','','','','','','1','','2026-03-24 08:34','2026-03-24 08:34','なし','','','','','yuki95717@gmail.com','税込経理','3434556597','','','3822220023','','0','2026-01-01','1','3','1','','決算','','',''],
  ['1','2026-01-01','','受取利息','事業主借','UKETORIR','391','34','対象外','0','内税','0','0','','','','','','','','','','','','','','','','','','','','','','','','元入金','元入金','MOTOIRE','400','34','対象外','0','内税','0','0','','','','','','','','','','','','','','','','','','','','','','','','1','','2026-03-24 08:34','2026-03-24 08:34','なし','','','','','yuki95717@gmail.com','税込経理','3434556597','','','3822220023','','0','2026-01-01','2','3','2','','決算','','',''],
  ['1','2026-01-01','','損益','税引前所得処分','','','5499','対象外','0','内税','0','0','','','','','','','','','','','','','','','','','','','','','','','','元入金','元入金','MOTOIRE','400','5499','対象外','0','内税','0','0','','','','','','','','','','','','','','','','','','','','','','','','1','','2026-03-24 08:34','2026-03-24 08:34','なし','','','','','yuki95717@gmail.com','税込経理','3434556597','','','3822220023','','0','2026-01-01','3','3','3','','決算','','',''],
  ['2','2026-01-20','','消耗品費','消耗品費','SHOUMOU','710','5204','課対仕入8%（軽）','385','内税','8','1','','コープさっぽろ','','','','','','','','','','','','','','','','','','','','','家事按分50%','事業主借','事業主借','JIGYOU','390','5204','対象外','0','内税','0','0','','','','','','','','','','','','','','','','','','','','','','','','0','コープさっぽろ','2026-02-28 10:26','2026-02-28 10:26','なし','','','','','yuki95717@gmail.com','税込経理','3321977807','','','3701507621','','0','','1','1','4','','手動','','','128'],
  ['3','2026-01-23','','消耗品費','消耗品費','SHOUMOU','710','1500','課対仕入8%（軽）','111','内税','8','1','','イオン','','','','','','','','','','','','','','','','','','','','','家事按分50','未払金','未払金','MIHARAIK','322','1500','対象外','0','内税','0','0','','イオン','','','','','','','','','','','','','','','','','','','','','','0','イオン','2026-02-28 10:16','2026-02-28 10:16','なし','','','','','yuki95717@gmail.com','税込経理','3321948038','','','3701476026','','0','','1','1','5','','手動','','','133'],
  ['4','2026-01-25','','車両費','その他経費','SHARYOU','726','3062','課対仕入10%','278','内税','10','0','','COSMO石油','','','','','','','','','','','','','','','','','','','','','部品交換','事業主借','事業主借','JIGYOU','390','3062','対象外','0','内税','0','0','','','','','','','','','','','','','','','','','','','','','','','','0','COSMO石油','2026-01-25 18:40','2026-01-25 18:40','なし','','','','','yuki95717@gmail.com','税込経理','3218629783','','','3586572427','','0','','1','1','6','','手動','','','127'],
  ['5','2026-01-31','','消耗品費','消耗品費','SHOUMOU','710','30888','課対仕入8%（軽）','2288','内税','8','1','','コープさっぽろ','','','','','','','','','','','','','','','','','','','','','家事按分50','未払金','未払金','MIHARAIK','322','30888','対象外','0','内税','0','0','','コープさっぽろ','','','','','','','','','','','','','','','','','','','','','','0','コープさっぽろ','2026-02-28 10:20','2026-02-28 10:20','なし','','','','','yuki95717@gmail.com','税込経理','3321963153','','','3701491878','','0','2026-02-26','1','1','7','','手動','','','137'],
  ['6','2026-02-06','','車両費','その他経費','SHARYOU','726','5136','課対仕入10%','466','内税','10','0','','COSMO石油','','','','','','','','','','','','','','','','','','','','','燃料','現金','現金','GENKIN','','5136','対象外','0','内税','0','0','','','','','','','','','','','','','','','','','','','','','','','','0','COSMO石油','2026-02-28 10:15','2026-02-28 10:15','なし','','','','','yuki95717@gmail.com','税込経理','3321945420','','','3701473240','','0','','1','1','8','','手動','','','136'],
  ['7','2026-02-20','','消耗品費','消耗品費','SHOUMOU','710','10073','課対仕入8%（軽）','746','内税','8','1','','アークス','','','','','','','','','','','','','','','','','','','','','家事按分50','事業主借','事業主借','JIGYOU','390','10073','対象外','0','内税','0','0','','','','','','','','','','','','','','','','','','','','','','','','0','アークス','2026-02-28 10:17','2026-02-28 10:17','なし','','','','','yuki95717@gmail.com','税込経理','3321948960','','','3701476991','','0','','1','1','9','','手動','','','134'],
  ['8','2026-02-24','','車両費','その他経費','SHARYOU','726','4763','課対仕入10%','433','内税','10','0','','COSMO石油','','','','','','','','','','','','','','','','','','','','','燃料','現金','現金','GENKIN','','4763','対象外','0','内税','0','0','','','','','','','','','','','','','','','','','','','','','','','','0','COSMO石油','2026-02-28 10:15','2026-02-28 10:15','なし','','','','','yuki95717@gmail.com','税込経理','3321945982','','','3701473834','','0','','1','1','10','','手動','','','132'],
  ['9','2026-03-07','','消耗品費','消耗品費','SHOUMOU','710','14967','課対仕入8%（軽）','1108','内税','8','1','','アークス','','','','','','','','','','','','','','','','','','','','','','事業主借','事業主借','JIGYOU','390','14967','対象外','0','内税','0','0','','','','','','','','','','','','','','','','','','','','','','','','0','アークス','2026-03-07 10:20','2026-03-07 10:20','なし','','','','','yuki95717@gmail.com','税込経理','3358346662','','','3740913703','','0','','1','1','11','','手動','','','143'],
  ['10','2026-03-07','','消耗品費','消耗品費','SHOUMOU','710','5600','課対仕入8%（軽）','414','内税','8','1','','コープさっぽろ','','','','','','','','','','','','','','','','','','','','','','事業主借','事業主借','JIGYOU','390','5600','対象外','0','内税','0','0','','','','','','','','','','','','','','','','','','','','','','','','0','コープさっぽろ','2026-03-07 10:20','2026-03-07 10:20','なし','','','','','yuki95717@gmail.com','税込経理','3358347148','','','3740914197','','0','','1','1','12','','手動','','','144'],
];

// freee CSV headers (95 columns)
const FREEE_HEADERS = [
  'No','取引日','管理番号','借方勘定科目','借方決算書表示名','借方勘定科目ショートカット１','借方勘定科目ショートカット２（勘定科目コード）','借方金額','借方税区分','借方税金額','借方内税・外税','借方税率','借方軽減税率有無','借方取引先コード','借方取引先名','借方取引先ショートカット１','借方取引先ショートカット２','借方品目','借方品目ショートカット１','借方品目ショートカット２','借方部門','借方部門ショートカット１','借方部門ショートカット２','借方メモ','借方メモショートカット１','借方メモショートカット２','借方セグメント１','借方セグメント１ショートカット１','借方セグメント１ショートカット２','借方セグメント２','借方セグメント２ショートカット１','借方セグメント２ショートカット２','借方セグメント３','借方セグメント３ショートカット１','借方セグメント３ショートカット２','借方備考','貸方勘定科目','貸方決算書表示名','貸方勘定科目ショートカット１','貸方勘定科目ショートカット２（勘定科目コード）','貸方金額','貸方税区分','貸方税金額','貸方内税・外税','貸方税率','貸方軽減税率有無','貸方取引先コード','貸方取引先名','貸方取引先ショートカット１','貸方取引先ショートカット２','貸方品目','貸方品目ショートカット１','貸方品目ショートカット２','貸方部門','貸方部門ショートカット１','貸方部門ショートカット２','貸方メモ','貸方メモショートカット１','貸方メモショートカット２','貸方セグメント１','貸方セグメント１ショートカット１','貸方セグメント１ショートカット２','貸方セグメント２','貸方セグメント２ショートカット１','貸方セグメント２ショートカット２','貸方セグメント３','貸方セグメント３ショートカット１','貸方セグメント３ショートカット２','貸方備考','決算整理仕訳','発行元','作成日時','更新日時','承認状況(仕訳承認)','申請者(仕訳承認)','申請日時(仕訳承認)','承認者(仕訳承認)','承認日時(仕訳承認)','作成者','消費税経理処理方法','取引ID','口座振替ID','振替伝票ID','仕訳ID','仕訳番号','期末日取引フラグ','取引支払日','仕訳行番号','仕訳行数','レコード番号','取引内容','登録した方法','経費精算 申請番号','支払依頼 申請番号','ファイル番号'
];

// Processing column positions (1-indexed ExcelJS columns)
// CSV occupies columns 1-95. Processing starts at col 99 (CU)
const PC = {
  TORIHIKI_DATE: 99,  // CU: _取引日
  KARI_KAMOKU: 100,    // CV: _借方科目
  KASHI_KAMOKU: 101,   // CW: _貸方科目
  KESSAN: 102,         // CX: _決算仕訳
  IN_OUT: 103,         // CY: _入出
  KAMOKU_NAME: 104,    // CZ: _勘定科目名
  BUNRUI: 105,         // DA: _分類
  KINGAKU: 106,        // DB: _金額
  TORIHIKISAKI: 107,   // DC: _取引先
  BIKOU: 108,          // DD: _備考
  VALID: 109,          // DE: _有効行
};

// Colors
const NAVY = 'FF1E3A5F';
const GOLD = 'FFC9A84C';
const WHITE = 'FFFFFFFF';
const LIGHT_GRAY = 'FFF8FAFC';
const LIGHT_BLUE = 'FFE8F4FD';
const GREEN_BG = 'FFE8F5E9';
const RED_BG = 'FFFCE4EC';
const BORDER_COLOR = 'FFE2E8F0';

function colLetter(n) {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = '企業のお医者さん';

  // ============================================================
  // Sheet 1: ダッシュボード
  // ============================================================
  const dash = wb.addWorksheet('ダッシュボード', {
    properties: { tabColor: { argb: NAVY } },
    views: [{ showGridLines: false }]
  });

  const dashFont = { name: 'Noto Sans JP', size: 11 };
  const dashTitleFont = { name: 'Noto Sans JP', size: 14, bold: true, color: { argb: NAVY } };
  const dashLabelFont = { name: 'Noto Sans JP', size: 11, color: { argb: 'FF475569' } };
  const dashValueFont = { name: 'Noto Sans JP', size: 14, bold: true };
  const dashHeaderFont = { name: 'Noto Sans JP', size: 12, bold: true, color: { argb: WHITE } };

  dash.columns = [
    { width: 2 },   // A: spacer
    { width: 30 },  // B: labels
    { width: 18 },  // C: values
    { width: 30 },  // D: notes / extra
    { width: 2 },   // E: spacer
  ];

  // Title
  dash.getCell('B1').value = '経営ダッシュボード';
  dash.getCell('B1').font = { name: 'Noto Sans JP', size: 18, bold: true, color: { argb: NAVY } };

  // Month selector
  dash.getCell('B2').value = '対象月：';
  dash.getCell('B2').font = dashLabelFont;
  dash.getCell('C2').value = '2026年1月';
  dash.getCell('C2').font = { ...dashFont, bold: true };
  dash.getCell('C2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
  dash.getCell('C2').border = {
    top: { style: 'thin', color: { argb: BORDER_COLOR } },
    bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
    left: { style: 'thin', color: { argb: BORDER_COLOR } },
    right: { style: 'thin', color: { argb: BORDER_COLOR } },
  };
  // Data validation for month dropdown will reference _統合データ!H column
  dash.getCell('C2').dataValidation = {
    type: 'list',
    formulae: ["'_統合データ'!$H$2:$H$50"],
    showDropDown: false,
  };

  // Summary section
  const summaryStart = 4;
  const summaryItems = [
    ['売上合計', `=SUMIFS('_統合データ'!E:E,'_統合データ'!B:B,"入",'_統合データ'!F:F,C2)`, ''],
    ['費用合計', `=SUMIFS('_統合データ'!E:E,'_統合データ'!B:B,"出",'_統合データ'!F:F,C2)`, ''],
    ['手残り（売上−費用）', '=C4-C5', ''],
    ['損益分岐点（固定費合計）',
      `=SUMIFS('_統合データ'!E:E,'_統合データ'!B:B,"出",'_統合データ'!F:F,C2,'_統合データ'!D:D,"家賃・場所代")+SUMIFS('_統合データ'!E:E,'_統合データ'!B:B,"出",'_統合データ'!F:F,C2,'_統合データ'!D:D,"通信費（スマホ・ネット）")+SUMIFS('_統合データ'!E:E,'_統合データ'!B:B,"出",'_統合データ'!F:F,C2,'_統合データ'!D:D,"月額サービス（サブスク）")`,
      ''],
    ['今月あといくら売ればいい？', '=C7-C4', 'マイナスになっている場合は目標達成！'],
  ];

  for (let i = 0; i < summaryItems.length; i++) {
    const r = summaryStart + i;
    const [label, formula, note] = summaryItems[i];
    dash.getCell(`B${r}`).value = label;
    dash.getCell(`B${r}`).font = dashLabelFont;
    dash.getCell(`C${r}`).value = { formula };
    dash.getCell(`C${r}`).font = dashValueFont;
    dash.getCell(`C${r}`).numFmt = '#,##0';
    if (note) {
      dash.getCell(`D${r}`).value = note;
      dash.getCell(`D${r}`).font = { name: 'Noto Sans JP', size: 9, color: { argb: 'FF94A3B8' } };
    }
    // Color for hand-remaining
    if (i === 2) {
      dash.getCell(`C${r}`).font = { ...dashValueFont, color: { argb: 'FF16A34A' } };
    }
  }

  // Warning for unmapped accounts
  dash.getCell('B10').value = { formula: `=IF(COUNTIF('_統合データ'!D:D,"★未分類")>0,"⚠ 未分類の取引があります → 科目マッピングを確認","")` };
  dash.getCell('B10').font = { name: 'Noto Sans JP', size: 10, color: { argb: 'FFDC2626' } };

  // Income breakdown
  const incomeHeaderRow = 12;
  dash.getCell(`B${incomeHeaderRow}`).value = '【 売上の内訳 】';
  dash.getCell(`B${incomeHeaderRow}`).font = dashHeaderFont;
  dash.getCell(`B${incomeHeaderRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  dash.getCell(`C${incomeHeaderRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };

  for (let i = 0; i < INCOME_CATS.length; i++) {
    const r = incomeHeaderRow + 1 + i;
    dash.getCell(`B${r}`).value = INCOME_CATS[i];
    dash.getCell(`B${r}`).font = dashFont;
    dash.getCell(`B${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_BG } };
    dash.getCell(`C${r}`).value = { formula: `=SUMIFS('_統合データ'!E:E,'_統合データ'!B:B,"入",'_統合データ'!F:F,$C$2,'_統合データ'!D:D,B${r})` };
    dash.getCell(`C${r}`).font = dashFont;
    dash.getCell(`C${r}`).numFmt = '#,##0';
    dash.getCell(`C${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_BG } };
  }

  // Expense breakdown
  const expenseHeaderRow = incomeHeaderRow + INCOME_CATS.length + 2;
  dash.getCell(`B${expenseHeaderRow}`).value = '【 費用の内訳 】';
  dash.getCell(`B${expenseHeaderRow}`).font = dashHeaderFont;
  dash.getCell(`B${expenseHeaderRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  dash.getCell(`C${expenseHeaderRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };

  for (let i = 0; i < EXPENSE_CATS.length; i++) {
    const r = expenseHeaderRow + 1 + i;
    dash.getCell(`B${r}`).value = EXPENSE_CATS[i];
    dash.getCell(`B${r}`).font = dashFont;
    dash.getCell(`C${r}`).value = { formula: `=SUMIFS('_統合データ'!E:E,'_統合データ'!B:B,"出",'_統合データ'!F:F,$C$2,'_統合データ'!D:D,B${r})` };
    dash.getCell(`C${r}`).font = dashFont;
    dash.getCell(`C${r}`).numFmt = '#,##0';
  }

  // ============================================================
  // Sheet 2: 入力シート (manual input)
  // ============================================================
  const input = wb.addWorksheet('入力シート', {
    properties: { tabColor: { argb: 'FF4CAF50' } },
  });

  input.columns = [
    { header: '日付', width: 14, key: 'date' },
    { header: '入/出', width: 8, key: 'inout' },
    { header: '内容', width: 25, key: 'content' },
    { header: '分類', width: 22, key: 'category' },
    { header: '金額', width: 14, key: 'amount' },
  ];

  // Header styling
  input.getRow(1).eachCell(cell => {
    cell.font = { name: 'Noto Sans JP', size: 11, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: 'center' };
  });

  // Data validation for 入/出 column (B2:B501)
  for (let r = 2; r <= MANUAL_ROWS + 1; r++) {
    input.getCell(`B${r}`).dataValidation = {
      type: 'list',
      formulae: ['"入,出"'],
      showDropDown: false,
    };
    input.getCell(`D${r}`).dataValidation = {
      type: 'list',
      formulae: ["'科目マッピング'!$E$3:$E$14"],
      showDropDown: false,
    };
    input.getCell(`E${r}`).numFmt = '#,##0';
    input.getCell(`A${r}`).numFmt = 'yyyy/m/d';
  }

  // Add some sample manual data
  input.getCell('A2').value = new Date(2026, 0, 15);
  input.getCell('B2').value = '入';
  input.getCell('C2').value = 'テスト売上';
  input.getCell('D2').value = '商品の売上';
  input.getCell('E2').value = 100000;

  // ============================================================
  // Sheet 3: freee取込
  // ============================================================
  const freee = wb.addWorksheet('freee取込', {
    properties: { tabColor: { argb: GOLD } },
  });

  // Row 1: Headers (95 columns)
  for (let c = 0; c < FREEE_HEADERS.length; c++) {
    const cell = freee.getCell(1, c + 1);
    cell.value = FREEE_HEADERS[c];
    cell.font = { name: 'Noto Sans JP', size: 9, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
  }

  // All 12 sample rows from freee CSV (key columns only)
  // Rows 1-3: settlement entries (BR=1) → should be skipped
  // Rows 4-12: normal entries (BR=0) → should appear in dashboard
  const testRows = [
    { no: '1', date: new Date(2026, 0, 1), kariKamoku: '事業主借', kariKingaku: 294150, kariBikou: '', kariTori: '', kashiKamoku: '元入金', kashiKingaku: 294150, kessan: '1' },
    { no: '1', date: new Date(2026, 0, 1), kariKamoku: '受取利息', kariKingaku: 34, kariBikou: '', kariTori: '', kashiKamoku: '元入金', kashiKingaku: 34, kessan: '1' },
    { no: '1', date: new Date(2026, 0, 1), kariKamoku: '損益', kariKingaku: 5499, kariBikou: '', kariTori: '', kashiKamoku: '元入金', kashiKingaku: 5499, kessan: '1' },
    { no: '2', date: new Date(2026, 0, 20), kariKamoku: '消耗品費', kariKingaku: 5204, kariBikou: '家事按分50%', kariTori: 'コープさっぽろ', kashiKamoku: '事業主借', kashiKingaku: 5204, kessan: '0' },
    { no: '3', date: new Date(2026, 0, 23), kariKamoku: '消耗品費', kariKingaku: 1500, kariBikou: '', kariTori: 'イオン', kashiKamoku: '未払金', kashiKingaku: 1500, kessan: '0' },
    { no: '4', date: new Date(2026, 0, 25), kariKamoku: '車両費', kariKingaku: 3062, kariBikou: '部品交換', kariTori: 'COSMO石油', kashiKamoku: '事業主借', kashiKingaku: 3062, kessan: '0' },
    { no: '5', date: new Date(2026, 0, 31), kariKamoku: '消耗品費', kariKingaku: 30888, kariBikou: '', kariTori: 'コープさっぽろ', kashiKamoku: '未払金', kashiKingaku: 30888, kessan: '0' },
    { no: '6', date: new Date(2026, 1, 6), kariKamoku: '車両費', kariKingaku: 5136, kariBikou: '燃料', kariTori: 'COSMO石油', kashiKamoku: '現金', kashiKingaku: 5136, kessan: '0' },
    { no: '7', date: new Date(2026, 1, 20), kariKamoku: '消耗品費', kariKingaku: 10073, kariBikou: '', kariTori: 'アークス', kashiKamoku: '事業主借', kashiKingaku: 10073, kessan: '0' },
    { no: '8', date: new Date(2026, 1, 24), kariKamoku: '車両費', kariKingaku: 4763, kariBikou: '燃料', kariTori: 'COSMO石油', kashiKamoku: '現金', kashiKingaku: 4763, kessan: '0' },
    { no: '9', date: new Date(2026, 2, 7), kariKamoku: '消耗品費', kariKingaku: 14967, kariBikou: '', kariTori: 'アークス', kashiKamoku: '事業主借', kashiKingaku: 14967, kessan: '0' },
    { no: '10', date: new Date(2026, 2, 7), kariKamoku: '消耗品費', kariKingaku: 5600, kariBikou: '', kariTori: 'コープさっぽろ', kashiKamoku: '事業主借', kashiKingaku: 5600, kessan: '0' },
  ];
  for (let i = 0; i < testRows.length; i++) {
    const r = i + 2;
    const t = testRows[i];
    freee.getCell(r, 1).value = t.no;                        // A: No
    freee.getCell(r, 2).value = t.date;                       // B: 取引日
    freee.getCell(r, 2).numFmt = 'yyyy/m/d';
    freee.getCell(r, 4).value = t.kariKamoku;                 // D: 借方勘定科目
    freee.getCell(r, 8).value = t.kariKingaku;                // H: 借方金額
    freee.getCell(r, 15).value = t.kariTori;                  // O: 借方取引先名
    freee.getCell(r, 36).value = t.kariBikou;                 // AJ: 借方備考
    freee.getCell(r, 37).value = t.kashiKamoku;               // AK: 貸方勘定科目
    freee.getCell(r, 41).value = t.kashiKingaku;              // AO: 貸方金額
    freee.getCell(r, 70).value = t.kessan;                    // BR: 決算整理仕訳
  }

  // Processing columns (hidden, starting at col 99 = CU)
  // Headers for processing columns
  const pcHeaders = [
    [PC.TORIHIKI_DATE, '_取引日'],
    [PC.KARI_KAMOKU, '_借方科目'],
    [PC.KASHI_KAMOKU, '_貸方科目'],
    [PC.KESSAN, '_決算仕訳'],
    [PC.IN_OUT, '_入出'],
    [PC.KAMOKU_NAME, '_勘定科目名'],
    [PC.BUNRUI, '_分類'],
    [PC.KINGAKU, '_金額'],
    [PC.TORIHIKISAKI, '_取引先'],
    [PC.BIKOU, '_備考'],
    [PC.VALID, '_有効行'],
  ];

  for (const [col, header] of pcHeaders) {
    const cell = freee.getCell(1, col);
    cell.value = header;
    cell.font = { name: 'Noto Sans JP', size: 9, bold: true, color: { argb: 'FF94A3B8' } };
  }

  // Processing formulas for rows 2 to FREEE_ROWS+1
  const mapSheet = "'科目マッピング'";

  for (let r = 2; r <= FREEE_ROWS + 1; r++) {
    // CU: _取引日 = B (col 2)
    freee.getCell(r, PC.TORIHIKI_DATE).value = { formula: `IF(B${r}="","",B${r})` };

    // CV: _借方科目 = D (col 4)
    freee.getCell(r, PC.KARI_KAMOKU).value = { formula: `IF(B${r}="","",D${r})` };

    // CW: _貸方科目 = AK (col 37)
    freee.getCell(r, PC.KASHI_KAMOKU).value = { formula: `IF(B${r}="","",AK${r})` };

    // CX: _決算仕訳 = BR (col 70)
    freee.getCell(r, PC.KESSAN).value = { formula: `IF(B${r}="","",BR${r})` };

    // CY: _入出 - check mapping table
    const cuCol = colLetter(PC.KARI_KAMOKU);  // CV
    const cwCol = colLetter(PC.KASHI_KAMOKU);  // CW
    const cxCol = colLetter(PC.KESSAN);        // CX
    freee.getCell(r, PC.IN_OUT).value = {
      formula: `IF(OR(B${r}="",$${cxCol}${r}="1"),"",IF(ISNUMBER(MATCH($${cuCol}${r},${mapSheet}!$A$2:$A$30,0)),INDEX(${mapSheet}!$C$2:$C$30,MATCH($${cuCol}${r},${mapSheet}!$A$2:$A$30,0)),IF(ISNUMBER(MATCH($${cwCol}${r},${mapSheet}!$A$2:$A$30,0)),INDEX(${mapSheet}!$C$2:$C$30,MATCH($${cwCol}${r},${mapSheet}!$A$2:$A$30,0)),"")))`
    };

    // CZ: _勘定科目名
    const cyCol = colLetter(PC.IN_OUT);
    freee.getCell(r, PC.KAMOKU_NAME).value = {
      formula: `IF(${cyCol}${r}="","",IF(${cyCol}${r}="出",${cuCol}${r},${cwCol}${r}))`
    };

    // DA: _分類
    const czCol = colLetter(PC.KAMOKU_NAME);
    freee.getCell(r, PC.BUNRUI).value = {
      formula: `IF(${czCol}${r}="","",IFERROR(VLOOKUP(${czCol}${r},${mapSheet}!$A$2:$B$30,2,FALSE),"★未分類"))`
    };

    // DB: _金額
    freee.getCell(r, PC.KINGAKU).value = {
      formula: `IF(${cyCol}${r}="","",IF(${cyCol}${r}="出",H${r},AO${r}))`
    };
    freee.getCell(r, PC.KINGAKU).numFmt = '#,##0';

    // DC: _取引先 = O (col 15)
    freee.getCell(r, PC.TORIHIKISAKI).value = { formula: `IF(B${r}="","",O${r})` };

    // DD: _備考 = AJ (col 36)
    freee.getCell(r, PC.BIKOU).value = { formula: `IF(B${r}="","",AJ${r})` };

    // DE: _有効行
    const daCol = colLetter(PC.BUNRUI);
    freee.getCell(r, PC.VALID).value = {
      formula: `AND(${colLetter(PC.TORIHIKI_DATE)}${r}<>"",${cyCol}${r}<>"",${daCol}${r}<>"")`
    };
  }

  // Hide processing columns
  for (let c = PC.TORIHIKI_DATE; c <= PC.VALID; c++) {
    freee.getColumn(c).hidden = true;
  }

  // ============================================================
  // Sheet 4: 科目マッピング
  // ============================================================
  const mapping = wb.addWorksheet('科目マッピング', {
    properties: { tabColor: { argb: 'FF9C27B0' } },
  });

  mapping.columns = [
    { width: 20 },  // A: freee勘定科目
    { width: 25 },  // B: 分類
    { width: 8 },   // C: 入/出
    { width: 3 },   // D: spacer
    { width: 25 },  // E: 分類一覧
    { width: 8 },   // F: 入/出
  ];

  // Section A: Mapping table headers
  mapping.getCell('A1').value = 'freee勘定科目';
  mapping.getCell('B1').value = '収支ツールの分類';
  mapping.getCell('C1').value = '入/出';
  ['A1', 'B1', 'C1'].forEach(addr => {
    mapping.getCell(addr).font = { name: 'Noto Sans JP', size: 11, bold: true, color: { argb: WHITE } };
    mapping.getCell(addr).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  });

  // Mapping data
  for (let i = 0; i < MAPPINGS.length; i++) {
    const r = i + 2;
    mapping.getCell(`A${r}`).value = MAPPINGS[i][0];
    mapping.getCell(`B${r}`).value = MAPPINGS[i][1];
    mapping.getCell(`C${r}`).value = MAPPINGS[i][2];
    ['A', 'B', 'C'].forEach(col => {
      mapping.getCell(`${col}${r}`).font = { name: 'Noto Sans JP', size: 10 };
      mapping.getCell(`${col}${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
    });
  }

  // Section B: Category reference
  mapping.getCell('E1').value = '使える分類';
  mapping.getCell('F1').value = '入/出';
  ['E1', 'F1'].forEach(addr => {
    mapping.getCell(addr).font = { name: 'Noto Sans JP', size: 11, bold: true, color: { argb: WHITE } };
    mapping.getCell(addr).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  });

  const allCats = [
    ...INCOME_CATS.map(c => [c, '入']),
    ...EXPENSE_CATS.map(c => [c, '出']),
  ];
  for (let i = 0; i < allCats.length; i++) {
    const r = i + 2; // but we need to track offset
    // Put a divider: income first, then gap
    if (i === 0) {
      mapping.getCell(`E${r}`).value = allCats[i][0];
      mapping.getCell(`F${r}`).value = allCats[i][1];
    } else {
      mapping.getCell(`E${r + (i >= INCOME_CATS.length ? 1 : 0)}`).value = allCats[i][0];
      mapping.getCell(`F${r + (i >= INCOME_CATS.length ? 1 : 0)}`).value = allCats[i][1];
    }
  }
  // Simpler: just list them all from E2
  for (let i = 0; i < allCats.length; i++) {
    const r = i + 2;
    mapping.getCell(`E${r}`).value = allCats[i][0];
    mapping.getCell(`F${r}`).value = allCats[i][1];
    mapping.getCell(`E${r}`).font = { name: 'Noto Sans JP', size: 10 };
    mapping.getCell(`F${r}`).font = { name: 'Noto Sans JP', size: 10 };
    if (allCats[i][1] === '入') {
      mapping.getCell(`E${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_BG } };
      mapping.getCell(`F${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_BG } };
    }
  }
  // E column for data validation in 入力シート: categories only (E3:E14 corresponds to all 12 cats)
  // Actually E2:E13 has the 12 categories. Let me adjust the data validation range.
  // E2=商品の売上, E3=その他の収入, E4=材料・仕入れ, ..., E13=その他
  // So validation range should be E2:E13

  // Update 入力シート data validation to correct range
  for (let r = 2; r <= MANUAL_ROWS + 1; r++) {
    input.getCell(`D${r}`).dataValidation = {
      type: 'list',
      formulae: ["'科目マッピング'!$E$2:$E$13"],
      showDropDown: false,
    };
  }

  // ============================================================
  // Sheet 5: _統合データ
  // ============================================================
  const merged = wb.addWorksheet('_統合データ', {
    properties: { tabColor: { argb: 'FF9E9E9E' } },
  });

  merged.columns = [
    { header: '日付', width: 14, key: 'date' },
    { header: '入/出', width: 8, key: 'inout' },
    { header: '内容', width: 25, key: 'content' },
    { header: '分類', width: 22, key: 'category' },
    { header: '金額', width: 14, key: 'amount' },
    { header: '年月', width: 14, key: 'yearmonth' },
    { header: 'ソース', width: 10, key: 'source' },
    { header: '月リスト', width: 14, key: 'monthlist' },
  ];

  // Header styling
  merged.getRow(1).eachCell(cell => {
    cell.font = { name: 'Noto Sans JP', size: 10, bold: true, color: { argb: 'FF94A3B8' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  // Block 1: Manual input (rows 2 to MANUAL_ROWS+1)
  const inputSheet = "'入力シート'";
  for (let r = 2; r <= MANUAL_ROWS + 1; r++) {
    const srcR = r; // same row number in input sheet
    merged.getCell(`A${r}`).value = { formula: `IF(${inputSheet}!A${srcR}="","",${inputSheet}!A${srcR})` };
    merged.getCell(`A${r}`).numFmt = 'yyyy/m/d';
    merged.getCell(`B${r}`).value = { formula: `IF(${inputSheet}!A${srcR}="","",${inputSheet}!B${srcR})` };
    merged.getCell(`C${r}`).value = { formula: `IF(${inputSheet}!A${srcR}="","",${inputSheet}!C${srcR})` };
    merged.getCell(`D${r}`).value = { formula: `IF(${inputSheet}!A${srcR}="","",${inputSheet}!D${srcR})` };
    merged.getCell(`E${r}`).value = { formula: `IF(${inputSheet}!A${srcR}="","",${inputSheet}!E${srcR})` };
    merged.getCell(`E${r}`).numFmt = '#,##0';
    merged.getCell(`F${r}`).value = { formula: `IF(A${r}="","",TEXT(A${r},"yyyy年m月"))` };
    merged.getCell(`G${r}`).value = { formula: `IF(A${r}="","","手入力")` };
  }

  // Block 2: freee import (rows FREEE_DATA_START to FREEE_DATA_START+FREEE_ROWS-1)
  const freeeSheet = "'freee取込'";
  const validCol = colLetter(PC.VALID);
  const dateCol = colLetter(PC.TORIHIKI_DATE);
  const inoutCol = colLetter(PC.IN_OUT);
  const toriCol = colLetter(PC.TORIHIKISAKI);
  const bikouCol = colLetter(PC.BIKOU);
  const bunruiCol = colLetter(PC.BUNRUI);
  const kingakuCol = colLetter(PC.KINGAKU);

  for (let r = FREEE_DATA_START; r < FREEE_DATA_START + FREEE_ROWS; r++) {
    const srcR = r - FREEE_DATA_START + 2; // freee sheet row (starting from row 2)

    merged.getCell(`A${r}`).value = { formula: `IF(${freeeSheet}!${validCol}${srcR}=FALSE,"",${freeeSheet}!${dateCol}${srcR})` };
    merged.getCell(`A${r}`).numFmt = 'yyyy/m/d';
    merged.getCell(`B${r}`).value = { formula: `IF(${freeeSheet}!${validCol}${srcR}=FALSE,"",${freeeSheet}!${inoutCol}${srcR})` };
    merged.getCell(`C${r}`).value = { formula: `IF(${freeeSheet}!${validCol}${srcR}=FALSE,"",${freeeSheet}!${toriCol}${srcR}&" "&${freeeSheet}!${bikouCol}${srcR})` };
    merged.getCell(`D${r}`).value = { formula: `IF(${freeeSheet}!${validCol}${srcR}=FALSE,"",${freeeSheet}!${bunruiCol}${srcR})` };
    merged.getCell(`E${r}`).value = { formula: `IF(${freeeSheet}!${validCol}${srcR}=FALSE,"",${freeeSheet}!${kingakuCol}${srcR})` };
    merged.getCell(`E${r}`).numFmt = '#,##0';
    merged.getCell(`F${r}`).value = { formula: `IF(A${r}="","",TEXT(A${r},"yyyy年m月"))` };
    merged.getCell(`G${r}`).value = { formula: `IF(A${r}="","","freee")` };
  }

  // Month list helper (H column) - unique months from F column
  // Use a simple formula approach: check each possible month
  // For simplicity, list unique months using a helper approach
  // Since UNIQUE/SORT/FILTER are Google Sheets functions not supported in xlsx,
  // we'll pre-populate some months and let the user adjust, OR use a workaround

  // Workaround: pre-generate month labels for 2026
  const months2026 = [];
  for (let m = 1; m <= 12; m++) {
    months2026.push(`2026年${m}月`);
  }
  for (let i = 0; i < months2026.length; i++) {
    merged.getCell(`H${i + 2}`).value = months2026[i];
    merged.getCell(`H${i + 2}`).font = { name: 'Noto Sans JP', size: 9 };
  }

  // ============================================================
  // Save
  // ============================================================
  await wb.xlsx.writeFile(OUTPUT);
  console.log(`Created: ${OUTPUT}`);

  // Print verification summary
  console.log('\n=== Verification ===');
  console.log(`Sheets: ${wb.worksheets.map(s => s.name).join(', ')}`);
  console.log(`Manual input rows: 2-${MANUAL_ROWS + 1}`);
  console.log(`freee processing rows: 2-${FREEE_ROWS + 1}`);
  console.log(`Merged data: manual rows 2-${MANUAL_ROWS + 1}, freee rows ${FREEE_DATA_START}-${FREEE_DATA_START + FREEE_ROWS - 1}`);
  console.log(`Processing columns: ${colLetter(PC.TORIHIKI_DATE)}(${PC.TORIHIKI_DATE}) - ${colLetter(PC.VALID)}(${PC.VALID})`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

/**
 * 収支ツール セットアップスクリプト（Google Apps Script）
 * ※ freeeのCSVデータのみで集計（シンプル3シート構成）
 *
 * 【シート構成】
 *   ダッシュボード  : 月別集計（ここだけ見る）
 *   freee取込      : CSVを貼るシート + 右端に自動計算列
 *   科目マッピング  : freee科目 → 分類の対応表
 *
 * 【使い方】
 * 1. 対象のGoogle Sheetを開く
 * 2. 拡張機能 → Apps Script
 * 3. このコードを全部貼り付け
 * 4. setupTest() を実行（動作確認）
 * 5. 動作OKなら setupFull() を実行（本番規模）
 */

// ============================================================
// 定数
// ============================================================

var TEST_FREEE_ROWS  = 20;    // テスト用
var FULL_FREEE_ROWS  = 4000;  // 本番用
var FREEE_ROWS = TEST_FREEE_ROWS; // setup関数内で切り替え

// freee取込の処理列（CSV95列の右、列99=CUから）
var PC = {
  DATE:    99,   // CU: _取引日
  KARI:   100,   // CV: _借方科目
  KASHI:  101,   // CW: _貸方科目
  KESSAN: 102,   // CX: _決算仕訳
  INOUT:  103,   // CY: _入出（入 or 出 or 空白=スキップ）
  KAMOKU: 104,   // CZ: _勘定科目名
  BUNRUI: 105,   // DA: _分類（12カテゴリ）
  KINGAKU:106,   // DB: _金額
  TORI:   107,   // DC: _取引先
  BIKOU:  108,   // DD: _備考
  VALID:  109,   // DE: _有効行（TRUE=集計対象）
  YEARMO: 110,   // DF: _年月（ダッシュボード集計の軸）
};

// 科目マッピング（freee勘定科目 → [分類, 入/出]）
var MAPPINGS = [
  ['売上高',     '商品の売上',           '入'],
  ['雑収入',     'その他の収入',         '入'],
  ['仕入高',     '材料・仕入れ',         '出'],
  ['地代家賃',   '家賃・場所代',         '出'],
  ['通信費',     '通信費（スマホ・ネット）','出'],
  ['荷造運賃',   '送料・配送',           '出'],
  ['旅費交通費', '交通費',               '出'],
  ['車両費',     '交通費',               '出'],
  ['広告宣伝費', '広告・宣伝',           '出'],
  ['研修費',     '勉強・セミナー',       '出'],
  ['新聞図書費', '勉強・セミナー',       '出'],
  ['消耗品費',   '道具・備品',           '出'],
  ['減価償却費', '道具・備品',           '出'],
  ['諸会費',     '月額サービス（サブスク）','出'],
  ['支払手数料', 'その他',               '出'],
  ['外注費',     'その他',               '出'],
  ['接待交際費', 'その他',               '出'],
  ['福利厚生費', 'その他',               '出'],
  ['租税公課',   'その他',               '出'],
  ['保険料',     'その他',               '出'],
  ['水道光熱費', 'その他',               '出'],
  ['給料賃金',   'その他',               '出'],
];

var INCOME_CATS  = ['商品の売上', 'その他の収入'];
var EXPENSE_CATS = ['材料・仕入れ', '家賃・場所代', '通信費（スマホ・ネット）',
                    '送料・配送', '交通費', '広告・宣伝', '勉強・セミナー',
                    '道具・備品', '月額サービス（サブスク）', 'その他'];
var ALL_CATS = INCOME_CATS.concat(EXPENSE_CATS);

// 損益分岐点に使う固定費カテゴリ
var FIXED_COST_CATS = ['家賃・場所代', '通信費（スマホ・ネット）', '月額サービス（サブスク）'];

// 色
var NAVY        = '#1E3A5F';
var GOLD        = '#C9A84C';
var WHITE       = '#FFFFFF';
var LIGHT_BLUE  = '#E8F4FD';
var GREEN_BG    = '#E8F5E9';
var PROC_BG     = '#F0F4F8';   // 処理列の背景（薄グレー）
var BORDER_COLOR= '#E2E8F0';

// ============================================================
// エントリーポイント
// ============================================================

/** テスト用（20行で動作確認） */
function setupTest() {
  FREEE_ROWS = TEST_FREEE_ROWS;
  setup_();
}

/** 本番用（4000行）※ 実行に1〜2分かかります */
function setupFull() {
  FREEE_ROWS = FULL_FREEE_ROWS;
  setup_();
}

function setup_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('=== 収支ツール セットアップ開始 (freee ' + FREEE_ROWS + '行) ===');

  var sheets = prepareSheets_(ss);
  setupMappingSheet_(sheets.mapping);
  Logger.log('✓ 科目マッピング');

  setupFreeeProcessing_(sheets.freee);
  Logger.log('✓ freee取込 処理列');

  setupDashboard_(sheets.dashboard, sheets.freee);
  Logger.log('✓ ダッシュボード');

  // ダッシュボードを先頭タブに
  sheets.dashboard.activate();
  ss.moveActiveSheet(1);

  // === 診断ログ（問題調査用）===
  SpreadsheetApp.flush();
  var fr = sheets.freee;
  var b2  = fr.getRange('B2').getValue();
  var b2f = fr.getRange('B2').getDisplayValue();
  var df2 = fr.getRange(2, PC.YEARMO).getValue();
  var cy2 = fr.getRange(2, PC.INOUT).getValue();
  var g2  = sheets.dashboard.getRange('G2').getValue();
  Logger.log('=== 診断 ===');
  Logger.log('freee取込 B2 (getValue): ' + b2 + '  型: ' + (typeof b2));
  Logger.log('freee取込 B2 (表示値):   ' + b2f);
  Logger.log('freee取込 DF2 (_年月):   ' + df2);
  Logger.log('freee取込 CY2 (_入出):   ' + cy2);
  Logger.log('ダッシュボード G2 (月リスト): ' + g2);
  Logger.log('=== 完了 ===');

  SpreadsheetApp.getUi().alert(
    'セットアップ完了！\n\n' +
    '【診断結果】\n' +
    'B2の値: ' + b2f + '\n' +
    'DF2の年月: ' + (df2 || '★空（要確認）') + '\n' +
    '月リスト(G2): ' + (g2 || '★空（要確認）') + '\n\n' +
    (g2 ? 'ダッシュボードの▼から月を選んでください。' : '⚠ 月リストが空です。ログを確認してください。')
  );
}

// ============================================================
// Step 1: シート準備
// ============================================================

function prepareSheets_(ss) {
  // 不要な旧シートを削除
  var oldSheetNames = ['マスタ（触らない）', '分類マスタ', '_統合データ', '2026年8月'];
  oldSheetNames.forEach(function(name) {
    var s = ss.getSheetByName(name);
    if (s) { ss.deleteSheet(s); Logger.log('  削除: ' + name); }
  });

  // 既存シートを探す
  var dashboard = ss.getSheetByName('ダッシュボード') || ss.getSheetByName('⇒閲覧専用');
  var freee     = ss.getSheetByName('freee取込')     || ss.getSheetByName('シート6');
  var mapping   = ss.getSheetByName('科目マッピング');

  // リネーム
  if (dashboard && dashboard.getName() === '⇒閲覧専用') {
    dashboard.setName('ダッシュボード');
    Logger.log('  リネーム: ⇒閲覧専用 → ダッシュボード');
  }
  if (freee && freee.getName() === 'シート6') {
    freee.setName('freee取込');
    Logger.log('  リネーム: シート6 → freee取込');
  }

  // なければ新規作成
  if (!dashboard) { dashboard = ss.insertSheet('ダッシュボード'); Logger.log('  作成: ダッシュボード'); }
  if (!freee)     { freee     = ss.insertSheet('freee取込');      Logger.log('  作成: freee取込'); }

  // 科目マッピングは毎回クリア再作成
  if (mapping) ss.deleteSheet(mapping);
  mapping = ss.insertSheet('科目マッピング');
  Logger.log('  作成: 科目マッピング');

  // タブ色
  dashboard.setTabColor(NAVY);
  freee.setTabColor(GOLD);
  mapping.setTabColor('#9C27B0');

  return { dashboard: dashboard, freee: freee, mapping: mapping };
}

// ============================================================
// Step 2: 科目マッピングシート
// ============================================================

function setupMappingSheet_(sheet) {
  // --- A:C 列：マッピング本表 ---
  sheet.getRange('A1:C1').setValues([['freee勘定科目', '収支ツールの分類', '入/出']])
    .setFontWeight('bold').setFontColor(WHITE).setBackground(NAVY)
    .setFontFamily('Noto Sans JP').setFontSize(11);

  sheet.getRange(2, 1, MAPPINGS.length, 3).setValues(MAPPINGS)
    .setFontFamily('Noto Sans JP').setFontSize(10).setBackground(LIGHT_BLUE);

  // --- E:F 列：分類一覧（参照用） ---
  sheet.getRange('E1:F1').setValues([['使える分類', '入/出']])
    .setFontWeight('bold').setFontColor(WHITE).setBackground(NAVY)
    .setFontFamily('Noto Sans JP').setFontSize(11);

  var catData = ALL_CATS.map(function(c) {
    return [c, INCOME_CATS.indexOf(c) >= 0 ? '入' : '出'];
  });
  sheet.getRange(2, 5, catData.length, 2).setValues(catData)
    .setFontFamily('Noto Sans JP').setFontSize(10);
  // 入カテゴリに緑背景
  sheet.getRange(2, 5, INCOME_CATS.length, 2).setBackground(GREEN_BG);

  // 列幅
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 60);
  sheet.setColumnWidth(4, 30);  // spacer
  sheet.setColumnWidth(5, 200);
  sheet.setColumnWidth(6, 60);
}

// ============================================================
// Step 3: freee取込 処理列
// ============================================================

function setupFreeeProcessing_(sheet) {
  var mapRef   = "'科目マッピング'";
  var mapA     = '$A$2:$A$' + (MAPPINGS.length + 1);   // マッピングA列範囲
  var mapC     = '$C$2:$C$' + (MAPPINGS.length + 1);   // 入/出C列範囲
  var mapAB    = '$A$2:$B$' + (MAPPINGS.length + 1);   // 分類VLOOKUP範囲
  var lastRow  = FREEE_ROWS + 1;                        // 2〜lastRow行に数式
  var BATCH    = 500;

  // ヘッダー行（処理列）
  var pcHeaders = [
    [PC.DATE,    '_取引日（B列）'],
    [PC.KARI,    '_借方科目（D列）'],
    [PC.KASHI,   '_貸方科目（AK列）'],
    [PC.KESSAN,  '_決算仕訳（BR列）'],
    [PC.INOUT,   '_入出'],
    [PC.KAMOKU,  '_勘定科目名'],
    [PC.BUNRUI,  '_分類'],
    [PC.KINGAKU, '_金額'],
    [PC.TORI,    '_取引先（O列）'],
    [PC.BIKOU,   '_備考（AJ列）'],
    [PC.VALID,   '_有効行'],
    [PC.YEARMO,  '_年月'],
  ];
  pcHeaders.forEach(function(h) {
    sheet.getRange(1, h[0])
      .setValue(h[1])
      .setFontFamily('Noto Sans JP').setFontSize(9).setFontWeight('bold')
      .setFontColor('#475569').setBackground(PROC_BG);
  });

  // 処理列の列幅
  sheet.setColumnWidth(PC.DATE,    90);
  sheet.setColumnWidth(PC.KARI,    100);
  sheet.setColumnWidth(PC.KASHI,   100);
  sheet.setColumnWidth(PC.KESSAN,  70);
  sheet.setColumnWidth(PC.INOUT,   50);
  sheet.setColumnWidth(PC.KAMOKU,  110);
  sheet.setColumnWidth(PC.BUNRUI,  150);
  sheet.setColumnWidth(PC.KINGAKU, 90);
  sheet.setColumnWidth(PC.TORI,    100);
  sheet.setColumnWidth(PC.BIKOU,   120);
  sheet.setColumnWidth(PC.VALID,   70);
  sheet.setColumnWidth(PC.YEARMO,  80);

  // 数式をバッチ設定
  for (var start = 2; start <= lastRow; start += BATCH) {
    var end     = Math.min(start + BATCH - 1, lastRow);
    var nRows   = end - start + 1;

    var fDATE=[], fKARI=[], fKASHI=[], fKESSAN=[];
    var fINOUT=[], fKAMOKU=[], fBUNRUI=[], fKINGAKU=[];
    var fTORI=[], fBIKOU=[], fVALID=[], fYEARMO=[];

    for (var r = start; r <= end; r++) {
      // CU: _取引日 ← B列
      fDATE.push(['=IF(B'+r+'="","",B'+r+')']);

      // CV: _借方科目 ← D列
      fKARI.push(['=IF(B'+r+'="","",D'+r+')']);

      // CW: _貸方科目 ← AK列
      fKASHI.push(['=IF(B'+r+'="","",AK'+r+')']);

      // CX: _決算仕訳 ← BR列（"1"または1 = 決算仕訳）
      fKESSAN.push(['=IF(B'+r+'="","",BR'+r+')']);

      // CY: _入出（借方科目 → 出、貸方科目 → 入、なければ空白）
      // $CX&""="1" でテキスト/数値どちらの"1"も安全に判定
      fINOUT.push([
        '=IF(OR(B'+r+'="",$CX'+r+'&""="1"),"",'+
        'IF(ISNUMBER(MATCH($CV'+r+','+mapRef+'!'+mapA+',0)),'+
           'INDEX('+mapRef+'!'+mapC+',MATCH($CV'+r+','+mapRef+'!'+mapA+',0)),'+
        'IF(ISNUMBER(MATCH($CW'+r+','+mapRef+'!'+mapA+',0)),'+
           'INDEX('+mapRef+'!'+mapC+',MATCH($CW'+r+','+mapRef+'!'+mapA+',0)),'+
        '"")))']);

      // CZ: _勘定科目名（出→借方、入→貸方）
      fKAMOKU.push(['=IF(CY'+r+'="","",IF(CY'+r+'="出",CV'+r+',CW'+r+'))']);

      // DA: _分類（マッピング表でVLOOKUP、なければ★未分類）
      fBUNRUI.push([
        '=IF(CZ'+r+'="","",'+
        'IFERROR(VLOOKUP(CZ'+r+','+mapRef+'!'+mapAB+',2,FALSE),"★未分類"))']);

      // DB: _金額（出→借方金額H、入→貸方金額AO）
      fKINGAKU.push(['=IF(CY'+r+'="","",IF(CY'+r+'="出",H'+r+',AO'+r+'))']);

      // DC: _取引先 ← O列
      fTORI.push(['=IF(B'+r+'="","",O'+r+')']);

      // DD: _備考 ← AJ列
      fBIKOU.push(['=IF(B'+r+'="","",AJ'+r+')']);

      // DE: _有効行（集計対象 = TRUE）
      fVALID.push(['=AND(CU'+r+'<>"",CY'+r+'<>"",DA'+r+'<>"")']);

      // DF: _年月（ダッシュボードの集計軸）
      // B列を直接参照。3段IFERROR で日付型/テキスト/ハイフン形式に対応
      //   1st: 数値日付 → YEAR/MONTH
      //   2nd: テキスト"2026/01/01" → DATEVALUE → YEAR/MONTH
      //   3rd: テキスト"2026-01-01" → ハイフンをスラッシュに変換 → DATEVALUE → YEAR/MONTH
      fYEARMO.push([
        '=IF(B'+r+'="","",'+
        'IFERROR('+
          'IF(ISNUMBER(B'+r+'),YEAR(B'+r+')&"年"&MONTH(B'+r+')&"月",'+
          'IFERROR('+
            'YEAR(DATEVALUE(B'+r+'))&"年"&MONTH(DATEVALUE(B'+r+'))&"月",'+
            'YEAR(DATEVALUE(SUBSTITUTE(B'+r+',"-","/")))&"年"&MONTH(DATEVALUE(SUBSTITUTE(B'+r+',"-","/")))&"月"'+
          ')),'+
        '"")))']);
    }

    sheet.getRange(start, PC.DATE,    nRows, 1).setFormulas(fDATE);
    sheet.getRange(start, PC.KARI,    nRows, 1).setFormulas(fKARI);
    sheet.getRange(start, PC.KASHI,   nRows, 1).setFormulas(fKASHI);
    sheet.getRange(start, PC.KESSAN,  nRows, 1).setFormulas(fKESSAN);
    sheet.getRange(start, PC.INOUT,   nRows, 1).setFormulas(fINOUT);
    sheet.getRange(start, PC.KAMOKU,  nRows, 1).setFormulas(fKAMOKU);
    sheet.getRange(start, PC.BUNRUI,  nRows, 1).setFormulas(fBUNRUI);
    sheet.getRange(start, PC.KINGAKU, nRows, 1).setFormulas(fKINGAKU);
    sheet.getRange(start, PC.TORI,    nRows, 1).setFormulas(fTORI);
    sheet.getRange(start, PC.BIKOU,   nRows, 1).setFormulas(fBIKOU);
    sheet.getRange(start, PC.VALID,   nRows, 1).setFormulas(fVALID);
    sheet.getRange(start, PC.YEARMO,  nRows, 1).setFormulas(fYEARMO);

    SpreadsheetApp.flush();
    Logger.log('  処理列 ' + start + '〜' + end + ' 行完了');
  }

  // 書式
  sheet.getRange(2, PC.KINGAKU, lastRow - 1, 1).setNumberFormat('#,##0');
  sheet.getRange(2, PC.DATE,    lastRow - 1, 1).setNumberFormat('yyyy/m/d');

  // 処理列に薄背景（CSVとの区別）
  sheet.getRange(1, PC.DATE, lastRow, 12).setBackground(PROC_BG);
}

// ============================================================
// Step 4: ダッシュボード
// ============================================================

function setupDashboard_(sheet, freeeSheet) {
  sheet.clear();
  sheet.showRows(1, sheet.getMaxRows());  // 旧シートで行が非表示になっていた場合の防御
  sheet.setHiddenGridlines(true);

  var fr = "'freee取込'";  // 参照先
  var dfLastRow = FREEE_ROWS + 1;

  // 列幅
  sheet.setColumnWidth(1, 16);   // A: spacer
  sheet.setColumnWidth(2, 240);  // B: ラベル
  sheet.setColumnWidth(3, 150);  // C: 値
  sheet.setColumnWidth(4, 250);  // D: 備考
  sheet.setColumnWidth(7, 80);   // G: 月リスト（後で非表示）

  // --- タイトル ---
  sheet.getRange('B1').setValue('経営ダッシュボード')
    .setFontFamily('Noto Sans JP').setFontSize(18).setFontWeight('bold').setFontColor(NAVY);
  Logger.log('  Dashboard: title written');

  // --- 月リスト（G列）---
  // ※ hideColumns は setDataValidation の後に行う（先に隠すと validation 設定が失敗する）
  sheet.getRange('G1').setValue('月リスト').setFontColor('#94A3B8').setFontSize(9);
  sheet.getRange('G2').setFormula(
    '=IFERROR(SORT(UNIQUE(FILTER('+fr+'!DF2:DF'+dfLastRow+','+fr+'!DF2:DF'+dfLastRow+'<>""))),"")');
  SpreadsheetApp.flush();  // G2数式を確定してからvalidation設定
  Logger.log('  Dashboard: G2 month list formula set');

  // --- 月選択ドロップダウン ---
  sheet.getRange('B2').setValue('対象月：')
    .setFontFamily('Noto Sans JP').setFontSize(11).setFontColor('#475569');

  // C2: ドロップダウンのみ（数式なし）。ユーザーが月を選ぶ
  sheet.getRange('C2')
    .setFontFamily('Noto Sans JP').setFontSize(11).setFontWeight('bold')
    .setBackground('#FFF9C4')
    .setBorder(true, true, true, true, false, false, BORDER_COLOR, SpreadsheetApp.BorderStyle.SOLID);

  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(sheet.getRange('G2:G50'), true)
    .setAllowInvalid(false).build();
  sheet.getRange('C2').setDataValidation(rule);
  Logger.log('  Dashboard: C2 dropdown set');

  // G列を非表示（validation設定後に行う）
  sheet.hideColumns(7);
  Logger.log('  Dashboard: G column hidden');

  // 行3: 区切り線
  sheet.getRange('B3:D3').setBackground(NAVY);

  // ─── SUMIFS ヘルパー（インライン文字列組み立て）───────────────
  // ※ CY が空文字の行（決算・B/S科目）は "入"/"出" に一致しないため DE フィルタ不要
  var sumBase  = function(inout) {
    return 'SUMIFS('+fr+'!DB:DB,'+fr+'!CY:CY,"'+inout+'",'+fr+'!DF:DF,$C$2';
  };
  var sumCat = function(inout, cat) {
    return sumBase(inout)+','+fr+'!DA:DA,"'+cat+'")';
  };

  var salesF   = '='+sumBase('入')+')';
  var expenseF = '='+sumBase('出')+')';
  var fixedF   = '='+FIXED_COST_CATS.map(function(c){ return sumCat('出',c); }).join('+');

  // --- サマリー行（B4〜B8） ---
  var rows = [
    [4, '売上合計',                salesF,   '',                    NAVY],
    [5, '費用合計',                expenseF, '',                    NAVY],
    [6, '手残り（売上−費用）',     '=C4-C5', '',                    '#16A34A'],
    [7, '損益分岐点（固定費合計）', fixedF,   '家賃＋通信費＋サブスク', NAVY],
    [8, '今月あといくら売ればいい？','=C7-C4','マイナス＝目標達成！',  NAVY],
  ];
  rows.forEach(function(item) {
    var r = item[0];
    sheet.getRange('B'+r).setValue(item[1])
      .setFontFamily('Noto Sans JP').setFontSize(11).setFontColor('#475569');
    sheet.getRange('C'+r).setFormula(item[2])
      .setFontFamily('Noto Sans JP').setFontSize(14).setFontWeight('bold')
      .setFontColor(item[4]).setNumberFormat('#,##0');
    if (item[3]) {
      sheet.getRange('D'+r).setValue(item[3])
        .setFontFamily('Noto Sans JP').setFontSize(9).setFontColor('#94A3B8');
    }
    Logger.log('  Dashboard row '+r+': '+item[1]);
  });

  // 行9: 区切り線 / 行10: 未分類警告 / 行11: 区切り線
  sheet.getRange('B9:D9').setBackground(BORDER_COLOR);
  sheet.getRange('B10')
    .setFormula('=IF(COUNTIFS('+fr+'!CY:CY,"<>",'+fr+'!DA:DA,"★未分類")>0,"⚠ 未分類の取引があります → 科目マッピングを確認","")')
    .setFontFamily('Noto Sans JP').setFontSize(10).setFontColor('#DC2626');
  sheet.getRange('B11:D11').setBackground(BORDER_COLOR);
  Logger.log('  Dashboard: warning formula set');

  // --- 売上の内訳 ---
  var incomeStart = 12;
  sheet.getRange('B'+incomeStart+':C'+incomeStart).merge()
    .setValue('【 売上の内訳 】')
    .setFontFamily('Noto Sans JP').setFontSize(12).setFontWeight('bold')
    .setFontColor(WHITE).setBackground(NAVY);
  INCOME_CATS.forEach(function(cat, i) {
    var r = incomeStart + 1 + i;
    sheet.getRange('B'+r).setValue(cat).setFontFamily('Noto Sans JP').setFontSize(11);
    sheet.getRange('B'+r+':C'+r).setBackground(GREEN_BG);
    sheet.getRange('C'+r).setFormula('='+sumCat('入', cat))
      .setFontFamily('Noto Sans JP').setFontSize(11).setNumberFormat('#,##0');
  });
  Logger.log('  Dashboard: income breakdown written');

  // --- 費用の内訳 ---
  var expenseStart = incomeStart + INCOME_CATS.length + 2;
  sheet.getRange('B'+expenseStart+':C'+expenseStart).merge()
    .setValue('【 費用の内訳 】')
    .setFontFamily('Noto Sans JP').setFontSize(12).setFontWeight('bold')
    .setFontColor(WHITE).setBackground(NAVY);
  EXPENSE_CATS.forEach(function(cat, i) {
    var r = expenseStart + 1 + i;
    sheet.getRange('B'+r).setValue(cat).setFontFamily('Noto Sans JP').setFontSize(11);
    sheet.getRange('C'+r).setFormula('='+sumCat('出', cat))
      .setFontFamily('Noto Sans JP').setFontSize(11).setNumberFormat('#,##0');
  });
  Logger.log('  Dashboard: expense breakdown written');

  SpreadsheetApp.flush();
  Logger.log('  Dashboard setup complete');
}

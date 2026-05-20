# HP掲載用スライドHTML 制作仕様書

## 概要
資料ライブラリページ（`materials/index.html`）に1枚ずつ掲載するHTMLスライド。
PPTXの内容をHTML化したもので、講習会ページのスライドと同じデザイン体系を共有する。

---

## デザイントークン（共通）

```css
:root {
  --gold: #c9a84c;
  --gold-light: #e8d08a;
  --text-dark: #2a2a2a;
  --text-mid: #4a4a4a;
}
```

- **フォント**: `'Noto Sans JP', sans-serif`（ゴシック統一。Serifは使わない）
- **背景色**: `#f8fafc`
- **スライド背景**: `linear-gradient(135deg, #d4d8e2 0%, #edf0f6 38%, #ffffff 58%, #dde0e8 100%)`

---

## レイアウトルール

| 項目 | 値 |
|---|---|
| スライド最大幅 | `max-width: 680px` （全スライド共通、絶対に変えない） |
| スライド角丸 | `border-radius: 14px` |
| スライド内パディング | `padding: 26px 36px` |
| スライドボーダー | `border: 1px solid rgba(201,168,76,0.2)` |
| スライド影 | `box-shadow: 0 6px 28px rgba(0,0,0,0.09), 0 2px 6px rgba(0,0,0,0.05)` |
| 金コーナー装飾 | `::before`（左上）`::after`（右下）各18x18px、gold 1.5px、opacity 0.6 |
| 表示位置 | 画面中央、最下部から15%上（`padding-bottom: 15vh`） |
| 外枠 | なし（透明枠なし） |
| SLIDE番号ラベル | 表示しない（deco飾り線・slide-num共に不要） |

---

## フォントサイズ一覧

### スライド本体
| 要素 | サイズ | 備考 |
|---|---|---|
| タイトル `.slide-title` | 22px / 700 | 1行表示（改行しない） |
| サブタイトル `.slide-subtitle` | 14px / 400 | タイトル直下、黒文字、中央揃え |

### ボックス内（col-box / text-block）
| 要素 | サイズ | 備考 |
|---|---|---|
| ラベル `.col-label` | 12px | letter-spacing: 2px、gold色 |
| メインテキスト `.col-main` | 17〜18px / 600 | 2カラム=17px、3カラム=18px |
| サブテキスト `.col-sub` | 14px | color: #666 |
| リスト `ul li` | 16px | `・`付き |
| テキストブロック本文 `.block-body` | 16px | line-height: 1.8 |
| テキストブロックメイン `.block-main` | 17px / 600 | |
| テキストブロックラベル `.block-label` | 12px | gold色 |

### ポイント欄（point-bar）※サイズ固定、変更しない
| 要素 | サイズ | 備考 |
|---|---|---|
| ラベル `.point-label` | 9px / 700 | letter-spacing: 2px、gold色 |
| テキスト `.point-text` | 13px / 500 | |

---

## ポイント欄の仕様

```css
.point-bar {
  background: white;
  border: 1.5px solid var(--gold);  /* 金色の枠 */
  border-radius: 8px;
  padding: 10px 20px;
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}
```

- 旧「解説」→「ポイント」に名称変更済み
- **1行表示**（flexで横並び、改行しない）
- タイトルも1行表示が基本
- 複数ポイントがある場合は `.point-bar` を複数配置（margin-top: 6px で間隔）

---

## スライドレイアウトパターン

### パターンA: 2カラム比較型
用途：対になる概念の比較（個人事業主vs法人、売掛金vs買掛金、資産vs経費、固定費vs変動費）

```html
<div class="two-col">
  <div class="col-box">
    <div class="col-label">ラベル</div>
    <!-- col-main / col-sub / ul のいずれかで内容を構成 -->
  </div>
  <div class="col-box">...</div>
</div>
```

```css
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
```

### パターンB: 3カラム型
用途：3つの要素を横並び（売上/粗利/純利、原因①②③）

```html
<div class="three-col">
  <div class="col-box">...</div>
  <div class="col-box">...</div>
  <div class="col-box">...</div>
</div>
```

```css
.three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 16px; }
```

### パターンC: 2×2グリッド型
用途：4つの要素（年商/年収/利益/所得）

```html
<div class="four-grid">
  <div class="col-box">...</div>
  <div class="col-box">...</div>
  <div class="col-box">...</div>
  <div class="col-box">...</div>
</div>
```

```css
.four-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
```

### パターンD: テキスト説明型
用途：単一概念の詳細説明（減価償却とは）

```html
<div class="text-block">
  <div class="block-label">ラベル</div>
  <div class="block-main">メインテキスト</div>
  <div class="block-body">詳細説明</div>
</div>
```

---

## col-box 共通CSS

```css
.col-box {
  background: rgba(255,255,255,0.65);
  border: 1px solid rgba(201,168,76,0.4);
  border-radius: 8px;
  padding: 14px 16px;  /* 2カラム */
  /* padding: 12px 10px;  3カラム時 */
  text-align: center;
}
```

---

## HTMLテンプレート（フルページ）

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>【スライドタイトル】 | 企業のお医者さん</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    /* ここにCSS変数・共通スタイル・レイアウトパターンを配置 */
  </style>
</head>
<body>
  <div class="slide-unit">
    <div class="slide">
      <div class="slide-title">【タイトル（1行）】</div>
      <!-- 必要に応じて slide-subtitle -->
      <!-- レイアウトパターン A〜D を配置 -->
      <div class="point-bar">
        <span class="point-label">ポイント</span>
        <span class="point-text">【ポイントテキスト（1行）】</span>
      </div>
    </div>
  </div>
</body>
</html>
```

---

## 既存スライド一覧（9枚）

| # | ファイル名 | タイトル | パターン |
|---|---|---|---|
| 01 | slide_01.html | 個人事業主と法人の違い | A（2カラム＋リスト） |
| 02 | slide_02.html | キャッシュフローとは | A（サブタイトル＋2カラム） |
| 03 | slide_03.html | 売掛金と買掛金 | A（2カラム） |
| 04 | slide_04.html | 資産と経費の違い | A（2カラム） |
| 05 | slide_05.html | 固定費と変動費 | A（2カラム） |
| 06 | slide_06.html | 黒字でも倒産する理由 | B（3カラム）＋リンク |
| 07 | slide_07.html | 売上・粗利・純利の違い | B（3カラム） |
| 08 | slide_08.html | 年商・年収・所得・利益の違い | C（2×2グリッド） |
| 09 | slide_09.html | 減価償却とは | D（テキスト説明） |

---

## モーダル表示仕様（資料ライブラリ）

スライドHTMLは `materials/index.html` の資料カードからモーダル（iframe方式）で表示される。
fetch方式はCSS競合が多すぎるため採用しない。**iframe方式を維持すること。**

### モーダルCSS（materials/index.html 側）

```css
#modal { display:none; position:fixed; top:0; left:0; width:100%; height:100%; z-index:1000; background:rgba(0,0,0,0.72); }
#modal.open { display:flex; align-items:flex-end; justify-content:center; padding-bottom:15vh; }
#modal-inner { position:relative; width:90%; max-width:800px; overflow:visible; background:none; border-radius:0; }
#modal-inner iframe { display:block; width:100%; border:none; border-radius:0; background:none; overflow:hidden; }
#modal-inner img { display:block; width:100%; max-height:70vh; object-fit:contain; background:#fff; border-radius:14px; }
#modal-close { position:absolute; top:12px; right:12px; background:rgba(0,0,0,0.6); color:#fff; border:none; border-radius:50%; width:36px; height:36px; font-size:20px; line-height:36px; text-align:center; cursor:pointer; z-index:1010; }
```

### モーダルJS（materials/index.html 側）

```javascript
function openModal(url, imgSrc, title) {
  const inner = document.getElementById('modal-inner');
  if (url) {
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.onload = function() {
      try {
        iframe.style.height = (iframe.contentDocument.body.scrollHeight + 20) + 'px';
      } catch(e) {
        iframe.style.height = '60vh';
      }
    };
    inner.innerHTML = '<button id="modal-close" onclick="closeModal()">✕</button>';
    inner.appendChild(iframe);
  } else {
    inner.innerHTML = '<button id="modal-close" onclick="closeModal()">✕</button>' +
      '<img src="' + imgSrc + '" alt="' + title + '">';
  }
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.getElementById('modal-inner').innerHTML = '';
  document.body.style.overflow = '';
}
```

### スライドHTML側の必須bodyスタイル

スライドHTMLがiframe内で正しく表示されるために必須：

```css
body {
  font-family: 'Noto Sans JP', sans-serif;
  background-color: transparent;  /* 白枠防止：#f8fafcにしない */
  margin: 0;
  padding: 16px 0;
  overflow: hidden;               /* スクロールバー防止 */
  display: flex;
  align-items: center;
  justify-content: center;
}
```

**禁止事項：**
- `min-height: 100vh` → iframeでは不要、高さ計算が狂う
- `padding-bottom: 15vh` → モーダル側で位置制御するのでスライド側では不要
- `background-color: #f8fafc` → 白枠の原因になる

### Cloudflare Pages 設定

#### `_headers` ファイル
```
/*
  X-Frame-Options: SAMEORIGIN
```

**重要：**
- サイト全体を `SAMEORIGIN` にする（`DENY` にしない）
- 同一ドメインのiframeでスライドを表示するため
- パス別に分けると Cloudflare Clean URLs との組み合わせでパターン不一致が起きるので `/*` で統一

#### Clean URLs に関する注意
- Cloudflare Pages は `.html` 拡張子を自動除去する（Clean URLs）
- `data.json` の url は `slide_06.html` でOK（ブラウザが `slide_06` にリダイレクト）
- `_headers` のパス指定では `.html` なしの `/materials/slide_*` を使うこと

### デプロイ

```bash
npx wrangler pages deploy . --project-name kigyonooishasan-hp --branch main --commit-dirty=true
```

**`--branch main` は必須。** 省略するとプレビュー環境にしかデプロイされない。

---

## 注意事項
- スライド間リンクのhrefは、HP統合時に実際のパスに差し替えること
- 講習会ページ（`library.html`）のフォントもNoto Sans JP（ゴシック）に統一すること
- 新規スライド追加時は必ず `max-width: 680px` を維持すること
- ポイント欄のフォントサイズは変更禁止（9px/13px固定）
- モーダル表示方式は iframe 方式を維持すること（fetch方式はCSS競合で禁止）
- スライドHTML の body 背景は必ず `transparent` にすること
-CSS/HTML の視覚的バグはOpus側で診断する。Codeは自己判断で修正を繰り返さず、スクショベースの指示を待つこと
---

## トラブルシュート（過去の教訓）

### 絶対にやってはいけないこと
1. **fetch方式でスライドを読み込む** → 親ページのTailwind CSSがスライドのスタイルを破壊する。iframeなら隔離される
2. **X-Frame-Options: DENY** → 同一ドメインのiframeがブロックされる。必ず SAMEORIGIN
3. **X-Frame-Options を DENY と SAMEORIGIN 両方設定** → 競合して DENY にフォールバックする。DENY の行を消して SAMEORIGIN だけにする
4. **スライドHTMLに `min-height:100vh` や `padding-bottom:15vh`** → iframe内で巨大な余白ができる
5. **スライドHTMLに `background-color:#f8fafc`** → iframe内で白枠に見える
6. **`#modal-inner` に `background`, `border-radius`, `max-height`** → 白枠・スクロールバーの原因

### よくある症状と原因

| 症状 | 原因 | 修正 |
|---|---|---|
| 「接続が拒否されました」 | X-Frame-Options: DENY | `_headers` で SAMEORIGIN に変更 |
| 白い枠が出る | スライドHTML の body 背景色、または `#modal-inner` の background | 両方 transparent/none に |
| スクロールバーが出る | `#modal-inner` の `max-height` + `overflow-y:auto`、またはスライドHTML の body 余白 | max-height 削除、overflow:visible、スライド側 overflow:hidden |
| スライドが縦に崩れる | fetch方式で親ページCSSが干渉 | iframe方式に戻す |
| デプロイしても反映されない | `--branch main` の付け忘れ | 必ず `--branch main` 付きでデプロイ |
| `_headers` のパターンが効かない | Clean URLs で `.html` が除去される | `/materials/slide_*`（.html なし）で指定 |

### CSS修正時のルール
- **視覚的な問題はClaude Code単体で解決しない**。Opus側でスクショを見て正確なCSS修正を書き、Claude Codeにはコピペ用コードを渡す
- 「白枠を消して」のような曖昧指示ではなく「この行のこのプロパティをこう変えて」と具体的に指示する
# CLAUDE.md（Homepage / Static Site）

## 0. 前提（最優先）
- 親フォルダの共通CLAUDE.md（事業OS/憲法）に必ず従う。
- このフォルダは「企業のお医者さん」HP（静的サイト）のみを扱う。

## 1. プロジェクト概要
- サイト名：企業のお医者さん（kigyonooishasan.pages.dev）
- 構成：静的HTML/CSS/JS（フレームワークなし）
- ホスティング：Cloudflare Pages（Wranglerで直接デプロイ、GitHubは使用しない）
- デプロイコマンド：`cd 10_ホームページ && npx wrangler pages deploy . --project-name kigyonooishasan-hp --branch main --commit-dirty=true`
- スタイリング：Tailwind CSS CDN + インライン `<style>`
- フォント：Noto Sans JP（Google Fonts）

## 2. 掲載ポリシー（HP固有・重要）
- HPには「講習会の情報は掲載しない」
- 目的は「顧問契約（個別指導）へ誘導する導線」を壊さないこと（共通憲法優先）。

## 3. デザインシステム

### カラーパレット（HP統一色）
| 用途 | 色コード | Tailwind相当 |
|------|---------|-------------|
| 本文テキスト | `#0f172a` | slate-900 |
| 補助テキスト | `#475569` | slate-600 |
| 薄補助テキスト | `#4a4a4a` | — |
| ベース背景 | `#f8fafc` / `#faf8f3` | slate-50 / warm |
| ボーダー | `#e2e8f0` | slate-200 |
| アクセント | `#4f46e5` | indigo-600 |
| CTAボタン背景 | `#1E3A5F` | — |
| ゴールド | `#c9a84c` / `#C08010` | — |

### デザイントークン
- 角丸：rounded-xl〜rounded-2xl
- フォント：Noto Sans JP（本文）＋ Noto Serif JP（タイトル・library.html）

## 4. ファイル構成とアーキテクチャ

```
10_ホームページ/
├── index.html              ← トップページ
├── service.html            ← サービス・料金
├── contact.html            ← お問い合わせ
├── library.html            ← 講習会ページ（1939行・単一HTMLファイル）
├── maintenance.html        ← メンテナンス画面
├── css/style.css           ← メインCSS（ほぼ未参照・Tailwind CDNが主体）
├── js/main.js              ← メインJS（ほぼ未参照・各HTMLにインライン直書き）
├── blog/
│   ├── index.html          ← ブログ一覧
│   ├── data.json           ← 記事メタデータ
│   └── *.html              ← 個別記事
└── materials/
    ├── index.html          ← 資料ライブラリ一覧（iframe親）
    ├── scale.css           ← 資料用CSS（※URL解決の注意あり→§6参照）
    ├── data.json           ← 資料メタデータ
    ├── slide_01〜09.html   ← スライド本体（iframeで読込）
    ├── facilitator_memo.html
    ├── question_card.html / question_card_2.html
    └── self-check.html
```

### ページ間の依存関係
| ページ | 外部CSS | 外部JS | CDN |
|--------|--------|--------|-----|
| index.html / service.html / contact.html | なし | なし | Tailwind CDN, Google Fonts, GA4 |
| blog/*.html | なし | なし | Tailwind CDN, Google Fonts, GA4 |
| library.html | なし | なし | Tailwind CDN, Google Fonts |
| materials/index.html | scale.css | なし | Tailwind CDN, Google Fonts |
| materials/slide_0*.html | なし | なし | Google Fonts のみ |
| materials/question_card*.html / self-check.html | scale.css | なし | Google Fonts |

### 共通要素の管理方式
- **ナビバー・フッター**：共通CSSファイルなし。各HTMLページに**直書き**。変更時は全ページを個別修正が必要
- **スタイリング**：Tailwind CDN + インライン `<style>` が主体。`css/style.css` と `js/main.js` はほぼ未参照
- **GA4**：主要ページのみ設置（ID: G-ETQGD0Y74Q）

## 5. iframe・埋込構造

- `materials/index.html` → `openModal()` → `<iframe src="slide_XX.html">` でスライドを表示
- **iframeは親ページのCSSを一切継承しない**
- CSS変数・色・フォント等の変更は必ず親ページとスライドHTML両方を修正すること

### CSS変数の定義箇所（変更時は全箇所修正必須）
| 変数名 | 現在値 | 定義ファイル |
|--------|--------|------------|
| `--text-dark` | `#0f172a` | library.html, materials/index.html, slide_01〜09.html |
| `--text-mid` | `#4a4a4a` | library.html, materials/index.html, slide_01〜09.html |
| `--gold` | `#c9a84c` | library.html, materials/index.html, slide_01〜09.html |
| `--gold-light` | `#e8d08a` | library.html, materials/index.html, slide_01〜09.html |

### scale.css のURL解決の注意
`scale.css` の参照は `href="scale.css"`（相対パス）。ページURLが `/materials`（末尾スラッシュなし）の場合、ブラウザは `10_ホームページ/scale.css`（親ディレクトリ）に解決する。`materials/scale.css` に変更を加えても反映されないため、グリッドCSS等は `materials/index.html` のインライン `<style>` に直接記述すること。

## 6. 講習会ページ（library.html）

### 概要
- ファイル：`10_ホームページ/library.html`（1939行・単一HTMLファイル）
- 内容：入門者向け経営講習会 全6回のスライド＋解説を全てインラインで掲載
- タブ切り替えで第1〜6回を表示（`showTab(n)` 関数）

### 第1〜6回の構成（完成済み・入門編）
| 回 | タイトル | スライド数 |
|----|---------|----------|
| 第1回 | なぜあなたの経営は上手くいかないのか | 18枚 |
| 第2回 | お金の流れを自分の言葉で語れるか | 未確認 |
| 第3回 | （経営理念・ターゲット系） | 未確認 |
| 第4回 | （強み発見系） | 未確認 |
| 第5回 | （数字・実践系） | 未確認 |
| 第6回（最終回） | 覚悟を決める | 13枚 |

### スライドのHTMLパターン（library.html内）
```html
<div class="slide-unit">
  <div class="deco"><span>SLIDE XX</span></div>
  <div class="slide">
    <div class="slide-num">SLIDE XX</div>
    <div class="slide-title">タイトル</div>
    <div class="slide-kw">第X回 入門者向け経営講座｜企業のお医者さん</div>
  </div>
  <div class="commentary">
    <span class="label">解説</span>
    <p>解説テキスト</p>
  </div>
</div>
```

### 主要CSSクラス
| クラス | 用途 |
|--------|------|
| `.slide-unit` | スライド1枚の外枠（max-width: 680px） |
| `.slide` | グレーグラデーション背景のカード（ゴールドコーナー装飾付き） |
| `.slide-num` | 「SLIDE XX」ラベル（gold, 9px） |
| `.slide-title` | タイトル（Noto Serif JP, 24px, 700） |
| `.slide-kw` | サブテキスト（14px, #444） |
| `.slide-box` | 白半透明ボックス（.main + .sub 構成） |
| `.kw-tags` | 2列グリッドのタグ一覧 |
| `.commentary` | 解説エリア（ラベル＋本文） |
| `.section-div` | セクション区切り線 |
| `.recap-list` | 振り返りリスト |

### デザイントークン（library.html内の`:root`）
```css
--gold: #c9a84c;
--gold-light: #e8d08a;
--text-dark: #2a2a2a;
--text-mid: #4a4a4a;
```
- スライド背景：`linear-gradient(135deg, #d4d8e2 0%, #edf0f6 38%, #ffffff 58%, #dde0e8 100%)`

### 新スライド追加時のルール
- スライドはすべて `library.html` に直書き（外部HTMLファイルは使わない）
- 新しい回を追加する場合：`tab-7`〜の`div`を追加し、タブボタンも追加、`showTab`のループ上限も変更
- 既存の入門編（第1〜6回）はシリーズ完結済み。続編は別タブ・別シリーズとして追加する

## 7. 変更影響マトリクス

| 変更対象 | 必ず確認すべきファイル |
|---------|---------------------|
| ナビバー・フッター | index/service/contact/library.html 全部 |
| CSS変数 (--text-dark等) | library.html, materials/index.html, slide_01〜09.html |
| materials/index.html | scale.css(効かない可能性), 各slide_XX.html |
| slide_XX.html 1枚 | 他のslide_XXと整合性確認 |
| Tailwindクラス変更 | 同クラス使用箇所を grep |

## 8. 資料画像の追加手順（必ずこの順で実施）
1. **ファイル名変更**：`連番_タイトル名.拡張子` 形式にリネーム（例：`001_黒字でも倒産する理由.jpg`）
   - `git mv` でリネームしてgitに変更を追跡させる
2. **画像圧縮**：Node.js + sharp で圧縮
   - JPG：quality 80 / mozjpeg: true
   - PNG：compressionLevel 9 / effort 10
3. **Webに差し替え**：圧縮ファイルでworktreeの画像を上書き
4. **元ファイル削除**：圧縮前の一時フォルダを削除
5. **コミット → Wranglerで直接デプロイ**
- 圧縮ツール：`C:/Users/kikuchi yuki/AppData/Local/Temp/node_modules/sharp`（インストール済み）

## 9. 保持すべきURL・リンク
- Google予約：https://calendar.app.google/CbDg9ukVRzjJBY2RA
- 各ページリンク：service.html / blog/index.html / contact.html

## 10. コンテンツトーン
- 公開文章は「初心者が一度で理解できる日本語」に翻訳する（難語を避ける）。
- 集客フェーズの"冷徹な診断口調"はOK。ただし誹謗中傷はしない（共通憲法の範囲で）。

## 11. 作業ルール（最小影響）
- 修正はピンポイントで行う。指示された箇所以外は触らない
- 複数ファイルにまたがる修正の場合は着手前に一覧を報告する
- 修正完了後は変更箇所を箇条書きで簡潔に報告する
- エラーが出た場合は自律的に修正して再報告する
- 既存URL/ファイル名/導線は勝手に変えない（変更する場合は理由と影響範囲を先に提示）
- CSS/HTMLの視覚的バグはOpus側で診断する。Codeは自己判断で修正を繰り返さず、スクショベースの指示を待つこと

## 12. HP変更時のチェック手順
1. git commit でセーブポイント作成
2. 変更対象のファイルと依存関係を確認
3. 変更実施
4. style.css/main.js を触った場合 → 全ページ確認
5. 個別ページのみの場合 → そのページ＋関連ページ確認
6. git commit → Wranglerでデプロイ
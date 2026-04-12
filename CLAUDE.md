# 共通CLAUDE.md（事業OS / 憲法）

## 0. この事業の正体（前提）
- これは「コンサル」ではなく、コンサルの皮を被った **経営自立支援の教育事業**。
- アイデンティティは **「企業のお医者さん」**：感情でなく、数字と事実で診断する実務家。
- 成功の定義は **「院長が不用になる＝最短卒業（自立）」**。長期囲い込みは失敗。  
  （依存が増える設計はすべてNG）

## 1. 文章・コミュニケーションの二重人格（用途で切替）
- 【集客/SNS/広報】「経営のセカンドオピニオン」：冷徹・診断口調。市場のバグ指摘。フィルターとして機能させる。
- 【個別支援/顧問/顧客向け】医者スタンス：信頼前提で、P/L・B/Sの裏側の甘えや依存を治療する。
- この2つを混ぜない。「毒舌」は支援では使わない。支援は常に冷静・誠実・対等。

## 2. 戦略の原理（この事業が勝つ理由）
- ターゲット：既存コンサルが無視した「小規模事業者の大多数（経営初心者・お母さん層等）」。
- 差別化：囲い込みと逆をやる。**卒業設計・自立支援・サブスクで緩い継続**。
- 模倣困難性：院長の思想そのもの。「卒業させる」行動が取れる会計士は少なく、大手は動けない。
- 宗教化防止：コミュニティ熱量が「院長絶対」に変質しない設計を優先。

## 3. 財務思想（負けない要塞）
- 生活費は外部安定収入で守る。事業収益に依存しない。
- キャッシュバッファを厚く。短期利益より継続性と耐久性を優先。
- 施策は「院長の精神負荷を上げない」「固定費とリスクを上げない」ことを優先。

## 4. 収益モデルの倫理（囲い込み禁止）
- フロント商品は“利益の最大化”より、**依存体質の足切り/自立の入口**として設計。
- ミドル（顧問）は「パーソナルトレーニング」。自律度をスコアリングし卒業を判定。
- エンド（サブスク）は「卒業生の相互扶助エコシステム」。院長は現場から離れる方向。

## 5. 卒業（自立）設計は最優先
- 卒業は“解約”ではなく“成功”。
- 顧客が自分で判断できるようにする（答えを与えるのでなく、判断の型を渡す）。
- 目標は「専門家に使われる側 → 専門家を使う側」への転換。

## 6. Claude（AI）に対する作業方針
Claudeは「代わりに決める」ためではなく、以下のために使う：
- 整理（情報の構造化）
- 翻訳（会計/経営を日常言語に置換）
- 設計（依存を増やさないオペ/導線/プロダクト設計）
- 盲点の指摘（宗教化・囲い込み・複雑化の兆候）

Claudeがやってはいけない：
- 依存を増やす提案（囲い込み、情報の隠蔽、恐怖訴求による成約誘導）
- 短期売上のために卒業を遅らせる設計
- 不必要な複雑化（運用負荷を上げる仕組み）
- 院長の権威を強化する言い回し（宗教化の種）

## 7. 判断基準（迷ったらこれ）
優先順位：
1) 自立（卒業） > 売上
2) 明快さ > スケール
3) 継続性（負けない） > 拡大
4) 現場の負荷を下げる > 体裁を整える

## 8. 出力の基本
- 日本語で、結論→理由→次の一手 の順に短く明快に。
- 顧客向け文章は「初心者が一度で理解できる言葉」に翻訳する。
- 不確実なことは断定しない。仮定・前提・選択肢を明示する。

## 9. デプロイ方針
- **GitHub経由のデプロイは行わない**。
- デプロイは必ずCloudflare Pagesへ直接行う。（Wranglerで直接デプロイ）
- **必ずメインディレクトリからデプロイする**：`C:\Users\kikuchi yuki\kigyonooishasan\20_タスク管理
- **ワークツリーからデプロイ禁止**：`functions/`（D1 API）`auth.js` `_headers` `wrangler.toml` が欠落し、D1データが消える

  ```
  npx wrangler pages deploy . --project-name task-manager --branch main --commit-dirty=true
  ```
- `--branch main` 必須（省略するとプレビューURLにしかデプロイされない）

## 10. ClaudeCode基本方針
- **編集前にコードベースを調査せよ。読んでいないコードは決して変更するな**。
- effort levelは `high` で作業すること（settings.jsonで設定済み）
- 複雑な設計判断・デバッグ時は `/effort max` に切り替えを検討すること
### 作業開始時の必須手順（毎回実行）
1. `pwd`（現在地確認）
2. `git rev-parse --show-toplevel`（リポジトリルート確認）
3. `git worktree list`（worktree一覧）
4. `git status`（状態確認）
※ PowerShellでは `pwd` = `Get-Location`。どちらでも可。
→ 上記4つの出力を提示してから作業を開始すること。省略不可。

### 変更の作法（全ファイル共通）
- 1変更＝1目的＝1コミット。関係ないリファクタ・整形は禁止。
- 変更前：`git stash` または復旧用コミット/タグを作成
- 変更後：`git diff` で差分を提示し、変更点を箇条書きで説明
- 編集対象は必ず**絶対パスで宣言**してから編集開始
- 編集後は同じ**絶対パスで `cat` / `type`** して、正しいファイルが更新されたことを確認

## 10-1. ファイル編集の鉄則

### パス定義（絶対パスで固定）
- **MAIN（正）**：`C:\Users\kikuchi yuki\kigyonooishasan\`
- **WORKTREE（仮）**：上記以外のworktree配下すべて

### ルール
- **設定ファイル（CLAUDE.md等）・ドキュメントの永続的な変更は、必ずMAINのファイルを直接編集する。WORKTREE内のファイルを編集してはならない。**
- 編集前：「編集対象：`C:\...\CLAUDE.md`」と絶対パスで宣言する
- 編集後：同じ絶対パスで `type` / `cat` して中身を表示し、正しいファイルに書き込めたことを証明する
- worktreeはビルド/デプロイ用の一時領域。設定・ドキュメントの永続的な変更をworktreeに行ってはならない。

- WORKTREEのファイルをMAINへ cp / コピーで上書き禁止（過去事故あり）。必要なら差分を確認し、MAIN側で同等の変更を再現すること（WORKTREE→MAINの直コピーは禁止）。


## 10-2　資料・スライド作成時の留意点
-資料ライブラリ内の資料を作成する際は、slide_html_spec.mdを参照し作成すること
--CSS/HTML の視覚的バグはOpus側で診断する。Codeは自己判断で修正を繰り返さず、スクショベースの指示を待つこと

## 10-3. HP（ホームページ）アーキテクチャ

### ファイル構成
```
10_ホームページ/
├── index.html              ← トップページ
├── service.html            ← サービス・料金
├── contact.html            ← お問い合わせ
├── library.html            ← 講習会ページ
├── maintenance.html        ← メンテナンス画面
├── css/style.css           ← メインCSS（ほぼ未参照・Tailwind CDNが主体）
├── js/main.js              ← メインJS（ほぼ未参照・各HTMLにインライン直書き）
├── blog/
│   ├── index.html          ← ブログ一覧
│   ├── data.json           ← 記事メタデータ
│   └── *.html              ← 個別記事
└── materials/
    ├── index.html          ← 資料ライブラリ一覧（iframe親）
    ├── scale.css           ← 資料用CSS（※URL解決の注意あり→後述）
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

**重要**：`scale.css` の参照は `href="scale.css"`（相対パス）。ページURLが `/materials`（末尾スラッシュなし）の場合、ブラウザは `10_ホームページ/scale.css`（親ディレクトリ）に解決する。`materials/scale.css` に変更を加えても反映されないため、グリッドCSS等は `materials/index.html` のインライン `<style>` に直接記述すること。

### iframe・埋込構造
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

### 共通要素の管理方式
- **ナビバー・フッター**：共通CSSファイルなし。各HTMLページに**直書き**。変更時は全ページを個別修正が必要
- **スタイリング**：Tailwind CDN + インライン `<style>` が主体。`css/style.css` と `js/main.js` はほぼ未参照
- **GA4**：主要ページのみ設置（ID: G-ETQGD0Y74Q）

### HP修正時の必須ルール
- CSS変数・色の変更前に `grep -r "変更対象値"` で全定義箇所を洗い出す
- `--text-dark` 等の変数は library.html・materials/index.html・slide_01〜09.html の**全箇所**を修正すること
- iframeで読み込まれるスライドHTMLは親CSSを継承しないため、必ず個別に修正すること
- `materials/scale.css` への変更は効かない場合がある（URL解決の問題）。代わりに `materials/index.html` のインライン `<style>` に記述すること

## 11. ガントチャート（gantt.html）アーキテクチャドキュメント

### ⚠️ 重要：このファイルの修正ルール
1. **修正前に必ず `git stash` で退避**
2. **修正後に `git diff` で差分を確認してからコミット**
3. **worktreeのファイルをmainにcpしない（過去事故あり）**
4. **一度に1つの修正だけ行い、動作確認してから次に進む**
5. **編集前にこのセクションを読んで全体構造を把握してから作業に入ること**

### 構造概要（約2675行、単一HTMLファイル）

#### レイアウト：4分割グリッド
```
┌─────────────────┬───────────────────────┐
│ gantt-hd-left    │ gantt-hd-right         │  ← ヘッダー（月行+日付行、計54px）
├─────────────────┼───────────────────────┤
│ gantt-loc-left   │ gantt-loc-right        │  ← 場所行（36px固定）
├─────────────────┼───────────────────────┤
│ gantt-bd-left    │ gantt-bd-right         │  ← ボディ（タスク名列 / 日程バー列）
└─────────────────┴───────────────────────┘
```

- 左右は**独立したtable**。行数・高さを厳密に一致させて段ズレを防止
- スクロール同期：bdRight → bdLeft(scrollTop), hdRight/locRight(scrollLeft)
- 列幅：COL_W = 30px、colgroup で明示固定

#### 行高さの定数
```javascript
const ROW_H = { project: 28, task: 32 };
const LOC_ROW_H = 36;
```

#### 主要関数マップ

| 関数名 | 行番号（目安） | 役割 |
|--------|---------------|------|
| `ganttTaskMatch(task)` | L1316 | 親タスクのフィルタ判定（期日フィルタ含む） |
| `ganttSubtaskMatch(task)` | L1338 | サブタスクのフィルタ判定（期日フィルタ除外） |
| `getEffectiveDateRange(task)` | L1354 | 自身＋子孫のstartDate/dueDateから有効範囲を算出 |
| `collectGrandchildMarkers(task)` | L1378 | 孫タスクの日付マーカー▲を収集 |
| `appendSubtaskRows(...)` | L1396 | サブタスク行をleft/right配列に追記 |
| `buildSubtaskRowPairs(...)` | L1470 | 旧互換関数（appendSubtaskRowsを使え） |
| `renderGantt()` | L1518 | メインの描画関数。左右テーブルを生成しDOMに挿入 |

#### renderGantt() の処理フロー
1. 表示範囲の日付配列`days`を生成
2. 場所(location)行のHTMLを生成
3. プロジェクトごとにループ：
   a. プロジェクト行（左右各1行）
   b. 期限ありタスク → 各タスクで左行(ラベル)＋右行(バー/点)を生成
   c. 各タスクのサブタスクを `appendSubtaskRows` で追加
   d. 期限なしタスク（showNoDueチェック時のみ）
   e. 「＋ タスクを追加」行
4. ヘッダーHTML（月行＋日付行）を生成
5. 4分割グリッドを `ganttContent.innerHTML` に挿入
6. スクロール同期イベントを設定

#### ★ 段ズレが起きる唯一の原因
左テーブルと右テーブルの**行数が一致しない**か、**行の高さが一致しない**場合。
現在のJSロジックでは行数・高さは一致するように書かれているので、
段ズレが出る場合は**CSS側**（style.css）で行の高さが変わっている可能性が高い。

#### ドラッグ関連
- バードラッグ：mousedown/mousemove/mouseup でstartDate/dueDateを更新
- 場所ドラッグ：startLocDrag → mousedown でドラッグ開始
- マイルストーン（点）→ バー化：calcPreviewDates で方向判定

#### データ構造（localStorage `taskData`）
```javascript
data = {
  projects: [{ id, name, color, dueDate }],
  tasks: [{ id, projectId, parentId, title, status, assigneeId, startDate, dueDate, children }],
  users: [{ id, name, avatar }],
  locations: [{ id, label, startDate, endDate, color }]
}
```


## 12. デプロイ前チェックリスト
デプロイコマンド実行前に以下を確認。1つでも欠けたら中止：
- [ ] `pwd` が `...\task-manager\` である（worktreeではない）
- [ ] `functions/` ディレクトリが存在する
- [ ] `auth.js` が存在する
- [ ] `_headers` が存在する
- [ ] `wrangler.toml` が存在する
- [ ] `git diff` で意図しない変更がないことを確認済み


## 13. 過去の失敗パターン（再発防止）
- **iframe内のCSS未修正**：`materials/index.html` の `--text-dark` を修正したが、iframe読込先の各スライドHTMLの同変数が未修正で文字色が統一されなかった。原因：iframeは親CSSを継承しないことを見落とした
- **CSS zoomによるレスポンシブの誤り**：CSS `zoom` のメディアクエリはビューポート幅（＝ウィンドウ幅）に反応するため、大画面でも半画面にすると縮小される。物理モニタサイズでは判定できない。安易にzoomメディアクエリを追加しないこと

---

## 14. タスク管理ツール（task-manager）アーキテクチャ

### ファイル構成
```
task-manager/
├── wrangler.toml          ← Cloudflare Pages設定（D1/R2/AIバインディング）
├── _headers               ← キャッシュ制御（HTML: no-store / その他: must-revalidate）
├── style.css              ← 共通スタイルシート（約1275行、CSS変数26個定義）
├── auth.js                ← ユーザー認証（localStorageベース）
├── data.js                ← データ管理・D1 API連携
├── logo.png
│
├── index.html             ← マイタスク画面
├── project.html           ← プロジェクト管理画面
├── customers.html         ← 顧客管理画面（pdf.js追加読み込み）
├── gantt.html             ← ガントチャート（§11参照）
│
└── functions/api/
    ├── data.js            ← D1 CRUD API (GET/PUT /api/data)
    ├── upload.js          ← R2ファイルアップロード (POST /api/upload)
    ├── ocr.js             ← AI画像認識・契約書日付抽出 (POST /api/ocr)
    ├── meeting-ai.js      ← AI会議要約・タグ自動生成 (POST /api/meeting-ai)
    └── file/[key].js      ← R2ファイル取得 (GET /api/file/{key})
```

### ページ間の依存関係
| ページ | 外部CSS | 外部JS | CDN |
|--------|--------|--------|-----|
| 全4ページ共通 | `style.css` | `data.js`, `auth.js` | Google Fonts (Noto Sans JP) |
| customers.html のみ追加 | — | — | pdf.js (Cloudflare CDN) |

ロジックはすべて各HTMLのインライン `<script>` に直書き。`style.css` が唯一の共通CSSファイル。

### CSS変数の定義箇所（`style.css` の `:root` に一元定義）
| 変数名 | 値 | 用途 |
|--------|----|----|
| `--primary` | `#E8662A` | メインカラー（オレンジ） |
| `--navy` | `#1E3A5F` | タイトル・強調 |
| `--navy-light` | `#2a4f7a` | ライトネイビー |
| `--navy-dark` | `#152d4a` | ダークネイビー |
| `--gold` | `#D4AF37` | ゴールドアクセント |
| `--gold-pale` | `rgba(212,175,55,0.12)` | ゴールド薄背景 |
| `--bg` | `#f8fafc` | ページ背景 |
| `--bg-card` | `#fff` | カード背景 |
| `--text` | `#0f172a` | 本文テキスト |
| `--text-sub` | `#475569` | サブテキスト |
| `--text-muted` | `#94a3b8` | 淡いテキスト |
| `--border` | `#e2e8f0` | ボーダー |
| `--danger` | `#dc2626` | エラー |
| `--warning` | `#f59e0b` | 警告 |
| `--success` | `#16a34a` | 成功 |

HPと異なり **CSS変数は `style.css` 1ファイルで完結**。変更時は `style.css` のみ修正すれば全ページに反映される。

### バックエンド構成
| バインディング | 種別 | 用途 |
|--------------|------|------|
| `env.DB` | D1 | データ本体（JSON blob を `store` テーブルで管理） |
| `env.FILES` | R2 | アップロードファイル（PDF・画像等） |
| `env.AI` | Cloudflare AI | OCR（Llama 3.2 11B Vision）/ 会議要約（Llama 3.1 8B） |

### データ保存戦略（優先順位）
1. **D1**（メイン）: `/api/data` に PUT、リトライ最大2回
2. **localStorage**（フォールバック）: D1失敗時に `tm2_backup` として保存
3. **R2**（ファイル専用）: バイナリファイルを個別キーで保存

### 認証フロー
```
ページ読込 → initAuth() → localStorage('tm2_currentUser') 確認
  → 未選択: ユーザー選択モーダル表示 → 選択 → localStorage保存
  → 選択済み: そのままコールバック実行
```
※将来 Google OAuth への置き換えを想定した設計

### タスクステータス定義
| ステータスID | ラベル | 色 |
|------------|--------|-----|
| `pending` | 未着手 | `#94a3b8` |
| `inProgress` | 進行中 | `#3b82f6` |
| `stuck` | スタック | `#f59e0b` |
| `review` | 確認待ち | `#eab308` |
| `done` | 完了 | `#22c55e` |

### task-manager修正時の必須ルール
- **CSSの変更は `style.css` のみ**。各HTMLにCSSを追加しないこと
- **デプロイ前チェックリスト（§12）を必ず実行**：`functions/`, `auth.js`, `_headers`, `wrangler.toml` の存在確認
- **ガントチャートの修正は §11 を読んでから作業すること**（構造が複雑で段ズレ事故が起きやすい）
- `data.js` の `INITIAL_DATA` を変更する場合は `migrateData()` での後方互換処理も確認すること
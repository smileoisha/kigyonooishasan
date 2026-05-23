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

### Gitバックアップ
- バックアップ先：`H:\共有ドライブ\50_バックアップ\kigyonooishasan.git`（bareリポジトリ）
- バックアップコマンド（リポジトリルートで実行）：
  ```
  git push backup main
  ```
- `origin`（GitHub）へのpushは行わない

### HP（ホームページ）
- デプロイ元：`H:\共有ドライブ\60_Web編集用\kigyonooishasan\10_ホームページ\`
- デプロイコマンド（上記ディレクトリで実行）：
  ```
  npx wrangler pages deploy . --project-name kigyonooishasan-hp --branch main --commit-dirty=true
  ```

### Cronワーカー（customer_concerns 自動解決）
- デプロイ元：`H:\共有ドライブ\60_Web編集用\kigyonooishasan\task-manager\cron-worker\`
- Workers名：`task-manager-cron`（Pages とは別の独立 Workers）
- デプロイコマンド（Bashで実行）：
  ```bash
  cd "H:\共有ドライブ\60_Web編集用\kigyonooishasan\task-manager\cron-worker" && npx wrangler deploy
  ```
- スケジュール：`0 0 * * *`（毎日0時UTC / JST 9時）
- 処理内容：14日超の `status='open'` 投稿を一括クローズ（`auto_resolved=1`）
- 同一 D1（`task-manager-db`）を共有。Pages Functions とは別デプロイ

### タスク管理ツール
- **必ずメインディレクトリからデプロイする**：`H:\共有ドライブ\60_Web編集用\kigyonooishasan\task-manager\`
- **ワークツリーからデプロイ禁止**：`functions/`（D1 API）`auth.js` `_headers` `wrangler.toml` が欠落し、D1データが消える
- **デプロイは必ずBashで `cd && pwd && deploy` を1コマンドで実行する**（PowerShellの `Set-Location` は別呼び出しで維持されず、親ディレクトリからの誤デプロイ事故が発生した）
  ```bash
  cd "H:\共有ドライブ\60_Web編集用\kigyonooishasan\task-manager" && pwd && test -f index.html && test -f knowledge.html && npx wrangler@3 pages deploy . --project-name task-manager --branch main --commit-dirty=true
  ```
- `--branch main` 必須（省略するとプレビューURLにしかデプロイされない）
- **`wrangler@3` を使うこと**（v4はWindows+Node24環境でクラッシュする既知問題あり）
- **デプロイ後のファイル数チェック**：正常は約35ファイル。100以上なら誤デプロイ → 即再デプロイ

## 10. ClaudeCode基本方針
-作業後に新しい発見事項がある場合は、当CLAUDE.MDに追記修正を行いナレッジとする。ただしCLAUDE.MDの膨張につながるため、
必要がある場合は、院長に確認すること
- **編集前にコードベースを調査せよ。読んでいないコードは決して変更するな**。
- effort levelは `high` で作業すること（settings.jsonで設定済み）
- 複雑な設計判断・デバッグ時は `/effort max` に切り替えを検討すること
- **曖昧な指示・複数の解釈が可能な場合は、作業を止めて確認すること。**
-設計や計画はOpus4.6が行い、Sonnetは実行導入を行う事。院長がこのルールを忘れている場合は質問で気づかせること

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

### 機密情報の検知ルール
- Git管理下のファイルにAPIキー・トークン・パスワード等の機密情報がハードコードされていることを検知した場合、**即座に院長に警告し、削除するか確認すること**
- 機密情報は必ずGit管理外（`~/.claude/CLAUDE.md` やローカル環境変数等）に置く
- `.env` / `credentials.json` 等の機密ファイルがリポジトリに含まれていないか、作業開始時に注意する

### 変更前の必須セルフチェック（全プロジェクト共通・変更実行前に回答すること）
- この変更は他のファイルに影響するか？（iframe先、共通CSS、共通JS、API等）
- 該当プロジェクトのアーキテクチャセクション（§10-3 / §11 / §14）を確認したか？
- 影響が複数ファイルにまたがる場合、影響ファイル一覧を提示してから作業開始

## 10-1. ファイル編集の鉄則

### パス定義（絶対パスで固定）
- **MAIN（正）**：`H:\共有ドライブ\60_Web編集用\kigyonooishasan\`
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
10_ホームページ/CLAUDE.md を参照

## 10-4. 変更影響マトリクス
`10_ホームページ/CLAUDE.md`（HP）および `task-manager/CLAUDE.md`（§6）を参照。



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
  tasks: [{ id, projectId, parentId, title, status, assigneeId, startDate, dueDate }],
  users: [{ id, name, avatar }],
  locations: [{ id, label, startDate, endDate, color }]
}
```
※ `children` カラムは廃止済み。親子関係は `parentId` のみで管理。


## 12. デプロイ前チェックリスト（task-manager専用）
デプロイコマンド実行前に以下を確認。1つでも欠けたら中止：
- [ ] `pwd` が `...\task-manager\` である（worktreeではない）
- [ ] `functions/` ディレクトリが存在する
- [ ] `auth.js` が存在する
- [ ] `_headers` が存在する
- [ ] `wrangler.toml` が存在する
- [ ] `index.html` が存在する（親ディレクトリ誤デプロイ検知用）
- [ ] `knowledge.html` が存在する（同上）
- [ ] `git diff` で意図しない変更がないことを確認済み

### デプロイ後チェック
- [ ] Wrangler出力のファイル数が **約35件** であること（100以上 → 誤デプロイ、即再デプロイ）


## 13. バックアップ＆リストア手順（task-manager）

### バックアップ体制
| 種類 | 場所 | 頻度 | 保持期間 |
|------|------|------|---------|
| 自動バックアップ | Cloudflare R2 (`backup/backup-YYYY-MM-DD.json`) | 日次（ページ読込時） | 30日分 |
| Google Driveバックアップ | 設定した場合のみ | 日次 | 無制限 |
| 手動エクスポート | ブラウザダウンロード | 手動 | — |

- バックアップ実行状態（最終実行日時等）は `app_settings` テーブルの `backup-status` キーで管理（`functions/api/backup.js`）

### バックアップのダウンロード（R2から）
```bash
cd task-manager
npx wrangler r2 object get "task-manager-files/backup/backup-YYYY-MM-DD.json" --remote --file "restore.json"
```

### リストア手順
```bash
# 1. バックアップ検証（dry-run）
node scripts/restore.js "restore.json" --dry-run

# 2. 内容に問題なければ本番リストア（5秒のキャンセル猶予あり）
node scripts/restore.js "restore.json"
```

### ステージング（開発用）D1環境
- 本番D1: `task-manager-db`（id: `a33ad2ee-c247-40a7-9de0-b97eac10f532`）
- 開発D1: `task-manager-db-dev`（id: `7dc64c76-2347-4fe8-b879-658e7d13f2f3`）
- **ローカル開発起動コマンド（本番D1に触れない）：**
  ```bash
  npx wrangler pages dev . --d1 DB=7dc64c76-2347-4fe8-b879-658e7d13f2f3
  ```
- **デプロイは必ず本番コマンド（§9）を使うこと。ローカル開発コマンドでデプロイ禁止。**

---

## 13-旧. 過去の失敗パターン（再発防止）
- **iframe内のCSS未修正**：`materials/index.html` の `--text-dark` を修正したが、iframe読込先の各スライドHTMLの同変数が未修正で文字色が統一されなかった。原因：iframeは親CSSを継承しないことを見落とした
- **CSS zoomによるレスポンシブの誤り**：CSS `zoom` のメディアクエリはビューポート幅（＝ウィンドウ幅）に反応するため、大画面でも半画面にすると縮小される。物理モニタサイズでは判定できない。安易にzoomメディアクエリを追加しないこと
- **PowerShellのSet-Locationで親ディレクトリから誤デプロイ（task-manager）**：PowerShellの `Set-Location` が別ツール呼び出し間で維持されず、`task-manager/` ではなく親の `kigyonooishasan/` から `wrangler pages deploy .` が実行された。`index.html` `knowledge.html` が404、UIが古い状態に。対策：デプロイは必ずBashで `cd && pwd && test -f index.html && deploy` を1コマンドで実行。ファイル数約35件を確認

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
    ├── data.js            ← D1 全データ一括 GET/PUT（フロントからは未使用。restore.js・運用スクリプト用に残存）
    ├── tasks.js           ← タスク個別 CRUD (GET/PUT /api/tasks)
    ├── customers.js       ← 顧客個別 CRUD (GET/PUT /api/customers)
    ├── projects.js        ← プロジェクト個別 CRUD (GET/PUT /api/projects)
    ├── locations.js       ← 場所個別 CRUD (GET/PUT /api/locations)
    ├── tag-master.js      ← タグマスタ個別 CRUD (GET/PUT /api/tag-master)
    ├── knowledge.js       ← ナレッジ横断検索・upsert (GET/PUT /api/knowledge)
    ├── knowledge/history.js ← 編集履歴 (GET /api/knowledge/history)
    ├── resync.js          ← ナレッジ完全再同期 (POST /api/resync)
    ├── backup.js          ← R2バックアップ（backup-status は app_settings テーブルで管理）
    ├── mcp.js             ← MCPツール用エンドポイント
    ├── concerns.js        ← 困りごと CRUD (GET/POST /api/concerns)
    ├── concerns/[id].js   ← 困りごと個別操作 (PATCH/DELETE)
    ├── concerns/summary.js← 困りごとサマリー (GET /api/concerns/summary) ※MCP用
    ├── admin/concerns.js  ← 管理者向け困りごと (GET/PATCH /api/admin/concerns)
    ├── upload.js          ← R2ファイルアップロード (POST /api/upload)
    ├── ocr.js             ← AI画像認識・契約書日付抽出 (POST /api/ocr)
    ├── meeting-ai.js      ← AI会議要約・タグ自動生成 (POST /api/meeting-ai)
    └── file/[key].js      ← R2ファイル取得 (GET /api/file/{key})
    ※ admin/meetings.js は削除済み
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

### D1テーブル構成（リレーショナル10+テーブル）
`store` テーブルは廃止済み。以下のリレーショナル構成：
```
tasks / task_notes / task_links / task_work_logs
customers / customer_meetings / customer_concerns
projects / users / locations / tag_master
app_settings / knowledge / knowledge_history
```
- `app_settings`: backup-status 等の設定値をキー・バリュー形式で管理（backup.js が使用）
- `customer_concerns`: 困りごとフォーム投稿（urgency: normal/urgent, status: open/resolved）

### バックエンド構成
| バインディング | 種別 | 用途 |
|--------------|------|------|
| `env.DB` | D1 | データ本体（リレーショナル10+テーブル。`store` テーブルは廃止済み） |
| `env.FILES` | R2 | アップロードファイル（PDF・画像等）＋バックアップ |
| `env.AI` | Cloudflare AI | OCR（Llama 3.2 11B Vision）/ 会議要約（Llama 3.1 8B） |

### データ保存戦略（優先順位）
1. **D1**（メイン）: 個別APIエンドポイント（`/api/tasks`, `/api/customers`, `/api/projects`, `/api/locations`, `/api/tag-master`）へスナップショット差分検知で PUT。`loadData()` も同エンドポイントから `Promise.all` で並列取得
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
- `functions/api/data.js` はフロントから直接呼ばれない（`restore.js` 等の運用スクリプト専用）。フロントのデータ操作は個別API（tasks/customers/projects/locations/tag-master）を使うこと


## 15. 講習会ページ（library.html）アーキテクチャ
`10_ホームページ/CLAUDE.md`（§6）を参照。
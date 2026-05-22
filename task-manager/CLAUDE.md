# CLAUDE.md（task-manager）

## 前提
親フォルダの共通CLAUDE.md（事業OS/憲法）に必ず従う。このファイルはtask-manager固有の情報のみ扱う。

---

## 1. デプロイ

### ⚠️ デプロイ前チェックリスト（1つでも欠けたら中止）
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

### コマンド
```bash
# 本番デプロイ（必ずBashで cd && pwd && deploy を1コマンドで実行）
cd "H:\共有ドライブ\60_Web編集用\kigyonooishasan\task-manager" && pwd && test -f index.html && test -f knowledge.html && npx wrangler pages deploy . --project-name task-manager --branch main --commit-dirty=true

# ローカル開発（本番D1に触れない）
npx wrangler pages dev . --d1 DB=7dc64c76-2347-4fe8-b879-658e7d13f2f3
```
- **デプロイは必ずBashで実行する**（PowerShellの `Set-Location` は別呼び出しで維持されず誤デプロイ事故あり）
- `--branch main` 必須（省略するとプレビューURLにしかデプロイされない）
- **ワークツリーからデプロイ禁止**：`functions/` `auth.js` `_headers` `wrangler.toml` が欠落しD1データが消える

---

## 2. D1データベース
| 環境 | DB名 | ID |
|------|------|-----|
| 本番 | task-manager-db | a33ad2ee-c247-40a7-9de0-b97eac10f532 |
| 開発 | task-manager-db-dev | 7dc64c76-2347-4fe8-b879-658e7d13f2f3 |

---

## 3. バックアップ＆リストア

### バックアップ体制
| 種類 | 場所 | 頻度 |
|------|------|------|
| 自動 | Cloudflare R2 `backup/backup-YYYY-MM-DD.json` | 日次（ページ読込時）/ 30日保持 |
| 手動 | ブラウザダウンロード | 手動 |

### バックアップ内容
- store廃止済み。バックアップはリレーショナルテーブル（tasks / customers / projects / locations / tag_master 等）から取得
- backup-statusはapp_settingsテーブルで管理（backup.jsが使用）

### コマンド
```bash
# R2からダウンロード
npx wrangler r2 object get "task-manager-files/backup/backup-YYYY-MM-DD.json" --remote --file "restore.json"

# リストア（dry-run → 本番）
node scripts/restore.js "restore.json" --dry-run
node scripts/restore.js "restore.json" --target=local  # ローカルdev（デフォルト）
node scripts/restore.js "restore.json" --target=prod   # 本番（5秒キャンセル猶予あり）

# dev D1スキーマ初期化（新規セットアップ時のみ）
npx wrangler d1 execute task-manager-db --local --file=scripts/init-schema.sql
```

### リストアテスト手順（本番データ破壊ゼロ）
1. `npx wrangler pages dev .` でローカルサーバー起動
2. R2から最新バックアップをDL
3. `node scripts/restore.js "restore.json" --dry-run` で検証
4. `node scripts/restore.js "restore.json"` でローカルに復元
5. `http://localhost:8788` でデータ表示を目視確認

---

## 4. アーキテクチャ

### ファイル構成
```
task-manager/
├── wrangler.toml          ← Cloudflare Pages設定（D1/R2/AIバインディング）
├── _headers               ← キャッシュ制御（HTML: no-store / その他: must-revalidate）
├── style.css              ← 共通スタイルシート（CSS変数一元定義）
├── auth.js                ← ユーザー認証（localStorageベース）
├── data.js                ← データ管理・D1 API連携
├── index.html             ← マイタスク
├── project.html           ← プロジェクト管理
├── customers.html         ← 顧客管理（pdf.js追加）
├── gantt.html             ← ガントチャート（§5参照）
├── knowledge.html         ← ナレッジ検索・管理
├── concerns.html          ← 困りごと投稿フォーム（顧客向け・CF Access JWT認証）
└── functions/api/
    ├── data.js            ← D1 CRUD (GET/PUT /api/data) ※フロント未使用・restore.js/運用スクリプト専用
    ├── tasks.js           ← タスクCRUD (GET/PUT /api/tasks)
    ├── customers.js       ← 顧客CRUD (GET/PUT /api/customers)
    ├── projects.js        ← プロジェクトCRUD (GET/PUT /api/projects)
    ├── locations.js       ← 場所CRUD (GET/PUT /api/locations)
    ├── tag-master.js      ← タグマスターCRUD (GET/PUT /api/tag-master)
    ├── backup.js          ← R2バックアップ (GET/POST /api/backup)
    ├── mcp.js             ← MCPツール (POST /api/mcp)
    ├── knowledge.js       ← ナレッジ横断検索・upsert
    ├── knowledge/history.js ← 編集履歴 (GET /api/knowledge/history)
    ├── resync.js          ← ナレッジ完全再同期 (POST /api/resync)
    ├── upload.js          ← R2アップロード (POST /api/upload)
    ├── ocr.js             ← AI画像認識 (POST /api/ocr)
    ├── meeting-ai.js      ← AI会議要約 (POST /api/meeting-ai)
    ├── file/[key].js      ← R2ファイル取得 (GET /api/file/{key})
    ├── concerns.js        ← 困りごと CRUD (GET/POST /api/concerns)
    ├── concerns/[id].js   ← 困りごと個別操作 (PATCH/DELETE /api/concerns/:id)
    ├── concerns/summary.js← 困りごとサマリー (GET /api/concerns/summary) ※MCP用
    └── admin/concerns.js  ← 管理者向け困りごと (GET/PATCH /api/admin/concerns) ※JWT不要
```

### ページ依存関係
- 全ページ共通：`style.css` / `data.js` / `auth.js` / Google Fonts
- `customers.html` のみ追加：pdf.js (Cloudflare CDN)
- ロジックは各HTMLのインライン `<script>` に直書き

### CSS変数（`style.css` の `:root` で一元定義 — 変更はここだけでOK）
| 変数 | 値 | 用途 |
|------|----|------|
| `--primary` | `#E8662A` | オレンジ（メイン） |
| `--navy` | `#1E3A5F` | タイトル・強調 |
| `--navy-light` | `#2a4f7a` | ライトネイビー |
| `--navy-dark` | `#152d4a` | ダークネイビー |
| `--gold` | `#D4AF37` | ゴールドアクセント |
| `--bg` | `#f8fafc` | ページ背景 |
| `--bg-card` | `#fff` | カード背景 |
| `--text` | `#0f172a` | 本文 |
| `--text-sub` | `#475569` | サブテキスト |
| `--text-muted` | `#94a3b8` | 淡いテキスト |
| `--border` | `#e2e8f0` | ボーダー |
| `--danger/--warning/--success` | 赤/黄/緑 | ステータス |

### D1テーブル構成
```
tasks / task_notes / task_links / task_work_logs / customers / customer_meetings / customer_concerns / projects / users / locations / tag_master / app_settings / knowledge / knowledge_history
```

### バックエンド
| バインディング | 種別 | 用途 |
|--------------|------|------|
| `env.DB` | D1 | データ本体（リレーショナル10テーブル + app_settings） |
| `env.FILES` | R2 | アップロードファイル（PDF・画像等）＋バックアップ（R2 backup/） |
| `env.AI` | Cloudflare AI | OCR（Llama 3.2 11B Vision）/ 会議要約（Llama 3.1 8B） |

### 認証二系統
| 系統 | 対象 | 方式 | 備考 |
|------|------|------|------|
| 内部管理 | index/project/customers/gantt/knowledge | auth.js（localStorageベース） | 院長・Masami用 |
| 顧客向け | concerns.html, /api/concerns | Cloudflare Access JWT | メール→顧客ID解決 |

- 困りごとフォームはCloudflare Accessで認証後、JWTからメールを抽出し、customersテーブルを直接クエリ（`SELECT id, name FROM customers WHERE email = ?`）で顧客IDを解決する
- 管理者側（/api/admin/concerns）はJWT不要（CF Accessの対象パス外 `api/concerns*` を避けて `api/admin/concerns` に配置）
- 二系統は独立しており、auth.jsの変更はconcerns系に影響しない（逆も同様）

### データ保存戦略（優先順位）
1. D1（メイン）: 個別APIエンドポイント（/api/tasks, /api/customers, /api/projects, /api/locations, /api/tag-master）へスナップショット差分検知でPUT。loadData()も個別APIからPromise.allで並列取得。/api/data はrestore.js・運用スクリプト用に残存（フロントからは未使用）
2. localStorage（フォールバック）: D1失敗時 `tm2_backup`
3. R2（ファイル専用）

### タスクステータス
| ID | ラベル | 色 |
|----|--------|-----|
| `pending` | 未着手 | `#94a3b8` |
| `inProgress` | 進行中 | `#3b82f6` |
| `stuck` | スタック | `#f59e0b` |
| `review` | 確認待ち | `#eab308` |
| `done` | 完了 | `#22c55e` |

### knowledgeテーブル
- スキーマ: id, source_type, source_id, title, body, tags, customer_id, parent_id, sort_order, created_at, updated_at
- 自動同期: PUT /api/data のたびに task_notes + customer_meetings をupsert
- history: `knowledge_history` テーブル（最大20件/エントリ）

### customer_concernsテーブル
- スキーマ: id, customer_id, email, body, urgency, status, created_at, updated_at, resolved_at, auto_resolved, category, resolution, resolution_knowledge_id
- urgency: `normal` / `urgent`
- category: `cash_flow` / `no_money` / `expenses` / `hiring` / `marketing` / `repeat` / `anxiety` / `other`
- status: `open` / `resolved`
- GET /api/concerns 呼び出し時に14日超の未解決投稿を自動クローズ（auto_resolved=1）
- 重複チェック: POST時にClaude Haiku APIで既存open投稿と比較（ANTHROPIC_API_KEY必要）
- Slack通知: urgency=urgentの投稿時に顧客名付きで通知（SLACK_WEBHOOK_URL必要）
- MCPツール: `get_customer_concerns`（customer_id必須、status絞り込み可）。要約はチャット側Claudeが実施
- 管理者画面: customers.html の「困りごと」タブから全ステータス閲覧・ステータス変更可

---

## 5. ガントチャート（gantt.html）

### ⚠️ 修正前の必須ルール
1. 修正前に `git stash`
2. 修正後に `git diff` 確認してからコミット
3. worktreeのファイルをmainにcpしない
4. 1修正ずつ、動作確認してから次へ
5. このセクション全体を読んでから作業開始

### 構造（約2700行・単一HTML）
```
┌──────────────────┬──────────────────────┐
│ gantt-hd-left     │ gantt-hd-right        │ ← ヘッダー（54px）
├──────────────────┼──────────────────────┤
│ gantt-loc-left    │ gantt-loc-right       │ ← 場所行（36px）
├──────────────────┼──────────────────────┤
│ gantt-bd-left     │ gantt-bd-right        │ ← ボディ（タスク名/バー）
└──────────────────┴──────────────────────┘
```
左右は独立したtable。行数・高さを一致させて段ズレを防止。

### 行高さの定数
```javascript
const ROW_H = { project: 28, task: 32 };
const LOC_ROW_H = 36;
```

### 主要関数
| 関数 | 行（目安） | 役割 |
|------|-----------|------|
| `ganttTaskMatch(task)` | L1316 | フィルタ判定（期日フィルタ含む） |
| `ganttSubtaskMatch(task)` | L1338 | サブタスクのフィルタ判定 |
| `getEffectiveDateRange(task)` | L1354 | 自身＋子孫の有効日程算出 |
| `appendSubtaskRows(...)` | L1396 | サブタスク行を追記 |
| `renderGantt()` | L1518 | メイン描画関数 |

### ★ 段ズレの唯一の原因
左右テーブルの行数・高さが一致しない場合。段ズレが出る場合は **CSS側（style.css）で行高さが変わっている可能性が高い**。

---

## 6. 変更影響マトリクス
| 変更対象 | 確認すべきファイル |
|---------|-----------------|
| `style.css` | 全ページ（index/project/customers/gantt/knowledge） |
| `data.js` | `migrateData()` と `INITIAL_DATA` |
| `gantt.html` | §5を読んでから（段ズレ注意） |
| `functions/api/data.js` | `syncKnowledge()` との整合 |

---

## 7. ナレッジ更新の正しい手順

### ⚠️ `wrangler d1 execute --file` はナレッジ更新に使わない
- 大きなSQL文字列（目安：5,000文字超）を**無音で切り捨てる**バグがある
- "1 rows written" と表示されても実際には途中で打ち切られている

### ナレッジ更新は `update_knowledge` MCP ツールを使う
- PUT `/api/knowledge` 経由で最大 **100,000文字** まで安全に格納できる
- HTMLもMarkdownもそのまま格納（形式変換なし）
- `scripts/update-one-knowledge.js`（SQLファイル生成スクリプト）は**廃止**

### `wrangler d1 execute` が必要な用途（これだけ）
- スキーマ初期化（`scripts/init-schema.sql`）
- DDL・一括データ操作など、API経由では対応できないもの

---

## 8. 過去の失敗パターン（再発防止）
- **worktreeからデプロイ**：`functions/`が欠落してD1データが消えた → デプロイ前チェックリスト必須
- **INITIAL_DATA変更後のmigrateData未修正**：既存データが壊れた → 必ずセットで修正すること
- **ワークツリーのファイルをMAINへcp**：意図しない上書きが発生した → 差分確認後にMAIN側で再現すること
- **PowerShellのSet-Locationで親ディレクトリから誤デプロイ**：PowerShellの `Set-Location` が別ツール呼び出し間で維持されず、`task-manager/` ではなく親の `kigyonooishasan/` から `wrangler pages deploy .` が実行された。結果 `index.html` `knowledge.html` が404、UIが古い状態に。D1データ自体は無傷だがユーザーには全データ消失に見えた。**対策**：デプロイは必ずBashで `cd && pwd && test -f index.html && deploy` を1コマンドで実行。デプロイ後のファイル数が約35件であることを確認（100以上なら誤デプロイ）
- **同一UI部品の1ファイル見落とし**：ノートUIを gantt/index/customers の3ファイルで直したが project.html だけ見落とし、原因は「project.html は contenteditable で textarea と実装が違うから対象外」と実装方式ベースで除外したこと。**対策**：
  1. 同じUI部品を複数ページで持つ機能を直す時は、最初に対象ファイル一覧を grep で作る（例：`grep -l "note-content-input" *.html`）
  2. 実装方式（textarea/contenteditable/input）で除外せず、**機能目的ベース**で全ファイル横断確認
  3. ユーザーから「直っていない」報告を受けたら、追加修正の前に**全対象ファイルの現状を再確認**
  4. インラインstyle（`style="min-height:80px"`）は外部CSSより優先されるので、CSS側だけ変えても効かない → `grep -n 'style="[^"]*height'` で潜在的なインライン指定を洗う

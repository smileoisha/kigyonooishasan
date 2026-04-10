# CLAUDE.md（Homepage / Static Site）

## 0. 前提（最優先）
- 親フォルダの共通CLAUDE.md（事業OS/憲法）に必ず従う。
- このフォルダは「企業のお医者さん」HP（静的サイト）のみを扱う。

## 1. プロジェクト概要
- サイト名：企業のお医者さん（kigyonooishasan.pages.dev）
- 構成：静的HTML/CSS/JS（フレームワークなし）
- ホスティング：Cloudflare Pages（直接アップロード方式、GitHubは使用しない）
- デプロイコマンド：`cd 10_ホームページ && npx wrangler pages deploy . --project-name kigyonooishasan-hp`
- デプロイ先プロジェクト：kigyonooishasan-hp（kigyonooishasan-hp.pages.dev）
- スタイリング：Tailwind CSS CDN
- フォント：Noto Sans JP（Google Fonts）

## 2. ファイル構成
- index.html：トップページ
- service.html：サービス・料金
- blog/index.html：ブログ一覧
- contact.html：問い合わせ
- assets/：画像・CSS・JS

## 3. 掲載ポリシー（HP固有・重要）
- HPには「講習会の情報は掲載しない」 [1](https://outlook.live.com/owa/?ItemID=AQMkADAwATM3ZmYAZS05YTM3LTdmZDUtMDACLTAwCgBGAAADueryWFep10SpppDx%2fg1jAgcAfdwaKXDwV0uGXt2JxLfrJAAAAHdOOHwAAAB93BopcPBXS4Ze3YnEt%2bskAAIwBPCuAAAA&exvsurl=1&viewmodel=ReadMessageItem)
- 目的は「顧問契約（個別指導）へ誘導する導線」を壊さないこと（共通憲法優先）。

## 4. デザインシステム（必ず守ること）
- ベース背景：#f8fafc（slate-50）/ 白を交互
- アクセント：#4f46e5（indigo-600）
- テキスト：#0f172a（slate-900）/ #475569（slate-600）
- ボーダー：#e2e8f0（slate-200）
- 角丸：rounded-xl〜rounded-2xl
- フォント：Noto Sans JP

## 5. 作業ルール（最小影響）
- 修正はピンポイントで行う。指示された箇所以外は触らない
- 複数ファイルにまたがる修正の場合は着手前に一覧を報告する
- 修正完了後は変更箇所を箇条書きで簡潔に報告する
- エラーが出た場合は自律的に修正して再報告する
- 既存URL/ファイル名/導線は勝手に変えない（変更する場合は理由と影響範囲を先に提示）

## 6. 保持すべきURL・リンク
- Google予約：https://calendar.app.google/CbDg9ukVRzjJBY2RA
- 各ページリンク：service.html / blog/index.html / contact.html

## 7. 資料画像の追加手順（必ずこの順で実施）
1. **ファイル名変更**：`連番_タイトル名.拡張子` 形式にリネーム（例：`001_黒字でも倒産する理由.jpg`）
   - `git mv` でリネームしてgitに変更を追跡させる
2. **画像圧縮**：Node.js + sharp で圧縮
   - JPG：quality 80 / mozjpeg: true
   - PNG：compressionLevel 9 / effort 10
3. **Webに差し替え**：圧縮ファイルでworktreeの画像を上書き
4. **元ファイル削除**：圧縮前の一時フォルダを削除
5. **コミット＆プッシュ**：mainにマージしてCloudflare Pagesへデプロイ
- 圧縮ツール：`C:/Users/kikuchi yuki/AppData/Local/Temp/node_modules/sharp`（インストール済み）

## 8. コア原則
- シンプル第一：余計な要素を追加しない
- 最小影響：指示された変更のみ行う
- 既存デザインの一貫性を維持する

## 9. コンテンツトーン（HP向け補足）
- 公開文章は「初心者が一度で理解できる日本語」に翻訳する（難語を避ける）。
- 集客フェーズの“冷徹な診断口調”はOK。ただし誹謗中傷はしない（共通憲法の範囲で）。

# サイト構成マップ

## ページ一覧
- index.html（トップ）
- service.html（サービス紹介）
- contact.html（お問い合わせ）
- library.html（資料ライブラリ）
- maintenance.html（メンテナンス画面）
- blog/index.html（ブログ一覧）
- blog/各記事.html（個別記事）
- materials/index.html（講習会資料一覧）
- materials/各資料.html（個別資料）

## 共通ファイル（⚠️ 変更時は全ページに影響）
- css/style.css → 全HTMLが参照。変更時は全ページの表示確認必須
- js/main.js → 全HTMLが参照。変更時は全ページの動作確認必須
- _headers → 全ページのHTTP設定。慎重に扱え

## 画像管理
- assets/images/ → サイト共通画像（ロゴ・装飾）
- assets/images/materials/ → 講習会スライド画像
- 画像の追加・リネーム・削除時は参照元HTMLを必ず確認

## データファイル
- blog/data.json → ブログ一覧の記事データ
- materials/data.json → 資料一覧のデータ
- 新規記事・資料追加時はdata.jsonへの登録も忘れるな

## HP変更時のチェック手順
1. git commit でセーブポイント作成
2. 変更対象のファイルと依存関係を確認
3. 変更実施
4. style.css/main.js を触った場合 → 全ページ確認
5. 個別ページのみの場合 → そのページ＋関連ページ確認
6. git commit → デプロイ
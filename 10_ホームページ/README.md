# 企業のお医者さん

経営初心者・小規模事業者・お母さん経営者を応援する経営サポートサービスのWebサイトです。

## サイト構成

```
kigyonooishasan/
├── index.html          # トップページ
├── service.html        # サービス・料金ページ
├── contact.html        # お問い合わせ・無料相談ページ
├── sitemap.xml         # SEO用サイトマップ
├── robots.txt          # クローラー設定
├── _headers            # Cloudflare Pages セキュリティヘッダー
├── _redirects          # Cloudflare Pages リダイレクト設定
├── css/
│   └── style.css       # メインスタイルシート
├── js/
│   └── main.js         # メインJavaScript
├── blog/
│   ├── index.html              # ブログ一覧ページ
│   ├── template.html           # 記事テンプレート（新記事作成時のベース）
│   └── cashflow-basics.html    # サンプル記事
└── assets/
    └── images/         # 画像置き場（OGP画像など）
```

## 技術構成

- **ホスティング**: Cloudflare Pages
- **フェーズ2**: Next.js × Cloudflare Workers への移行予定
- **フォント**: Noto Sans JP (Google Fonts)
- **カラー**: オレンジ（#E8662A）× グリーン（#2D8A4E）

## セットアップ手順

### 1. GitHubリポジトリと接続

```bash
git init
git remote add origin https://github.com/smileoisha/kigyonooishasan.git
git add .
git commit -m "Initial commit: 企業のお医者さん サイト初期構築"
git push -u origin main
```

### 2. Cloudflare Pages 設定

1. Cloudflare ダッシュボード → Pages → プロジェクト作成
2. GitHubリポジトリ `smileoisha/kigyonooishasan` を接続
3. ビルド設定：
   - フレームワーク: なし（静的HTML）
   - ビルドコマンド: （空白）
   - 出力ディレクトリ: `/`（ルート）
4. mainブランチへのpushで自動デプロイされます

### 3. Google Analytics 設定

`index.html`・`service.html`・`contact.html`・ブログ各ページの以下コメントを解除し、
`GA_MEASUREMENT_ID` を実際のIDに置き換えてください：

```html
<!-- <script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script> -->
```

また `js/main.js` の先頭のGA設定コメントも解除してください。

### 4. お問い合わせフォーム（Googleフォーム）設定

1. Googleフォームでお問い合わせフォームを作成
2. 「送信」→「<>（埋め込み）」からiframeコードを取得
3. `contact.html` の仮フォーム部分をGoogleフォームのiframeに置き換え

### 5. Google 予約カレンダー設定

`contact.html` の以下のURLをGoogle Calendar予約ページのURLに変更：

```html
<a href="https://calendar.google.com/calendar/appointments/" ...>
```

### 6. OGP画像の作成

`assets/images/ogp.png` を作成してください（推奨サイズ: 1200×630px）

## 新しいブログ記事の作り方

1. `blog/template.html` をコピーして新しいファイル名で保存（例: `blog/my-article.html`）
2. `<!-- ▼ 記事ごとに変更してください ▼ -->` の箇所を編集
3. `article-body` 内に記事本文を書く
4. `blog/index.html` の記事一覧に追記
5. `sitemap.xml` に新しいURLを追加
6. GitHubにpushすると自動でCloudflare Pagesにデプロイされます

## カラーパレット

| 用途 | カラー | HEXコード |
|------|--------|----------|
| メインオレンジ | オレンジ | #E8662A |
| サブグリーン | グリーン | #2D8A4E |
| 薄いオレンジ（背景） | アクセント | #FFF3E8 |
| 薄いグリーン（背景） | アクセント | #EBF7F0 |
| テキスト | ダークグレー | #333333 |
| 背景 | 温かみのある白 | #FFFAF6 |

---
name: screenshot_merge
description: 複数のHTMLファイルをスクリーンショット方式でPDF化し、1ファイルに結合するツール。提案書のHTML→完成版PDF変換に使用。Puppeteerで.pageクラスをキャプチャ（なければbody）、pdf-libでPDFに変換・結合する。個別PDFは作成しない。
---

# screenshot_merge

## 使い方
```bash
# 初回のみ（依存パッケージのインストール）
cd tools/screenshot_merge
npm install

# 実行（プロジェクトルートから）
node tools/screenshot_merge/screenshot_merge.js output.pdf page1.html page2.html ...
```

第1引数が出力PDF、第2引数以降がHTMLファイル（指定順で結合）。

## 前提

* Node.js
* `npm install`（初回のみ）→ puppeteer・pdf-lib が入る

## 仕様

* `.page` クラスの要素をキャプチャ（なければ `body`）
* deviceScaleFactor: 2（高解像度）
* 余白なし・ブラウザ表示そのまま
* 個別PDFは生成しない（完成版のみ出力）

---
name: html2pdf
description: HTMLファイルをA4横・高解像度PDFに変換するツール。提案書・資料のHTML→PDF変換時に使用。Playwrightで3倍解像度スクリーンショットを撮り、Pillowで288DPI PDFに変換する。`.page`クラスがあればその要素を、なければbody全体をキャプチャする。
---

# html2pdf

## 使い方
```bash
python tools/html2pdf/html2pdf.py input.html [output.pdf]
```

output省略時は同じ場所に同名.pdfを出力。

## 前提

* playwright（`python -m playwright install chromium`）
* Pillow

## 仕様

* A4横固定
* 3倍解像度（deviceScaleFactor=3）
* `.page`クラスの要素をキャプチャ（なければbody）
* 余白なし・ブラウザ表示そのまま

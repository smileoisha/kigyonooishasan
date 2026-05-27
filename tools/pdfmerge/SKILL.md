---
name: pdfmerge
description: 複数のPDFファイルを指定順で1ファイルに結合するツール。提案書の各ページPDFを結合して完成版を作る時などに使用。
---

# pdfmerge

## 使い方
```bash
python tools/pdfmerge/pdfmerge.py output.pdf input1.pdf input2.pdf input3.pdf ...
```

第1引数が出力ファイル、第2引数以降が入力ファイル（指定順で結合）。

## 前提

* pypdf（`pip install pypdf`）

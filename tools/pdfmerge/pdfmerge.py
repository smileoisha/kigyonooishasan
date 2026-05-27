#!/usr/bin/env python3
"""
PDF結合ツール
使い方: python pdfmerge.py output.pdf input1.pdf input2.pdf ...
第1引数が出力、第2引数以降が入力（指定順で結合）
"""
import sys
from pathlib import Path
from pypdf import PdfWriter, PdfReader

def main():
    if len(sys.argv) < 3:
        print("使い方: python pdfmerge.py output.pdf input1.pdf input2.pdf ...")
        sys.exit(1)

    output_path = Path(sys.argv[1])
    input_paths = [Path(p) for p in sys.argv[2:]]

    for p in input_paths:
        if not p.exists():
            print(f"ファイルが見つかりません: {p}")
            sys.exit(1)

    writer = PdfWriter()
    total_pages = 0

    for p in input_paths:
        reader = PdfReader(str(p))
        for page in reader.pages:
            writer.add_page(page)
        total_pages += len(reader.pages)
        print(f"  + {p.name} ({len(reader.pages)}ページ)")

    with open(output_path, 'wb') as f:
        writer.write(f)

    size_kb = output_path.stat().st_size / 1024
    print(f"完了: {output_path.name} ({total_pages}ページ, {size_kb:.0f}KB)")

if __name__ == '__main__':
    main()

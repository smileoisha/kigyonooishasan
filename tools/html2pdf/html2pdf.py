"""
html2pdf.py — HTMLをA4横・高解像度PDFに変換する

使い方:
    python tools/html2pdf/html2pdf.py input.html [output.pdf]

前提:
    pip install pillow playwright
    python -m playwright install chromium
"""

import sys
import os
from pathlib import Path


def html_to_pdf(html_path: str, pdf_path: str | None = None) -> str:
    from playwright.sync_api import sync_playwright
    from PIL import Image
    import io

    html_path = Path(html_path).resolve()
    if pdf_path is None:
        pdf_path = html_path.with_suffix(".pdf")
    pdf_path = Path(pdf_path).resolve()

    # A4横: 297mm x 210mm → 96DPI換算 (Playwrightのvieport基準)
    A4_W_PX = 1123
    A4_H_PX = 794
    SCALE = 3  # deviceScaleFactor → 288DPI相当

    screenshots = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport={"width": A4_W_PX, "height": A4_H_PX},
            device_scale_factor=SCALE,
        )
        page.goto(f"file://{html_path}")
        page.wait_for_load_state("networkidle")

        # .page クラスの要素を1枚ずつキャプチャ
        page_elements = page.query_selector_all(".page")

        if page_elements:
            for elem in page_elements:
                # 各.page要素のサイズに合わせてviewportを調整
                box = elem.bounding_box()
                if box:
                    page.set_viewport_size({
                        "width": int(box["width"]),
                        "height": int(box["height"]),
                    })
                    elem.scroll_into_view_if_needed()
                img_bytes = elem.screenshot()
                screenshots.append(Image.open(io.BytesIO(img_bytes)).convert("RGB"))
        else:
            # .page なし → body全体をキャプチャ
            body = page.query_selector("body")
            if body:
                img_bytes = body.screenshot()
            else:
                img_bytes = page.screenshot(full_page=True)
            screenshots.append(Image.open(io.BytesIO(img_bytes)).convert("RGB"))

        browser.close()

    if not screenshots:
        raise RuntimeError("キャプチャ対象が見つかりませんでした")

    # 1枚目をベースにPDF保存（288DPI）
    first = screenshots[0]
    rest = screenshots[1:]
    first.save(
        str(pdf_path),
        format="PDF",
        resolution=288,
        save_all=True,
        append_images=rest,
    )

    return str(pdf_path)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("使い方: python html2pdf.py input.html [output.pdf]")
        sys.exit(1)

    input_html = sys.argv[1]
    output_pdf = sys.argv[2] if len(sys.argv) >= 3 else None

    result = html_to_pdf(input_html, output_pdf)
    print(f"出力: {result}")

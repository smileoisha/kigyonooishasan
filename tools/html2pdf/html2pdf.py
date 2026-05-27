#!/usr/bin/env python3
"""
HTML → 高解像度PDF変換（A4横・1ページ）
使い方: python html2pdf.py input.html [output.pdf]
output省略時は input と同じ場所に同名.pdf を出力
"""
import asyncio
import sys
import os
from pathlib import Path

async def main():
    if len(sys.argv) < 2:
        print("使い方: python html2pdf.py input.html [output.pdf]")
        sys.exit(1)

    input_path = Path(sys.argv[1]).resolve()
    if not input_path.exists():
        print(f"ファイルが見つかりません: {input_path}")
        sys.exit(1)

    if len(sys.argv) >= 3:
        output_path = Path(sys.argv[2]).resolve()
    else:
        output_path = input_path.with_suffix('.pdf')

    print(f"入力: {input_path}")
    print(f"出力: {output_path}")

    from playwright.async_api import async_playwright
    from PIL import Image
    import tempfile

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(
            viewport={'width': 1400, 'height': 1000},
            device_scale_factor=3
        )
        await page.goto(f'file:///{input_path}', wait_until='networkidle')

        element = page.locator('.page')
        count = await element.count()
        if count == 0:
            element = page.locator('body')

        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp_png = tmp.name

        await element.screenshot(path=tmp_png)
        box = await element.bounding_box()
        print(f"キャプチャ: {box['width']:.0f}x{box['height']:.0f}px (viewport)")

        await browser.close()

    img = Image.open(tmp_png)
    w_px, h_px = img.size
    print(f"画像: {w_px}x{h_px}px (3x解像度)")

    if img.mode == 'RGBA':
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    elif img.mode != 'RGB':
        img = img.convert('RGB')

    a4_w_pt = 297 * 72 / 25.4
    dpi = w_px / (a4_w_pt / 72)

    img.save(str(output_path), 'PDF', resolution=dpi)

    os.unlink(tmp_png)

    size_kb = output_path.stat().st_size / 1024
    print(f"完了: {output_path.name} ({size_kb:.0f}KB, {dpi:.0f}DPI)")

asyncio.run(main())

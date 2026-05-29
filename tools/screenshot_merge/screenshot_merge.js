/**
 * screenshot_merge.js
 * HTMLファイルをスクリーンショット方式でPDF化して結合
 *
 * 使い方:
 *   node tools/screenshot_merge/screenshot_merge.js output.pdf page1.html page2.html ...
 *
 * 仕様:
 *   - .page クラスの要素をキャプチャ（なければ body）
 *   - deviceScaleFactor: 2（高解像度）
 *   - 個別PDFは生成しない（完成版のみ出力）
 */
const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');
const path = require('path');
const fs = require('fs');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('使い方: node screenshot_merge.js output.pdf input1.html input2.html ...');
    process.exit(1);
  }

  const [output, ...inputs] = args;
  const outAbs = path.resolve(output);

  const browser = await puppeteer.launch({ headless: true });
  const pdfDoc = await PDFDocument.create();

  for (const htmlFile of inputs) {
    const abs = path.resolve(htmlFile);
    const url = `file:///${abs.replace(/\\/g, '/')}`;
    console.log(`  処理: ${path.basename(htmlFile)}`);

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: 'networkidle0' });

    // .page クラスを優先、なければ body
    let el = await page.$('.page');
    if (!el) el = await page.$('body');

    const buf = await el.screenshot({ type: 'png' });
    await page.close();

    const img = await pdfDoc.embedPng(buf);
    const pg = pdfDoc.addPage([img.width, img.height]);
    pg.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  await browser.close();

  const bytes = await pdfDoc.save();
  fs.writeFileSync(outAbs, bytes);

  const kb = Math.round(fs.statSync(outAbs).size / 1024);
  console.log(`完了: ${path.basename(output)} (${inputs.length}ページ, ${kb}KB)`);
}

main().catch(e => { console.error(e.message); process.exit(1); });

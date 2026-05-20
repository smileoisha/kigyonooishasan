#!/usr/bin/env node
// Notion 一般ページ → D1 直接インポート用SQLファイル生成
// Usage: node scripts/notion-import-general.js
// 出力: scripts/notion-import-general.sql
// 実行: npx wrangler d1 execute task-manager-db --remote --file scripts/notion-import-general.sql

const fs = require('fs');
const path = require('path');

const MAX_BODY = 4900;
const TRUNCATION_NOTICE = '\n\n...(文字数制限のため省略)';
const DATA_FILE = path.join(__dirname, 'notion-general-pages.json');
const OUT_FILE = path.join(__dirname, 'notion-import-general.sql');

function convertNotionMarkdown(raw) {
  if (!raw) return '';
  let text = raw;
  text = text.replace(/<ancestor-path>[\s\S]*?<\/ancestor-path>/g, '');
  text = text.replace(/<properties>[\s\S]*?<\/properties>/g, '');
  text = text.replace(/<empty-block\/>/g, '');
  text = text.replace(/<colgroup>[\s\S]*?<\/colgroup>/g, '');
  text = text.replace(/<br\s*\/?>/g, '\n');
  text = text.replace(/<page url="[^"]*">([^<]*)<\/page>/g, '[$1]');
  text = text.replace(/<mention-page url="[^"]*"\/>/g, '');
  text = text.replace(/!\[\]\(https:\/\/prod-files-secure\.s3[^)]+\)/g, '');
  text = convertTables(text);
  text = text.replace(/\\<column-list\\>/g, '\n---\n');
  text = text.replace(/\\<\/column-list\\>/g, '');
  text = text.replace(/<column>/g, '').replace(/<\/column>/g, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function convertTables(text) {
  return text.replace(/<table([^>]*)>([\s\S]*?)<\/table>/g, (match, attrs, inner) => {
    const hasHeader = /header-row="true"/.test(attrs);
    const rows = [];
    const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(inner)) !== null) {
      const cells = [];
      const cellRegex = /<td>([\s\S]*?)<\/td>/g;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        const cell = cellMatch[1]
          .replace(/<br\s*\/?>/g, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/\|/g, '\\|')
          .replace(/\n/g, ' ')
          .trim();
        cells.push(cell || ' ');
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length === 0) return '';
    const maxCols = Math.max(...rows.map(r => r.length));
    const padded = rows.map(r => {
      const p = [...r];
      while (p.length < maxCols) p.push(' ');
      return p;
    });
    let md = '\n';
    padded.forEach((row, i) => {
      md += '| ' + row.join(' | ') + ' |\n';
      if (i === 0 && hasHeader) {
        md += '| ' + row.map(() => '---').join(' | ') + ' |\n';
      }
    });
    return md;
  });
}

function truncateBody(body) {
  if (body.length <= MAX_BODY) return body;
  return body.slice(0, MAX_BODY) + TRUNCATION_NOTICE;
}

function sqlStr(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
console.log(`${raw.length} エントリ読み込み完了`);

const lines = [];
lines.push('-- Notion 一般ページ インポート SQL');
lines.push(`-- 生成日時: ${new Date().toISOString()}`);
lines.push(`-- 総エントリ数: ${raw.length}`);
lines.push('');

raw.forEach(page => {
  const id = 'notion_' + page.uuid.replace(/-/g, '');
  const bodyConverted = convertNotionMarkdown(page.body_raw || '');
  const body = truncateBody(bodyConverted);
  const tags = JSON.stringify(page.tags || []);
  const truncated = body.length >= MAX_BODY ? ' [省略あり]' : '';
  console.log(`  [${id.slice(-8)}] ${page.title} (${body.length}文字${truncated})`);

  lines.push(
    `INSERT OR REPLACE INTO knowledge (id, source_type, source_id, title, body, tags, customer_id, parent_id, created_at, updated_at) VALUES (` +
    `${sqlStr(id)}, ` +
    `'manual', ` +
    `${sqlStr(id)}, ` +
    `${sqlStr(page.title)}, ` +
    `${sqlStr(body)}, ` +
    `${sqlStr(tags)}, ` +
    `NULL, ` +
    `NULL, ` +
    `datetime('now'), ` +
    `datetime('now')` +
    `);`
  );
});

fs.writeFileSync(OUT_FILE, lines.join('\n') + '\n', 'utf8');
console.log(`\nSQL出力完了: ${OUT_FILE}`);
console.log('\n次のコマンドで本番D1に書き込み:');
console.log('npx wrangler d1 execute task-manager-db --remote --file scripts/notion-import-general.sql');

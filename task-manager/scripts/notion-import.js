#!/usr/bin/env node
// Notion 20_ツクツク → ナレッジサイト インポートスクリプト
// Usage: node scripts/notion-import.js [--dry-run]
// 事前準備: npx wrangler pages dev . --d1 DB=a33ad2ee-c247-40a7-9de0-b97eac10f532

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const API_BASE = 'http://localhost:8788';
const BATCH_SIZE = 50;
const MAX_BODY = 4900;
const TRUNCATION_NOTICE = '\n\n...(文字数制限のため省略)';

const DATA_FILE = path.join(__dirname, 'notion_export_20tsukutsuku.json');

// Notion enhanced markdown → clean markdown 変換
function convertNotionMarkdown(raw) {
  if (!raw) return '';
  let text = raw;

  // ancestor-path / properties メタデータ除去
  text = text.replace(/<ancestor-path>[\s\S]*?<\/ancestor-path>/g, '');
  text = text.replace(/<properties>[\s\S]*?<\/properties>/g, '');

  // empty-block 除去
  text = text.replace(/<empty-block\/>/g, '');

  // colgroup 除去
  text = text.replace(/<colgroup>[\s\S]*?<\/colgroup>/g, '');

  // <br> → 改行
  text = text.replace(/<br\s*\/?>/g, '\n');

  // <page url="...">テキスト</page> → [テキスト]
  text = text.replace(/<page url="[^"]*">([^<]*)<\/page>/g, '[$1]');

  // <mention-page url="..."/> → 除去
  text = text.replace(/<mention-page url="[^"]*"\/>/g, '');

  // 期限切れ S3 画像 URL → 除去
  text = text.replace(/!\[\]\(https:\/\/prod-files-secure\.s3[^)]+\)/g, '');

  // テーブル変換
  text = convertTables(text);

  // column-list / column タグ除去
  text = text.replace(/\\<column-list\\>/g, '\n---\n');
  text = text.replace(/\\<\/column-list\\>/g, '');
  text = text.replace(/<column>/g, '').replace(/<\/column>/g, '\n');

  // 残タグ除去
  text = text.replace(/<[^>]+>/g, '');

  // 連続空行を2行に圧縮
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
      const padded = [...r];
      while (padded.length < maxCols) padded.push(' ');
      return padded;
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

async function postBatch(entries) {
  const res = await fetch(`${API_BASE}/api/knowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API ${res.status}: ${errText}`);
  }
  return res.json();
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`データファイルが見つかりません: ${DATA_FILE}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`${raw.length} エントリ読み込み完了`);
  if (DRY_RUN) console.log('[DRY RUN] データは書き込みません\n');

  const prepared = raw.map(e => {
    const bodyConverted = convertNotionMarkdown(e.body_raw || e.body || '');
    const body = truncateBody(bodyConverted);
    return {
      id: e.id,
      source_type: 'manual',
      source_id: e.id,
      title: e.title,
      body,
      tags: Array.isArray(e.tags) ? JSON.stringify(e.tags) : (e.tags || '[]'),
      parent_id: e.parent_id || null,
      customer_id: null,
    };
  });

  console.log('インポート対象:');
  prepared.forEach(e => {
    const truncated = (e.body.length >= MAX_BODY) ? ' [省略あり]' : '';
    console.log(`  [${e.id.slice(-8)}] ${e.title} (${e.body.length}文字${truncated})`);
  });

  if (DRY_RUN) {
    console.log('\n[DRY RUN] 完了。--dry-run を外して実行するとインポートします。');
    return;
  }

  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const batch = prepared.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(prepared.length / BATCH_SIZE);
    process.stdout.write(`\nバッチ ${batchNum}/${totalBatches} (${batch.length}件) 送信中...`);
    const result = await postBatch(batch);
    console.log(' OK', result);
  }

  console.log('\nインポート完了！');
}

main().catch(err => {
  console.error('エラー:', err.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * D1リストアスクリプト
 * 使い方:
 *   node scripts/restore.js <backupファイルパス> [--dry-run] [--target=local|prod]
 *
 * 例（ローカルdev環境でテスト・デフォルト）:
 *   node scripts/restore.js "restore-test.json" --dry-run
 *   node scripts/restore.js "restore-test.json" --target=local
 *
 * 例（本番にリストア）:
 *   node scripts/restore.js "restore-test.json" --target=prod
 *
 * --target=local: localhost:8788（wrangler pages dev 起動中が前提）
 * --target=prod : https://task-manager-a5x.pages.dev（本番）
 * デフォルト: local
 */

const fs = require('fs');
const path = require('path');

const PROD_URL = 'https://task-manager-a5x.pages.dev';
const LOCAL_URL = 'http://localhost:8788';

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find(a => !a.startsWith('--'));
  const isDryRun = args.includes('--dry-run');
  const targetArg = args.find(a => a.startsWith('--target='));
  const target = targetArg ? targetArg.split('=')[1] : 'local';
  const BASE_URL = target === 'prod' ? PROD_URL : LOCAL_URL;

  if (!filePath) {
    console.error('使い方: node scripts/restore.js <バックアップファイルパス> [--dry-run]');
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`ファイルが見つかりません: ${absPath}`);
    process.exit(1);
  }

  // ─── バックアップ内容の検証 ─────────────────────────────
  console.log(`\n📂 ファイル読み込み: ${absPath}`);
  const raw = fs.readFileSync(absPath, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('❌ JSONパースエラー:', e.message);
    process.exit(1);
  }

  const fileSizeKB = Math.round(raw.length / 1024);
  console.log(`✅ JSONパース成功`);
  console.log(`   顧客数          : ${data.customers?.length ?? 0}`);
  console.log(`   タスク数        : ${data.tasks?.length ?? 0}`);
  console.log(`   プロジェクト数  : ${data.projects?.length ?? 0}`);
  console.log(`   ユーザー数      : ${data.users?.length ?? 0}`);
  console.log(`   手動ナレッジ数  : ${data._manualKnowledge?.length ?? 0}`);
  console.log(`   サイズ          : ${fileSizeKB} KB`);

  if (!data.tasks || !data.customers || !data.projects) {
    console.error('❌ 不正なデータ形式: tasks/customers/projects が見つかりません');
    process.exit(1);
  }

  if (isDryRun) {
    console.log('\n🔍 --dry-run モード: 検証のみ（書き込みなし）');
    console.log('✅ バックアップデータは正常です。リストア可能です。');
    console.log('\n実際にリストアするには --dry-run を外して再実行してください。');
    return;
  }

  // ─── 確認プロンプト ─────────────────────────────────────
  const targetLabel = target === 'prod' ? '本番データベース' : 'ローカルdev環境（dev D1）';
  console.log(`\n⚠️  ${targetLabel}に書き込みます。`);
  console.log(`   リストア先: ${BASE_URL}/api/data`);
  console.log('\n5秒後に開始します... Ctrl+C でキャンセル');
  await new Promise(r => setTimeout(r, 5000));

  // ─── リストア実行 ───────────────────────────────────────
  console.log('\n📤 リストア中...');
  try {
    const res = await fetch(`${BASE_URL}/api/data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: raw
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ リストア失敗 (HTTP ${res.status}): ${errText}`);
      process.exit(1);
    }

    const result = await res.json();
    console.log('✅ リストア完了！');
    console.log(`   レスポンス: ${JSON.stringify(result)}`);
  } catch (e) {
    console.error('❌ ネットワークエラー:', e.message);
    process.exit(1);
  }
}

main();

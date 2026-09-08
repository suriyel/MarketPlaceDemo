#!/usr/bin/env node
'use strict';
// 扫 blueprints/*/blueprint.json → catalog.json（docs/SPEC.md §catalog）。自包含，只用 Node 内置模块。
//   node scripts/build-catalog.js          # 重新生成 catalog.json
//   node scripts/build-catalog.js --check  # CI：重算与盘上不一致 ⇒ 退出 1（提示作者本地重跑再提交）
//
// ★ 与蚕丛 server-blueprint/marketplace.js buildCatalog 逐字段一致（蚕丛推送时用它重生成
//   catalog.json；蚕丛仓有单测对拍两份输出）。改字段两边同改。

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_SCHEMA_VERSION = 1;

function str(v) { return typeof v === 'string' ? v : ''; }
function entryOf(bp, id) {
  return {
    id,
    title: str(bp.title) || id,
    description: str(bp.description),
    version: str(bp.version),
    author: str(bp.author),
    tags: Array.isArray(bp.tags) ? bp.tags.filter((x) => typeof x === 'string') : [],
    ext: bp.ext && typeof bp.ext === 'object' && !Array.isArray(bp.ext) ? bp.ext : {},
  };
}

function buildCatalog(repoDir) {
  const root = path.join(repoDir, 'blueprints');
  let names = [];
  try { names = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); }
  catch (_) { names = []; }
  const blueprints = [];
  for (const n of names.sort()) {
    let bp;
    try { bp = JSON.parse(fs.readFileSync(path.join(root, n, 'blueprint.json'), 'utf8')); }
    catch (_) { continue; }
    if (!bp || typeof bp !== 'object') continue;
    blueprints.push(entryOf(bp, n));
  }
  return { schemaVersion: CATALOG_SCHEMA_VERSION, blueprints };
}
function catalogText(catalog) { return JSON.stringify(catalog, null, 2) + '\n'; }

if (require.main === module) {
  const out = path.join(ROOT, 'catalog.json');
  const text = catalogText(buildCatalog(ROOT));
  if (process.argv.includes('--check')) {
    let cur = '';
    try { cur = fs.readFileSync(out, 'utf8').replace(/\r\n/g, '\n'); } catch (_) { cur = ''; }
    if (cur !== text) {
      console.error('catalog.json is out of sync with blueprints/. Run `node scripts/build-catalog.js` and commit.');
      process.exit(1);
    }
    console.log('catalog.json in sync');
  } else {
    fs.writeFileSync(out, text);
    console.log('wrote catalog.json');
  }
}

module.exports = { buildCatalog, catalogText, entryOf, CATALOG_SCHEMA_VERSION };

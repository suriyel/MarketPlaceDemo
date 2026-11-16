'use strict';
// 界面文案门：zh / en 两表键集相等；ui/*.js 用到的 key 都在表里、表里没有死 key；t() 首参是字面量；界面代码无中文字面量（注释除外）。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', 'ui');
const zh = JSON.parse(fs.readFileSync(path.join(UI, 'locales', 'zh.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(UI, 'locales', 'en.json'), 'utf8'));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const files = fs.readdirSync(UI).filter((f) => f.endsWith('.js')).map((f) => path.join(UI, f));

test('zh / en 键集相等', () => {
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(zh).sort());
});

test('用到的 key 都在表里、表里无死 key、t() 首参是字面量', () => {
  const used = new Set();
  const bad = [];
  for (const f of files) {
    if (f.endsWith('i18n.js')) continue;
    for (const m of strip(fs.readFileSync(f, 'utf8')).matchAll(/\bt\(\s*([^,)]*)/g)) {
      const lit = /^'([^']*)'$/.exec(m[1].trim());
      if (!lit) bad.push(path.basename(f) + ' t(' + m[1] + ')'); else used.add(lit[1]);
    }
  }
  assert.deepStrictEqual(bad, []);
  assert.deepStrictEqual([...used].filter((k) => !(k in zh)), []);
  assert.deepStrictEqual(Object.keys(zh).filter((k) => !used.has(k)), []);
});

test('界面代码无中文字面量', () => {
  const hits = [];
  for (const f of files) strip(fs.readFileSync(f, 'utf8')).split('\n').forEach((l, i) => { if (/[一-鿿]/.test(l)) hits.push(path.basename(f) + ':' + (i + 1)); });
  assert.deepStrictEqual(hits, []);
});

// 需求任务界面文案表：蚕丛的翻译机制不覆盖应用界面（app-sdk/docs/UI.md「多语言」），应用自带（同 CodeHub）。
// 语言取桥 cancong:init 的 lang；表缺 key 回落中文表，再缺回 key 本身。门：__tests__/ui-i18n.test.js。

let table = {};
let fallback = {};

async function loadJson(p) {
  const r = await fetch(p, { cache: 'no-cache' });
  return r.ok ? r.json() : {};
}

export async function initI18n(lang) {
  fallback = await loadJson('locales/zh.json').catch(() => ({}));
  table = lang === 'en' ? await loadJson('locales/en.json').catch(() => ({})) : fallback;
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh';
}

export function t(key, vars) {
  let s = table[key];
  if (s == null) s = fallback[key];
  if (s == null) return key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
  return s;
}

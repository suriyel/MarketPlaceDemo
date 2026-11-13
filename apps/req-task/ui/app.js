// 需求任务界面（挂在 /x/req-task/ 下，全部相对路径）。蚕丛桥：主题 / 跳到任务 / 分享向导（交付包）。
// 状态以服务器为准（/api/state = 中转站任务 + 本地台账）；按钮只调本应用后端。
import { bridge } from './_cancong/bridge.js';
import { initI18n, t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const h = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'onclick') e.addEventListener('click', v); else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
};

let S = null;          // 最近一次 /api/state
let focus = null;      // cancong:navigate 进来的 task/<flowId>/<stepKey>
const drafts = new Map();   // 卡片里打开的表单（重绘不丢）：key → { kind, ... }

async function api(p, body) {
  const r = await fetch(p, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ ok: false, code: 'http_' + r.status }));
  return j;
}

function say(text, kind) {
  const m = $('msg');
  m.textContent = text || '';
  m.className = 'msg ' + (kind || 'ok');
  m.hidden = !text;
}

/** 后端 / 中转站错误码 → 文案（查表型：函数 + 字面量臂） */
function errText(code) {
  switch (code) {
    case 'consent_required': return t('rt.err.consent');
    case 'claimed_elsewhere': return t('rt.err.claimedElsewhere');
    case 'not_owner': return t('rt.err.notOwner');
    case 'flow_paused': return t('rt.err.paused');
    case 'flow_ended': return t('rt.err.ended');
    case 'step_not_ready': return t('rt.err.notReady');
    case 'not_current_step': return t('rt.err.notCurrent');
    case 'not_claimer': return t('rt.err.notClaimer');
    case 'reason_required': return t('rt.err.reason');
    case 'bad_rework_target': return t('rt.err.reworkTarget');
    case 'bad_cwd': return t('rt.err.cwd');
    case 'no_server': return t('rt.err.noServer');
    case 'unreachable': return t('rt.err.unreachable');
    case 'too_large': return t('rt.err.tooLarge');
    case 'disk_full': return t('rt.err.diskFull');
    case 'ui_not_connected': return t('rt.err.uiNotConnected');
    case 'project_full': return t('rt.err.projectFull');
    case 'blueprint_not_found': return t('rt.err.blueprintMissing');
    case 'workflow_not_ready': return t('rt.err.workflowNotReady');
    default: return t('rt.err.generic', { code: code || '?' });
  }
}

function statusText(task) {
  const l = task.local;
  if (task.flowStatus === 'paused') return t('rt.st.paused');
  if (task.flowStatus === 'cancelled') return t('rt.st.cancelled');
  if (task.flowStatus === 'done') return t('rt.st.flowDone');
  if (task.status === 'delivered') return t('rt.st.delivered');
  if (task.status === 'active' && !task.claimedByMe) return t('rt.st.claimedElsewhere', { host: task.claimedHost || '?' });
  if (task.status === 'pending' && l && task.lastRework) return t('rt.st.reworkedTo', { step: task.lastRework.targetName || '' });
  if (task.status === 'pending') return t('rt.st.pending');
  if (task.status === 'ready') return task.round > 1 ? t('rt.st.reworkReady') : t('rt.st.ready');
  if (l && l.state === 'running') return t('rt.st.running');
  if (l && l.state === 'run_done') return t('rt.st.runDone');
  return t('rt.st.active');
}

const keyOf = (task) => task.flowId + ':' + task.stepKey;

/** 自动装工作流失败的原因（平台错误码 → 人话；docs/REQ-FLOW-DESIGN.md §16.6） */
function wfWhy(code) {
  switch (code) {
    case 'consent_denied': return t('rt.wf.consentDenied');
    case 'market_auth_required': return t('rt.wf.authRequired');
    case 'market_fetch_failed': return t('rt.wf.fetchFailed');
    case 'not_in_market': return t('rt.wf.notInMarket');
    case 'ui_not_connected': return t('rt.wf.noUi');
    default: return t('rt.wf.installFailed', { code: code || '' });
  }
}

function card(task) {
  const k = keyOf(task);
  const l = task.local;
  const live = task.flowStatus === 'running';
  const mine = task.status === 'active' && task.claimedByMe;
  const ops = h('div', { class: 'ops' });
  const btn = (label, fn, primary, tid) => ops.append(h('button', { type: 'button', class: primary ? 'primary' : null, 'data-testid': tid, onclick: fn }, label));
  const d = drafts.get(k);

  if (live && task.status === 'ready') {
    const def = (S.lastRoot ? S.lastRoot.replace(/[\\/]+$/, '') + (S.lastRoot.includes('\\') ? '\\' : '/') : '') + task.reqId;
    const dir = h('input', { type: 'text', value: d && d.dir != null ? d.dir : def, placeholder: t('rt.receive.dirPh'), 'data-testid': 'rt-dir' });
    dir.addEventListener('input', () => drafts.set(k, Object.assign(drafts.get(k) || {}, { dir: dir.value })));
    ops.append(dir);
    btn(t('rt.receive.btn'), () => receive(task, dir.value.trim()), true, 'rt-receive');
  }
  const wfBad = !!(l && l.wf && l.wf.state === 'failed');
  if (live && mine && (!l || l.state === 'received')) {
    // 工作流没装上：先「重试安装」（市场要登录 / 新市场确认由蚕丛弹窗），装好才出「启动任务」
    if (wfBad) btn(t('rt.wf.retry'), () => retryWf(task), true, 'rt-retry-wf');
    else btn(t('rt.start.btn'), () => { drafts.set(k, { kind: 'start', prompt: null }); render(); }, true, 'rt-start-open');
  }
  if (mine && l && l.cwd && l.runId) btn(t('rt.view.btn'), () => bridge.openRun({ cwd: l.cwd, runId: l.runId }), false, 'rt-open-run');
  if (live && mine && l && (l.state === 'running' || l.state === 'run_done' || l.state === 'received')) {
    btn(t('rt.deliver.btn'), () => deliver(task), l.state === 'run_done', 'rt-deliver');
    if (task.ord > 0) btn(t('rt.rework.btn'), () => { drafts.set(k, { kind: 'rework' }); render(); }, false, 'rt-rework-open');
  }

  const steps = h('div', { class: 'steps' }, ...(task.steps || []).map((s) => h('span', {
    class: s.key === task.stepKey ? 'cur' : (s.status === 'delivered' ? 'done' : null) }, s.name + (s.round > 1 ? ' R' + s.round : ''))));
  const notes = [];
  if (task.prev) notes.push(task.prev.deliveredAt ? t('rt.card.prev', { step: task.prev.name, who: task.prev.owner })
    : t('rt.card.prevWaiting', { step: task.prev.name, who: task.prev.owner }));
  if (task.round > 1 && task.lastRework && task.lastRework.targetName === task.stepName) {
    notes.push(t('rt.card.rework', { from: task.lastRework.fromName || t('rt.card.admin'), reason: task.lastRework.reason || '' }));
  }
  if (task.stepDesc) notes.push(task.stepDesc);
  if (l && l.cwd) notes.push(t('rt.card.cwd', { cwd: l.cwd }));
  if (wfBad) notes.push(t('rt.wf.notReady', { id: l.wf.id || task.blueprintId, why: wfWhy(l.wf.code) }));
  else if (l && l.wf && l.wf.state === 'kept-local') notes.push(t('rt.wf.keptLocal', { id: l.wf.id || task.blueprintId }));

  const box = h('div', { class: 'card' + (task.status === 'ready' && live ? ' ready' : '') + (task.round > 1 && task.status !== 'delivered' ? ' rework' : '')
    + (focus === k ? ' hl' : ''), 'data-testid': 'rt-card', 'data-flow': task.flowId, 'data-step': task.stepKey, 'data-status': task.status },
  h('div', { class: 'head' }, h('span', { class: 'req' }, task.reqId), h('span', { class: 'title' }, task.reqTitle || ''),
    h('span', { class: 'pill', 'data-testid': 'rt-status' }, statusText(task))),
  h('div', { class: 'meta' }, task.round > 0 ? t('rt.card.step', { step: task.stepName, round: task.round, tpl: task.templateName || '' })
    : t('rt.card.stepNotYet', { step: task.stepName, tpl: task.templateName || '' })),
  steps, ...notes.map((n) => h('div', { class: 'note' }, n)), ops);
  // 草稿表单只在流程进行中出（暂停 / 取消后残留的确认框不能再点）
  if (live && d && d.kind === 'start' && !wfBad) box.append(startForm(task, d));
  if (live && d && d.kind === 'rework') box.append(reworkForm(task, d));
  return box;
}

function startForm(task, d) {
  const k = keyOf(task);
  const pre = d.prefill != null ? d.prefill : ((task.local && task.local.launch && JSON.parse(task.local.launch).prefill) || '');
  const ta = h('textarea', { 'data-testid': 'rt-prompt' });
  ta.value = d.prompt != null ? d.prompt : pre;
  ta.addEventListener('input', () => { d.prompt = ta.value; });
  const warn = d.blueprintMissing ? h('div', { class: 'msg err' }, t('rt.start.bpMissing', { id: task.blueprintId })) : null;
  return h('div', { class: 'form' }, h('div', { class: 'muted' }, t('rt.start.hint', { bp: task.blueprintId })), warn, ta,
    h('div', { class: 'ops' },
      h('button', { type: 'button', class: 'primary', 'data-testid': 'rt-start', onclick: () => start(task, ta.value, pre) }, t('rt.start.confirm')),
      h('button', { type: 'button', onclick: () => { drafts.delete(k); render(); } }, t('rt.common.cancel'))));
}

function reworkForm(task, d) {
  const k = keyOf(task);
  const before = (task.steps || []).slice(0, task.ord);
  const sel = h('select', { 'data-testid': 'rt-rework-target' }, ...before.map((s) => h('option', { value: s.key }, s.name)));
  if (d.target) sel.value = d.target;
  sel.addEventListener('change', () => { d.target = sel.value; });
  const ta = h('textarea', { placeholder: t('rt.rework.reasonPh'), 'data-testid': 'rt-rework-reason' });
  ta.value = d.reason || '';
  ta.addEventListener('input', () => { d.reason = ta.value; });
  const att = h('input', { type: 'checkbox', 'data-testid': 'rt-rework-attach' });
  att.checked = !!d.attach;
  att.addEventListener('change', () => { d.attach = att.checked; });
  return h('div', { class: 'form' }, h('label', null, t('rt.rework.target') + ' ', sel), ta, h('label', null, att, ' ' + t('rt.rework.attach')),
    h('div', { class: 'ops' },
      h('button', { type: 'button', class: 'primary', 'data-testid': 'rt-rework', onclick: () => rework(task, sel.value, ta.value, att.checked) }, t('rt.rework.confirm')),
      h('button', { type: 'button', onclick: () => { drafts.delete(k); render(); } }, t('rt.common.cancel'))));
}

function render() {
  if (!S) return;
  $('me').textContent = S.me ? t('rt.bar.me', { who: S.me.display }) : '';
  const srv = $('server');
  srv.textContent = S.online === false ? t('rt.bar.offline', { err: errText(S.error) }) : (S.online ? t('rt.bar.online') : t('rt.bar.connecting'));
  srv.className = 'pill ' + (S.online === false ? 'err' : (S.online ? 'ok' : ''));
  $('consent').hidden = !!S.consent;
  const groups = [
    [t('rt.group.todo'), S.tasks.filter((x) => x.flowStatus === 'running' && (x.status === 'ready' || (x.status === 'active' && x.claimedByMe)))],
    [t('rt.group.waiting'), S.tasks.filter((x) => x.flowStatus === 'running' && (x.status === 'pending' || (x.status === 'active' && !x.claimedByMe)))],
    [t('rt.group.other'), S.tasks.filter((x) => x.flowStatus !== 'running' || x.status === 'delivered')],
  ];
  const list = $('list');
  list.textContent = '';
  for (const [title, items] of groups) {
    if (!items.length) continue;
    list.append(h('h3', null, title + ' · ' + items.length), ...items.map(card));
  }
  $('empty').hidden = S.tasks.length > 0;
}

async function load(refresh) {
  const j = await api(refresh ? 'api/refresh' : 'api/state', refresh ? {} : undefined);
  if (j.ok) S = j;
  render();
}

async function guard(fn, okText) {
  say(t('rt.common.working'), 'ok');
  document.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    const r = await fn();
    if (r && r.ok === false) { say(errText(r.code) + (r.claimedHost ? ' (' + r.claimedHost + ')' : ''), 'err'); return null; }
    if (okText) say(okText, 'ok'); else say('');
    return r;
  } finally {
    document.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    await load(false);
  }
}

async function receive(task, dir) {
  const k = keyOf(task);
  const r = await guard(() => api(`api/tasks/${task.flowId}/${task.stepKey}/receive`, { cwd: dir }), t('rt.receive.done'));
  if (r) { drafts.set(k, { kind: 'start', prefill: r.prefill, prompt: null, blueprintMissing: r.blueprintMissing }); render(); }
}

async function retryWf(task) {
  const r = await guard(() => api(`api/tasks/${task.flowId}/${task.stepKey}/retry-workflow`, {}), null);
  if (r && r.wf && r.wf.state === 'failed') say(t('rt.wf.notReady', { id: r.wf.id, why: wfWhy(r.wf.code) }), 'err');
  else if (r) { say(t('rt.wf.ready'), 'ok'); drafts.set(keyOf(task), { kind: 'start', prompt: null }); render(); }
}

async function start(task, prompt, prefill) {
  const r = await guard(() => api(`api/tasks/${task.flowId}/${task.stepKey}/start`, { prompt, prefill }), t('rt.start.done'));
  if (r) { drafts.delete(keyOf(task)); render(); }
}

async function deliver(task) {
  const l = task.local;
  say(t('rt.deliver.wizard'), 'ok');
  const s = await bridge.share({ cwd: l.cwd, runIds: l.runId ? [l.runId] : undefined });
  if (!s || !s.ok) { say(t('rt.deliver.cancelled'), 'err'); return; }
  await guard(() => api(`api/tasks/${task.flowId}/${task.stepKey}/deliver`, { shareId: s.shareId, picked: s.picked, excluded: s.excluded, scanHits: s.scanHits }),
    t('rt.deliver.done'));
}

async function rework(task, targetKey, reason, attach) {
  if (!reason.trim()) { say(t('rt.err.reason'), 'err'); return; }
  let s = null;
  if (attach) {
    const l = task.local;
    say(t('rt.deliver.wizard'), 'ok');
    s = await bridge.share({ cwd: l.cwd, runIds: l.runId ? [l.runId] : undefined });
    if (!s || !s.ok) { say(t('rt.deliver.cancelled'), 'err'); return; }
  }
  const r = await guard(() => api(`api/tasks/${task.flowId}/${task.stepKey}/rework`, Object.assign({ targetKey, reason },
    s ? { shareId: s.shareId, picked: s.picked, excluded: s.excluded } : {})), t('rt.rework.done'));
  if (r) { drafts.delete(keyOf(task)); render(); }
}

bridge.onInit(async (info) => {
  await initI18n(info.lang);
  document.title = t('rt.title');
  $('title').textContent = t('rt.title');
  $('refresh').textContent = t('rt.bar.refresh');
  $('settings-btn').textContent = t('rt.bar.settings');
  $('consent-text').textContent = t('rt.consent.text');
  $('consent-ok').textContent = t('rt.consent.ok');
  $('empty').textContent = t('rt.empty');
  $('refresh').addEventListener('click', () => load(true));
  $('settings-btn').addEventListener('click', () => { const s = $('settings'); s.hidden = !s.hidden; if (!s.hidden) bridge.configForm(s); });
  $('consent-ok').addEventListener('click', () => guard(() => api('api/consent', {})));
  await load(false);
  setInterval(() => { if (!document.hidden) load(false); }, 15000);
});
bridge.onNavigate((route) => {
  const m = /^task\/([^/]+)\/([^/]+)$/.exec(route || '');
  focus = m ? m[1] + ':' + m[2] : null;
  load(true);
});

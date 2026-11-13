// 需求任务界面（挂在 /x/req-task/ 下，全部相对路径）。蚕丛桥：主题 / 跳到任务 / 分享向导（交付包）。
// 布局（docs/REQ-FLOW-DESIGN.md §17 Q39）：左列表右详情。详情 = 需求进度（各步责任人 / 状态 / 轮次 / 交付时间 + 打回痕迹）
// → 本步运行（节点链 + 状态 + 已用时长；「去回答」跳蚕丛那条任务）或「接收这一步」→ 材料 → 交付 / 打回。设置页占右侧详情区。
// 状态以服务器为准（/api/state = 中转站任务 + 本地台账 + 运行进度）；按钮只调本应用后端。
import { bridge } from './_cancong/bridge.js';
import { initI18n, t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const h = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'onclick') e.addEventListener('click', v); else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids) if (k != null && k !== false) e.append(k);
  return e;
};

let S = null;          // 最近一次 /api/state
let sel = null;        // 选中的任务 flowId:stepKey（cancong:navigate 进来的 task/<flowId>/<stepKey> 直接选中）
let mode = 'task';     // 'task' | 'settings'
let settings = null;   // 设置页数据 GET /api/settings
const drafts = new Map();   // 详情里打开的表单（重绘不丢）：key → { kind, ... }

async function api(p, body, method) {
  const tok = bridge.info && bridge.info.token;
  const headers = Object.assign(tok ? { authorization: 'Bearer ' + tok } : {}, body === undefined ? {} : { 'content-type': 'application/json' });
  const r = await fetch(p, { method: method || (body === undefined ? 'GET' : 'POST'), headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false, code: 'http_' + r.status }));
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
    case 'cwd_illegal_chars': return t('rt.err.cwdChars');
    case 'cwd_in_data_root': return t('rt.err.cwdDataRoot');
    case 'cwd_not_writable': return t('rt.err.cwdWritable');
    case 'bad_url': return t('rt.err.badUrl');
    case 'not_evolve': return t('rt.err.notEvolve');
    case 'ui_only': return t('rt.err.uiOnly');
    case 'no_server': return t('rt.err.noServer');
    case 'unreachable': return t('rt.err.unreachable');
    case 'too_large': return t('rt.err.tooLarge');
    case 'disk_full': return t('rt.err.diskFull');
    case 'ui_not_connected': return t('rt.err.uiNotConnected');
    case 'project_full': return t('rt.err.projectFull');
    case 'blueprint_not_found': return t('rt.err.blueprintMissing');
    case 'workflow_not_ready': return t('rt.err.workflowNotReady');
    case 'run_key_busy': return t('rt.err.runKeyBusy');
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
  const p = l && l.progress;
  if (l && l.state === 'running' && p && p.status === 'waiting_user') return t('rt.st.waiting');
  if (l && l.state === 'running' && p && p.status === 'disconnected') return t('rt.st.disconnected');
  if (l && l.state === 'running') return t('rt.st.running');
  if (l && l.state === 'run_done') return t('rt.st.runDone');
  return t('rt.st.active');
}

/** 需求进度里每一步的状态 @param {string} st */
function stepStatus(st) {
  switch (st) {
    case 'pending': return t('rt.step.pending');
    case 'ready': return t('rt.step.ready');
    case 'active': return t('rt.step.active');
    case 'delivered': return t('rt.step.delivered');
    default: return st || '';
  }
}

/** 自动装工作流失败的原因（平台错误码 → 人话；docs/REQ-FLOW-DESIGN.md §16.6） */
function wfWhy(code) {
  switch (code) {
    case 'consent_denied': return t('rt.wf.consentDenied');
    case 'market_auth_required': return t('rt.wf.authRequired');
    case 'market_fetch_failed': return t('rt.wf.fetchFailed');
    case 'not_in_market': return t('rt.wf.notInMarket');
    case 'ui_not_connected': return t('rt.wf.noUi');
    case 'not_on_client': return t('rt.wf.notOnClient');
    default: return t('rt.wf.installFailed', { code: code || '' });
  }
}

/** 接收面板里工作流怎么来 @param {string|null} src */
function wfSource(src) {
  switch (src) {
    case 'market': return t('rt.wf.srcMarket');
    case 'server': return t('rt.wf.srcServer');
    default: return t('rt.wf.srcApp');
  }
}

const keyOf = (task) => task.flowId + ':' + task.stepKey;
const pad = (n) => String(n).padStart(2, '0');
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function elapsed(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!iso || !(ms >= 0)) return '';
  const m = Math.floor(ms / 60000);
  return m < 60 ? t('rt.run.minutes', { n: m }) : t('rt.run.hours', { h: Math.floor(m / 60), m: m % 60 });
}

// ---------------- 左列表 ----------------
function groups() {
  if (!S) return [];
  return [
    [t('rt.group.todo'), S.tasks.filter((x) => x.flowStatus === 'running' && (x.status === 'ready' || (x.status === 'active' && x.claimedByMe)))],
    [t('rt.group.waiting'), S.tasks.filter((x) => x.flowStatus === 'running' && (x.status === 'pending' || (x.status === 'active' && !x.claimedByMe)))],
    [t('rt.group.other'), S.tasks.filter((x) => x.flowStatus !== 'running' || x.status === 'delivered')],
  ];
}

function dotClass(task) {
  const p = task.local && task.local.progress;
  if (task.flowStatus !== 'running' || task.status === 'delivered') return 'done';
  if (task.status === 'ready' || (p && (p.status === 'waiting_user' || p.status === 'disconnected' || p.status === 'halted'))) return 'act';
  if (task.status === 'active' && task.claimedByMe) return 'run';
  return 'wait';
}

function renderList() {
  const list = $('list');
  list.textContent = '';
  const gs = groups();
  if (!S.tasks.length) { list.append(h('p', { class: 'muted empty', 'data-testid': 'rt-empty' }, t('rt.empty'))); return; }
  for (const [title, items] of gs) {
    if (!items.length) continue;
    list.append(h('h3', null, title + ' · ' + items.length), ...items.map((task) => h('button', {
      type: 'button', class: 'row' + (mode === 'task' && sel === keyOf(task) ? ' on' : ''), 'data-testid': 'rt-row',
      'data-flow': task.flowId, 'data-step': task.stepKey, 'data-status': task.status,
      onclick: () => { sel = keyOf(task); mode = 'task'; render(); },
    }, h('span', { class: 'dot ' + dotClass(task) }),
    h('span', { class: 'rowbody' },
      h('span', { class: 'rowtop' }, h('span', { class: 'req' }, task.reqId), h('span', { class: 'rowst' }, statusText(task))),
      h('span', { class: 'rowtitle' }, task.reqTitle || ''),
      h('span', { class: 'muted small' }, task.round > 0 ? t('rt.row.step', { step: task.stepName, round: task.round }) : t('rt.row.stepNotYet', { step: task.stepName }))))));
  }
}

// ---------------- 右详情 ----------------
function stepChain(task) {
  const cur = task.stepKey;
  const box = h('div', { class: 'stepgrid' });
  for (const s of task.steps || []) {
    const k = s.key === cur ? 'cur' : s.status === 'delivered' ? 'done' : '';
    box.append(h('div', { class: 'stepcard ' + k },
      h('div', { class: 'between' }, h('b', null, s.name), h('span', { class: 'small st-' + (s.status || '') }, stepStatus(s.status) + (s.round > 0 ? ' R' + s.round : ''))),
      h('div', { class: 'muted small' }, s.owner || '—'),
      h('div', { class: 'muted small' }, s.deliveredAt ? t('rt.step.deliveredAt', { at: fmtTime(s.deliveredAt) }) : '—')));
  }
  const sec = h('section', { class: 'panel', 'data-testid': 'rt-flow' }, h('h4', null, t('rt.flow.title')), box);
  const rw = task.lastRework;
  if (rw && task.round > 1) sec.append(h('div', { class: 'reworkbar' }, t('rt.flow.rework', { from: rw.fromName || t('rt.card.admin'), to: rw.targetName || '', reason: rw.reason || '' })));
  return sec;
}

function receivePanel(task) {
  const k = keyOf(task);
  const d = drafts.get(k) || {};
  const sec = h('section', { class: 'panel accent', 'data-testid': 'rt-receive-panel' }, h('h4', null, t('rt.receive.title')));
  const dirRow = h('div', { class: 'kv' }, h('span', { class: 'k' }, t('rt.common.cwd')));
  if (d.editDir) {
    const dir = h('input', { type: 'text', value: d.dir != null ? d.dir : task.defaultCwd, placeholder: t('rt.receive.dirPh'), 'data-testid': 'rt-dir' });
    dir.addEventListener('input', () => drafts.set(k, Object.assign(drafts.get(k) || {}, { dir: dir.value })));
    dirRow.append(dir);
  } else {
    dirRow.append(h('span', { class: 'mono', 'data-testid': 'rt-dir-value' }, task.defaultCwd || ''),
      h('button', { type: 'button', class: 'link', 'data-testid': 'rt-dir-edit', onclick: () => { drafts.set(k, Object.assign({}, d, { editDir: true })); render(); } }, t('rt.receive.change')));
  }
  sec.append(dirRow,
    h('div', { class: 'kv' }, h('span', { class: 'k' }, t('rt.common.workflow')), h('span', { class: 'mono' }, task.blueprintId), h('span', { class: 'muted small' }, wfSource(task.blueprintSource))),
    h('div', { class: 'kv' }, h('span', { class: 'k' }, t('rt.common.materials')), h('span', null, task.prev ? t('rt.receive.prev', { step: task.prev.name, who: task.prev.owner }) : t('rt.receive.first'))),
    h('div', { class: 'ops' }, h('button', { type: 'button', class: 'primary', 'data-testid': 'rt-receive',
      onclick: () => receive(task, d.editDir ? String(d.dir != null ? d.dir : task.defaultCwd || '').trim() : '') }, t('rt.receive.btn'))));
  return sec;
}

function nodeChainEl(task, p) {
  const chain = task.chain || [];
  if (!chain.length) return null;
  const seen = new Set((p && p.visited) || []);
  const box = h('div', { class: 'nodes', 'data-testid': 'rt-nodes' });
  chain.forEach((n, i) => {
    const cls = p && p.node === n.id ? 'cur' : seen.has(n.id) ? 'done' : '';
    if (i) box.append(h('span', { class: 'arrow', 'aria-hidden': 'true' }, '›'));
    box.append(h('span', { class: 'node ' + cls, 'data-node': n.id }, (cls === 'done' ? '✓ ' : '') + n.title));
  });
  return box;
}

function runPanel(task) {
  const l = task.local;
  const p = l.progress || {};
  const titleOf = (id) => ((task.chain || []).find((n) => n.id === id) || { title: id || '' }).title;
  let line; let cls = '';
  if (l.state === 'run_done' || p.status === 'done') { line = t('rt.run.done'); cls = 'ok'; }
  else if (p.status === 'failed') { line = t('rt.run.failed'); cls = 'err'; }
  else if (p.status === 'waiting_user') { line = t('rt.run.waiting', { node: titleOf(p.node), n: p.asks || 1 }) + (p.summary ? ' · ' + p.summary : ''); cls = 'act'; }
  else if (p.status === 'halted') { line = t('rt.run.halted', { node: titleOf(p.node) }); cls = 'act'; }
  else if (p.status === 'disconnected') { line = t('rt.run.disconnected'); cls = 'err'; }
  else line = p.node ? t('rt.run.runningAt', { node: titleOf(p.node) }) : t('rt.run.running');
  const ops = h('div', { class: 'ops' });
  if (p.status === 'waiting_user' || p.status === 'halted' || p.status === 'disconnected') {
    ops.append(h('button', { type: 'button', class: 'primary', 'data-testid': 'rt-answer', onclick: () => bridge.openRun({ cwd: l.cwd, runId: l.runId }) },
      p.status === 'waiting_user' ? t('rt.run.answer') : t('rt.view.btn')));
  }
  ops.append(h('button', { type: 'button', 'data-testid': 'rt-observe', onclick: () => bridge.observeRun({ cwd: l.cwd, runId: l.runId }) }, t('rt.run.observe')));
  return h('section', { class: 'panel', 'data-testid': 'rt-run' },
    h('div', { class: 'between' }, h('h4', null, t('rt.run.title')),
      h('span', { class: 'muted small' }, [task.blueprintId, l.wf && l.wf.version, p.startedAt && l.state === 'running' ? t('rt.run.elapsed', { d: elapsed(p.startedAt) }) : null].filter(Boolean).join(' · '))),
    nodeChainEl(task, p),
    h('div', { class: 'runline ' + cls, 'data-testid': 'rt-run-line' }, line), ops);
}

function startPanel(task) {
  const l = task.local;
  const k = keyOf(task);
  const d = drafts.get(k);
  const wfBad = !!(l.wf && l.wf.state === 'failed');
  const sec = h('section', { class: 'panel accent', 'data-testid': 'rt-start-panel' }, h('h4', null, t('rt.run.title')));
  if (wfBad) {
    sec.append(h('div', { class: 'runline err' }, t('rt.wf.notReady', { id: l.wf.id || task.blueprintId, why: wfWhy(l.wf.code) })),
      h('div', { class: 'ops' }, h('button', { type: 'button', class: 'primary', 'data-testid': 'rt-retry-wf', onclick: () => retryWf(task) }, t('rt.wf.retry'))));
    return sec;
  }
  if (l.wf && l.wf.state === 'kept-local') sec.append(h('div', { class: 'muted small' }, t('rt.wf.keptLocal', { id: l.wf.id || task.blueprintId })));
  if (d && d.kind === 'start') sec.append(startForm(task, d));
  else sec.append(h('div', { class: 'ops' }, h('button', { type: 'button', class: 'primary', 'data-testid': 'rt-start-open',
    onclick: () => { drafts.set(k, { kind: 'start', prompt: null }); render(); } }, t('rt.start.btn'))));
  return sec;
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
  const sel0 = h('select', { 'data-testid': 'rt-rework-target' }, ...before.map((s) => h('option', { value: s.key }, s.name)));
  if (d.target) sel0.value = d.target;
  sel0.addEventListener('change', () => { d.target = sel0.value; });
  const ta = h('textarea', { placeholder: t('rt.rework.reasonPh'), 'data-testid': 'rt-rework-reason' });
  ta.value = d.reason || '';
  ta.addEventListener('input', () => { d.reason = ta.value; });
  const att = h('input', { type: 'checkbox', 'data-testid': 'rt-rework-attach' });
  att.checked = !!d.attach;
  att.addEventListener('change', () => { d.attach = att.checked; });
  return h('div', { class: 'form' }, h('label', null, t('rt.rework.target') + ' ', sel0), ta, h('label', null, att, ' ' + t('rt.rework.attach')),
    h('div', { class: 'ops' },
      h('button', { type: 'button', class: 'primary', 'data-testid': 'rt-rework', onclick: () => rework(task, sel0.value, ta.value, att.checked) }, t('rt.rework.confirm')),
      h('button', { type: 'button', onclick: () => { drafts.delete(k); render(); } }, t('rt.common.cancel'))));
}

function materials(task) {
  const l = task.local;
  const rows = [];
  if (l && l.cwd) rows.push(h('div', { class: 'kv' }, h('span', { class: 'k' }, t('rt.common.cwd')), h('span', { class: 'mono', 'data-testid': 'rt-cwd' }, l.cwd)));
  if (l && l.cwd) rows.push(h('div', { class: 'kv' }, h('span', { class: 'k' }, t('rt.common.docs')), h('span', { class: 'mono' }, '.req/' + task.stepKey + '-r' + task.round + '/docs')));
  if (task.prev) rows.push(h('div', { class: 'kv' }, h('span', { class: 'k' }, t('rt.common.upstream')),
    h('span', null, task.prev.deliveredAt ? t('rt.card.prev', { step: task.prev.name, who: task.prev.owner }) : t('rt.card.prevWaiting', { step: task.prev.name, who: task.prev.owner }))));
  if (task.stepDesc) rows.push(h('div', { class: 'kv' }, h('span', { class: 'k' }, t('rt.common.stepDesc')), h('span', { class: 'pre' }, task.stepDesc)));
  return rows.length ? h('section', { class: 'panel' }, h('h4', null, t('rt.common.materials')), ...rows) : null;
}

function renderTask(task) {
  const k = keyOf(task);
  const l = task.local;
  const live = task.flowStatus === 'running';
  const mine = task.status === 'active' && task.claimedByMe;
  const d = drafts.get(k);
  const box = h('div', { class: 'task', 'data-testid': 'rt-card', 'data-flow': task.flowId, 'data-step': task.stepKey, 'data-status': task.status },
    h('div', { class: 'head' }, h('span', { class: 'req' }, task.reqId), h('span', { class: 'title' }, task.reqTitle || ''),
      h('span', { class: 'pill', 'data-testid': 'rt-status' }, statusText(task)), h('span', { class: 'grow' }),
      h('span', { class: 'muted small' }, t('rt.card.template', { tpl: task.templateName || '' }))),
    stepChain(task));
  if (live && task.status === 'ready') box.append(receivePanel(task));
  if (mine && l && l.runId) box.append(runPanel(task));
  else if (live && mine && l && l.state === 'received') box.append(startPanel(task));
  const m = materials(task);
  if (m) box.append(m);
  if (live && mine && l && (l.state === 'running' || l.state === 'run_done' || l.state === 'received')) {
    const ops = h('div', { class: 'ops' },
      h('button', { type: 'button', class: l.state === 'run_done' ? 'primary' : null, 'data-testid': 'rt-deliver', onclick: () => deliver(task) }, t('rt.deliver.btn')),
      task.ord > 0 ? h('button', { type: 'button', 'data-testid': 'rt-rework-open', onclick: () => { drafts.set(k, { kind: 'rework' }); render(); } }, t('rt.rework.btn')) : null);
    box.append(ops);
    if (d && d.kind === 'rework') box.append(h('section', { class: 'panel' }, reworkForm(task, d)));
  }
  return box;
}

// ---------------- 设置页（§17 Q40′ / Q41）----------------
function settingsSource(src) {
  switch (src) {
    case 'setting': return t('rt.set.srcSetting');
    case 'cancong': return t('rt.set.srcCancong');
    default: return t('rt.set.srcNone');
  }
}

function renderSettings() {
  const s = settings || {};
  const d = drafts.get('__settings') || { serverUrl: s.serverUrl || '', workRoot: s.workRoot || '' };
  drafts.set('__settings', d);
  const srv = h('input', { type: 'text', value: d.serverUrl, placeholder: t('rt.set.serverPh'), 'data-testid': 'rt-set-server' });
  srv.addEventListener('input', () => { d.serverUrl = srv.value; });
  const root = h('input', { type: 'text', value: d.workRoot, placeholder: s.workRootDefault || '', 'data-testid': 'rt-set-root' });
  root.addEventListener('input', () => { d.workRoot = root.value; });
  const eff = s.effective || {};
  return h('div', { class: 'task', 'data-testid': 'rt-settings-page' },
    h('div', { class: 'head' }, h('span', { class: 'title' }, t('rt.bar.settings'))),
    h('section', { class: 'panel' }, h('h4', null, t('rt.set.server')), h('p', { class: 'muted small' }, t('rt.set.serverHelp')), srv,
      h('div', { class: 'small', 'data-testid': 'rt-set-effective' }, t('rt.set.effective', { origin: eff.origin || '—', src: settingsSource(eff.source) })),
      d.test ? h('div', { class: 'small ' + (d.test.ok ? 'okc' : 'errc'), 'data-testid': 'rt-set-test-result' },
        d.test.ok ? t('rt.set.testOk', { origin: d.test.origin, v: d.test.version || '?' }) : errText(d.test.code)) : null,
      h('div', { class: 'ops' }, h('button', { type: 'button', 'data-testid': 'rt-set-test', onclick: () => testServer(d) }, t('rt.set.test')))),
    h('section', { class: 'panel' }, h('h4', null, t('rt.set.root')), h('p', { class: 'muted small' }, t('rt.set.rootHelp')), root,
      h('div', { class: 'small', 'data-testid': 'rt-set-root-effective' }, t('rt.set.rootEffective', { dir: s.workRootEffective || '' }))),
    h('div', { class: 'ops' },
      h('button', { type: 'button', class: 'primary', 'data-testid': 'rt-set-save', onclick: () => saveSettings(d) }, t('rt.set.save')),
      h('button', { type: 'button', onclick: () => { drafts.delete('__settings'); mode = 'task'; render(); } }, t('rt.common.close'))));
}

function render() {
  if (!S) return;
  $('me').textContent = S.me ? t('rt.bar.me', { who: S.me.display }) : '';
  const srv = $('server');
  srv.textContent = S.online === false ? t('rt.bar.offline', { err: errText(S.error) }) : (S.online ? t('rt.bar.online') : t('rt.bar.connecting'));
  srv.className = 'pill ' + (S.online === false ? 'err' : (S.online ? 'ok' : ''));
  $('consent').hidden = !!S.consent;
  // 选中项：导航来的 / 上次选的仍在 ⇒ 保持；否则选第一个待处理的
  const all = groups().flatMap((g) => g[1]);
  if (!all.some((x) => keyOf(x) === sel)) sel = all.length ? keyOf(all[0]) : null;
  renderList();
  const detail = $('detail');
  detail.textContent = '';
  if (mode === 'settings') detail.append(renderSettings());
  else {
    const task = all.find((x) => keyOf(x) === sel);
    detail.append(task ? renderTask(task) : h('p', { class: 'muted' }, t('rt.pick')));
  }
}

let pollTimer = null;
async function load(refresh) {
  const j = await api(refresh ? 'api/refresh' : 'api/state', refresh ? {} : undefined);
  if (j.ok) S = j;
  render();
  // 选中任务在跑：5 s 刷新运行面板；否则 15 s
  clearTimeout(pollTimer);
  const cur = S && S.tasks.find((x) => keyOf(x) === sel);
  const fast = cur && cur.local && cur.local.state === 'running';
  schedule(fast ? 5000 : 15000);
}
function schedule(ms) {
  pollTimer = setTimeout(() => { if (document.hidden) schedule(ms); else load(false); }, ms);
}

async function guard(fn, okText) {
  say(t('rt.common.working'), 'ok');
  document.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    const r = await fn();
    if (r && r.ok === false) { say(errText(r.code) + (r.claimedHost ? ' (' + r.claimedHost + ')' : '') + (r.reason ? ' · ' + r.reason : ''), 'err'); return null; }
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
  // 本轮没起任务：只预选本人这一步最近一轮的 run；一个都没有才让向导按目录给全部（F8）
  const rid = l.runId || task.ownRunId;
  const s = await bridge.share({ cwd: l.cwd, runIds: rid ? [rid] : undefined });
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
    const rid = l.runId || task.ownRunId;
    s = await bridge.share({ cwd: l.cwd, runIds: rid ? [rid] : undefined });
    if (!s || !s.ok) { say(t('rt.deliver.cancelled'), 'err'); return; }
  }
  const r = await guard(() => api(`api/tasks/${task.flowId}/${task.stepKey}/rework`, Object.assign({ targetKey, reason },
    s ? { shareId: s.shareId, picked: s.picked, excluded: s.excluded } : {})), t('rt.rework.done'));
  if (r) { drafts.delete(keyOf(task)); render(); }
}

async function openSettings() {
  mode = 'settings';
  drafts.delete('__settings');
  const r = await api('api/settings');
  settings = r && r.ok ? r : null;
  render();
}

async function saveSettings(d) {
  const r = await guard(() => api('api/settings', { serverUrl: d.serverUrl, workRoot: d.workRoot }, 'PUT'), t('rt.set.saved'));
  if (r) { settings = r; drafts.set('__settings', { serverUrl: r.serverUrl || '', workRoot: r.workRoot || '' }); render(); }
}

async function testServer(d) {
  const r = await api('api/settings/test', { serverUrl: d.serverUrl });
  d.test = r && r.ok ? { ok: true, origin: r.origin, version: r.version } : { ok: false, code: (r && r.code) || '?' };
  render();
}

bridge.onInit(async (info) => {
  await initI18n(info.lang);
  document.title = t('rt.title');
  $('title').textContent = t('rt.title');
  $('refresh').textContent = t('rt.bar.refresh');
  $('settings-btn').textContent = t('rt.bar.settings');
  $('consent-text').textContent = t('rt.consent.text');
  $('consent-ok').textContent = t('rt.consent.ok');
  $('refresh').addEventListener('click', () => load(true));
  $('settings-btn').addEventListener('click', () => { if (mode === 'settings') { mode = 'task'; render(); } else openSettings(); });
  $('consent-ok').addEventListener('click', () => guard(() => api('api/consent', {})));
  await load(false);
});
bridge.onNavigate((route) => {
  const m = /^task\/([^/]+)\/([^/]+)$/.exec(route || '');
  if (m) { sel = m[1] + ':' + m[2]; mode = 'task'; }
  load(true);
});

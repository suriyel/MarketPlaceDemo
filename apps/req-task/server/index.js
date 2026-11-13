'use strict';
// 需求任务 —— 需求研发看板的个人端（TechDemos docs/REQ-FLOW-DESIGN.md §10）。
//   轮询自进化服务的中转站拿「分派给我的步骤」→ 接收（材料导入 + 预填任务）→ 跑完经分享向导交付 / 打回。
// 自进化服务地址：设置里填了就用它，否则用蚕丛自己推导出的（/me 的 evolveOrigin）。
const os = require('os');
const path = require('path');
const express = require('express');
const sdk = require('@cancong/app-sdk');
const { createCore } = require('./core');
const { createEvolveClient } = require('./evolve-client');

sdk.config.schema({
  serverUrl: { type: 'string', label: { zh: '自进化服务地址（留空 = 跟随蚕丛）', en: 'Self-evolution server (empty = follow cancong)' }, default: '' },
  workRoot: { type: 'string', label: { zh: '工作目录根（留空 = ~/req-tasks）', en: 'Working directory root (empty = ~/req-tasks)' }, default: '' },
});

let me = null;
const identity = async () => (me = await sdk.platform.me());
const origin = () => String(sdk.config.get('serverUrl') || '').trim() || (me && me.evolveOrigin) || null;

const E = createEvolveClient({ origin, dataDir: sdk.env.dataDir, identity });
const tracker = sdk.runs.tracker('req');
const core = createCore({ P: sdk.platform, E, db: sdk.store.sqlite({ name: 'app' }), runs: tracker, lang: sdk.env.lang,
  dataDir: sdk.env.dataDir, dataRoot: process.env.CANCONG_DATA_ROOT || null, cfg: { workRoot: () => sdk.config.get('workRoot') },
  log: (m) => console.log(m) });
tracker.onSettled((key, outcome, meta) => core.onRunSettled(key, outcome, meta));
// 本步运行进度（§17.4）：节点切换 / 等回答 / 恢复 / 结束都由平台推事件，界面关着也照记照报
for (const type of ['run.started', 'run.node', 'run.waiting_user', 'run.resumed', 'run.finished']) sdk.on(type, (e) => core.onRunEvent(e));

const app = express();
app.use(express.json());
const api = express.Router();
const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (e) {
    const code = e.code || 'internal_error';
    res.status(e.status && e.status >= 400 ? e.status : 400).json({ ok: false, code, claimedHost: e.claimedHost || undefined, reason: e.reason || undefined });
  }
};
api.get('/state', wrap(async () => Object.assign({ ok: true }, core.view())));
api.post('/refresh', wrap(async () => Object.assign({ ok: true }, await core.poll())));
api.post('/consent', wrap(async () => core.consent()));

// ---- 设置页（§17.5，应用自绘）：写接口只认本应用界面的令牌（应用代理不验令牌，本机别的进程 / 会话不能改服务地址把交付包导走）----
const uiOnly = (req) => {
  const tok = process.env.CANCONG_APP_TOKEN;
  const h = String(req.headers.authorization || '');
  if (!tok || h !== 'Bearer ' + tok) throw Object.assign(new Error('ui_only'), { code: 'ui_only', status: 403 });
};
const settingsView = () => {
  const own = String(sdk.config.get('serverUrl') || '').trim();
  return { ok: true, serverUrl: own, workRoot: String(sdk.config.get('workRoot') || ''), workRootEffective: core.workRoot(), workRootDefault: core.defaultRoot(),
    effective: { origin: origin(), source: own ? 'setting' : (me && me.evolveOrigin ? 'cancong' : null) } };
};
api.get('/settings', wrap(async () => { await identity().catch(() => null); return settingsView(); }));
api.put('/settings', wrap(async (req) => {
  uiOnly(req);
  const b = req.body || {};
  const patch = {};
  if (b.serverUrl !== undefined) {
    const u = String(b.serverUrl || '').trim();
    if (u && !/^https?:\/\/[^\s/]+/i.test(u)) throw Object.assign(new Error('bad_url'), { code: 'bad_url' });
    patch.serverUrl = u || null;
  }
  if (b.workRoot !== undefined) {
    const w = String(b.workRoot || '').trim();
    if (w) {
      const abs = path.resolve(w.replace(/^~(?=[\\/]|$)/, () => os.homedir()));
      const bad = core.checkDir(abs);
      if (bad) throw Object.assign(new Error(bad), { code: bad, reason: abs });
      patch.workRoot = abs;
    } else patch.workRoot = null;
  }
  sdk.config.set(patch);
  return settingsView();
}));
api.post('/settings/test', wrap(async (req) => {
  uiOnly(req);
  const u = String((req.body || {}).serverUrl || '').trim();
  const m = await E.meta(u || undefined);
  return { ok: true, origin: u || origin(), version: m.version };
}));
api.post('/tasks/:flowId/:stepKey/receive', wrap((req) => core.receive(req.params.flowId, req.params.stepKey, (req.body || {}).cwd)));
api.post('/tasks/:flowId/:stepKey/retry-workflow', wrap((req) => core.retryWorkflow(req.params.flowId, req.params.stepKey)));
api.post('/tasks/:flowId/:stepKey/start', wrap((req) => core.startRun(req.params.flowId, req.params.stepKey, (req.body || {}).prompt, (req.body || {}).prefill)));
api.post('/tasks/:flowId/:stepKey/deliver', wrap((req) => core.deliver(req.params.flowId, req.params.stepKey, req.body || {})));
api.post('/tasks/:flowId/:stepKey/rework', wrap((req) => core.rework(req.params.flowId, req.params.stepKey, req.body || {})));

app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'ui')));
app.use(sdk.http.errorHandler());

// 启动对账：平台就绪后开始轮询（待办卡 / 角标随进程清空，首轮轮询会重推）
sdk.onReconcile(async () => { core.start(); });
sdk.onShutdown(() => core.stop());

sdk.attach(app);

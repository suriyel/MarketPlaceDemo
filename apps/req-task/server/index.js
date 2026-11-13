'use strict';
// 需求任务 —— 需求研发看板的个人端（TechDemos docs/REQ-FLOW-DESIGN.md §10）。
//   轮询自进化服务的中转站拿「分派给我的步骤」→ 接收（材料导入 + 预填任务）→ 跑完经分享向导交付 / 打回。
// 自进化服务地址：设置里填了就用它，否则用蚕丛自己推导出的（/me 的 evolveOrigin）。
const path = require('path');
const express = require('express');
const sdk = require('@cancong/app-sdk');
const { createCore } = require('./core');
const { createEvolveClient } = require('./evolve-client');

sdk.config.schema({
  serverUrl: { type: 'string', label: { zh: '自进化服务地址（留空 = 跟随蚕丛）', en: 'Self-evolution server (empty = follow cancong)' }, default: '' },
});

let me = null;
const identity = async () => (me = await sdk.platform.me());
const origin = () => String(sdk.config.get('serverUrl') || '').trim() || (me && me.evolveOrigin) || null;

const E = createEvolveClient({ origin, dataDir: sdk.env.dataDir, identity });
const tracker = sdk.runs.tracker('req');
const core = createCore({ P: sdk.platform, E, db: sdk.store.sqlite({ name: 'app' }), runs: tracker, lang: sdk.env.lang,
  dataDir: sdk.env.dataDir, log: (m) => console.log(m) });
tracker.onSettled((key, outcome) => core.onRunSettled(key, outcome));

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

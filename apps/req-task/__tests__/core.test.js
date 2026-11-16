'use strict';
// 需求任务核心（server/core.js）：轮询通知 / 接收（材料 + 导入 + 预填）/ 启动纠偏 / 交付 / 打回 / 工作流自动安装（§16.6）。依赖全部桩。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { DatabaseSync } = require('node:sqlite');

const { createCore } = require('../server/core');

function setup(t, over) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-core-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const db = new DatabaseSync(':memory:');
  for (const m of ['001-init.sql', '002-wf.sql', '003-progress.sql']) db.exec(fs.readFileSync(path.join(__dirname, '..', 'server', 'migrations', m), 'utf8'));
  const calls = { notify: [], claim: [], download: [], importShare: [], deliver: [], put: [], start: [], ack: [], ensure: [], wf: [], progress: [] };
  const task = { flowId: '0123456789abcdef', reqId: 'REQ0000003', reqTitle: '告警合并', flowStatus: 'running', templateId: 'default', templateName: 'T',
    stepKey: 'dev', stepName: '开发', stepDesc: '按设计实现', blueprintId: 'req-task-free-run', ord: 1, status: 'ready', round: 1,
    claimedByMe: false, prev: { key: 'design', name: '设计', owner: 'a00000001' }, steps: [{ key: 'design', name: '设计' }, { key: 'dev', name: '开发' }], lastRework: null };
  const tasks = { list: [task], nudges: [], market: over && over.market !== undefined ? over.market : null };
  const P = {
    me: async () => ({ installId: 'i1', uid: 'b00000002', user: 'bob', host: 'PC-B', evolveOrigin: 'http://evo' }),
    notify: async (n) => { calls.notify.push(n); const e = over && over.notifyFail && over.notifyFail(n); if (e) throw e; return { ok: true }; },
    listBlueprints: async () => [{ id: 'req-task-free-run' }].concat((over && over.localBps) || []),
    importShare: async (zip, cwd, o) => { calls.importShare.push({ zip, cwd, baseline: o && o.baseline }); if (zip.includes('self')) { const e = new Error('x'); e.code = 'cwd_is_source'; throw e; } return { jobId: 'j1' }; },
    shareJob: async () => ({ phase: 'done', result: { deliverables: (over && over.imported) || {} } }),
    sharePackage: async () => Object.assign(Readable.from([Buffer.from('zipdata')]), { headers: { 'content-length': '7' } }),
    humanEdits: async () => ({ ok: true, files: [{ path: 'a.md', status: 'M' }], truncated: false }),
    getBlueprint: async () => ({ id: 'req-task-free-run', startNode: 'plan', nodes: [{ id: 'impl', title: '实现' }, { id: 'plan', title: '规划' }],
      edges: [{ from: 'plan', to: 'impl' }] }),
    getRun: async () => (over && over.run) || { status: 'running', node: 'plan', asks: 0 },
    liveSessions: async () => (over && over.live != null ? over.live : 1),
  };
  if (over && over.extendP) over.extendP(P, calls);   // 个别用例补平台能力（节点）
  // 新蚕丛才有 ensureBlueprintWait（over.ensure：结果或抛错的函数；over.oldCancong：没有这个能力）
  if (!(over && over.oldCancong)) {
    P.ensureBlueprintWait = async (b) => { calls.ensure.push(b); return over && over.ensure ? over.ensure(b) : { state: 'installed', id: b.id, version: '1.2.0', localModified: false }; };
  }
  const E = {
    tasks: async () => { if (tasks.fail) throw Object.assign(new Error('x'), { code: 'unreachable' }); return { tasks: tasks.list.map((x) => Object.assign({}, x)), nudges: tasks.nudges, market: tasks.market }; },   // 副本：像真服务器一样，缓存不会被桩偷偷改
    claim: async (f, k, cwd) => { calls.claim.push(cwd); task.status = 'active'; task.claimedByMe = true; return { ok: true }; },
    inputs: async () => ({ docs: [{ name: '需求说明.md', url: '/v1/req/client/blob/d1' }],
      deliveries: [{ deliveryId: 'dl1', url: '/v1/req/client/blob/p1' }, { deliveryId: 'self1', url: '/v1/req/client/blob/p2' }],
      rework: over && over.rework ? over.rework : null }),
    download: async (url, file) => { calls.download.push({ url, file }); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'x'); return file; },
    deliver: async (f, k, b) => { calls.deliver.push(b); return { deliveryId: 'D1', applied: false }; },
    putPackage: async (id, s, bytes) => { calls.put.push({ id, bytes }); return { next: 'test' }; },
    ackNudge: async (id) => { calls.ack.push(id); },
    workflowState: async (f, k, b) => { calls.wf.push({ f, k, b }); return { ok: true }; },
    progress: async (f, k, b) => { calls.progress.push({ f, k, b }); if (over && over.progressFail) throw over.progressFail; return { ok: true }; },
  };
  const runs = { start: async (key, o) => { calls.start.push({ key, o }); return { runId: 'run-1', cwd: o.cwd }; } };
  const core = createCore({ P, E, db, runs, lang: 'zh', dataDir: dir, reportDebounceMs: 0, platform: over && over.platform,
    dataRoot: over && over.dataRoot, now: over && over.now, log: over && over.log, cfg: { workRoot: () => (over && over.workRoot) || '' } });
  t.after(() => core.stop());
  return { core, calls, task, tasks, dir, db };
}

test('轮询：新任务推待办卡（首次带 IM）+ 角标；同进程不重复；催办推后确认', async (t) => {
  const { core, calls, tasks } = setup(t);
  let v = await core.poll();
  assert.strictEqual(v.online, true);
  const cards = calls.notify.filter((n) => n.kind === 'attention');
  assert.strictEqual(cards.length, 1);
  assert.strictEqual(cards[0].im, true);
  assert.match(cards[0].text, /REQ0000003 开发/);
  assert.deepStrictEqual(calls.notify.find((n) => n.kind === 'badge'), { kind: 'badge', count: 1 });
  await core.poll();
  assert.strictEqual(calls.notify.filter((n) => n.kind === 'attention').length, 1, '同进程不重复推');
  tasks.nudges = [{ id: 7, flowId: tasks.list[0].flowId, stepKey: 'dev', byUser: 'admin' }];
  await core.poll();
  assert.ok(calls.notify.some((n) => n.key === 'nudge:7' && n.im === true));
  assert.deepStrictEqual(calls.ack, [7]);
});

test('待办卡：平台暂时不可用（5xx / 连不上）下一轮重推，4xx 不重推；日志只记转折（拉到任务 / 恢复）', async (t) => {
  let fail = { status: 503, code: 'platform_unavailable' };
  const logs = [];
  const { core, calls, tasks, db } = setup(t, { notifyFail: (n) => (n.kind === 'attention' ? fail : null), log: (m) => logs.push(m) });
  const cards = () => calls.notify.filter((n) => n.kind === 'attention').length;
  await core.poll();
  assert.strictEqual(cards(), 1);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM notified').get().n, 0, '没推成不记已推');
  fail = null;
  await core.poll();
  assert.strictEqual(cards(), 2, '下一轮重推（不用等应用重启）');
  assert.strictEqual(calls.notify.filter((n) => n.kind === 'attention')[1].im, true, '真正第一次送达才带 IM');
  await core.poll();
  assert.strictEqual(cards(), 2, '推成后同进程不再推');
  tasks.list.push(Object.assign({}, tasks.list[0], { flowId: 'fedcba9876543210', reqId: 'REQ0000004' }));
  fail = { status: 400, code: 'bad_request' };
  await core.poll(); await core.poll();
  assert.strictEqual(cards(), 3, '4xx：推不进去的内容，不反复重推');
  assert.strictEqual(logs.filter((m) => /拉到任务 REQ0000003/.test(m)).length, 1, '同一状态只记一次');
  assert.ok(logs.some((m) => /拉到任务 REQ0000004 · 开发 · 第 1 轮（ready）/.test(m)));
  tasks.fail = true; await core.poll(); tasks.fail = false; await core.poll();
  assert.ok(logs.some((m) => /轮询恢复（此前连续失败 1 次）/.test(m)));
});

test('轮询失败：抖动两次仍算在线，连续第 3 次判离线；恢复后回到在线', async (t) => {
  const { core, tasks } = setup(t);
  assert.strictEqual((await core.poll()).online, true);
  tasks.fail = true;
  assert.strictEqual((await core.poll()).online, true);
  assert.strictEqual((await core.poll()).online, true);
  const v = await core.poll();
  assert.strictEqual(v.online, false);
  assert.strictEqual(v.error, 'unreachable');
  tasks.fail = false;
  assert.strictEqual((await core.poll()).online, true);
});

test('接收：须先同意；独占 → 需求文档落 .req/ → 逐包导入（同目录自源跳过）→ 预填 + 台账', async (t) => {
  const { core, calls, dir } = setup(t, { rework: { reason: '缺接口', fromName: '测试', package: { deliveryId: 'rw1', url: '/v1/req/client/blob/rw', bytes: 7 } } });
  await core.poll();
  assert.ok(path.isAbsolute(core.view().workRoot), '首次接收的默认根也是绝对路径');
  const cwd = path.join(dir, 'w', 'REQ0000003');
  await assert.rejects(core.receive('0123456789abcdef', 'dev', cwd), /consent_required/);
  core.consent();
  const r = await core.receive('0123456789abcdef', 'dev', cwd);
  assert.deepStrictEqual(calls.claim, [cwd]);
  assert.ok(fs.existsSync(path.join(cwd, '.req', 'dev-r1', 'docs', '需求说明.md')));
  assert.strictEqual(calls.importShare.length, 3, '上游两包 + 打回附带的包');
  assert.ok(calls.importShare.every((x) => x.cwd === cwd && x.zip.startsWith(path.join(dir, 'inbox'))));
  assert.ok(!fs.existsSync(path.join(dir, 'inbox', 'dl1.zip')), '导入后删包');
  const rw = JSON.parse(fs.readFileSync(path.join(cwd, '.req', 'dev-r1', 'rework.json'), 'utf8'));
  assert.strictEqual(rw.reason, '缺接口');
  assert.deepStrictEqual([rw.package.deliveryId, 'url' in rw.package], ['rw1', false], '签名下载地址不落进工作目录');
  assert.match(r.prefill, /REQ0000003/);
  assert.match(r.prefill, /之前各步的交付物已导入/);
  assert.match(r.prefill, /缺接口/);
  assert.strictEqual(r.blueprintMissing, false);
  const v = core.view();
  assert.strictEqual(v.workRoot, path.join(dir, 'w'), '没设根 ⇒ 沿用上次接收目录的上级');
  assert.strictEqual(v.tasks[0].local.state, 'received');
  assert.strictEqual(v.tasks[0].status, 'active', '接收后立刻刷新：不等下一轮轮询');
  assert.strictEqual(v.tasks[0].claimedByMe, true);
});

test('启动：接收后流程被暂停 / 取消 ⇒ 残留的确认框点了也不起任务（按服务器当下状态判）', async (t) => {
  const { core, calls, dir, task } = setup(t);
  await core.poll(); core.consent();
  const r = await core.receive('0123456789abcdef', 'dev', path.join(dir, 'wp'));
  task.flowStatus = 'paused';
  await assert.rejects(core.startRun('0123456789abcdef', 'dev', r.prefill), /flow_paused/);
  task.flowStatus = 'cancelled';
  await assert.rejects(core.startRun('0123456789abcdef', 'dev', r.prefill), /flow_ended/);
  assert.strictEqual(calls.start.length, 0);
  await core.onRunSettled('0123456789abcdef:dev:1', { kind: 'done' });   // 取消前就在跑的任务结束了
  assert.ok(!calls.notify.some((n) => String(n.key).startsWith('deliver:')), '流程已取消：不推「去交付」');
});

test('启动：带 reqTask 起交互任务；改过提示词记为启动纠偏；交付带 excluded / humanEdits / launch 两步上传', async (t) => {
  const { core, calls, dir } = setup(t);
  await core.poll(); core.consent();
  const cwd = path.join(dir, 'w2');
  const r = await core.receive('0123456789abcdef', 'dev', cwd);
  await core.startRun('0123456789abcdef', 'dev', r.prefill + '\n另外先跑一遍现有测试', undefined);
  const s = calls.start[0];
  assert.strictEqual(s.key, '0123456789abcdef:dev:1');
  assert.deepStrictEqual(s.o.owned.reqTask, { reqId: 'REQ0000003', flowId: '0123456789abcdef', stepKey: 'dev', stepName: '开发', round: 1, templateId: 'default' });
  assert.strictEqual(s.o.mode, 'interactive');
  await core.onRunSettled('0123456789abcdef:dev:1', { kind: 'done' });
  assert.ok(calls.notify.some((n) => n.key === 'deliver:0123456789abcdef:dev'));
  await assert.rejects(core.deliver('0123456789abcdef', 'dev', {}), /share_required/);
  const d = await core.deliver('0123456789abcdef', 'dev', { shareId: 's1', picked: { deliverables: ['a'] }, excluded: { deliverables: ['b'] }, scanHits: 0 });
  assert.strictEqual(d.next, 'test');
  const meta = calls.deliver[0].meta;
  assert.deepStrictEqual(meta.excluded, { deliverables: ['b'] });
  assert.deepStrictEqual(meta.humanEdits, { files: [{ path: 'a.md', status: 'M' }], truncated: false });
  assert.strictEqual(meta.launch.changed, true);
  assert.match(meta.launch.actual, /先跑一遍现有测试/);
  assert.deepStrictEqual(calls.put, [{ id: 'D1', bytes: 7 }]);
});

test('打回：必须有理由；不附带包 ⇒ hasPackage:false、不上传', async (t) => {
  const { core, calls, dir } = setup(t);
  await core.poll(); core.consent();
  await core.receive('0123456789abcdef', 'dev', path.join(dir, 'w3'));
  await assert.rejects(core.rework('0123456789abcdef', 'dev', { targetKey: 'design', reason: ' ' }), /reason_required/);
  await core.rework('0123456789abcdef', 'dev', { targetKey: 'design', reason: '设计漏了降级方案' });
  assert.deepStrictEqual(calls.deliver[0], { kind: 'rework', targetKey: 'design', reason: '设计漏了降级方案', hasPackage: false, meta: null });
  assert.strictEqual(calls.put.length, 0);
});

const MK = { name: 'Demo', url: 'https://github.com/acme/market.git', ref: 'main' };

test('★ 工作流（§16.6）：服务器下发市场 ⇒ 接收时 ensure 并上报；版本进 reqTask 与交付 meta', async (t) => {
  const { core, calls, dir, task } = setup(t, { market: MK });
  task.blueprintId = 'dev-flow';
  await core.poll(); core.consent();
  const r = await core.receive('0123456789abcdef', 'dev', path.join(dir, 'wm'));
  assert.deepStrictEqual(calls.ensure, [{ market: MK, id: 'dev-flow' }]);
  assert.deepStrictEqual(r.wf, { state: 'ready', id: 'dev-flow', version: '1.2.0', localModified: false });
  assert.strictEqual(r.blueprintMissing, false);
  assert.deepStrictEqual(calls.wf.map((x) => [x.k, x.b.state, x.b.version]), [['dev', 'ready', '1.2.0']]);
  assert.strictEqual(core.view().tasks[0].local.wf.state, 'ready', '台账带 wf，界面据此显示');
  await core.startRun('0123456789abcdef', 'dev', r.prefill);
  const rt = calls.start[0].o.owned.reqTask;
  assert.deepStrictEqual([rt.bpVersion, rt.bpLocalModified], ['1.2.0', false]);
  assert.strictEqual(require('../../../app-sdk/sdk/run-contract').validateStart(calls.start[0].o.owned ? { blueprintId: 'x', cwd: 'D:/w', mode: 'interactive', owned: calls.start[0].o.owned } : null), null, '平台校验认这两个键');
  await core.onRunSettled('0123456789abcdef:dev:1', { kind: 'done' });
  await core.deliver('0123456789abcdef', 'dev', { shareId: 's1' });
  assert.deepStrictEqual(calls.deliver[0].meta.workflow, { id: 'dev-flow', version: '1.2.0', localModified: false, state: 'ready' });
});

test('★ 工作流装不上：照常接收（材料在）、上报 failed、启动被拒；重试成功后能启动', async (t) => {
  let ok = false;
  const ensure = () => { if (ok) return { state: 'installed', id: 'dev-flow', version: '2.0.0', localModified: false };
    throw Object.assign(new Error('dns'), { code: 'market_fetch_failed' }); };
  const { core, calls, dir, task } = setup(t, { market: MK, ensure });
  task.blueprintId = 'dev-flow';
  await core.poll(); core.consent();
  const cwd = path.join(dir, 'wf');
  const r = await core.receive('0123456789abcdef', 'dev', cwd);
  assert.ok(fs.existsSync(path.join(cwd, '.req', 'dev-r1', 'docs', '需求说明.md')), '接收不回滚');
  assert.deepStrictEqual([r.wf.state, r.wf.code, r.blueprintMissing], ['failed', 'market_fetch_failed', true]);
  assert.strictEqual(calls.wf[0].b.state, 'failed');
  await assert.rejects(core.startRun('0123456789abcdef', 'dev', r.prefill), (e) => e.code === 'workflow_not_ready' && e.reason === 'market_fetch_failed');
  assert.strictEqual(calls.start.length, 0);
  ok = true;
  const again = await core.retryWorkflow('0123456789abcdef', 'dev');
  assert.strictEqual(again.wf.state, 'ready');
  await core.startRun('0123456789abcdef', 'dev', r.prefill);
  assert.strictEqual(calls.start[0].o.owned.reqTask.bpVersion, '2.0.0');
});

test('工作流：随包自由执行 / 服务器没下发市场 / 老蚕丛没有 ensure ⇒ 不 ensure，走旧的「本机缺工作流」提示', async (t) => {
  const a = setup(t, { market: MK });   // 任务默认绑 req-task-free-run
  await a.core.poll(); a.core.consent();
  const ra = await a.core.receive('0123456789abcdef', 'dev', path.join(a.dir, 'a'));
  assert.deepStrictEqual([a.calls.ensure.length, ra.wf, ra.blueprintMissing], [0, null, false]);
  const b = setup(t, { market: null });
  b.task.blueprintId = 'dev-flow';
  await b.core.poll(); b.core.consent();
  const rb = await b.core.receive('0123456789abcdef', 'dev', path.join(b.dir, 'b'));
  assert.deepStrictEqual([b.calls.ensure.length, rb.wf, rb.blueprintMissing], [0, null, true]);
  const c = setup(t, { market: MK, oldCancong: true });
  c.task.blueprintId = 'dev-flow';
  await c.core.poll(); c.core.consent();
  const rc = await c.core.receive('0123456789abcdef', 'dev', path.join(c.dir, 'c'));
  assert.deepStrictEqual([rc.wf, rc.blueprintMissing, c.calls.wf.length], [null, true, 0]);
  await c.core.startRun('0123456789abcdef', 'dev', rc.prefill);
  assert.ok(!('bpVersion' in c.calls.start[0].o.owned.reqTask), '老蚕丛不认的键不带');
});

test('工作流来源（§16 修订）：server = 服务器本机库 ⇒ 不走市场，按本机有没有判；没有 ⇒ failed not_on_client', async (t) => {
  const has = setup(t, { market: MK, localBps: [{ id: 'demand-spec-lite', version: '3.2.1' }] });
  has.task.blueprintId = 'demand-spec-lite'; has.task.blueprintSource = 'server';
  await has.core.poll(); has.core.consent();
  const r = await has.core.receive('0123456789abcdef', 'dev', path.join(has.dir, 's1'));
  assert.deepStrictEqual([has.calls.ensure.length, r.wf.state, r.wf.version], [0, 'ready', '3.2.1'], '本机有：不调市场');
  const miss = setup(t, { market: MK });
  miss.task.blueprintId = 'my-server-flow'; miss.task.blueprintSource = 'server';
  await miss.core.poll(); miss.core.consent();
  const r2 = await miss.core.receive('0123456789abcdef', 'dev', path.join(miss.dir, 's2'));
  assert.deepStrictEqual([miss.calls.ensure.length, r2.wf.state, r2.wf.code], [0, 'failed', 'not_on_client']);
  assert.strictEqual(miss.calls.wf[0].b.code, 'not_on_client', '上报看板');
  const mk = setup(t, { market: MK });
  mk.task.blueprintId = 'dev-flow'; mk.task.blueprintSource = 'market';
  await mk.core.poll(); mk.core.consent();
  await mk.core.receive('0123456789abcdef', 'dev', path.join(mk.dir, 's3'));
  assert.strictEqual(mk.calls.ensure.length, 1, 'market ⇒ 自动装');
});

test('B7：导入带上次的交付物指纹 baseline，并记下这次导入回来的新指纹', async (t) => {
  const { core, calls, dir } = setup(t, { imported: { 'design.md': 'h1' } });
  await core.poll(); core.consent();
  const cwd = path.join(dir, 'b7');
  await core.receive('0123456789abcdef', 'dev', cwd);
  assert.deepStrictEqual(calls.importShare[0].baseline, {}, '第一次没有 baseline');
  assert.deepStrictEqual(calls.importShare[1].baseline, { 'design.md': 'h1' }, '后一个包就带上前一个包落下的指纹');
});

test('R1 / F8：重起任务后旧 run 的迟到结局不覆盖新 run；本轮没起任务时给出本人最近一轮的 runId', async (t) => {
  const { core, calls, dir, task } = setup(t);
  await core.poll(); core.consent();
  const r = await core.receive('0123456789abcdef', 'dev', path.join(dir, 'r1'));
  await core.startRun('0123456789abcdef', 'dev', r.prefill);
  await core.onRunSettled('0123456789abcdef:dev:1', { kind: 'aborted' }, { runId: 'some-old-run' });
  assert.strictEqual(core.view().tasks[0].local.state, 'running', '旧 run 的结局被忽略');
  await core.onRunSettled('0123456789abcdef:dev:1', { kind: 'done' }, { runId: 'run-1' });
  assert.strictEqual(core.view().tasks[0].local.state, 'run_done');
  // 返工第 2 轮：本轮还没起任务 ⇒ ownRunId = 第 1 轮那个
  task.round = 2; task.status = 'active'; task.claimedByMe = true;
  await core.poll();
  const v = core.view().tasks[0];
  assert.deepStrictEqual([v.local, v.ownRunId], [null, 'run-1']);
  assert.ok(calls.start.length === 1);
});

const tick = () => new Promise((r) => setTimeout(r, 30));

test('★ 工作目录（§17.5）：留空 = <根>/<REQ>、相对路径按根解析；校验不过拒在独占之前', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-root-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const root = path.join(tmp, 'root');
  const a = setup(t, { workRoot: root });
  await a.core.poll(); a.core.consent();
  assert.strictEqual(a.core.view().tasks[0].defaultCwd, path.join(root, 'REQ0000003'));
  const r = await a.core.receive('0123456789abcdef', 'dev', '');
  assert.deepStrictEqual([r.cwd, a.calls.claim[0]], [path.join(root, 'REQ0000003'), path.join(root, 'REQ0000003')]);
  const b = setup(t, { workRoot: root });
  await b.core.poll(); b.core.consent();
  assert.strictEqual((await b.core.receive('0123456789abcdef', 'dev', 'sub/x')).cwd, path.join(root, 'sub', 'x'));

  const bad = async (over, input, code) => {
    const c = setup(t, over);
    await c.core.poll(); c.core.consent();
    await assert.rejects(c.core.receive('0123456789abcdef', 'dev', input), (e) => e.code === code);
    assert.strictEqual(c.calls.claim.length, 0, code + '：未独占');
  };
  await bad({ platform: 'win32' }, path.join(tmp, 'a&b'), 'cwd_illegal_chars');
  await bad({ dataRoot: tmp }, path.join(tmp, 'inside'), 'cwd_in_data_root');
  fs.writeFileSync(path.join(tmp, 'afile'), 'x');
  await bad({}, path.join(tmp, 'afile', 'sub'), 'cwd_not_writable');
  assert.strictEqual(a.core.checkDir(path.join(tmp, 'ok-dir')), null);
});

test('★ 运行进度（§17.4）：事件 → 走过 / 当前节点 / 等回答；去抖上报，首报带节点图，题面不上报', async (t) => {
  const run = { status: 'running', node: 'plan', asks: 0 };
  const { core, calls, dir } = setup(t, { run });
  await core.poll(); core.consent();
  const r = await core.receive('0123456789abcdef', 'dev', path.join(dir, 'p1'));
  await core.startRun('0123456789abcdef', 'dev', r.prefill);
  await tick();
  assert.deepStrictEqual(calls.progress[0].b.nodes, [{ id: 'plan', title: '规划' }, { id: 'impl', title: '实现' }], '按 startNode 沿边排序');
  assert.strictEqual(calls.progress[0].b.status, 'running');
  const ev = (type, data) => core.onRunEvent({ type, runId: 'run-1', at: '2026-11-12T08:00:00Z', data });
  await ev('run.node', { from: null, to: 'plan' });
  await ev('run.node', { from: 'plan', to: 'impl' });
  await ev('run.waiting_user', { askId: 'a1', summary: '用哪个库？' });
  await tick();
  const last = calls.progress[calls.progress.length - 1].b;
  assert.deepStrictEqual([last.status, last.node, last.visited, last.asks, last.nodes], ['waiting_user', 'impl', ['plan'], 1, undefined]);
  assert.strictEqual(last.summary, undefined, '题面不上报');
  const v = core.view().tasks[0];
  assert.deepStrictEqual([v.local.progress.summary, v.chain.map((n) => n.id)], ['用哪个库？', ['plan', 'impl']]);
  await core.onRunEvent({ type: 'run.node', runId: 'other-run', data: { to: 'x' } });
  Object.assign(run, { status: 'waiting_user', node: 'impl', asks: 1 });
  await core.reconcile();   // 对账与事件一致 ⇒ 不变
  assert.strictEqual(core.view().tasks[0].local.progress.status, 'waiting_user');
  await ev('run.finished', { outcome: { kind: 'done' } });
  await tick();
  assert.strictEqual(calls.progress[calls.progress.length - 1].b.status, 'done');
});

test('运行进度：老服务器没有进度端点（路由 404）⇒ 静默停报；会话没了 ⇒ 会话已断开（起跑宽限期内不判）', async (t) => {
  const old = Object.assign(new Error('http_404'), { status: 404, code: 'http_404' });
  let clock = new Date('2026-11-12T08:00:00Z');
  const { core, calls, dir } = setup(t, { progressFail: old, live: 0, run: { status: 'running', node: 'impl', asks: 0 }, now: () => clock });
  await core.poll(); core.consent();
  const r = await core.receive('0123456789abcdef', 'dev', path.join(dir, 'p2'));
  await core.startRun('0123456789abcdef', 'dev', r.prefill);
  await tick();
  await core.reconcile();
  assert.strictEqual(core.view().tasks[0].local.progress.status, 'running', '刚起跑的宽限期内不判断开');
  clock = new Date('2026-11-12T08:05:00Z');
  await core.reconcile();
  await tick();
  const p = core.view().tasks[0].local.progress;
  assert.deepStrictEqual([p.status, p.node], ['disconnected', 'impl']);
  assert.strictEqual(calls.progress.length, 1, '第一次 404 之后不再上报');
});


// ---- 运行位置选节点（TechDemos docs/NODE-TOPOLOGY-DISPATCH-DESIGN.md §5.12）----
const nodeP = (o) => (P, calls) => {
  calls.putFile = []; calls.pkg = []; calls.live = 0;
  P.nodes = async () => [{ id: 'n1', label: '开发机', up: true, sameVersion: true }, { id: 'n2', label: '旧机', up: true, sameVersion: false }, { id: 's-x', label: '共享一号', up: true, sameVersion: true, shared: true }];
  P.putFile = async (cwd, rel, data) => { if (o && o.putFail) throw Object.assign(new Error('x'), { code: 'bad_request' }); calls.putFile.push({ cwd, rel, text: Buffer.isBuffer(data) ? '<bytes ' + data.length + '>' : String(data) }); return { ok: true }; };
  const pkg = P.sharePackage;
  P.sharePackage = async (id, opt) => { calls.pkg.push({ id, opt }); return pkg(id); };
  const live = P.liveSessions;
  P.liveSessions = async (c) => { calls.live++; return live(c); };
};

test('★ 运行位置选节点：材料放到节点目录（先落标记再独占）、包导入到节点、无头下发、交付时从节点取包', async (t) => {
  const { core, calls, task } = setup(t, { extendP: nodeP(), live: 0, now: undefined });
  await core.poll();
  core.consent();
  assert.deepStrictEqual((await core.nodes()).map((n) => [n.id, n.ok, n.shared]), [['n1', true, false], ['n2', false, false], ['s-x', true, true]]);

  await assert.rejects(core.receive(task.flowId, 'dev', 'proj/REQ', 'n1'), { code: 'bad_cwd' }, '节点目录要绝对路径');
  await assert.rejects(core.receive(task.flowId, 'dev', '/home/u/REQ', 'n2'), { code: 'node_unavailable' }, '版本不同的节点不能选');
  assert.deepStrictEqual(calls.claim, [], '都拒在独占之前');

  const r = await core.receive(task.flowId, 'dev', '/home/u/req/REQ0000003', 'n1');
  const cwd = '@n1:/home/u/req/REQ0000003';
  assert.strictEqual(r.cwd, cwd);
  assert.deepStrictEqual(calls.claim, [cwd]);
  assert.deepStrictEqual(calls.putFile.map((x) => [x.cwd, x.rel]), [[cwd, '.req/dev-r1/received.json'], [cwd, '.req/dev-r1/docs/需求说明.md']]);
  assert.deepStrictEqual(calls.importShare.map((x) => [x.cwd, x.baseline]), [[cwd, {}], [cwd, {}]], '包由节点导入，同样带上次的指纹（指纹由节点算）');
  assert.ok(!fs.existsSync('/home/u/req/REQ0000003/.req'), '本机不落任何材料');
  assert.strictEqual((await core.nodes())[0].lastDir, '/home/u/req', '记住这台节点上次用的上级目录');
  assert.strictEqual(core.view().tasks[0].location, 'n1');

  await core.startRun(task.flowId, 'dev', '做吧', null);
  assert.deepStrictEqual([calls.start[0].o.cwd, calls.start[0].o.mode], [cwd, 'headless']);
  await core.reconcile();
  assert.strictEqual(calls.live, 0, '节点上的任务不拿本机活会话数判断开');
  assert.notStrictEqual((core.view().tasks[0].local.progress || {}).status, 'disconnected');

  await core.deliver(task.flowId, 'dev', { shareId: 'S1' });
  assert.deepStrictEqual(calls.pkg, [{ id: 'S1', opt: { cwd } }]);
  assert.deepStrictEqual(calls.put, [{ id: 'D1', bytes: 7 }]);
});

test('运行位置选节点：节点不收目录 ⇒ 不独占；本机接收不受影响（不带节点 ⇒ 老路径逐字不变）', async (t) => {
  const { core, calls, task, dir } = setup(t, { extendP: nodeP({ putFail: true }), workRoot: undefined });
  await core.poll();
  core.consent();
  await assert.rejects(core.receive(task.flowId, 'dev', '/root/x', 'n1'), { code: 'bad_request' });
  assert.deepStrictEqual(calls.claim, []);
  const local = path.join(dir, 'w');
  const r = await core.receive(task.flowId, 'dev', local);
  assert.strictEqual(r.cwd, local);
  assert.ok(fs.existsSync(path.join(local, '.req', 'dev-r1', 'docs', '需求说明.md')));
  await core.startRun(task.flowId, 'dev', 'p', null);
  assert.strictEqual(calls.start[0].o.mode, 'interactive');
  await core.deliver(task.flowId, 'dev', { shareId: 'S1' });
  assert.deepStrictEqual(calls.pkg, [{ id: 'S1', opt: undefined }]);
});

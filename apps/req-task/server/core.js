'use strict';
// core.js —— 需求任务的业务核心（TechDemos docs/REQ-FLOW-DESIGN.md §10）。依赖全注入，单测用桩驱动：
//   P   = 平台（sdk.platform：me / notify / listBlueprints / importShare / shareJob / sharePackage / humanEdits）
//   E   = 中转站客户端（evolve-client.js）
//   db  = 本地台账（store.sqlite）
//   runs = sdk.runs.tracker('req')
// 轮询 60 s、不重入、连续 3 次失败判离线（照 CodeHub watcher）。接收 = 独占 → 下载材料 → 导入 → 预填任务；
// 交付 = 分享向导（界面经桥）→ 人工修改差异 → 两步上传。打回同理（可附带当前产物）。

const fs = require('fs');
const path = require('path');

const POLL_MS = 60 * 1000;
const DOWN_AFTER = 3;
const JOB_WAIT_MS = 15 * 60 * 1000;

function createCore(d) {
  const { P, E, db, runs, lang } = d;
  const now = d.now || (() => new Date());
  const log = d.log || (() => {});
  const T = text(lang);
  const st = { me: null, tasks: [], nudges: [], online: null, fails: 0, error: null, lastPollAt: null, busy: false };
  let timer = null;
  const shownThisRun = new Set();   // 待办卡随应用进程清空 ⇒ 每次启动重推一遍；IM 只在第一次（落库）推

  // ---- 台账 ----
  const qStep = db.prepare('SELECT flow_id AS flowId, step_key AS stepKey, round, req_id AS reqId, cwd, run_id AS runId, state, launch FROM steps WHERE flow_id = ? AND step_key = ? AND round = ?');
  const qSteps = db.prepare('SELECT flow_id AS flowId, step_key AS stepKey, round, req_id AS reqId, cwd, run_id AS runId, state, launch FROM steps');
  const upStep = db.prepare(`INSERT INTO steps (flow_id, step_key, round, req_id, cwd, run_id, state, launch, updated_at)
    VALUES (@flowId, @stepKey, @round, @reqId, @cwd, @runId, @state, @launch, @at)
    ON CONFLICT(flow_id, step_key, round) DO UPDATE SET cwd = COALESCE(@cwd, cwd), run_id = COALESCE(@runId, run_id),
      state = @state, launch = COALESCE(@launch, launch), updated_at = @at`);
  const qNotified = db.prepare('SELECT 1 FROM notified WHERE k = ?');
  const addNotified = db.prepare('INSERT OR IGNORE INTO notified (k, at) VALUES (?, ?)');
  const kvGet = (k) => { const r = db.prepare('SELECT v FROM kv WHERE k = ?').get(k); return r ? r.v : null; };
  const kvSet = (k, v) => db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, String(v));
  const save = (s) => upStep.run({ flowId: s.flowId, stepKey: s.stepKey, round: s.round, reqId: s.reqId || null, cwd: s.cwd || null,
    runId: s.runId || null, state: s.state, launch: s.launch ? JSON.stringify(s.launch) : null, at: now().toISOString() });
  const keyOf = (t) => t.flowId + ':' + t.stepKey + ':' + t.round;
  const local = (t) => qStep.get(t.flowId, t.stepKey, t.round) || null;
  const taskOf = (flowId, stepKey) => st.tasks.find((x) => x.flowId === flowId && x.stepKey === stepKey) || null;
  const fail = (code, extra) => Object.assign(new Error(code), { code }, extra || {});

  // ---- 轮询 ----
  async function poll() {
    if (st.busy) return;   // 不重入
    st.busy = true;
    try {
      st.me = await P.me();
      const r = await E.tasks();
      st.tasks = r.tasks || []; st.nudges = r.nudges || [];
      st.fails = 0; st.online = true; st.error = null; st.lastPollAt = now().toISOString();
      await announce();
    } catch (e) {
      st.fails++;
      st.error = e.code || e.message;
      if (st.fails >= DOWN_AFTER || e.code === 'no_server') st.online = false;
      log('[req-task] 轮询失败（第 ' + st.fails + ' 次）：' + st.error);
    } finally { st.busy = false; }
    return view();
  }

  // 新任务推待办卡（+ IM）；催办推一次后确认；角标 = 待接收数
  async function announce() {
    const ready = st.tasks.filter((t) => t.status === 'ready' && t.flowStatus === 'running');
    for (const t of ready) {
      const k = keyOf(t);
      if (shownThisRun.has(k)) continue;
      const first = !qNotified.get(k);
      await P.notify({ kind: 'attention', key: 'task:' + k.replace(/[^A-Za-z0-9._:-]/g, '_'), route: 'task/' + t.flowId + '/' + t.stepKey,
        text: (t.round > 1 ? T.reworkReady : T.newTask)(t), im: first }).catch(() => {});
      shownThisRun.add(k);
      if (first) addNotified.run(k, now().toISOString());
    }
    for (const n of st.nudges) {
      const t = taskOf(n.flowId, n.stepKey);
      await P.notify({ kind: 'attention', key: 'nudge:' + n.id, route: 'task/' + n.flowId + '/' + n.stepKey,
        text: T.nudge(t || { reqId: n.flowId, stepName: n.stepKey }, n.byUser), im: true }).catch(() => {});
      await E.ackNudge(n.id).catch(() => {});
    }
    await P.notify({ kind: 'badge', count: ready.length }).catch(() => {});
  }

  function start() {
    if (timer) return;
    const loop = () => { timer = setTimeout(() => { poll().finally(loop); }, POLL_MS); if (timer.unref) timer.unref(); };
    poll().finally(loop);
  }
  function stop() { if (timer) clearTimeout(timer); timer = null; }

  function view() {
    const loc = new Map(qSteps.all().map((s) => [s.flowId + ':' + s.stepKey + ':' + s.round, s]));
    return {
      me: st.me ? { display: st.me.uid || (st.me.user + '@' + st.me.host), uid: st.me.uid, evolveOrigin: st.me.evolveOrigin } : null,
      online: st.online, error: st.error, lastPollAt: st.lastPollAt, consent: kvGet('consent') === '1', lastRoot: kvGet('lastRoot'),
      tasks: st.tasks.map((t) => Object.assign({}, t, { local: loc.get(keyOf(t)) || null })),
    };
  }

  // ---- 接收 ----
  async function waitJob(jobId) {
    const t0 = Date.now();
    for (;;) {
      const j = await P.shareJob(jobId);
      if (j.phase === 'done') return j.result || {};
      if (j.phase === 'failed' || j.phase === 'cancelled') throw fail(j.code || 'import_failed');
      if (Date.now() - t0 > JOB_WAIT_MS) throw fail('import_timeout');
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  async function importPkg(url, name, cwd) {
    const zip = path.join(d.dataDir, 'inbox', name + '.zip');
    await E.download(url, zip);
    try {
      const r = await P.importShare(zip, cwd);
      await waitJob(r.jobId);
      return { ok: true };
    } catch (e) {
      // 同一台机器、同一目录接自己上一步的包：导入器拒「目录就是来源」——材料本来就在，跳过即可
      if (e.code === 'cwd_is_source') return { ok: true, skipped: 'cwd_is_source' };
      throw e;
    } finally { try { fs.rmSync(zip, { force: true }); } catch (_) { /* 已删 */ } }
  }

  async function receive(flowId, stepKey, cwd) {
    if (kvGet('consent') !== '1') throw fail('consent_required');
    if (!path.isAbsolute(String(cwd || ''))) throw fail('bad_cwd');
    const t = taskOf(flowId, stepKey);
    if (!t) throw fail('task_not_found');
    const claimed = t.status === 'active' && t.claimedByMe;
    if (!claimed) await E.claim(flowId, stepKey, cwd);
    fs.mkdirSync(cwd, { recursive: true });
    const inp = await E.inputs(flowId, stepKey);
    const reqDir = path.join(cwd, '.req', stepKey + '-r' + t.round);
    for (const doc of inp.docs || []) await E.download(doc.url, path.join(reqDir, 'docs', doc.name));
    for (const p of inp.deliveries || []) await importPkg(p.url, p.deliveryId, cwd);
    if (inp.rework) {
      fs.mkdirSync(reqDir, { recursive: true });
      fs.writeFileSync(path.join(reqDir, 'rework.json'), JSON.stringify(inp.rework, null, 2));
      if (inp.rework.package) await importPkg(inp.rework.package.url, inp.rework.package.deliveryId, cwd);
    }
    const prefill = prefillOf(t, inp);
    save({ flowId, stepKey, round: t.round, reqId: t.reqId, cwd, state: 'received', launch: { prefill } });
    kvSet('lastRoot', path.dirname(cwd));
    await poll();   // 独占之后立刻刷新任务列表：否则缓存里仍是「待接收」，界面要等下一轮（60 s）才出交付 / 启动按钮
    const bps = await P.listBlueprints().catch(() => []);
    return { ok: true, cwd, prefill, blueprintId: t.blueprintId,
      blueprintMissing: !bps.some((b) => b.id === t.blueprintId) };
  }

  function prefillOf(t, inp) {
    const lines = [T.prefillHead(t)];
    if (t.stepDesc) lines.push('', T.prefillDesc(t.stepDesc));
    lines.push('', T.prefillMaterials('.req/' + t.stepKey + '-r' + t.round));
    if (inp.rework) lines.push('', T.prefillRework(inp.rework.fromName || '', inp.rework.reason || ''));
    return lines.join('\n');
  }

  // ---- 启动（确认框里改过的提示词 = 启动纠偏）----
  async function startRun(flowId, stepKey, prompt, prefill) {
    const t = taskOf(flowId, stepKey);
    const l = t && local(t);
    if (!t || !l || !l.cwd) throw fail('not_received');
    const pre = prefill != null ? String(prefill) : ((l.launch && JSON.parse(l.launch).prefill) || '');
    const actual = String(prompt || '');
    const launch = { prefill: pre, actual, changed: actual !== pre };
    const r = await runs.start(keyOf(t), { blueprintId: t.blueprintId, cwd: l.cwd, mode: 'interactive', prompt: actual,
      owned: { label: t.reqId + ' · ' + t.stepName, route: 'task/' + flowId + '/' + stepKey,
        reqTask: { reqId: t.reqId, flowId, stepKey, stepName: String(t.stepName || '').slice(0, 64), round: t.round, templateId: t.templateId || '' } } });
    save({ flowId, stepKey, round: t.round, cwd: r.cwd || l.cwd, runId: r.runId, state: 'running', launch });
    return { ok: true, runId: r.runId, cwd: r.cwd || l.cwd };
  }

  /** runs.tracker 回调：run 结束 ⇒ 待办卡「去交付」 */
  async function onRunSettled(key, outcome) {
    const [flowId, stepKey, round] = String(key).split(':');
    const l = qStep.get(flowId, stepKey, Number(round));
    if (!l || l.state === 'delivered') return;
    save({ flowId, stepKey, round: Number(round), state: 'run_done' });
    await P.notify({ kind: 'attention', key: 'deliver:' + flowId + ':' + stepKey, route: 'task/' + flowId + '/' + stepKey,
      text: T.goDeliver(l.reqId || flowId, outcome && outcome.kind), im: false }).catch(() => {});
  }

  // ---- 交付 / 打回（包已由界面经桥在分享向导里生成 = shareId）----
  async function uploadShare(deliveryId, shareId) {
    const s = await P.sharePackage(shareId);
    const bytes = Number(s.headers && s.headers['content-length']);
    if (!Number.isFinite(bytes) || bytes <= 0) { if (s.destroy) s.destroy(); throw fail('package_unreadable'); }
    return E.putPackage(deliveryId, s, bytes);
  }

  async function deliver(flowId, stepKey, b) {
    const t = taskOf(flowId, stepKey);
    const l = t && local(t);
    if (!t || !t.claimedByMe) throw fail('not_claimer');
    if (!b || !b.shareId) throw fail('share_required');
    let humanEdits = null;
    if (l && l.runId && l.cwd) {
      const h = await P.humanEdits(l.runId, l.cwd).catch((e) => ({ files: null, reason: e.code || 'error' }));
      humanEdits = h.files ? { files: h.files, truncated: !!h.truncated } : { files: [], reason: h.reason || 'no_tracking' };
    }
    const meta = { picked: b.picked || null, excluded: b.excluded || null, scanHits: b.scanHits == null ? null : b.scanHits,
      humanEdits, launch: l && l.launch ? JSON.parse(l.launch) : null };
    const r = await E.deliver(flowId, stepKey, { kind: 'deliver', meta });
    const up = await uploadShare(r.deliveryId, b.shareId);
    save({ flowId, stepKey, round: t.round, state: 'delivered' });
    await P.notify({ kind: 'attention-clear', key: 'deliver:' + flowId + ':' + stepKey }).catch(() => {});
    poll().catch(() => {});
    return { ok: true, next: up.next || null, done: !!up.done };
  }

  async function rework(flowId, stepKey, b) {
    const t = taskOf(flowId, stepKey);
    if (!t || !t.claimedByMe) throw fail('not_claimer');
    if (!b || !String(b.reason || '').trim()) throw fail('reason_required');
    const r = await E.deliver(flowId, stepKey, { kind: 'rework', targetKey: b.targetKey, reason: b.reason, hasPackage: !!b.shareId,
      meta: b.shareId ? { picked: b.picked || null, excluded: b.excluded || null } : null });
    if (b.shareId) await uploadShare(r.deliveryId, b.shareId);
    save({ flowId, stepKey, round: t.round, state: 'reworked' });
    poll().catch(() => {});
    return { ok: true };
  }

  function consent() { kvSet('consent', '1'); return { ok: true }; }

  return { poll, start, stop, view, receive, startRun, onRunSettled, deliver, rework, consent, _state: st };
}

function text(lang) {
  const en = lang === 'en';
  return {
    newTask: (t) => (en ? `New task: ${t.reqId} ${t.stepName}` : `新任务：${t.reqId} ${t.stepName}`) + (t.reqTitle ? ' · ' + t.reqTitle : ''),
    reworkReady: (t) => (en ? `Sent back for rework: ${t.reqId} ${t.stepName} (round ${t.round})` : `被打回返工：${t.reqId} ${t.stepName}（第 ${t.round} 轮）`),
    nudge: (t, by) => (en ? `Reminder from ${by || 'admin'}: ${t.reqId} ${t.stepName}` : `${by || '管理员'} 催办：${t.reqId} ${t.stepName}`),
    goDeliver: (reqId, kind) => (en ? `${reqId}: the task ended (${kind || 'done'}) — review and deliver` : `${reqId}：任务已结束（${kind || 'done'}），去核对并交付`),
    prefillHead: (t) => (en ? `Requirement ${t.reqId} "${t.reqTitle || ''}" — step "${t.stepName}"${t.round > 1 ? ` (rework round ${t.round})` : ''}.`
      : `需求 ${t.reqId}「${t.reqTitle || ''}」——步骤「${t.stepName}」${t.round > 1 ? `（返工第 ${t.round} 轮）` : ''}。`),
    prefillDesc: (s) => (en ? `What this step should produce: ${s}` : `本步骤要做的：${s}`),
    prefillMaterials: (dir) => (en ? `Requirement documents are in ${dir}/docs; the previous steps' deliverables are already in the working directory.`
      : `需求文档在 ${dir}/docs；之前各步的交付物已导入工作目录。`),
    prefillRework: (from, reason) => (en ? `Sent back by ${from}. Reason: ${reason}` : `被「${from}」打回，理由：${reason}`),
  };
}

module.exports = { createCore, POLL_MS };

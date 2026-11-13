'use strict';
// evolve-client.js —— 对接自进化服务（需求研发中转站）的客户端接口 /v1/req/client/*（TechDemos docs/REQ-FLOW-DESIGN.md §6.2）。
// 实例令牌首用登记（TOFU）后存 data/secrets/req-token.json；之后每次带 Authorization: ReqInstall <installId>.<token>。
// 大文件（下载输入包 / 上传交付包）全程流式，内存常数。

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { pipeline } = require('stream/promises');

class EvolveError extends Error {
  constructor(status, code, extra) { super(code); this.status = status; this.code = code; Object.assign(this, extra || {}); }
}

/**
 * @param {{ origin: () => string|null, dataDir: string, identity: () => Promise<any> }} o
 */
function createEvolveClient(o) {
  const tokenFile = path.join(o.dataDir, 'secrets', 'req-token.json');
  let cached = null;   // { installId, token }

  const readToken = () => { try { return JSON.parse(fs.readFileSync(tokenFile, 'utf8')); } catch (_) { return null; } };
  const writeToken = (t) => { fs.mkdirSync(path.dirname(tokenFile), { recursive: true }); fs.writeFileSync(tokenFile, JSON.stringify(t)); };
  const base = () => { const b = o.origin(); if (!b) throw new EvolveError(0, 'no_server'); return b.replace(/\/+$/, ''); };

  async function json(method, p, body, auth) {
    let res;
    try {
      res = await fetch(base() + '/v1' + p, { method, headers: Object.assign({ accept: 'application/json' },
        body !== undefined ? { 'content-type': 'application/json' } : {}, auth ? { authorization: auth } : {}),
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    } catch (e) { if (e instanceof EvolveError) throw e; throw new EvolveError(0, 'unreachable', { detail: e && e.message }); }
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.ok === false) throw new EvolveError(res.status, (j && j.error) || 'http_' + res.status, j || {});
    return j.data !== undefined ? j.data : j;
  }

  /** 登记（若需要）→ Authorization 头 */
  async function authz() {
    const me = await o.identity();
    if (!cached) cached = readToken();
    if (cached && cached.installId === me.installId && cached.token) {
      const h = 'ReqInstall ' + cached.installId + '.' + cached.token;
      // 工号是启动后 30 s 才在后台取到的：首次登记早于它 ⇒ 当时按「用户名@主机名」登记了。一旦拿到工号就带令牌重登一次，
      // 服务端当场改挂到 uid:（不等 5 分钟一次的心跳同步），免得管理员这期间按旧身份指派而悬空。
      if (me.uid && cached.uid !== me.uid) {
        await json('POST', '/req/client/register', { installId: me.installId, uid: me.uid, user: me.user, host: me.host, appVersion: me.appVersion }, h);
        cached.uid = me.uid;
        writeToken(cached);
      }
      return h;
    }
    const r = await json('POST', '/req/client/register', { installId: me.installId, uid: me.uid || null, user: me.user, host: me.host, appVersion: me.appVersion });
    if (!r.token) throw new EvolveError(409, 'already_registered');
    cached = { installId: me.installId, token: r.token, uid: me.uid || null };
    writeToken(cached);
    return 'ReqInstall ' + cached.installId + '.' + cached.token;
  }
  /** 令牌被管理员重置 ⇒ 401：丢掉本地令牌重登一次 */
  async function call(method, p, body) {
    try { return await json(method, p, body, await authz()); } catch (e) {
      if (e.status !== 401) throw e;
      cached = null; try { fs.rmSync(tokenFile, { force: true }); } catch (_) { /* 已不在 */ }
      return json(method, p, body, await authz());
    }
  }

  const step = (flowId, key) => '/req/client/steps/' + encodeURIComponent(flowId) + '/' + encodeURIComponent(key);

  /** 签名链接下载到文件（流式） */
  async function download(urlPath, file) {
    const res = await fetch(base() + urlPath, { signal: AbortSignal.timeout(30 * 60 * 1000) });
    if (!res.ok || !res.body) throw new EvolveError(res.status, 'download_failed');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await pipeline(require('stream').Readable.fromWeb(res.body), fs.createWriteStream(file));
    return file;
  }

  /** 流式 PUT 交付包：stream 可读流，bytes 必须是确切长度（中转站按 Content-Length 校验） */
  async function putPackage(deliveryId, stream, bytes) {
    const u = new URL(base() + '/v1/req/client/deliveries/' + encodeURIComponent(deliveryId) + '/package');
    const auth = await authz();
    const lib = u.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = lib.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'PUT',
        headers: { authorization: auth, 'content-type': 'application/zip', 'content-length': String(bytes) } }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let j = null;
          try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { /* 非 JSON */ }
          if (res.statusCode >= 200 && res.statusCode < 300 && j && j.ok) resolve(j.data);
          else reject(new EvolveError(res.statusCode, (j && j.error) || 'upload_failed'));
        });
      });
      req.on('error', (e) => reject(new EvolveError(0, 'unreachable', { detail: e.message })));
      stream.on('error', (e) => req.destroy(e));
      stream.pipe(req);
    });
  }

  return {
    tasks: () => call('GET', '/req/client/tasks'),
    claim: (flowId, key, cwd) => call('POST', step(flowId, key) + '/claim', { cwd }),
    inputs: (flowId, key) => call('GET', step(flowId, key) + '/inputs'),
    deliver: (flowId, key, body) => call('POST', step(flowId, key) + '/deliveries', body),
    workflowState: (flowId, key, body) => call('POST', step(flowId, key) + '/workflow', body),
    ackNudge: (id) => call('POST', '/req/client/nudges/' + encodeURIComponent(id) + '/ack', {}),
    download, putPackage, authz,
  };
}

module.exports = { createEvolveClient, EvolveError };

'use strict';
// 中转站客户端：首用登记拿令牌；工号晚到（启动 30 s 后才取到）⇒ 带令牌重登一次让服务端改挂 uid:；令牌被重置 ⇒ 401 后重登。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const { createEvolveClient } = require('../server/evolve-client');

test('登记 / 工号晚到重登 / 令牌失效重登', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-ec-'));
  const regs = [];
  let valid = 'tok1';
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/v1/req/client/register') {
        const b = JSON.parse(body);
        regs.push({ uid: b.uid, auth: req.headers.authorization || null });
        return send(200, { ok: true, data: { token: req.headers.authorization ? null : valid } });
      }
      if (req.headers.authorization !== 'ReqInstall i1.' + valid) return send(401, { ok: false, error: 'bad_install_token' });
      return send(200, { ok: true, data: { tasks: [], nudges: [] } });
    });
  }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.on('listening', r));
  t.after(() => { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  let me = { installId: 'i1', uid: null, user: 'zhang', host: 'PC-Z' };
  const E = createEvolveClient({ origin: () => 'http://127.0.0.1:' + srv.address().port, dataDir: dir, identity: async () => me });
  await E.tasks();
  assert.deepStrictEqual(regs, [{ uid: null, auth: null }], '首用登记，此时还没有工号');
  await E.tasks();
  assert.strictEqual(regs.length, 1, '工号没变不重登');
  me = Object.assign({}, me, { uid: 'z00583895' });
  await E.tasks();
  assert.deepStrictEqual(regs[1], { uid: 'z00583895', auth: 'ReqInstall i1.tok1' }, '工号到了带令牌重登');
  await E.tasks();
  assert.strictEqual(regs.length, 2, '只重登一次');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'secrets', 'req-token.json'), 'utf8')).uid, 'z00583895');
  valid = 'tok2';   // 管理员重置了令牌
  await E.tasks();
  assert.strictEqual(regs[2].auth, null, '401 后丢掉本地令牌、重新首用登记');
});

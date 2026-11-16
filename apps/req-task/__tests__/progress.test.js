'use strict';
// 本步运行进度纯函数（server/progress.js，docs/REQ-FLOW-DESIGN.md §17.4）：节点链排序 / 容器内层映射 / 事件折叠。

const test = require('node:test');
const assert = require('node:assert');
const { nodeChain, topOf, applyEvent, sameReport } = require('../server/progress');

test('nodeChain：从 startNode 沿边广度优先；回边与 $end 不影响；没连到的补尾；loop / parallel 内层收进容器', () => {
  const bp = { startNode: 'a', nodes: [
    { id: 'orphan', title: '孤立' },
    { id: 'c', title: 'C' },
    { id: 'lp', kind: 'loop', title: '循环', body: { startNode: 'x', nodes: [{ id: 'x' }, { id: 'y', kind: 'parallel', branches: [{ body: { nodes: [{ id: 'z' }] } }] }] } },
    { id: 'a', title: 'A' },
    { id: 'b' },
  ], edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'lp' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }, { from: 'c', to: '$end' }] };
  const c = nodeChain(bp);
  assert.deepStrictEqual(c.map((n) => n.id), ['a', 'b', 'lp', 'c', 'orphan']);
  assert.strictEqual(c[1].title, 'b', '没标题用 id');
  assert.deepStrictEqual(c[2].inner, ['x', 'y', 'z']);
  assert.deepStrictEqual([topOf(c, 'z'), topOf(c, 'c'), topOf(c, 'nope'), topOf(c, null)], ['lp', 'c', 'nope', null]);
  assert.deepStrictEqual(nodeChain(null), []);
  assert.deepStrictEqual(nodeChain({ startNode: 'gone', nodes: [{ id: 'q' }] }).map((n) => n.id), ['q']);
});

test('applyEvent：起跑 / 换节点（内层映射、走过去重）/ 等回答累计 / 恢复清零 / 结束分成败', () => {
  const chain = nodeChain({ startNode: 'a', nodes: [{ id: 'a' }, { id: 'lp', kind: 'loop', body: { nodes: [{ id: 'x' }] } }], edges: [{ from: 'a', to: 'lp' }] });
  let p = applyEvent(null, { type: 'run.started', at: 'T0' }, chain);
  assert.deepStrictEqual([p.status, p.startedAt], ['running', 'T0']);
  p = applyEvent(p, { type: 'run.node', data: { from: null, to: 'a' } }, chain);
  p = applyEvent(p, { type: 'run.node', data: { from: 'a', to: 'x' } }, chain);
  p = applyEvent(p, { type: 'run.node', data: { from: 'x', to: 'x' } }, chain);
  assert.deepStrictEqual([p.node, p.visited], ['lp', ['a']]);
  p = applyEvent(p, { type: 'run.waiting_user', data: { summary: 'Q1' } }, chain);
  p = applyEvent(p, { type: 'run.waiting_user', data: {} }, chain);
  assert.deepStrictEqual([p.status, p.asks, p.summary], ['waiting_user', 2, 'Q1']);
  const back = applyEvent(p, { type: 'run.resumed' }, chain);
  assert.deepStrictEqual([back.status, back.asks, back.summary], ['running', 0, null]);
  assert.strictEqual(applyEvent(back, { type: 'run.finished', data: { outcome: { kind: 'aborted' } } }, chain).status, 'failed');
  const done = applyEvent(back, { type: 'run.finished', data: { outcome: { kind: 'done_with_unhandled' } } }, chain);
  assert.deepStrictEqual([done.status, done.visited], ['done', ['a', 'lp']]);
  assert.strictEqual(applyEvent(back, { type: 'terminal.exited' }, chain), back, '不认识的事件原样返回');
  assert.ok(sameReport(back, Object.assign({}, back)) && !sameReport(back, p) && !sameReport(null, back));
});

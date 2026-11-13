'use strict';
// progress.js —— 本步运行进度的纯函数（TechDemos docs/REQ-FLOW-DESIGN.md §17.4）：
//   nodeChain(bp)        工作流顶层节点链（从 startNode 沿 edges 广度优先排序；没连到的按数组序补尾）；
//                         loop / parallel 容器的内层节点（body.nodes / branches[].body.nodes）收进 inner，映射回容器
//   applyEvent(p, e, c)  平台 run 事件 → 进度 {status, node, visited[], asks, summary, startedAt}
// 平台 run.node 只带 {from, to} 节点 id（无标题），标题取自 getBlueprint 的节点 title。

const innerIds = (n) => {
  const out = [];
  const walk = (body) => {
    for (const x of (body && body.nodes) || []) { if (x && x.id) { out.push(x.id); walk(x.body); for (const br of x.branches || []) walk(br.body); } }
  };
  walk(n.body);
  for (const br of n.branches || []) walk(br.body);
  return out;
};

/** @param {any} bp blueprint.json → [{ id, title, inner: string[] }] */
function nodeChain(bp) {
  const nodes = (bp && Array.isArray(bp.nodes) ? bp.nodes : []).filter((n) => n && typeof n.id === 'string');
  if (!nodes.length) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = []; const seen = new Set();
  const queue = [byId.has(bp.startNode) ? bp.startNode : nodes[0].id];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id); out.push(id);
    for (const e of bp.edges || []) if (e && e.from === id && byId.has(e.to) && !seen.has(e.to)) queue.push(e.to);
  }
  for (const n of nodes) if (!seen.has(n.id)) out.push(n.id);
  return out.map((id) => { const n = byId.get(id); return { id, title: String(n.title || id).slice(0, 64), inner: innerIds(n) }; });
}

/** 节点 id（可能是 loop / parallel 内层）→ 顶层节点 id；不认识的原样返回 @param {any[]} chain @param {string|null} id */
function topOf(chain, id) {
  if (!id) return null;
  for (const n of chain || []) if (n.id === id || n.inner.includes(id)) return n.id;
  return id;
}

const FAILED = new Set(['failed', 'aborted']);

/**
 * @param {any} p 当前进度（可为 null）
 * @param {{ type: string, at?: string, data?: any }} e 平台事件
 * @param {any[]} chain nodeChain 结果（可为空：此时节点 id 原样记）
 */
function applyEvent(p, e, chain) {
  const cur = Object.assign({ status: 'running', node: null, visited: [], asks: 0, summary: null, startedAt: null }, p || {});
  const next = Object.assign({}, cur, { visited: cur.visited.slice() });
  const d = e.data || {};
  switch (e.type) {
    case 'run.started':
      next.status = 'running'; next.startedAt = cur.startedAt || e.at || null;
      break;
    case 'run.node': {
      const from = topOf(chain, d.from); const to = topOf(chain, d.to);
      if (from && from !== to && !next.visited.includes(from)) next.visited.push(from);
      next.node = to || next.node;
      if (next.status !== 'waiting_user') next.status = 'running';
      break;
    }
    case 'run.waiting_user':
      next.status = 'waiting_user'; next.asks = cur.asks + 1; next.summary = d.summary ? String(d.summary).slice(0, 200) : cur.summary;
      break;
    case 'run.resumed':
      next.status = 'running'; next.asks = 0; next.summary = null;
      break;
    case 'run.finished':
      next.status = FAILED.has(d.outcome && d.outcome.kind) ? 'failed' : 'done'; next.asks = 0; next.summary = null;
      if (next.node && next.status === 'done' && !next.visited.includes(next.node)) next.visited.push(next.node);
      break;
    default: return p || cur;
  }
  return next;
}

/** 两份进度是否值得重新上报（只比服务端看得到的字段）*/
function sameReport(a, b) {
  if (!a || !b) return false;
  return a.status === b.status && a.node === b.node && a.asks === b.asks && a.startedAt === b.startedAt
    && (a.visited || []).join(',') === (b.visited || []).join(',');
}

module.exports = { nodeChain, topOf, applyEvent, sameReport };

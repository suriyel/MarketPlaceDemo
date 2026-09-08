'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/;

function safeDeliverable(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*\.md$/i.test(value)) return null;
  if (path.basename(value) !== value) return null;
  return value;
}

function validateExplorationTasks(items) {
  const errors = [];
  if (!Array.isArray(items)) return ['任务文件必须是 JSON 数组'];
  if (items.length < 1 || items.length > 16) {
    errors.push(`任务数必须为 1–16，实际为 ${items.length}`);
  }

  const ids = new Set();
  const deliverables = new Set();
  const maxProbeBudget = items.length <= 3 ? 5 : (items.length <= 7 ? 4 : 3);
  const maxFollowupBudget = items.length <= 3 ? 3 : (items.length <= 7 ? 2 : 1);
  for (let i = 0; i < items.length; i++) {
    const task = items[i] || {};
    const label = `items[${i}]`;
    const id = typeof task.id === 'string' ? task.id : '';
    if (!TASK_ID_RE.test(id)) {
      errors.push(`${label}.id 必须匹配 ${TASK_ID_RE}`);
    } else if (ids.has(id.toLowerCase())) {
      errors.push(`${label}.id 重名: ${id}`);
    } else {
      ids.add(id.toLowerCase());
    }

    const dimensions = task.dimensions;
    if (!Array.isArray(dimensions) || dimensions.length < 2 || dimensions.length > 5) {
      errors.push(`${label}.dimensions 必须包含 2–5 个正交维度`);
    } else {
      const seenDimensions = new Set();
      for (let j = 0; j < dimensions.length; j++) {
        const dimension = typeof dimensions[j] === 'string' ? dimensions[j].trim() : '';
        const key = dimension.toLowerCase();
        if (!dimension || dimension.length > 80) {
          errors.push(`${label}.dimensions[${j}] 必须是 1–80 字符的非空字符串`);
        } else if (seenDimensions.has(key)) {
          errors.push(`${label}.dimensions 维度重名: ${dimension}`);
        } else {
          seenDimensions.add(key);
        }
      }
    }

    if (!Number.isInteger(task.probeBudget)
      || task.probeBudget < 2 || task.probeBudget > maxProbeBudget) {
      errors.push(`${label}.probeBudget 在本次 ${items.length} 个 task 下必须为 2–${maxProbeBudget} 的整数`);
    } else if (Array.isArray(dimensions) && task.probeBudget !== dimensions.length) {
      errors.push(`${label}.probeBudget 必须等于 dimensions 条数`);
    }
    if (!Number.isInteger(task.followupBudget)
      || task.followupBudget < 1 || task.followupBudget > maxFollowupBudget) {
      errors.push(`${label}.followupBudget 在本次 ${items.length} 个 task 下必须为 1–${maxFollowupBudget} 的整数`);
    }

    const deliverable = typeof task.deliverable === 'string' ? task.deliverable : '';
    if (!safeDeliverable(deliverable)) {
      errors.push(`${label}.deliverable 必须是安全的 Markdown 文件名`);
      continue;
    }
    const stem = deliverable.slice(0, -3);
    if (id && stem.toLowerCase() !== id.toLowerCase()
      && !stem.toLowerCase().startsWith(id.toLowerCase() + '-')) {
      errors.push(`${label}.deliverable 必须以任务 id 开头: ${id}`);
    }
    if (deliverables.has(deliverable.toLowerCase())) {
      errors.push(`${label}.deliverable 重名: ${deliverable}`);
    } else {
      deliverables.add(deliverable.toLowerCase());
    }
  }
  return errors;
}

function validateTasksFile(file) {
  if (!file || !fs.existsSync(file)) throw new Error(`任务文件不存在: ${file || '<empty>'}`);
  let items;
  try {
    items = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`任务文件不是合法 JSON: ${error.message}`);
  }
  const errors = validateExplorationTasks(items);
  if (errors.length) throw new Error(errors.join('; '));
  return { ok: true, count: items.length };
}

function artifactPath(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.path === 'string') return value.path;
  return null;
}

function sourceCandidates(branch, deliverable, detailsDir) {
  const candidates = [];
  const seen = new Set();
  const task = branch.task || {};
  const expected = deliverable;
  const detailsRoot = path.resolve(detailsDir || '');
  const add = (value, base) => {
    const raw = artifactPath(value);
    if (!raw) return;
    const resolved = path.resolve(base || '', raw);
    if (path.dirname(resolved).toLowerCase() !== detailsRoot.toLowerCase()) return;
    if (path.basename(resolved).toLowerCase() !== expected.toLowerCase()) return;
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(resolved);
    }
  };
  for (const artifact of branch.summary && Array.isArray(branch.summary.artifacts)
    ? branch.summary.artifacts : []) {
    add(artifact, branch.cwd || '');
  }
  return candidates;
}

function collectReports(parallelFile, detailsDir) {
  if (!parallelFile || !fs.existsSync(parallelFile)) {
    throw new Error(`parallel ledger 不存在: ${parallelFile || '<empty>'}`);
  }
  const ledger = JSON.parse(fs.readFileSync(parallelFile, 'utf8'));
  if (!Array.isArray(ledger.branches) || !ledger.branches.length) {
    throw new Error('parallel ledger 没有 branches');
  }
  const entries = [];
  const used = new Set();
  const errors = [];
  for (const branch of ledger.branches) {
    const task = branch.task || {};
    const deliverable = safeDeliverable(task.deliverable);
    const entry = {
      taskId: String(task.id == null ? branch.taskId || branch.branchId : task.id),
      title: task.title || task.purpose || branch.branchId,
      status: branch.status,
      summary: branch.summary && branch.summary.note || '',
      file: null,
    };
    if (branch.status === 'done') {
      if (!deliverable) {
        errors.push(`${entry.taskId}: deliverable 非法或不是 .md`);
      } else if (used.has(deliverable.toLowerCase())) {
        errors.push(`${entry.taskId}: deliverable 重名 ${deliverable}`);
      } else {
        used.add(deliverable.toLowerCase());
        const candidates = sourceCandidates(branch, deliverable, detailsDir);
        const source = candidates.find((candidate) => fs.existsSync(candidate)
          && fs.statSync(candidate).isFile()
          && fs.readFileSync(candidate, 'utf8').trim());
        if (!source) {
          errors.push(`${entry.taskId}: done 分支缺少非空专题文档；已检查 ${candidates.join(', ')}`);
        } else {
          entry.file = `details/${deliverable}`;
        }
      }
    }
    entries.push(entry);
  }
  if (errors.length) {
    const error = new Error(errors.join('; '));
    error.entries = entries;
    throw error;
  }
  return { ok: true, entries, verified: entries.filter((entry) => entry.file).length };
}

if (require.main === module) {
  try {
    const result = process.argv[2] === '--validate-tasks'
      ? validateTasksFile(process.argv[3])
      : collectReports(process.argv[2], process.argv[3]);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stderr.write(String(error && error.message || error) + '\n');
    process.exitCode = 1;
  }
}

module.exports = {
  collectReports,
  safeDeliverable,
  sourceCandidates,
  validateExplorationTasks,
  validateTasksFile,
};

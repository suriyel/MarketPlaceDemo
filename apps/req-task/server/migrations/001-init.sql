-- 本地台账（对账 / 重启后补推待办卡；任务状态以服务器为准）
CREATE TABLE steps (
  flow_id TEXT NOT NULL, step_key TEXT NOT NULL, round INTEGER NOT NULL,
  req_id TEXT, cwd TEXT, run_id TEXT,
  state TEXT NOT NULL,            -- received（材料已就位）| running | run_done | delivered | reworked
  launch TEXT,                    -- JSON {prefill, actual, diff}（启动纠偏，随交付上报）
  updated_at TEXT,
  PRIMARY KEY (flow_id, step_key, round)
);
CREATE TABLE notified (k TEXT PRIMARY KEY, at TEXT);   -- 已推过待办卡的「新任务」（flow:step:round）
CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT);          -- consent / lastRoot

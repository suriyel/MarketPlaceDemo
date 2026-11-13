-- 本步运行进度（docs/REQ-FLOW-DESIGN.md §17.4）：JSON {status, node, visited[], asks, summary, startedAt}
ALTER TABLE steps ADD COLUMN progress TEXT;

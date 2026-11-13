-- 工作流就绪态（docs/REQ-FLOW-DESIGN.md §16.6）：JSON {state: ready|kept-local|failed, id, version, localModified, code?, reason?}
ALTER TABLE steps ADD COLUMN wf TEXT;

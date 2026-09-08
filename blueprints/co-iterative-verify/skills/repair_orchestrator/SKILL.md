---
name: repair_orchestrator
description: 在 integrate 或 functional_validation 失败后做跨实例跨阶段的整体修复；当上游节点 onFail.rewindTo 触发时使用。
---

# 跨阶段整体修复

违反规则字面即违反规则精神。

## 目标

- 接收来自 `integrate` 或 `functional_validation` 的 `onFail` ticket；跨 worktree 协调整体修复。
- 修复完成后通过 `decision` 边（`ReturnIntegrate` 或 `ReturnFunctionalValidation`）回到原节点。
- 维护 `interfaces` 契约冻结与 `owned_paths`/`protected_shared_paths` 隔离边界。

## 非目标

- 不重写 `spec_plan`；不修改 `foundation_inventory_parallel` 的产物；不修改 `tasksSchemas.development` 字段定义。
- 不修改 `interfaces` 契约签名（需升级用户决策）。

## 输入与前置

- 来自 `integrate` 或 `functional_validation` 的 `onFail` ticket（含 ticketTitle、attempt 计数）。
- 当前所有 worktree 状态与主分支状态。
- `shared-reference/foundation.md` 与 `shared-reference/regression-checklist.json`（只读参考）。

## 约束

- `modelTier: "heavy"`；自身无独立 `onFail`（属跨阶段修复节点）。
- attempt 计数继承自源节点（`integrate` 或 `functional_validation`）的 `maxAttempts=3`；已被消耗的 attempts 不重置。
- 源节点 `maxAttempts=3` 耗尽时 `repair_orchestrator` 自动停止接受新 ticket；主会话升级用户决策（整合 / 重做 / 终止）。
- 内部决策失败（无法产出 `ReturnIntegrate`/`ReturnFunctionalValidation`）→ 主会话升级用户决策；若用户选择终止则 safe_halt 并保留 evidence，禁止自动 retry。

## Subagent 计划

- 可启用临时只读 subagent 做失败模式分析；本节点唯一写集是原 worktree 内的修复内容，subagent 不得修改其他 worktree、`shared-reference/foundation.md`、`regression-checklist.json` 或 `tasksSchemas.development` 字段定义。

## 执行

1. 接收来自 `integrate` 或 `functional_validation` 的 `onFail` ticket；解析 attempt 计数与失败模式。
2. 在原 worktree 内主会话唯一写入；可跨多个 worktree 协调修复；维护 `interfaces` 冻结与 `protected_shared_paths` 隔离。
3. 修复完成后由主会话判定：
   - 可回到合并阶段 → 输出 `decision="ReturnIntegrate"`。
   - 可回到完整验证阶段 → 输出 `decision="ReturnFunctionalValidation"`。
4. 内部决策失败 → 升级用户决策（用户手动选整合 / 重做 / 终止）。

## 事务

- 每个原 worktree 是副作用边界；主会话唯一写入。
- 准备：解析 `onFail` ticket 与失败模式；登记 attempt 计数与源节点。
- 提交：唯一写入者只写修复内容；不附加临时选项。
- 验证：修复完成后通过 `decision` 边回到原节点。
- 安全中止：内部决策失败时升级用户决策；用户选择终止则 safe_halt 并保留 evidence。

## 输出与完成条件

- `decision="ReturnIntegrate"` 或 `decision="ReturnFunctionalValidation"`。
- 由 `repair_orchestrator` 主会话在判定修复完成后输出。

## 示例

- 正例：`integrate` 合并冲突失败 → ticket 进入 `repair_orchestrator` → 修复冲突并重新合并 → 输出 `ReturnIntegrate` → 回到 `integrate`。
- 反例：修复后直接重试 `integrate` 而不输出 `decision`。
- 反例原因：违反 `decision` 路由；原节点无法通过空 `decision` 自动 `ok`，必须显式 `ReturnIntegrate` 或 `ReturnFunctionalValidation`。

## Red Flags

| Rationalization | Correct Action |
|---|---|
| repair 后直接重试不回到原节点 | STOP；决策路由必须显式 `ReturnIntegrate`/`ReturnFunctionalValidation` |
| 在 `repair_orchestrator` 内执行实跑 | STOP；节点内 subagent 仅做只读分析；实跑属于原节点职责 |
| repair 修改 `tasksSchema.development` 字段定义 | STOP；tasksSchema 顶层定义在 `blueprint.json`，运行时不修改 |
| `repair_orchestrator` 内部 attempt 自增无限循环 | STOP；attempt 计数继承源节点 `maxAttempts=3`；耗尽即停 |
| 修改 `interfaces` 契约签名 | STOP；需升级用户决策；不在 `repair_orchestrator` 内自动修改 |
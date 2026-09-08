---
name: integrate
description: 合并所有 parallel_delivery worktree 至主分支并完成启动复核；当 parallel_delivery 三态汇聚后或 repair_orchestrator ReturnIntegrate 时使用。
---

# 合并与启动复核

违反规则字面即违反规则精神。

## 目标

- 合并所有 `parallel_delivery` worktree 至目标仓库主分支。
- 依据 `shared-reference/regression-checklist.json` 中 smoke 标记的命令执行启动复核。
- 主会话自主判定 `decision="Passed"`（**非用户审批**）；通过后推进到 `functional_validation`。

## 非目标

- 不执行完整功能验证（属于 `functional_validation`）。
- 不修改 `tasksSchemas.development` 字段定义；不修改 `interfaces` 契约签名。

## 输入与前置

- `parallel_delivery` 所有实例 `status`（`ok`/`failed`/`blocked` 三态汇聚）。
- 主分支当前状态；`shared-reference/regression-checklist.json` 中的 smoke 命令。
- 所有 worktree 的最终内容（来自 `parallel_delivery` 产出）。

## 约束

- `modelTier: "heavy"`；`onFail.rewindTo:repair_orchestrator`（`maxAttempts=3`）。
- 完成判定仅由出边 `decision: "Passed"` 承担路由；**不设 `terminalWhen`**，避免与 `functional_validation` 的 `terminalWhen` 中 `__decision` envelope 字段语义混淆。
- `Passed` 由 integrate 主会话依据启动复核结果自主判定；与 `functional_validation` 的 `Passed`（用户审批）来源不同。
- 主分支写集由主会话唯一控制；所有 worktree 合并按顺序执行。

## Subagent 计划

- 可启用临时只读 subagent 做合并冲突分析；本节点唯一写集是主分支与启动复核记录，subagent 不得修改其他仓库或工作树。

## 执行

1. 按 `parallel_delivery` 实例顺序合并所有 worktree 至主分支；处理 `interfaces` 契约冻结与冲突。
2. 启动复核：执行 `regression-checklist.json` 中标记为 smoke 的命令 + 主分支编译。
3. 复核全部通过 → 主会话判定 `decision="Passed"` → 推进到 `functional_validation`。
4. 复核任一失败 → `status="failed"` → `onFail.rewindTo:repair_orchestrator`（`maxAttempts=3`）。

## 事务

- 主分支合并与启动复核是两个独立交付物。
- 准备：登记所有 worktree 与主分支读写集；列出 smoke 命令。
- 提交：唯一写入者只执行已批准合并；不附加临时选项。
- 验证：smoke 命令全部通过；主分支编译通过。
- 安全中止：`maxAttempts=3` 耗尽则停留并由主会话生成 safe_halt 报告。

## 输出与完成条件

- 所有 worktree 已合并至主分支。
- 启动复核（依赖 `regression-checklist.json` 中标记为 smoke 的命令 + 主分支编译）通过。
- `decision="Passed"`。

## 示例

- 正例：两个 worktree 合并后主分支编译通过；smoke 命令 `node --test server/__smoke__/*.test.js` 退出码 0 → 主会话判定 `Passed` → 推进到 `functional_validation`。
- 反例：合并时跳过 `interfaces` 契约校验直接覆盖共享文件。
- 反例原因：契约冻结是并行交付的不变条件；跳过校验将破坏 `protected_shared_paths` 隔离边界。

## Red Flags

| Rationalization | Correct Action |
|---|---|
| 合并失败直接 halt | STOP；必须 `onFail.rewindTo:repair_orchestrator`，`maxAttempts=3` |
| `functional_validation` 失败也回 `integrate` | STOP；`integrate` 与 `functional_validation` 失败语义不同 |
| 合并时跳过 `interfaces` 契约校验 | STOP；契约冻结是并行交付的不变条件 |
| integrate 的 `Passed` 来自用户审批 | STOP；`Passed` 由 integrate 主会话自主判定；用户审批仅发生在 `spec_plan` 与 `functional_validation` |
| 给 integrate 加 terminalWhen 用 `__decision` | STOP；integrate 不设 `terminalWhen`；避免与 `functional_validation` envelope 语义混淆 |
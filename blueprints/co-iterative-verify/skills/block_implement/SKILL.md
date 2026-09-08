---
name: block_implement
description: 在 worktree 内实现业务代码并编写验证测试用例；当 parallel_delivery 实例启动时使用。
---

# 开发块实现与测试用例编写

违反规则字面即违反规则精神。

## 目标

- 在 worktree 内实现业务代码；编写验证测试用例作为 `verification` 字段的 `command` 注入。
- 遵守 `owned_paths` 独占与 `protected_shared_paths` 隔离边界。
- 遵守 `interfaces` 契约冻结（不修改接口签名）。

## 非目标

- 不跨实例写共享文件；不在主分支提交。
- 不执行完整功能验证（属于 `functional_validation`）。

## 输入与前置

- `foundation_inventory_parallel` 产出（`shared-reference/foundation.md` + `shared-reference/regression-checklist.json`）。
- 运行时任务清单中本实例的 `tasksSchemas.development` 字段。

## 约束

- `modelTier: "heavy"`；worktree 内主会话唯一写入。
- 本实例独占 `owned_paths`；禁止修改其他实例 `protected_shared_paths`。
- `interfaces` 契约冻结；修改需经 `repair_orchestrator` 升级用户决策。
- `verification` 至少 1 条；每条至少含 `name` 与 `command`。

## Subagent 计划

- 可启用临时只读 subagent 做现有接口扫描或测试命令验证；本实例唯一写集是其独立 worktree 内的 `owned_paths`，subagent 不得写入其他实例的 worktree 或主分支。

## 执行

1. 解析本实例 `tasksSchemas.development` 字段（id、goal、scope、owned_paths、protected_shared_paths、interfaces、done_when、verification）。
2. 在 worktree 内实现业务代码；遵守 `owned_paths` 与 `protected_shared_paths` 边界。
3. 编写验证测试用例作为 `verification` 字段的 `command`；至少 1 条；含 `name` 与 `command`。
4. 完成后返回 `status="ok"`；失败时返回 `status="failed"`。

## 事务

- 仅 worktree 内写集；主会话唯一写入。
- 准备：解析 `tasksSchemas.development` 字段与冻结 `interfaces`。
- 提交：唯一写入者只写已批准实现内容。
- 验证：实现完成且 `verification` 字段已填。
- 安全中止：失败时返回 `status="failed"`。

## 输出与完成条件

- 业务代码已实现；测试用例已编写并注入 `verification`。
- 返回 `status="ok"`。

## 示例

- 正例：task A 在 worktree 内实现 `server/orders/create.js` + 编写 `server/orders/__tests__/create.test.js`，并把 `verification: [{name:"unit-tests", command:"node --test server/orders/__tests__/*.test.js", expectedExitCode:0}]` 注入 → 返回 `status="ok"`。
- 反例：task A 在 worktree 内顺手修改 `server/routes/index.js`（属于 task B 的 `protected_shared_paths`）。
- 反例原因：跨实例写共享文件破坏 `interfaces` 契约冻结与 `protected_shared_paths` 隔离边界；并线交付的最小写集是 `owned_paths`，超出即 partial failure。

## Red Flags

| Rationalization | Correct Action |
|---|---|
| 跨实例修改 `protected_shared_paths` | STOP；破坏并行交付隔离边界 |
| 测试用例不写入 `verification` 字段 | STOP；`block_verify` 依赖 `verification` 字段执行自验 |
| 修改 `interfaces` 契约签名 | STOP；契约冻结；需 `repair_orchestrator` 升级用户决策 |
| 在主分支提交 | STOP；本节点仅在 worktree 内写入 |
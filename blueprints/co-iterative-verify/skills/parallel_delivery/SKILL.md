---
name: parallel_delivery
description: 在 git worktree 中并线迭代开发与并行编写验证测试用例；当需要多开发块独立交付且最终合并时使用。
---

# 开发块并线交付

违反规则字面即违反规则精神。

## 目标

- 按 `tasksSchemas.development` 动态展开 task 实例；每个实例独占一个 git worktree。
- 每个实例内顺序执行 `block_implement`（实现 + 编写测试用例）→ `block_verify`（执行 `verification` 命令自验）。
- 整体并行体支持 `ok`/`failed`/`blocked` 三态汇聚；所有匹配出边均进入 `integrate`。

## 非目标

- 不跨实例写共享文件；不在主分支提交；不执行完整功能验证（属于 `functional_validation`）。
- 不修改 `tasksSchemas.development` 字段定义；不修改 `interfaces` 契约签名。

## 输入与前置

- `foundation_inventory_parallel` 产出（`shared-reference/foundation.md` + `shared-reference/regression-checklist.json`）。
- 运行时任务清单（由 `spec_plan` 通过 `bp-tasks set` 注入）。
- 每个 task 实例必须独占 `owned_paths`；`protected_shared_paths` 禁止跨实例修改。

## 约束

- `kind: "parallel"`；`iterator.kind="tasks"`；`iterator.tasksSchemaRef="development"`。
- `workspace="worktree"`；`gitInit=true`；`worktreeRequired=true`；`maxConcurrent=4`。
- 每个实例内部 `block_verify.onFail.rewindTo:block_implement`（`maxAttempts=3`，worktree 内聚合修复）。
- `interfaces` 是契约冻结字段；任何修改需经 `repair_orchestrator` 升级用户决策。
- `verification` 命令按数组顺序执行；任意一条 `expectedExitCode` 不匹配即视为该实例 `block_verify` 失败。

## Subagent 计划

- 每个 task 实例可启用临时只读 subagent 做现有接口扫描或测试命令验证；每个实例的唯一写集是其独立 worktree，subagent 不得写入其他 worktree 或主分支。

## 执行

1. 按 `iterator.tasksSchemaRef="development"` 展开任务实例；为每个实例创建独立 git worktree。
2. 实例内 `block_implement`：实现业务代码 + 编写测试用例（测试用例作为 `verification` 字段的 `command` 注入）。
3. 实例内 `block_verify`：按 `verification` 数组顺序执行每条命令；记录 `expectedExitCode` 与实际退出码。
4. 任意一条 `expectedExitCode` 不匹配 → 实例 `status="failed"` → `block_verify.onFail.rewindTo:block_implement` 触发（`maxAttempts=3`）。
5. 整体并行体三态汇聚：所有实例 `ok` → `ok`；任一 `failed` 或 `blocked` → 整体对应状态。
6. 任意出边按 `when: status == "ok" | "failed" | "blocked"` 全覆盖推进到 `integrate`。

## 事务

- 每个 worktree 是独立副作用；主会话唯一写入 worktree。
- 准备：为每个实例登记独占 `owned_paths` 与冻结 `interfaces`；校验 `protected_shared_paths` 不冲突。
- 提交：实例 `block_verify` 通过 `expectedExitCode` 后实例 `ok`；并行体推进。
- 验证：所有 `verification` 命令通过；`interfaces` 字段未修改。
- 安全中止：`maxAttempts=3` 耗尽则实例停留；整体并行体进入 `failed` 或 `blocked`。

## 输出与完成条件

- 每个实例 `block_verify` 返回 `status=="ok"`（`interfaces` 字段冻结契约 + `verification` 命令全部通过 `expectedExitCode`）。
- 整体并行体三态汇聚后推进到 `integrate`。

## 示例

- 正例：task A 与 task B 在独立 worktree 中分别实现 `server/orders/` 与 `frontend/permission/`；每个实例 `verification` 含 1 条 `node --test` 命令且 `expectedExitCode=0` → 两个实例 `ok` → 并行体 `ok` → 推进到 `integrate`。
- 反例：task A 在 worktree 中修改 `server/routes/index.js`（属于 task B 的 `protected_shared_paths`）→ 触发跨实例写共享文件冲突。
- 反例原因：违反 `protected_shared_paths` 约束；`interfaces` 契约冻结的共享文件不应被任一实例单独修改。

## Red Flags

| Rationalization | Correct Action |
|---|---|
| 跨 worktree 改 `protected_shared_paths` | STOP；跨实例写共享文件是 partial failure 的根因 |
| 把测试编写搬到独立 task | STOP；测试编写是 `block_implement` 内 `verification` 字段产出 |
| `block_verify` 失败不回 `block_implement` | STOP；`onFail.rewindTo:block_implement` 是 worktree 内聚合修复的唯一路径 |
| 忽略 `parallel_delivery` 的 `blocked` 状态 | STOP；`blocked` 是合法三态之一，必须有对应出边 |
| `interfaces` 契约在 worktree 内被修改 | STOP；契约冻结是并行交付的不变条件；需 `repair_orchestrator` 升级用户决策 |
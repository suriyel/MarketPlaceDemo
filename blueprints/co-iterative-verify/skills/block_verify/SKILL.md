---
name: block_verify
description: 在 worktree 内按 verification 命令数组执行自验；当 block_implement 完成后使用。
---

# 开发块功能自验

违反规则字面即违反规则精神。

## 目标

- 按 `verification` 数组顺序执行每条命令；记录实际退出码与 `expectedExitCode` 对比。
- 全部通过 → 返回 `status="ok"`；任一失败 → 返回 `status="failed"`。
- 失败时 `onFail.rewindTo:block_implement`（`maxAttempts=3`）触发 worktree 内聚合修复。

## 非目标

- 不执行完整功能验证（属于 `functional_validation`）。
- 不修改业务代码或测试用例（属于 `block_implement`）。

## 输入与前置

- `block_implement` 产出（业务代码 + `verification` 字段）。
- worktree 当前状态。

## 约束

- `modelTier: "heavy"`；`onFail.rewindTo:block_implement`（`maxAttempts=3`，worktree 内聚合修复）。
- `interfaces` 契约冻结字段必须未被修改；如已修改则视为本实例失败。
- `expectedExitCode` 缺省取 `0`，`timeoutMs` 缺省取 `300000`。

## Subagent 计划

- 本节点无 subagent 调用；自验逻辑由主会话按 `verification` 数组顺序执行；不修改 worktree 之外的写集。

## 执行

1. 校验 `interfaces` 字段未被修改（与 `block_implement` 启动时的 frozen snapshot 对比）。
2. 按 `verification` 数组顺序执行每条命令；记录实际退出码。
3. 任意一条 `expectedExitCode` 不匹配 → 实例 `status="failed"` → `onFail.rewindTo:block_implement` 触发（`maxAttempts=3`）。
4. 全部命令通过 → 返回 `status="ok"` → 实例完成。

## 事务

- 仅 worktree 内执行；不修改写集。
- 准备：解析 `verification` 字段与 frozen `interfaces`。
- 提交：执行命令并记录结果。
- 验证：所有命令 `expectedExitCode` 匹配。
- 安全中止：`maxAttempts=3` 耗尽则实例停留；整体并行体进入 `failed`。

## 输出与完成条件

- 所有 `verification` 命令通过 `expectedExitCode`。
- `interfaces` 字段未被修改。
- 返回 `status="ok"`。

## 示例

- 正例：`verification: [{name:"unit-tests", command:"node --test ...", expectedExitCode:0}]` 执行后退出码 0、`interfaces` 未被修改 → 返回 `status="ok"` → 实例完成。
- 反例：跳过 `verification` 命令直接返回 `status="ok"`（main 会话"看着代码差不多就过了"）。
- 反例原因：自验是 `block_verify` 的唯一职责；跳过会破坏 worktree 内聚合修复循环，导致实现错误沿并行体推进到 `integrate`。

## Red Flags

| Rationalization | Correct Action |
|---|---|
| 跳过 `verification` 命令直接返回 ok | STOP；自验是 `block_verify` 的唯一职责 |
| 忽略 `expectedExitCode` 不匹配 | STOP；任意一条不匹配即视为本实例失败 |
| 修改 `interfaces` 契约签名后自验 | STOP；契约冻结；修改需 `repair_orchestrator` 升级用户决策 |
| 把 `onFail.rewindTo:block_implement` 改成 `parallel_delivery` 整体 | STOP；修复范围限定在原 worktree 内 |
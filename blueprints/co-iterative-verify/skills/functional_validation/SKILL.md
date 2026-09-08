---
name: functional_validation
description: 执行完整功能验证并产出最终验收结论；当 integrate Passed 后或 repair_orchestrator ReturnFunctionalValidation 时使用。
---

# 完整功能验证

违反规则字面即违反规则精神。

## 目标

- 执行 `shared-reference/regression-checklist.json` 中全部验收命令（不仅是 smoke）。
- 由用户在 `approvalAsk` 弹窗中点击 `Passed` 才算工作流完成。
- 落盘 `shared-reference/validation-report.md` 作为最终验收证据。

## 非目标

- 不修改业务代码（仅在验证失败时通过 `repair_orchestrator` 修复）。
- 不产出新的功能回归清单（属于 `foundation_inventory_parallel`）。

## 输入与前置

- `integrate` 产出（合并后主分支 + 启动复核报告）；或 `repair_orchestrator` ReturnFunctionalValidation ticket。
- `shared-reference/regression-checklist.json` 中全部验收命令（含 smoke 与 required 标记）。

## 约束

- `modelTier: "heavy"`；`approvalAsk=true`；`onFail.rewindTo:repair_orchestrator`（`maxAttempts=3`）。
- `terminalWhen="status == \"ok\" && next_input.__decision == \"Passed\""`；`__decision` 由 `approvalAsk=true` 弹窗的用户点击返回，合法值 `"Passed"`/`"Not Passed"`，区分大小写。
- 不修改 `tasksSchemas.development` 字段定义；不修改 `interfaces` 契约签名。
- 用户在弹窗中点击 `Passed` → 节点结束；点击 `Not Passed` 或取消 → 进入 `onFail` 或重试。

## Subagent 计划

- 可启用临时只读 subagent 做断言级别取证；本节点唯一写集是 `shared-reference/validation-report.md`，subagent 不得修改业务代码或 `regression-checklist.json`。

## 执行

1. 解析 `regression-checklist.json` 中全部验收命令（含 smoke 与 required 标记）。
2. 按顺序执行每条命令；记录实际退出码与输出摘要。
3. 全部命令通过 → 主会话写入 `shared-reference/validation-report.md`（含命令列表、通过情况与时间戳） → 触发 `approvalAsk` 弹窗。
4. 用户点击 `Passed` → `__decision="Passed"` → `terminalWhen` 命中 → 工作流完成。
5. 验证任一命令失败 → `status="failed"` → `onFail.rewindTo:repair_orchestrator`（`maxAttempts=3`）。

## 事务

- 仅 `shared-reference/validation-report.md` 写入动作。
- 准备：解析 `regression-checklist.json` 全部命令；登记读写集。
- 提交：唯一写入者只写验证结果；不附加临时选项。
- 验证：用户在 `approvalAsk` 弹窗中点击 `Passed`；`validation-report.md` 已落盘。
- 安全中止：`maxAttempts=3` 耗尽则停留并由主会话生成 safe_halt 报告。

## 输出与完成条件

- 所有 `regression-checklist` 断言通过；`shared-reference/validation-report.md` 已落盘且非空。
- `terminalWhen="status == \"ok\" && next_input.__decision == \"Passed\""` 命中。
- 用户已在 `approvalAsk` 弹窗中点击 `Passed`。

## 示例

- 正例：`regression-checklist.json` 含 5 条 required 命令全部通过 → `validation-report.md` 落盘 → 用户在弹窗中点击 `Passed` → 工作流完成。
- 反例：`Passed` 由节点自动判定而非用户。
- 反例原因：违反 `approvalAsk=true`；缺少用户审批的工作流完成不构成最终验收。

## Red Flags

| Rationalization | Correct Action |
|---|---|
| `Passed` 由节点自动判定而非用户 | STOP；`approvalAsk=true` 要求用户在弹窗中点击 `Passed` |
| 验证失败直接 halt | STOP；必须 `onFail.rewindTo:repair_orchestrator`，`maxAttempts=3` |
| 跳过 `regression-checklist.json` 中标记 required 的命令 | STOP；清单是完整功能验证的输入契约 |
| 修改业务代码以通过验证 | STOP；验证失败通过 `repair_orchestrator` 修复，不在本节点修改 |
| 把 `__decision` 改成其他字符串 | STOP；`Passed`/`Not Passed` 区分大小写；取消则节点进入重试 |
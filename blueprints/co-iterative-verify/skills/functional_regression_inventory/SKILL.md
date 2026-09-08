---
name: functional_regression_inventory
description: 基于 spec_plan 功能验收种子扩展并审阅功能回归清单；当 foundation_inventory_parallel.acceptance 分支启动时使用。
---

# 功能回归清单与审阅

违反规则字面即违反规则精神。

## 目标

- 解析 `shared-reference/plan.md` 的功能验收种子；产出 `shared-reference/regression-checklist.json`。
- 清单为纯 JSON 格式；含 smoke 标记、required 标记与命令数组。

## 非目标

- 不执行真实测试命令；不修改主分支。
- 不产出 `shared-reference/foundation.md`（属于 `foundation_prepare`）。

## 输入与前置

- `spec_plan` 产出（`shared-reference/plan.md` + 运行时任务清单）。
- 目标仓库路径与已冻结的 `interfaces` 契约。

## 约束

- `workspace="readonly"`（继承自 `foundation_inventory_parallel.acceptance` 分支）。
- `modelTier: "heavy"`；无内层 `onFail`（属准备阶段；分支失败由 `foundation_inventory_parallel` 整体 `failed` 汇聚，下游 `parallel_delivery` 入边 `when: status == "ok"` 隐式阻断）。
- 主会话唯一写入 `shared-reference/regression-checklist.json`。

## Subagent 计划

- 可启用临时只读 subagent 做现有测试收集；本分支唯一写集是 `shared-reference/regression-checklist.json`，subagent 不得写入其他文件。

## 执行

1. 解析 `shared-reference/plan.md` 的功能验收种子；扩展为完整编号功能回归清单。
2. 写入 `shared-reference/regression-checklist.json`（含 smoke 标记、required 标记与命令数组）。
3. 验证 JSON 已落盘且为合法 JSON；返回 `status="ok"`。

## 事务

- 仅 `shared-reference/regression-checklist.json` 写入动作。
- 准备：解析 `plan.md` 的功能验收种子。
- 提交：唯一写入者只写已批准内容。
- 验证：JSON 已落盘且合法。
- 安全中止：`maxAttempts=3` 耗尽则停留并由主会话生成 safe_halt 报告。

## 输出与完成条件

- `shared-reference/regression-checklist.json` 已落盘且为合法 JSON。
- 返回 `status="ok"`。

## 示例

- 正例：`plan.md` 的功能验收种子"订单创建→查询主流程"扩展为 5 条命令数组（含 1 条 `smoke=true, required=true`、4 条 `required=true`）→ 写入 `regression-checklist.json` → 返回 `status="ok"`。
- 反例：在 `regression-checklist.json` 中混入"手动在浏览器中打开页面并目视检查"等不可执行步骤。
- 反例原因：清单只含可执行的命令数组；`functional_validation` 与 `parallel_delivery.block_verify` 都按 `command` 字段执行，混入非命令条目会让执行阶段崩溃或假性通过。

## Red Flags

| Rationalization | Correct Action |
|---|---|
| acceptance 分支直接产出真实测试 | STOP；仅产出纯 JSON 命令数组；真实测试由 `verification` 字段承担 |
| 在清单中混入手动验证步骤 | STOP；清单只含可执行的命令数组 |
| 跳过 `plan.md` 直接产出清单 | STOP；`plan.md` 是功能验收种子的唯一真源 |
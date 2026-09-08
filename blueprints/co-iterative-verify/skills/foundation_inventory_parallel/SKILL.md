---
name: foundation_inventory_parallel
description: 在静态并行中准备共享基础说明与功能回归清单；当 spec_plan 已通过用户审批且需进入并线交付前时使用。
---

# 基础与回归清单并行

违反规则字面即违反规则精神。

## 目标

- 并行执行 `foundation_prepare` 与 `functional_regression_inventory` 两个分支；两个分支均 `status=="ok"` 才汇聚到 `parallel_delivery`。
- `foundation_prepare` 产出 `shared-reference/foundation.md`（共享基础说明，workspace="direct"）。
- `functional_regression_inventory` 产出 `shared-reference/regression-checklist.json`（纯 JSON 功能回归清单，workspace="readonly"）。

## 非目标

- 不编写新业务功能；不修改主分支。
- 不产出 `shared-reference/validation-report.md`（属于 `functional_validation`）。
- 不执行完整功能验证。

## 输入与前置

- `spec_plan` 产出（`shared-reference/plan.md` + 运行时任务清单）。
- 目标仓库与已冻结的 `interfaces` 契约。
- 两个分支写集不重叠：`foundation.md`（foundation 分支） vs `regression-checklist.json`（acceptance 分支）。

## 约束

- 顶层不设 `workspace` 字段（避免与分支 `workspace` 嵌套冲突）；各分支自行声明 `workspace`。
- `maxConcurrent=2`（两个分支并发上限）。
- 任一分支 `status=="failed"` 即整体视为 `failed`；顶层无外层 `onFail`（属准备阶段）。
- `foundation_prepare` 与 `functional_regression_inventory` 无内部分支 `onFail`（分支失败由并行体整体 `failed` 汇聚传递）。

## Subagent 计划

- 节点内仅允许只读 subagent 做接口扫描或现有测试收集；两个分支的唯一写集是 `shared-reference/foundation.md`（foundation 分支）与 `shared-reference/regression-checklist.json`（acceptance 分支），subagent 不得写入其他文件。

## 执行

1. 并行启动两个分支：`foundation_prepare`（workspace="direct"）与 `functional_regression_inventory`（workspace="readonly"）。
2. foundation 分支：解析 `plan.md` 与目标仓库；产出 `shared-reference/foundation.md`（含共享接口、受保护共享路径与本轮基础基线说明）。
3. acceptance 分支：解析 `plan.md` 的功能验收种子；产出 `shared-reference/regression-checklist.json`（含 smoke 标记、required 标记与命令数组）。
4. 两个分支均 `status=="ok"` 时并行体 `status="ok"`；任一 `status=="failed"` 时并行体 `status="failed"`。
5. 整体推进到 `parallel_delivery`（仅当 `status=="ok"`）。

## 事务

- 仅 `shared-reference/foundation.md` 与 `shared-reference/regression-checklist.json` 两个写入动作。
- 准备：解析 `plan.md` 与目标仓库；登记两个分支的读写集。
- 提交：唯一写入者只写已批准内容，不附加临时选项。
- 验证：两份产物均已落盘且非空；分支均为 `ok`。
- 安全中止：任一分支 `maxAttempts=3` 耗尽则停留并由主会话生成 safe_halt 报告。

## 输出与完成条件

- `shared-reference/foundation.md` 已落盘且非空。
- `shared-reference/regression-checklist.json` 已落盘且为合法 JSON。
- 两个分支均 `status=="ok"`。

## 示例

- 正例：`foundation_prepare` 写入 `foundation.md`，`functional_regression_inventory` 写入 `regression-checklist.json`；两份文件均非空 → 并行体 `ok` → 进入 `parallel_delivery`。
- 反例：`functional_regression_inventory` 把真实测试命令直接写入 `regression-checklist.json` 而非纯 JSON 命令数组。
- 反例原因：acceptance 分支仅产出纯 JSON 清单；真实测试由 `parallel_delivery` 的 `verification` 字段承担，避免职责重叠。

## Red Flags

| Rationalization | Correct Action |
|---|---|
| 两个分支合并成一个 foundation 节点 | STOP；保持双分支：foundation 与 regression-checklist 是不同写集、不同会话 |
| acceptance 分支直接产出真实测试 | STOP；acceptance 分支仅产出纯 JSON 清单；真实测试由 `verification` 字段承担 |
| foundation 分支写主分支代码 | STOP；foundation 仅产出共享基础说明文档，不产出业务代码 |
| 顶层 `workspace="readonly"` 与 `foundation` 分支 `"direct"` 冲突 | STOP；顶层不设 `workspace`；由各分支自行声明，避免嵌套冲突 |
| 任一分支失败仍推进 `parallel_delivery` | STOP；任一分支 `status=="failed"` 即整体 `failed`；`parallel_delivery` 不启动 |
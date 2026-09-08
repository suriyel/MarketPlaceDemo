---
name: foundation_prepare
description: 解析 spec_plan 产出并写入共享基础说明文档；当 foundation_inventory_parallel.foundation 分支启动时使用。
---

# 共享基础串行准备

违反规则字面即违反规则精神。

## 目标

- 解析 `shared-reference/plan.md` 与目标仓库；产出 `shared-reference/foundation.md`。
- 文档含共享接口、受保护共享路径与本轮基础基线说明。

## 非目标

- 不编写新业务功能；不修改主分支。
- 不产出 `shared-reference/regression-checklist.json`（属于 `functional_regression_inventory`）。

## 输入与前置

- `spec_plan` 产出（`shared-reference/plan.md` + 运行时任务清单）。
- 目标仓库路径与已冻结的 `interfaces` 契约。

## 约束

- `workspace="direct"`（继承自 `foundation_inventory_parallel.foundation` 分支）。
- `modelTier: "heavy"`；无内层 `onFail`（属准备阶段；分支失败由 `foundation_inventory_parallel` 整体 `failed` 汇聚，下游 `parallel_delivery` 入边 `when: status == "ok"` 隐式阻断）。
- 主会话唯一写入 `shared-reference/foundation.md`。

## Subagent 计划

- 可启用临时只读 subagent 做接口扫描；本分支唯一写集是 `shared-reference/foundation.md`，subagent 不得写入其他文件。

## 执行

1. 解析 `shared-reference/plan.md` 与目标仓库；提取共享接口与受保护共享路径。
2. 写入 `shared-reference/foundation.md`（含共享接口、受保护共享路径与本轮基础基线说明）。
3. 验证文档已落盘且非空；返回 `status="ok"`。

## 事务

- 仅 `shared-reference/foundation.md` 写入动作。
- 准备：解析 `plan.md` 与目标仓库。
- 提交：唯一写入者只写已批准内容。
- 验证：文档已落盘且非空。
- 安全中止：`maxAttempts=3` 耗尽则停留并由主会话生成 safe_halt 报告。

## 输出与完成条件

- `shared-reference/foundation.md` 已落盘且非空。
- 返回 `status="ok"`。

## 示例

- 正例：`plan.md` 中已冻结 `interfaces: ["CON-ORDER-API-v2"]`、`protected_shared_paths: ["server/routes/index.js"]` → 解析后写入 `foundation.md`（含共享接口列表、受保护路径与本轮基础基线说明） → 返回 `status="ok"`。
- 反例：跳过 `plan.md`，由 main 会话凭记忆直接写出 `foundation.md` 中的接口列表。
- 反例原因：`plan.md` 是共享接口与受保护路径的唯一真源；绕开它会让 foundation 文档与并行交付契约漂移，导致 `parallel_delivery` 启动时 `interfaces` frozen snapshot 与文档不一致。

## Red Flags

| Rationalization | Correct Action |
|---|---|
| foundation 分支写主分支代码 | STOP；仅产出共享基础说明文档 |
| foundation 分支直接产出真实测试 | STOP；测试由 `parallel_delivery` 的 `verification` 字段承担 |
| 跳过 `plan.md` 直接产出 `foundation.md` | STOP；`plan.md` 是共享接口与受保护路径的唯一真源 |
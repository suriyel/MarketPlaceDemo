---
name: spec_plan
description: 形成并线计划与 development 任务清单播种；当需要启动并线迭代开发并要求最终做统一验证时使用。
---

# 并线计划与任务播种

违反规则字面即违反规则精神。

## 目标

- 基于用户原始意图，产出 `development` tasksSchema 实例清单并通过 `bp-tasks set` 注入到运行时。
- 落盘 `shared-reference/plan.md` 作为本轮目标、并行块、共享接口与功能验收种子的唯一真源。
- 由用户在 `approvalAsk` 弹窗中点击通过后进入 `foundation_inventory_parallel`。

## 非目标

- 不执行项目探索；不调用 `project-explore-parallel`。
- 不编写代码或测试用例；不产出 `shared-reference/foundation.md` 或 `regression-checklist.json`（属于后续节点）。
- 不修改 `tasksSchemas.development` 字段定义（顶层定义在 `blueprint.json`）。

## 输入与前置

- 用户原始意图与目标仓库绝对路径。
- 允许读取：`shared-reference/` 已存在的上游文档（首次进入时通常为空）。
- 允许读取：蓝图 `blueprint.json` 中 `tasksSchemas.development` 的字段约束与示例。

## 约束

- `tasksSchema.development` 每个实例必须满足 `requiredFields`：含 `id`、`title`、`goal`、`repo`、`scope`、`owned_paths`、`protected_shared_paths`、`interfaces`、`done_when`、`verification`。
- `verification` 至少 1 条；每条至少含 `name` 与 `command`；`expectedExitCode` 缺省取 `0`，`timeoutMs` 缺省取 `300000`。
- 跨实例 `owned_paths` 不得重叠；`protected_shared_paths` 与其他实例 `owned_paths` 不得相交；`interfaces` 是契约冻结字段，运行期间不得修改接口签名。
- 调用 `bp-tasks set` 一次；任务实例数 ≥ 1；JSON 体 `schema` 字段为 `"development"`。
- `approvalAsk=true`：用户在弹窗中点击 `Passed` 才推进；含糊答复不构成批准。

## Subagent 计划

- 可在节点内临时启用只读 subagent 做技术栈/接口预调查；本节点的唯一写集是 `shared-reference/plan.md` 与运行时任务清单（由 `bp-tasks set` 注入），subagent 不得写入其他文件。

## 执行

1. 解析用户原始意图与目标仓库路径；按 `tasksSchemas.development.requiredFields` 校验每个 task 实例。
2. 写 `shared-reference/plan.md`（包含目标、并行块划分、共享接口与功能验收种子清单）。
3. 通过 `bp-tasks set <loopId> --items-stdin=<json>` 或 `--items-file=<path>` 注入 `development` 实例清单（loopId 与 `parallel_delivery` 节点关联）。
4. 调用 `AskUserQuestion` 触发 `approvalAsk` 弹窗，向用户展示目标、并行块、共享接口、受保护共享路径与功能验收种子。
5. 用户点击 `Passed` 后推进到 `foundation_inventory_parallel`；否则本节点保持 `status=awaiting_approval` 并把 `approvalAsk` 弹窗置于待响应状态，由主会话按常规重试。

## 事务

- 仅 `bp-tasks set` 与落盘 `shared-reference/plan.md` 两个写入动作。
- 准备：解析精确目标与任务清单；登记读写集为 `plan.md` 与运行时任务列表。
- 提交：唯一写入者只写已批准内容，不附加临时选项。
- 验证：用户在 `approvalAsk` 弹窗中点击 `Passed`；`plan.md` 已落盘。
- 安全中止：失败时 `spec_plan` 状态停留；主会话生成 safe_halt 报告并保留 evidence。

## 输出与完成条件

- `shared-reference/plan.md` 已落盘且非空。
- `bp-tasks set` 已完成；任务实例数 ≥ 1；每个实例满足 `tasksSchema.development` 校验。
- 用户已在 `approvalAsk` 弹窗中点击 `Passed`。

## 示例

- 正例：用户意图"为订单后端做权限模块重构并补齐单元测试" → 主会话产出 `backend-orders` + `frontend-permission` 两个 task 实例，`interfaces: ["CON-ORDER-API-v2"]` 共享契约冻结，`verification` 各含 ≥1 条命令。
- 反例：直接调用 `bp-tasks set` 但 `verification` 数组为空 → 触发 `tasksSchema.development.minItems` 校验失败。
- 反例原因：违反 `tasksSchema.development` `minItems: 1` 约束；`block_verify` 阶段无可执行命令将无法完成自验。

## Red Flags

| Rationalization | Correct Action |
|---|---|
| 把 spec 与 prep 合并更省事 | STOP；保持独立：`spec_plan` 与 `foundation_inventory_parallel` 失败路由不可分 |
| block_implement 内也包含测试编写 | 仅当 `verification` 字段已填；禁止把测试用例搬到独立 task |
| spec_plan 直接产出验收清单 | 验收清单是 `foundation_inventory_parallel.acceptance` 分支的产物，避免职责重叠 |
| 跳过 `bp-tasks set` 直接进入下一节点 | STOP；`parallel_delivery` 依赖运行时任务清单；缺失将导致 `iterator.tasks` 为空 |
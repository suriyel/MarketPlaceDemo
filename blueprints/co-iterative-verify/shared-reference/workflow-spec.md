# co-iterative-verify 工作流规格

状态：draft
ID：co-iterative-verify
版本：1.0.0
规格内容摘要：<sha256 占位 — 用户明确批准后由父会话写入账本；规格文件本身不预先填入以避免字节变化使 SHA-256 失效>

## 目标与非目标

### 目标
- 让多个开发块在隔离 git worktree 中并线迭代开发（`parallel_delivery`）。
- 在每个开发块内同时产出实现代码与验证测试用例（测试用例写在 `tasksSchema.development.verification` 字段，由 `block_implement` 阶段产出，`block_verify` 阶段执行）。
- 最终进入统一验证阶段（`functional_validation`），由用户在 `Passed` 决策下完成验收。
- 工作流能力独立于 `parallel-development-core` 而存在；不依赖已有工作流的运行时引用。

### 非目标
- 不替代 `project-explore-parallel`：需要项目证据时请单独调用；本工作流自身不引入 `plan` 前置节点。
- 不替代 BRM 记忆注入、需求文档生成等其他工作流。
- 不强制实跑新生成的业务工作流（workflow-spec.md L11）。
- 不更新、覆盖或自动改名已有工作流（workflow-spec.md L7）。
- 不在生成包中包含 `call`、`references`、`reuseUserAssets` 或本机资产运行时依赖（workflow-spec.md L9）。
- 不引入新的并行扇出语法（仅复用 `kind:"parallel"` + `iterator.kind:"tasks"` 现有范式）。
- 不增加独立 `validate`、`approval` 或 `handoff` 节点（workflow-spec.md L10）。
- 不重复 blueprint-creator baseline 已声明的框架级约束（记忆加载、ticket、生命周期、等待、通用收尾）；本规格仅写本工作流特有的业务契约（workflow-spec.md L57-58 节点文档不变量）。

## 输入与输出

### 用户输入
- 工作流目标：用户简述要并线迭代开发的内容（例如："为订单后端做权限模块重构并补齐单元测试"）。
- 项目路径：根目录绝对路径（注入到 `tasksSchema.development.repo`）。
- 任务清单：用户在 `spec_plan` 阶段产出若干 `development` task 实例，通过 `bp-tasks set` 注入。
- 是否审批：默认 `spec_plan` 与 `functional_validation` 两处强制 `approvalAsk=true`；其他节点不设审批门。

#### `bp-tasks set` 调用契约
- 命令：`bp-tasks set <loopId> --items-stdin=<json>` 或 `--items-file=<path>`（参见 `bp-tasks` shim 注入路径）。
- JSON 体形如：
  ```json
  {
    "schema": "development",
    "tasks": [
      {
        "id": "backend-orders",
        "title": "订单后端模块",
        "status": "pending",
        "goal": "完成订单模块本轮全部后端功能",
        "repo": "D:/project/app",
        "scope": "backend/module/orders",
        "owned_paths": ["server/orders/"],
        "protected_shared_paths": ["server/routes/index.js"],
        "interfaces": ["CON-ORDER-API-v2"],
        "done_when": ["批准的订单主流程全部通过"],
        "verification": [
          { "name": "unit-tests", "command": "node --test server/orders/__tests__/*.test.js", "timeoutMs": 300000, "expectedExitCode": 0 }
        ]
      }
    ]
  }
  ```
- 完成条件：任务实例数 ≥ 1；每个实例满足 `tasksSchema.development` 的 `requiredFields` 校验；`verification` 字段至少 1 条。
- 调用时序：仅在 `spec_plan` 节点主会话内调用一次；后续 `parallel_delivery` 通过 `iterator.tasksSchemaRef="development"` 自动展开。

### 运行时事实
- 工作流起点：`spec_plan`。
- 工作区约束：`foundation_inventory_parallel` 不设顶层 `workspace` 字段，由各分支自行声明（`foundation` 分支 `workspace="direct"`、`acceptance` 分支 `workspace="readonly"`，避免嵌套冲突）；`parallel_delivery` 顶层 `workspace="worktree"`，`gitInit=true`，`worktreeRequired=true`。
- git 约束：每个 `parallel_delivery` 实例独占 git worktree；`integrate` 合并至主分支；合并完成后清理 worktree。
- 任务清单来源：`spec_plan` 通过 `bp-tasks set` 注入；schema 引用 `tasksSchemas["development"]`。

### 持久产物

| 路径 | 基准根 | 写入节点 | 消费者 |
|---|---|---|---|
| `plans/co-iterative-verify-spec.md` | `{{HARNESS_MEMORY_DIR}}` | spec 阶段（父会话） | 整个 run |
| `shared-reference/plan.md` | `{{HARNESS_MEMORY_DIR}}/workflows/co-iterative-verify/<run-id>/` | `spec_plan` | `foundation_inventory_parallel`、`integrate`、`functional_validation` |
| `shared-reference/foundation.md` | 同上 | `foundation_prepare` | `parallel_delivery` |
| `shared-reference/regression-checklist.json` | 同上 | `functional_regression_inventory` | `parallel_delivery`、`integrate`、`functional_validation` |
| `shared-reference/validation-report.md` | 同上 | `functional_validation` | run 完成证据 |
| 多个 git worktree | 目标仓库 | `parallel_delivery` | `integrate` |
| 主分支变更 | 目标仓库 | `integrate` | run 完成交付 |

### 完成信号
- `functional_validation` 节点的 `terminalWhen="status == \"ok\" && next_input.__decision == \"Passed\""` 命中。
- `next_input.__decision` 字段来源：`functional_validation` 节点的 `approvalAsk=true` 触发用户弹窗，用户点击按钮后引擎返回 envelope，envelope 的 `__decision` 字段取值为字符串 `"Passed"` 或 `"Not Passed"`（区分大小写；用户可点击取消则 envelope 不携带 `__decision`，节点进入重试）。
- 用户在 `functional_validation` 的 `approvalAsk` 弹窗中点击 `Passed`。
- `shared-reference/validation-report.md` 已落盘。

### 失败终态
- 任意 `onFail` `maxAttempts` 耗尽 → 节点停留在 `halted_max` 状态（参见 `workflow-authoring-standard.md` L73）；主会话生成 safe_halt 报告并保留 evidence，禁止换 ID/换措辞/重启会话绕过。
- `parallel_delivery` 任一 task 实例失败且 `block_verify.onFail.rewindTo:block_implement` 三轮耗尽 → 该 task 实例进入 `failed`；并行体整体 `status="failed"`；沿 `parallel_delivery → integrate`（`when: status == "failed"`）汇聚；下游 `integrate.onFail.rewindTo:repair_orchestrator` 接管。
- `repair_orchestrator` 自身决策失败（`ReturnIntegrate`/`ReturnFunctionalValidation` 都无法产出）→ 主会话升级用户决策（用户手动选整合或重做或终止）；若用户选择终止则 safe_halt 并保留 evidence。

## tasksSchema.development 定义

放置在 `blueprint.json` 顶级 `tasksSchemas` 字段中，被 `parallel_delivery.iterator.tasksSchemaRef` 引用。

```json
{
  "tasksSchemas": {
    "development": {
      "requiredFields": {
        "id":          { "type": ["string", "number"], "description": "开发块唯一标识" },
        "title":       { "type": "string", "description": "开发块标题" },
        "status":      { "type": "string", "default": "pending", "description": "运行时由 iterator 设置" },
        "goal":        { "type": "string", "description": "开发块业务目标" },
        "repo":        { "type": "string", "format": "abs-path", "description": "目标仓库绝对路径" },
        "scope":       { "type": "string", "description": "开发块路径范围（人类可读）" },
        "owned_paths": { "type": "array", "items": { "type": "string" }, "description": "本实例独占写集；与其他实例不得重叠" },
        "protected_shared_paths": { "type": "array", "items": { "type": "string" }, "description": "禁止本实例修改的共享文件清单" },
        "interfaces":  { "type": "array", "items": { "type": "string" }, "description": "本实例依赖的共享契约标识；跨实例契约冻结后不可修改" },
        "done_when":   { "type": "array", "items": { "type": "string" }, "description": "完成条件清单（人类可读）" },
        "verification":{ "type": "array", "items": { "type": "object", "required": ["name", "command"], "properties": { "name": { "type": "string" }, "command": { "type": "string" }, "timeoutMs": { "type": "integer", "default": 300000 }, "expectedExitCode": { "type": "integer", "default": 0 } } }, "minItems": 1, "description": "验证命令清单；block_verify 阶段按顺序执行，任意 expectedExitCode 不匹配即视为 block_verify 失败" }
      },
      "recommendedFields": {},
      "userFields": {},
      "extensionFieldsAllowed": false,
      "doneValues": ["done"],
      "example": {
        "id": "backend-orders",
        "title": "订单后端模块",
        "status": "pending",
        "goal": "完成订单模块本轮全部后端功能",
        "repo": "D:/project/app",
        "scope": "backend/module/orders",
        "owned_paths": ["server/orders/"],
        "protected_shared_paths": ["server/routes/index.js"],
        "interfaces": ["CON-ORDER-API-v2"],
        "done_when": ["批准的订单主流程全部通过"],
        "verification": [
          { "name": "unit-tests", "command": "node --test server/orders/__tests__/*.test.js", "timeoutMs": 300000, "expectedExitCode": 0 }
        ]
      }
    }
  }
}
```

### 字段约束与冲突检测
- `owned_paths` 跨实例不得重叠；引擎在 `parallel_delivery` 启动前静态检测重叠并报错。
- `protected_shared_paths` 与其他实例的 `owned_paths` 不得相交；引擎在并行启动前静态检测冲突并报错。
- `interfaces` 是契约冻结字段；`parallel_delivery` 启动前取所有实例 `interfaces` 的并集作为 frozen snapshot，运行期间任何 `block_implement` 不得修改接口签名（修改需经 `repair_orchestrator` 升级用户决策）。
- `verification` 至少 1 条；每条至少含 `name` 与 `command`（`required: ["name","command"]`）；`expectedExitCode` 缺省取 `0`，`timeoutMs` 缺省取 `300000`；`block_verify` 按数组顺序执行，任意一条退出码不符即视为该实例 `block_verify` 失败。

## 最小拓扑与必要性

主链：`spec_plan → foundation_inventory_parallel → parallel_delivery → integrate → functional_validation`

旁路：`repair_orchestrator` 作为 `integrate` 与 `functional_validation` 的共享失败回路节点，从这两个节点通过 `onFail.rewindTo` 进入；完成后通过 `decision` 边（`ReturnIntegrate` / `ReturnFunctionalValidation`）回到原节点。

| 节点 | 独立输入/交付物 | 独立失败或审批边界 | 不可合并原因 |
|---|---|---|---|
| `spec_plan` | 用户原始意图 + 任务清单注入 + `shared-reference/plan.md` | `approvalAsk=true` 强制审批；onFail 失败兜底 halt；产出 `development` tasksSchema 实例 | 与 `foundation_inventory_parallel` 合并将导致 spec 阶段失败路由不可分；省略则失去计划阶段 |
| `foundation_inventory_parallel` | `foundation_prepare` 产出 `shared-reference/foundation.md` + `functional_regression_inventory` 产出 `shared-reference/regression-checklist.json` | 任一内部分支 `status=="failed"` 即整体 `failed`；顶层无外层 onFail（属准备阶段而非业务执行） | 两个分支写集不同（基础说明 vs JSON 清单）、会话独立；并行可提速 |
| `parallel_delivery` | 每个 task 实例的 git worktree + `block_implement` 产物 + `block_verify` 产物 | 每个实例内部 `block_verify.onFail.rewindTo:block_implement`（`maxAttempts=3`） | 多 worktree 隔离是独立边界；每个实例独立失败路由 |
| `repair_orchestrator` | 跨阶段多 worktree 修复方案 + `decision` 路由 | 作为 `integrate`/`functional_validation` 的 `onFail.rewindTo` 共享目标；attempt 计数继承自源节点 | 整合多阶段失败修复逻辑；避免链式重做全部 worktree |
| `integrate` | 主分支合并产物 + 启动复核产物 | `onFail.rewindTo:repair_orchestrator`（`maxAttempts=3`）；完成判定仅由出边 `decision: "Passed"` 承担（`Passed` 由 integrate 主会话依据启动复核结果自主判定） | 合并与启动复核是独立交付物；失败语义与 `functional_validation` 不同 |
| `functional_validation` | 完整功能验证结论 + `Passed`/`Not Passed` 决策 | `approvalAsk=true` 强制审批；`onFail.rewindTo:repair_orchestrator`（`maxAttempts=3`）；`terminalWhen="status == \"ok\" && next_input.__decision == \"Passed\""` | 最终验收必须有独立审批门与终态信号 |

### 反例（不引入）
- 把"等待用户批准"建成空节点：审批属于实际执行副作用的业务节点；空节点无独立业务产物（process-template.md L40）。
- 把"review 看起来更清晰"作为新增节点理由：视觉清晰不是独立会话、产物或失败边界（workflow-spec-template.md L71）。
- 把"测试编写"建成独立顶层节点：现有 read_set 中无此实例（F19）；与代码实现跨阶段顺序化违背"并线"语义。

## 路由与并行

### 普通分支（单选）
- `spec_plan → foundation_inventory_parallel`：`when: status == "ok"`；失败兜底：`spec_plan.onFail` 缺省（属计划阶段，按 halt 处理并保留 evidence）。
- `foundation_inventory_parallel → parallel_delivery`：`when: status == "ok"`。
- `parallel_delivery → integrate`：`when: status == "ok"`、`when: status == "failed"`、`when: status == "blocked"`（三态全覆盖）。
- `integrate → functional_validation`：`decision: "Passed"`（启动复核通过；由 integrate 主会话自主判定）。
- `repair_orchestrator → integrate`：`decision: "ReturnIntegrate"`（修复完成可回合并；由 repair_orchestrator 主会话自主判定）。
- `repair_orchestrator → functional_validation`：`decision: "ReturnFunctionalValidation"`（修复完成可回验证；由 repair_orchestrator 主会话自主判定）。

正确示例：

```json
[
  { "from": "parallel_delivery", "to": "integrate", "when": "status == \"ok\"" },
  { "from": "parallel_delivery", "to": "integrate", "when": "status == \"failed\"" },
  { "from": "parallel_delivery", "to": "integrate", "when": "status == \"blocked\"" },
  { "from": "integrate", "to": "functional_validation", "decision": "Passed" },
  { "from": "repair_orchestrator", "to": "integrate", "decision": "ReturnIntegrate" },
  { "from": "repair_orchestrator", "to": "functional_validation", "decision": "ReturnFunctionalValidation" }
]
```

反例：在 `parallel_delivery` 之后只画 `{when: "status == \"ok\""}` 一条边，期望 `failed`/`blocked` 时自动等待。原因：未处理 failure path，触发 unhandled-failure-path lint（parallel-demo.json L6）。

### fanout / parallel

#### `foundation_inventory_parallel`（kind:"parallel"，静态双分支）
- `branches[0]`：`branchId="foundation"`，`body.startNode="foundation_prepare"`，`workspace="direct"`，含 `onFail.rewindTo:foundation_prepare`（`maxAttempts=3`）。
- `branches[1]`：`branchId="acceptance"`，`body.startNode="functional_regression_inventory"`，`workspace="readonly"`，含 `onFail.rewindTo:functional_regression_inventory`（`maxAttempts=3`）。
- `maxConcurrent=2`；顶层不设 `workspace` 字段（避免嵌套冲突；分支 `workspace` 自行生效）。
- 写集约束：两个分支写集不重叠（`foundation.md` vs `regression-checklist.json`）。
- 整体裁决：任一分支 `status=="failed"` 即整体视为 `failed`；`foundation_inventory_parallel` 顶层不出边 `when: status == "failed"`，由下游 `parallel_delivery` 入边条件 `when: status == "ok"` 隐式阻断（`foundation_inventory_parallel` 失败直接导致 `parallel_delivery` 不启动）。

正确示例：

```json
{
  "id": "foundation_inventory_parallel",
  "kind": "parallel",
  "title": "基础与回归清单并行",
  "maxConcurrent": 2,
  "branches": [
    {
      "branchId": "foundation",
      "body": {
        "startNode": "foundation_prepare",
        "nodes": [
          { "id": "foundation_prepare", "title": "共享基础串行准备", "onFail": { "rewindTo": "foundation_prepare", "ticketTitle": "共享基础准备失败", "maxAttempts": 3, "when": "status == \"failed\"" } }
        ],
        "edges": []
      },
      "workspace": "direct"
    },
    {
      "branchId": "acceptance",
      "body": {
        "startNode": "functional_regression_inventory",
        "nodes": [
          { "id": "functional_regression_inventory", "title": "功能回归清单与审阅", "onFail": { "rewindTo": "functional_regression_inventory", "ticketTitle": "功能回归清单失败", "maxAttempts": 3, "when": "status == \"failed\"" } }
        ],
        "edges": []
      },
      "workspace": "readonly"
    }
  ]
}
```

反例：把两个分支写成 `{when: "status == \"ok\""}` 各自独立的 fanout 边并期待并行执行。原因：普通多出边只走第一条匹配；并行必须用 `kind:"parallel"`（workflow-authoring-standard.md L35）。

#### `parallel_delivery`（kind:"parallel"，iterator=tasks 动态多实例）
- `iterator.kind="tasks"`，`iterator.tasksSchemaRef="development"`。
- `body.startNode="block_implement"`。
- `body` 内含 `block_implement → block_verify` 边（`when: status == "ok"`），`block_verify` 含 `onFail.rewindTo:block_implement`（`maxAttempts=3`）。
- `workspace="worktree"`，`gitInit=true`，`worktreeRequired=true`。
- `maxConcurrent=4`：依据 `tasksSchema.development` 的最小切片粒度（典型业务模块级 worktree），且全局 `concurrent=3` 是单节点 subagent 上限，并行 `parallel_delivery` 实例是独立 worktree 会话，4 实例不超过单节点并发预算；本规格在基础默认章节显式声明此差异。
- 写集约束：每个 task 实例必须独占 `owned_paths`；`protected_shared_paths` 防止跨实例写共享文件。
- 部分失败处理：`block_verify.onFail.rewindTo:block_implement`（`maxAttempts=3`）在 worktree 内聚合修复；整体并行失败由 `parallel_delivery` 出边 `when: status == "failed" | status == "blocked"` 路由至 `integrate`。

正确示例：

```json
{
  "id": "parallel_delivery",
  "kind": "parallel",
  "title": "开发块并线交付",
  "iterator": { "kind": "tasks", "tasksSchemaRef": "development" },
  "body": { "startNode": "block_implement", "nodes": [...], "edges": [...] },
  "workspace": "worktree",
  "gitInit": true,
  "worktreeRequired": true,
  "maxConcurrent": 4
}
```

反例：三个并行分支修改同一个文件。原因：并行执行产生覆盖或合并竞态；保留主会话唯一写入者（workflow-authoring-standard.md L52）。

### onFail
| source | rewindTo | when | ticketTitle | maxAttempts |
|---|---|---|---|---|
| `foundation_prepare` | `foundation_prepare` | `status == "failed"` | 共享基础准备失败，本分支内重试 | 3 |
| `functional_regression_inventory` | `functional_regression_inventory` | `status == "failed"` | 功能回归清单失败，本分支内重试 | 3 |
| `block_verify` | `block_implement` | `status == "failed"` | 模块块功能自验失败，原 worktree 内聚合修复 | 3 |
| `integrate` | `repair_orchestrator` | `status == "failed"` | 合并或启动复核失败，进入跨实例整体修复 | 3 |
| `functional_validation` | `repair_orchestrator` | `status == "failed"` | 完整功能验证失败，进入跨实例整体修复 | 3 |

正确示例：

```json
{
  "id": "integrate",
  "onFail": {
    "rewindTo": "repair_orchestrator",
    "ticketTitle": "合并或启动复核失败，进入跨实例整体修复",
    "maxAttempts": 3,
    "when": "status == \"failed\""
  }
}
```

反例：增加 `{ "from": "integrate", "to": "repair_orchestrator" }` 正向 edge。原因：回边没有整改 ticket、attempt 预算和正确失败状态（workflow-authoring-standard.md L68）。

`block_verify.maxAttempts=3` 说明：本规格全局默认 ≤3；`block_verify` 在 worktree 内聚合修复涉及跨接口回归，单 worktree 内 2 次重试（baseline parallel-development-core.json L91）可能无法覆盖，因此采用 3 次。该数值仍在 ≤3 范围内，不属于 D 表外的例外。

三轮上限默认值：所有 `review`/`retry`/`loop`/`onFail` 默认 `maxAttempts<=3`（workflow-spec.md L49）。本规格不申请任何超出 3 的例外。

### loop / review / retry
- 审阅—修订整个 run 最多三轮（spec SKILL.md L97）。
- 校验—修正整个 run 最多三轮（workflow-spec.md L39）。
- 任意计数器达到上限即停止并保留 evidence；禁止换 ID、换措辞、重启会话、重建文件绕过计数（workflow-authoring-standard.md L73）；超限即 `blocked`。

## 节点契约

通用约束：本规格节点契约仅写本节点特有的业务边界与 subagent 调用规则；通用 subagent 禁令（不向用户提问、不调用 DAG 状态变更、不调用导入或删除操作）由 blueprint-creator baseline 统一约束（workflow-spec.md L54-55），不在每个节点重复声明。

### `spec_plan`
- **节点属性**：`modelTier: "heavy"`, `approvalAsk: true`。
- **目标/非目标**：接收用户原始意图，产出 `development` tasksSchema 实例清单并通过 `bp-tasks set` 注入；不执行项目探索；不编写代码或测试。
- **输入/前置**：用户原始意图、目标仓库路径、是否声明需要项目探索。
- **subagent 计划**：可在节点内临时启用只读 subagent 做技术栈/接口预调查。
- **写集与唯一写入者**：主会话写 `shared-reference/plan.md` 与运行时任务列表。
- **输出/完成条件**：`bp-tasks set` 完成（任务实例数 ≥ 1）、`shared-reference/plan.md` 已落盘、用户已在 `approvalAsk` 弹窗中点击 `Passed`。
- **失败兜底**：节点本身无 `onFail`（属计划阶段）；失败时 `spec_plan` 状态停留，由主会话生成 safe_halt 报告并保留 evidence。

| Rationalization | Correct Action |
|---|---|
| 把 spec 与 prep 合并更省事 | 保持独立：spec 与 prep 失败路由不可分；spec 阶段失败应回退计划，不应回退 prep |
| block_implement 内也包含测试编写 | 仅当 `verification` 字段已填；禁止把测试用例搬到独立 task |
| spec_plan 直接产出验收清单 | 验收清单是 `foundation_inventory_parallel.acceptance` 分支的产物，避免职责重叠 |

### `foundation_inventory_parallel`
- **节点属性**：`kind: "parallel"`；不设顶层 `workspace`（避免与分支 `workspace` 嵌套冲突，由各分支自行声明）。
- **目标/非目标**：并行准备共享基础（`foundation_prepare`）与功能回归清单（`functional_regression_inventory`）；不编写新业务功能；不修改主分支。
- **输入/前置**：`spec_plan` 产出（`shared-reference/plan.md` + 任务清单）；目标仓库。
- **subagent 计划**：节点内仅允许只读 subagent 做接口扫描或现有测试收集。
- **写集与唯一写入者**：`foundation_prepare` 写 `shared-reference/foundation.md`（`workspace="direct"`）；`functional_regression_inventory` 写 `shared-reference/regression-checklist.json`（`workspace="readonly"`）；两分支写集不重叠。
- **输出/完成条件**：`foundation.md` 与 `regression-checklist.json` 均已存在且非空；并行分支均 `status=="ok"` 才汇聚到 `parallel_delivery`。任一分支 `status=="failed"` 即整体视为 `failed`，`parallel_delivery` 不启动。
- **失败兜底**：两个内部分支各自有 `onFail`（自循环重试 `maxAttempts=3`）；顶层无外层 `onFail`（属准备阶段）。

| Rationalization | Correct Action |
|---|---|
| 两个分支合并成一个 foundation 节点 | 保持双分支：foundation 与 regression-checklist 是不同写集、不同会话，分支隔离是独立边界 |
| acceptance 分支直接产出真实测试 | acceptance 分支仅产出纯 JSON 清单；真实测试由 `parallel_delivery` 的 `verification` 字段承担 |
| foundation 分支写主分支代码 | foundation 仅产出共享基础说明文档，不产出业务代码 |
| 顶层 `workspace="readonly"` 与 `foundation` 分支 `"direct"` 冲突 | 顶层不设 `workspace`；由各分支自行声明，避免嵌套冲突 |

### `parallel_delivery`
- **节点属性**：`kind: "parallel"`, `iterator.kind="tasks"`, `iterator.tasksSchemaRef="development"`, `workspace="worktree"`, `gitInit=true`, `worktreeRequired=true`, `maxConcurrent=4`。
- **目标/非目标**：每个 `development` task 实例在隔离 git worktree 中实现代码 + 编写测试用例 + 自验；不跨实例写共享文件；不在主分支提交。
- **输入/前置**：`foundation_inventory_parallel` 产出（`foundation.md` + `regression-checklist.json`）；运行时任务清单。
- **subagent 计划**：每个 task 实例可启用临时只读 subagent 做现有接口扫描或测试命令验证。
- **写集与唯一写入者**：每个实例独占 `owned_paths`；worktree 内主会话唯一写入者；`interfaces` 字段冻结共享契约。
- **输出/完成条件**：每个实例 `block_verify` 返回 `status=="ok"`（`interfaces` 字段冻结契约 + `verification` 命令全部通过 `expectedExitCode`）。整体并行体支持 `ok`/`failed`/`blocked` 三态汇聚。
- **失败兜底**：每个实例内部 `block_verify.onFail.rewindTo:block_implement`（`maxAttempts=3`）。

| Rationalization | Correct Action |
|---|---|
| 跨 worktree 改 `protected_shared_paths` | 停止：跨实例写共享文件是 partial failure 的根因 |
| 把测试编写搬到独立 task | 停止：测试编写是 `block_implement` 内的 `verification` 字段产出（用户决策 D2） |
| `block_verify` 失败不回 `block_implement` | 停止：`onFail.rewindTo:block_implement` 是 worktree 内聚合修复的唯一路径 |
| 忽略 `parallel_delivery` 的 `blocked` 状态 | 停止：`blocked` 是合法三态之一，必须有对应出边 |

### `repair_orchestrator`
- **节点属性**：`modelTier: "heavy"`；自身无独立 `onFail`（属跨阶段修复节点）。
- **目标/非目标**：在 `integrate` 或 `functional_validation` 失败后进行跨实例跨阶段的整体修复；不重写 `spec_plan`；不修改 `foundation_inventory_parallel` 的产物；不修改 `tasksSchema.development` 字段定义。
- **输入/前置**：来自 `integrate`/`functional_validation` 的 `onFail` ticket；当前 worktree 状态与主分支状态。
- **subagent 计划**：可启用临时只读 subagent 做失败模式分析。
- **写集与唯一写入者**：在原 worktree 内主会话唯一写入者；可跨多个 worktree 协调修复。
- **attempt 计数继承**：attempt 计数继承自源节点（`integrate` 或 `functional_validation`）的 `maxAttempts`（已被消耗的 attempts 不重置，但来自同一 `onFail` ticket 的总 attempt 预算仍受源节点 `maxAttempts=3` 限制）。源节点 `maxAttempts=3` 耗尽时 `repair_orchestrator` 自动停止接受新 ticket；主会话升级用户决策（整合 / 重做 / 终止）。
- **输出/完成条件**：`decision="ReturnIntegrate"` 或 `decision="ReturnFunctionalValidation"`，由 `repair_orchestrator` 主会话在判定修复完成后输出。
- **内部失败路径**：若 `repair_orchestrator` 内部决策失败（无法产出 `ReturnIntegrate`/`ReturnFunctionalValidation`），主会话升级用户决策（用户手动选整合 / 重做 / 终止）；若用户选择终止则 safe_halt 并保留 evidence，禁止自动 retry。

| Rationalization | Correct Action |
|---|---|
| repair 后直接重试不回到原节点 | 停止：决策路由必须显式 `ReturnIntegrate`/`ReturnFunctionalValidation`；不可让原节点自动 ok |
| 在 `repair_orchestrator` 内执行实跑 | 停止：节点内 subagent 仅做只读分析；实跑属于原节点职责 |
| repair 修改 `tasksSchema.development` 字段定义 | 停止：tasksSchema 顶层定义在 `blueprint.json`，运行时不修改 |
| `repair_orchestrator` 内部 attempt 自增无限循环 | 停止：attempt 计数继承源节点 `maxAttempts=3`；耗尽即停 |

### `integrate`
- **节点属性**：`modelTier: "heavy"`。
- **目标/非目标**：合并所有 `parallel_delivery` worktree 至主分支并完成启动复核；不执行完整功能验证（属于 `functional_validation`）。
- **输入/前置**：`parallel_delivery` 所有实例 `status`；主分支当前状态；`regression-checklist.json` 中的 smoke 命令。
- **subagent 计划**：可启用临时只读 subagent 做合并冲突分析。
- **写集与唯一写入者**：主会话唯一写入主分支。
- **输出/完成条件**：所有 worktree 已合并；启动复核（依赖 `regression-checklist.json` 中标记为 smoke 的命令 + 主分支编译）通过；`decision="Passed"`。
- **完成判定**：仅由出边 `decision: "Passed"` 承担路由（`Passed` 由 integrate 主会话依据启动复核结果自主判定，**非用户审批**；与 `functional_validation` 的 `Passed` 字段来源不同）。**不设 `terminalWhen`**，避免与 `functional_validation` 的 `terminalWhen` 中 `__decision` envelope 字段语义混淆。
- **失败兜底**：`onFail.rewindTo:repair_orchestrator`（`maxAttempts=3`）。

| Rationalization | Correct Action |
|---|---|
| 合并失败直接 halt | 停止：必须 `onFail.rewindTo:repair_orchestrator`，`maxAttempts=3` |
| `functional_validation` 失败也回 `integrate` | 停止：`integrate` 与 `functional_validation` 失败语义不同；分别通过 `repair_orchestrator` 的 `ReturnIntegrate`/`ReturnFunctionalValidation` 回到对应阶段 |
| 合并时跳过 `interfaces` 契约校验 | 停止：契约冻结是并行交付的不变条件 |
| integrate 的 `Passed` 来自用户审批 | 停止：`integrate` 的 `Passed` 由 integrate 主会话自主判定；用户审批仅发生在 `spec_plan` 与 `functional_validation` |
| 给 integrate 加 terminalWhen 用 `__decision` | 停止：integrate 不设 `terminalWhen`；完成判定由出边 `decision: "Passed"` 承担，避免与 `functional_validation` 的 `__decision` envelope 语义混淆 |

### `functional_validation`
- **节点属性**：`modelTier: "heavy"`, `approvalAsk: true`。
- **目标/非目标**：执行完整功能验证并产出最终验收结论；不修改业务代码（仅在验证失败时通过 `repair_orchestrator` 修复）。
- **输入/前置**：`integrate` 产出（合并后主分支 + 启动复核报告）；`regression-checklist.json` 中的全部验收命令。
- **subagent 计划**：可启用临时只读 subagent 做断言级别取证。
- **写集与唯一写入者**：主会话写 `shared-reference/validation-report.md`。
- **输出/完成条件**：所有 `regression-checklist` 断言通过；`terminalWhen="status == \"ok\" && next_input.__decision == \"Passed\""` 命中（`__decision` 由 `approvalAsk=true` 弹窗的用户点击返回，合法值 `"Passed"`/`"Not Passed"`，区分大小写）；`shared-reference/validation-report.md` 已落盘。
- **失败兜底**：`onFail.rewindTo:repair_orchestrator`（`maxAttempts=3`）。

| Rationalization | Correct Action |
|---|---|
| `Passed` 由节点自动判定而非用户 | 停止：`approvalAsk=true` 要求用户在弹窗中点击 `Passed` |
| 验证失败直接 halt | 停止：必须 `onFail.rewindTo:repair_orchestrator`，`maxAttempts=3` |
| 跳过 `regression-checklist.json` 中标记 required 的命令 | 停止：清单是完整功能验证的输入契约 |

## 确定性脚本与测试

### 脚本
- 本工作流不引入新 `.cjs` 脚本（schemaVersion 3 已移除纯 script 节点，workflow-spec.md L13）。
- 节点内确定性逻辑（如 `regression-checklist.json` 的合并与校验）由节点 subagent 在会话内执行，不产出独立的脚本文件。
- 节点契约中所列的 `verification` 命令（如 `"node --test server/orders/__tests__/*.test.js"`）由调用方注入；本工作流不内置命令集。
- `verification` 命令由 `bp-blueprint-creator:build` 节点在最终 `blueprint.json` 中按 schema 内联生成（参见 `tasksSchema.development` 定义的 `verification` 字段类型）；spec 阶段不创建暂存目录（spec SKILL.md L20）。

### RED
- 不适用：spec 阶段不执行测试。
- 工作流进入 build 后由 `bp-blueprint-creator:build` 节点负责 RED/GREEN 与权威 validate（workflow-spec.md L37-39）。

### GREEN
- 不适用：spec 阶段不执行测试。
- 工作流进入 build 后由 `bp-blueprint-creator:build` 节点负责权威 `validate` 与可选的 `lint` 校验。

## 副作用与事务

### 影响对象
- 主分支（`integrate` 节点合并后写）：影响目标仓库当前主分支状态。
- 多个 git worktree（`parallel_delivery` 节点创建/合并）：影响仓库磁盘使用与 git 引用。
- `shared-reference/` 目录下的 `plan.md`、`foundation.md`、`regression-checklist.json`、`validation-report.md`：影响工作流运行时账本的可追溯性。
- 任务清单（`bp-tasks set` 注入）：影响 `parallel_delivery` 实例数与写集。

### 审批动作
- `spec_plan`：用户在 `approvalAsk` 弹窗中审批后才能进入 `foundation_inventory_parallel`。
- `functional_validation`：用户在 `approvalAsk` 弹窗中点击 `Passed` 才算工作流完成。

### Prepare / Commit / Verify
- **Prepare**：`spec_plan` 完成后通过 `bp-tasks set` 注入任务清单；`foundation_inventory_parallel` 完成后两个分支产物均已落盘。
- **Commit**：`parallel_delivery` 完成后所有 worktree 状态已记录在主会话账本中；`integrate` 完成后主分支已合并所有 worktree。
- **Verify**：`functional_validation` 完成后 `validation-report.md` 落盘，用户已审批。

### 回滚或安全中止
- `integrate` 失败 → `onFail.rewindTo:repair_orchestrator`（`maxAttempts=3`）；超限即 `blocked`，保留 evidence（workflow-authoring-standard.md L73）。
- `functional_validation` 失败 → 同上。
- `repair_orchestrator` 内部决策失败 → 主会话升级用户决策（用户手动选整合 / 重做 / 终止）；用户选择终止则 safe_halt 并保留 evidence。
- 任意 `onFail` 三轮耗尽 → safe_halt 报告（保留 evidence，禁止换 ID 绕过）。
- 不删除已创建 worktree；不清空 `shared-reference/` 已落盘产物（故障可追溯）。
- 合并冲突不可解决 → `repair_orchestrator` 内显式升级用户决策；不自动覆盖或改名（workflow-spec.md L41）。

## 合规与验收

### 权威 validate
- `violations=0`（`POST /_blueprint/validate`，workflow-spec.md L38）。
- `lint=0` 或逐条批准豁免（workflow-spec-template.md L54）。

### lintspec 默认值表
| lint 检测项 | 默认状态 | 触发条件 | 本规格处置 |
|---|---|---|---|
| `unhandled-failure-path` | ON | `failed`/`blocked` 沿无条件边变 `done` | `parallel_delivery → integrate` 显式覆盖 ok/failed/blocked 三态；其他失败边均有 `onFail` 块 |
| 缺失 `onFail.when` | 强制 | `onFail` 块未声明 `when` 条件 | 所有 `onFail` 块均含 `when: status == "failed"` |
| 缺失 `onFail` 块 | 强制 | 节点有失败边但无 `onFail` 块 | `block_verify`、`integrate`、`functional_validation` 均含 `onFail` 块；`foundation_prepare`/`functional_regression_inventory` 含分支内 `onFail`；`repair_orchestrator` 自身无 `onFail`（属跨阶段修复节点，attempt 继承自源节点） |
| `maxAttempts > 3` 无豁免 | 强制 | `maxAttempts` 超 3 但规格未声明例外 | 所有 `maxAttempts` 均 ≤3；无申请例外 |
| 自包含目标含 `call`/`references`/`reuseUserAssets` | 强制 | 生成包内出现禁止项 | 生成包不含禁止项（workflow-spec.md L9） |
| 后向 edge | 强制 | 出现 `B → A` 正向回边 | 无后向 edge；返工统一走 `onFail.rewindTo` |

### 静态/单元/场景检查
- 静态：`blueprint-bridge.cjs` 的 structural parse（exit 1 仅在 syntax error）。
- 单元：`blueprint-bridge.cjs` 的 `__tests__/blueprint-bridge.test.cjs` 覆盖 `EXIT_SEMANTIC`/`EXIT_USAGE`/`EXIT_TRANSPORT` 退出码。
- 场景：未强制实跑新生成的业务工作流（workflow-spec.md L11）。

### 默认是否实跑
- 否（workflow-spec.md L11）。
- 工作流进入 `build` 节点后由 `bp-blueprint-creator:build` 自行决定是否实跑生成的业务工作流。

## 已确认决策与未决项

### 已确认决策
| ID | 议题 | 用户原话 | 规范化决策 |
|---|---|---|---|
| D1 | 结构形态 | 自包含新建（复用节点范式） | 独立 ID/独立 nodes，自包含；节点范式借鉴 parallel-development-core；tasksSchema/节点标题/接口/约束为这个意图特化 |
| D2 | 测试用例编写承载 | 内嵌在 block_implement | 写入 `tasksSchema.development.verification` 字段，由 `block_implement` 阶段产出；不引入独立顶层节点 |
| D3 | 项目探索前置 | 不增加前置（spec_plan 为起点） | 不引入 plan 前置节点；用户需要项目探索证据时单独调用 project-explore-parallel |
| D4 | 节点清单 | 6 节点拓扑（含 repair_orchestrator） | spec_plan → foundation_inventory_parallel → parallel_delivery → integrate → functional_validation + repair_orchestrator 共享失败回路 |

### 基础默认（沿用 blueprint-creator 已批准 baseline）
- `schemaVersion=3`。
- 所有 `review`/`retry`/`loop`/`onFail` 默认 `maxAttempts<=3`；本规格不申请任何超出 3 的例外。
- `block_verify.maxAttempts=3` 已在基础默认范围内（与 baseline `parallel-development-core.json` L91 的 `maxAttempts=2` 同在 ≤3 区间；选 3 是为 worktree 内聚合修复提供足够重试预算）。
- `parallel_delivery.maxConcurrent=4` 与全局 `concurrent=3` 不同：前者是 `kind:"parallel"` 节点的实例并行上限（独立 worktree 会话），后者是单个 `kind:"script"` 或 DAG 节点的 subagent 上限；本规格在路由与并行章节显式声明此差异。
- 禁止后向 edge、纯 `kind:"script"` 节点、自包含目标中的 `call`/`references`/`reuseUserAssets`。
- 默认不实跑新生成的业务工作流。
- 不更新或覆盖已有工作流；不自动改名。

### 高影响未决项
- 无。

## 批准

- 用户明确批准原话：（待批准后填入）
- 批准时间：（待批准后填入）
- 获批摘要：（待规格定稿后计算并填入 SHA-256）
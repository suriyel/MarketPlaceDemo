---
name: plan
description: 一次完成项目探索的输入校验、低成本分型、相关文档搜索、module 识别和动态任务播种，不生成过程型 Markdown。
---

# 校验输入并动态规划

本节点必须快速完成。只做足够支撑任务拆分的浅层扫描，不写简报或计划文档。

## 1. 校验输入与边界

1. 当前工作目录是唯一目标项目。用户文字中若指定了不同路径，使用
   `{{ADVANCE_BLOCKED notes="目标项目路径与当前工作目录不一致，请统一后重试"}}`。
2. 用户原始输入必须包含可回答的目的、需求或问题；只有“看看项目”一类空泛要求时暂停。
3. 读取已注入的 @需求文档；显式引用但不存在或不可读时暂停。权威顺序：用户明确指令 >
   标为权威的 @文档 > 其他 @文档 > 仓库普通文档与现状。
4. 全流程只读目标项目：禁止修改文件/Git、安装依赖、构建、测试、启动服务、联网、读取密钥，
   或跟随项目根外链接。

未指定深度时使用 `standard`。

## 2. 用最少读取完成分型

只查看顶层结构、项目指令、README、workspace/依赖清单、构建入口和与用户目的直接命中的文档。
从用户输入提取术语、module 名、数据对象和历史决策主题，再定向搜索需求、规格、ADR、RFC、设计和
运维文档；不做全库摘要。

判断项目是 code/docs/config/data/mixed，识别 workspace、应用、服务、包或 module 边界。大型项目
按相关性选择高相关 module，并在需要时安排一个跨 module 调用链任务。

先判定是否为绿地项目。只有同时满足以下条件才算绿地：

- 目标根没有与用户目的相关的现有实现、实质文档、架构、配置、数据或历史决策；
- 现有内容至多是空目录、`.git`、占位 README、空壳脚手架或通用忽略文件；
- 用户目标是从零建设，而不是在已有项目中新增一个尚不存在的特性。

以下情况不算绿地：已有项目只是相关 module 尚未实现；存在可复用的代码风格、架构约束、依赖或
项目文档；目标本身就是有实质内容的文档/配置/数据项目。证据不足时按 `existing`，不得误短路。

确认绿地后，不写任务文件、不创建任何 Markdown、不继续扫描，立即：

{{ADVANCE_OK artifact=none next=__decision=Greenfield notes="绿地项目：目标根没有与用户目的相关的可探索现状；未启动探索 Agent，直接结束"}}

若目标根已有内容，但用户给出的实现目标、改动范围和验收条件已经足够明确，且再做项目探索不会降低
实现风险或补充决策依据，则本次探索不适用。此时同样不写任务文件、不创建任何 Markdown、不继续扫描，立即：

{{ADVANCE_OK artifact=none next=__decision=SkipExploration notes="本次目标与范围已明确，项目探索不适用；未启动探索 Agent，交由后续开发工作流直接规划和实现"}}

不得仅因任务很小、熟悉技术栈或想节省时间而跳过；只要仍需确认现状、调用关系、约束、影响范围或
验收依据，就按下文生成必要的最小探索任务。

候选覆盖项只用于判断，不代表固定启动 Agent：相关文档、需求到实现、架构/数据流、项目规则与风格、
二三方复用、构建测试体系、相关 module、风险与历史决策。不存在、不相关或内容太少时合并或跳过。

## 3. 生成最少但足够的任务

- 任务数 1–16；`quick` 通常 1–3、`standard` 通常 2–6、`deep` 通常 4–16。
- 每项必须直接回答用户问题，范围不重叠；按探索价值从高到低排列，调度器按数组顺序补位。
- 大项目采用横向公共任务 + 纵向 module 任务；module 太多时聚类，不追求伪全覆盖。
- 文档搜索必须有目的；没有必要独立成任务时并入相关 module/主题任务。
- `scope` 写相对当前项目根的文件/目录。
- `deliverable` 使用唯一、安全的 `<task-id>-<topic>.md`，禁止目录穿越。
- 每个任务要求 `file:line` 或 `path#字段` 证据。

每个 task 还必须选择正交的域内探索维度。维度不是固定检查清单，应随专题内容变化；例如代码专题可选
入口/调用链、数据与状态、异常与恢复、配置与集成、测试与可观测性，文档专题可选权威来源、需求—实现
追踪、冲突、历史决策和隐式约束。维度之间不得只是同义改写，也不得按目录机械拆分。

按用户深度和本次外层 task 总数设置内部预算：

| 深度 | task 1–3 | task 4–7 | task 8–16 |
|---|---|---|---|
| `quick` | 2 probes / 1 follow-up | 2 / 1 | 2 / 1 |
| `standard` | 4 / 2 | 3 / 2 | 2 / 1 |
| `deep` | 5 / 3 | 4 / 2 | 3 / 1 |

`dimensions` 条数必须等于 `probeBudget`；`followupBudget` 是 Reviewer 发现独立、可精确界定缺口后可派发的
最大补探 Agent 数，不是必须用满的配额。

每项必须严格使用下列 JSON 结构；数组字段禁止写成空格分隔字符串，不得遗漏字段或增加未知字段：

```json
{
  "id": "T01-topic",
  "title": "直接回答用户问题的专题名",
  "category": "module",
  "module": "相关模块名",
  "purpose": "本任务要回答的具体问题",
  "scope": ["相对目录/", "相对文件"],
  "questions": ["必须回答的问题"],
  "evidenceRequired": ["关键结论提供 file:line 或 path#字段"],
  "dimensions": ["入口与调用链", "状态生命周期", "异常与恢复"],
  "probeBudget": 3,
  "followupBudget": 2,
  "sourceRefs": ["用户问题或需求文档引用"],
  "deliverable": "T01-topic.md"
}
```

没有合适值时，`module` 写 `cross-module`、`sourceRefs` 写用户原始需求，不得改变字段类型。

按 `exploration` schema 写 `{{HARNESS_STATE_DIR}}/tasks/parallel_explore-seed.json`。然后运行确定性校验；
若失败，按错误修正任务文件并重新校验，只有退出码为 0 才能播种：

```bash
node "{{SCRIPTS}}/collect-reports.cjs" --validate-tasks "{{HARNESS_STATE_DIR}}/tasks/parallel_explore-seed.json"
```

<!-- tasks-schema: exploration -->
{{TASKS_SET loop=parallel_explore file={{HARNESS_STATE_DIR}}/tasks/parallel_explore-seed.json}}

只有用户目的不明确、目标路径不一致、引用资料不可读，或确实需要探索却无法界定最小有价值范围时才暂停。
已有项目但本次探索不适用时必须按上面的 `SkipExploration` 成功结束，不得暂停。成功后只在 handoff/notes 交代任务数量、目标、关键全局约束和
未深入范围，不创建 `exploration-brief.md`、`exploration-plan.md` 或其他过程文档：

{{ADVANCE_OK artifact=none next=__decision=Existing notes="已完成输入校验与项目分型，生成 <N> 个必要探索任务；目标=<一句话>；未深入=<范围或无>"}}

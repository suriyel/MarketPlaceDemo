---
name: explore
description: 在只读目标项目中并行派发多维探针，经证据矩阵、独立挑战和有界定向复探产出一个可交付专题。
---

# 目的性专题探索

## 1. 领取任务

{{TASK_GET}}

以 `purpose` 和 `questions` 为验收标准。读取当前项目及 scope 内生效的 `AGENTS.md`/同类项目指令，
结合自动注入的用户原始意图和 @文档工作，不扩张到其他任务的主题。

## 2. 严格只读目标项目

框架已强制项目树只读并隔离兄弟分支。除此之外，禁止安装依赖、构建、测试、启动服务、联网、读取密钥
或跟随项目根外链接。默认跳过依赖目录、vendor、生成物、构建产物、缓存和大型二进制。

最终产物写入本次 run 的共享 memory：`{{HARNESS_MEMORY_DIR}}/explore/details/<deliverable>`。
`deliverable` 已在扇出前确定性校验为全局唯一且含任务 ID；不得额外拼接 task-id。

## 3. 专题内质量闭环

你是本专题的 Coordinator，不直接承担首轮扫描。使用 `{{AGENT}}` 调度独立子 Agent；子 Agent 只返回
结构化文本，绝不写共享文件、绝不再嵌套派发。严格遵守 task 的 `probeBudget` 与 `followupBudget`。

### Round 1 — 多维 Probe 扇出

为 `dimensions` 中每个维度派一名全新的 Probe Agent，数量必须等于 `probeBudget`。若当前工具支持同一回合
并行 Agent 调用，应同时派发；否则连续派发，但每名 Probe 都不得看到其他 Probe 的结果。输入只含 task 的
purpose、scope、questions、evidenceRequired、自己的 dimension 与只读边界，不给通用“全面探索”指令。

每名 Probe 必须返回同一结构：

```json
{
  "dimension": "本探针维度",
  "answers": [{"question": "...", "answer": "...", "status": "covered|unknown|out-of-scope"}],
  "claims": [{"statement": "...", "evidence": ["file:line"], "confidence": "high|medium|low"}],
  "relations": ["调用、事件、数据或配置关系"],
  "contradictions": ["与文档、实现或其他事实的冲突"],
  "gaps": [{"gap": "...", "scope": ["..."], "evidenceNeeded": "..."}],
  "inspected": ["已检查范围"]
}
```

Probe 只探索自己的维度；发现属于其他维度的线索时记录为 relation/gap，不顺手扩张。

### Round 1.5 — 证据矩阵合成

收齐 Probe 结果后，由你去重并形成 claim-evidence matrix。每个 task question 和关键 claim 必须有一行，记录：
结论、直接证据、独立探针来源、冲突和 `covered | gap | unsupported | out-of-scope`。两个 Probe 重复同一路径
不算独立佐证；“未找到”不得改写成“不存在”。矩阵只在内存中合成，不另建过程文件。

### Review — 独立 Challenger

`probeBudget` 为 2–3 时派一名 Evidence Auditor；为 4–5 时同时派 Evidence Auditor 和 Adversarial Scout。

- Evidence Auditor 接收原 task、Probe 结构化结果和证据矩阵，逐问题检查结论—证据对应、必要链路和冲突；
- Adversarial Scout 只接收原 task、最终 claims 和已查范围，不看 Probe 推理过程，定向寻找反例、反向调用、
  异步旁路、失败路径、配置覆盖以及把“未找到”当“不存在”的错误。

每名 Challenger 必须逐项给出 `pass | gap | unsupported | out-of-scope`：

- 每个 task question 是否直接回答；
- 每项关键结论是否有可定位证据；
- scope 内是否存在由已发现入口直接指向、却未追踪的必要链路；
- 是否把推断、建议或 handoff 摘要误当事实；
- 是否出现超出用户目标的扩张。

只有 `gap` / `unsupported` 且能够在 task scope 或其直接相邻范围内精确界定时，才进入下一轮。合并两名
Challenger 的重复缺口；有冲突时保留更严格结论。

### Round 2 — 有预算的 Focused re-explore

把独立缺口拆成 follow-up items，按风险和对用户问题的影响排序，最多取 `followupBudget` 项。每项派一名
新的 Focused Probe；互不依赖且工具支持时并行派发。输入只含一个缺口、所需证据和精确范围，不得重写
Round 1 已覆盖内容或扩张为另一个专题。完成后更新证据矩阵，并按同一 checklist 作最终核对。

以下情况立即停止，不继续加 Agent：所有问题已有状态；关键事实有直接证据；高风险单证据结论已标明限制；
冲突已解决或进入局限；必要链路没有未追踪的直接下一跳；Challenger 全部 pass；缺口超出用户目标；需要
禁止的访问/运行操作；或达到预算。同一缺口补探后仍无证据时如实写入“局限/未知项”。

## 4. 形成目的性证据

- 文档主题：用用户术语及同义词搜索 README、规格、ADR、RFC、设计和运维说明，记录命中与未命中。
- module/代码主题：先定位入口和边界，再沿调用、事件、数据或配置关系追踪，不列无意义目录树。
- 约束主题：区分显式规则和实际主导模式。
- 依赖主题：区分已使用内部能力、内部 wrapper、已声明三方件、可复用候选和未确认推测。

事实给 `file:line`，非文本证据给 `path#字段/对象`；推断列依据，建议说明与用户目标的关系。

## 5. 直接写最终专题文档

写 `{{HARNESS_MEMORY_DIR}}/explore/details/<deliverable>`。这是最终成品，不是过程笔记。结构按内容自适应：

- 必有：任务与范围、探索维度与实际 Agent 数、问题的直接答案、关键发现与证据、跨维度证据矩阵、检视结论、局限/未知项。
- 仅在适用时增加：文档—现状差异、架构图、约束与复用、风险、建议。
- 不适用的章节直接不写，禁止为了模板每节只填一两句话。
- 简单主题控制在 30–60 行；复杂主题通常不超过 120 行。证据密度优先于篇幅。
- 不重复大段源代码，不写探索过程流水账。

“检视结论”只列：Probe/Challenger/Focused Probe 数量、已覆盖问题、补探是否发生、仍未解决的具体缺口；
不得抄写子 Agent 的过程对话。

无法回答或不能提供证据时如实失败：

{{ADVANCE_FAIL notes="任务 <id> 未完成：<失败原因、已检查范围、建议如何处理>"}}

成功时必须把刚写好的 memory 绝对路径作为 artifact 上报。路径必须严格是
`{{HARNESS_MEMORY_DIR}}/explore/details/<deliverable>`；禁止改成状态目录、项目树下的相对路径或其他目录。
notes 给索引报告使用，控制为 2–4 句，必须含结论、Agent 实际用量、代表证据和相对输出路径：

{{ADVANCE_OK artifact={{HARNESS_MEMORY_DIR}}/explore/details/<deliverable>::<专题的一句话结论> notes="任务 <id>：<1–2句结论>；Agents：probe=<N> reviewer=<N> follow-up=<N>；证据：<file:line/path#field>；专题：explore/details/<deliverable>"}}

---
name: report
description: 在并行汇合后确定性收集各分支已写好的专题 Markdown，仅生成简短索引、跨专题结论和必要局限，不重写专题内容。
---

# 索引与汇总

本节点必须轻量：专题内容已经由并行 Agent 写完，不要再次展开成一份重复的长报告。

## 1. 收集专题成品

运行一次：

```bash
node {{SCRIPTS}}/collect-reports.cjs "{{HARNESS_STATE_DIR}}/parallel.json" "{{HARNESS_MEMORY_DIR}}/explore/details"
```

脚本只按分支上报的 artifact 校验 `{{HARNESS_MEMORY_DIR}}/explore/details/*.md`，在 stdout 输出任务、状态、摘要和相对链接；
不复制文件，也不生成持久化中间文件。若 done 分支缺专题文件，直接
`{{ADVANCE_FAIL notes="专题收集失败：<脚本错误>"}}`，不要凭 handoff 重写一份替代品。

## 2. 写简短总报告

读取收集结果和 `{{HARNESS_MEMORY_DIR}}/explore/details/*.md`，写 `{{HARNESS_MEMORY_DIR}}/explore/exploration-report.md`：

1. 标题 + 用户目标/范围（3–6 行）；
2. 核心结论（通常 3–8 条，每条链接到专题）；
3. 专题索引表：任务、状态、1 句结论、Markdown 链接；
4. 仅在确有跨专题关系时写“综合判断”；
5. 专题内已明确的未覆盖/冲突（没有则一句“无关键缺口”）；
6. 下一步建议（最多 5 条）。

总报告通常 40–80 行，硬上限 120 行。不复制专题中的长证据表、module 树或逐问题分析；链接过去。
不适用的章节省略，禁止为了模板制造只有一两句话的章节。

确认所有链接使用相对路径 `details/<file>.md`。然后立即把 advance 作为最后动作，不要遗漏：

{{ADVANCE_OK notes="并行专题已收集，索引与汇总报告完成；done=<N> failed=<N>" artifact={{HARNESS_MEMORY_DIR}}/explore/exploration-report.md}}

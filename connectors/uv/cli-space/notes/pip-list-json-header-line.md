---
title: uv pip list 任何 format 都先打一行 Using Python 头
source: wizard
updated: 2026-10-11
---
`uv pip list` 不管 `--format` 是默认 column、`freeze` 还是 `json`，实测都先在 stdout 打一行：

```
Using Python 3.12.13 environment at: C:\Users\Shannon\AppData\Roaming\uv\python\cpython-3.12.13-windows-x86_64-none
```
然后才是数据。

直接 `jq` 会因为首行非 JSON 报错；grep/awk 解析 columns/freeze 也会撞到噪声。两种修法：

1. 加 `--quiet` 抑制头一行：再 parse 即可。
2. 用 `tail -n +2`（或脚本里 skipFirstLine）丢掉头一行再 parse。

`uv sync --output-format json` 同样会在 JSON 之外打 `Resolved N packages ...` / `Prepared N packages ...` 这种进度行，解析时一并丢。

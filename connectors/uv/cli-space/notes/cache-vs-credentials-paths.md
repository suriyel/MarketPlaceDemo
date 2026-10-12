---
title: cache 与 credentials 落不同 AppData 子目录
source: wizard
updated: 2026-10-11
---
uv 0.11.15 实跑：

- `uv auth dir` → `C:\Users\Shannon\AppData\Roaming\uv\credentials`（仅目录，凭据在 Windows Credential Manager）
- `uv cache dir` → `C:\Users\Shannon\AppData\Local\uv\cache`（**Local** 不是 Roaming）

凭据走 Roaming（用户漫游同步），缓存走 Local（不漫游、不进域漫游配额）。

清理缓存只动 Local；删凭据只动 Roaming。两者无重叠。

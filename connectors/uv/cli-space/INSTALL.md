---
cli: uv
version: 0.13.0 (4ecd0eff2 2026-10-09 x86_64-pc-windows-msvc)
platform: win32-x64
verifiedAt: 2026-10-11
binPath: C:\Users\Shannon\.local\bin\uv.exe
---
## 步骤（实际跑通）

官方 Windows 安装器走 PowerShell 一次性脚本，下载二进制并落到 `~/.local/bin`：

```bash
curl -sSL --max-time 30 https://astral.sh/uv/install.ps1 -o /tmp/uv-install.ps1
UV_NO_MODIFY_PATH=1 powershell -ExecutionPolicy ByPass -NoProfile -File /tmp/uv-install.ps1
```

实跑输出（节选）：

```
downloading uv 0.13.0 (x86_64-pc-windows-msvc)
installing to C:\Users\Shannon\.local\bin
  uv.exe
  uvx.exe
  uvw.exe
everything's installed!
```

## 验证

```bash
# 用绝对路径直接调（最稳，本会话进程启动早于安装）
C:\Users\Shannon\.local\bin\uv.exe --version
# uv 0.13.0 (4ecd0eff2 2026-10-09 x86_64-pc-windows-msvc)

C:\Users\Shannon\.local\bin\uvx.exe --version
# uvx 0.13.0 (4ecd0eff2 2026-10-09 x86_64-pc-windows-msvc)

C:\Users\Shannon\.local\bin\uvw.exe --version
# uv 0.13.0 (4ecd0eff2 2026-10-09 x86_64-pc-windows-msvc)

# 命令列表也正常
C:\Users\Shannon\.local\bin\uv.exe help | head -25
# An extremely fast Python package manager.
# Usage: uv [OPTIONS] <COMMAND>
# Commands: auth run init add remove version sync lock export tree format check audit ...
```

> `uvx` 是 `uv tool run` 的别名，`uvw` 是「带已装工具跑命令」的便捷入口。三者同版本同源。

> 本机 `PATH` 实际已经包含 `~/.local/bin`，但 harness 进程早于本次安装启动，写 `binPath` 让框架按绝对路径拉起，避免新 shell 看不到。

## 踩坑与解法

- **蚕丛进程早于 PATH 修改**：传 `UV_NO_MODIFY_PATH=1` 跳过 PATH 编辑（脚本里 `-NoModifyPath` 已 deprecated），避免非交互路径下走 `HKCU\Environment` 触发卡顿；同时把绝对路径写进 `binPath`，框架按绝对路径拉起。
- **代理**：`http_proxy=http://127.0.0.1:10809` 已生效，astral.sh (301 → releases.astral.sh) 和 pypi.org (200) 都能直连，无需手动加 `NO_PROXY`。
- **PowerShell ExecutionPolicy**：脚本里没有受限 cmdlet，仅下载+解压；用 `-ExecutionPolicy ByPass -NoProfile` 干净执行，不污染会话配置。
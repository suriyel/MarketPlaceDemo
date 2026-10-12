---
name: uv
description: 用 Astral 的 uv（Python 包/项目管理器，Rust 写）做 Python 环境与项目工作的入口。当用户要装/卸 Python 包、创建/管理虚拟环境、跑 Python 脚本（带依赖）、初始化/锁定/同步一个 `pyproject.toml` 项目、按 `requirements.txt` 解析/同步环境、用 pipx 方式装可执行工具（如 ruff/black/pytest）、管理多版本 Python 时加载本 skill。
---

# uv

Astral 出品的极速 Python 包与项目管理器（Rust 实现）。一套命令替换 pip / pip-tools / pipx / poetry / pyenv / virtualenv / twine 等。本机版本：`uv 0.13.0 (4ecd0eff2 2026-10-09 x86_64-pc-windows-msvc)`，二进制在 `C:\Users\Shannon\.local\bin\uv.exe`。

uv 有两套主要入口：
- **`uv pip *`**：pip 兼容接口（适合已有 `requirements.txt` 工作流）。
- **`uv run / add / sync / lock / init`**：基于 `pyproject.toml` 的项目管理。
- **`uv tool *` / `uvx`**：装/跑 Python 发布的可执行工具（pipx 风格）。
- **`uv python *`**：管理多版本 Python 解释器。
- **`uv venv`**：单独建虚拟环境。

## 使用前：确认已登录

本 CLI 无需登录——公共 PyPI 访问对未登录用户完全可用。`auth` 子命令全是 **per-service**（PyPI / 私有仓库 / ghcr 等）的凭据管理，没有「uv 当前用户」这个全局态。**默认不要自动加 `uv auth login`**；只有当用户显式用了 `--index <私有 URL>` 或要 `uv publish` 时，提醒他手动跑：

```bash
uv auth login <service-url> -t <token>   # token 由用户提供，存进系统 keyring
```

不要替用户读取或转写 token。

## 常用任务

| 要做的事 | 命令 | 说明 |
|---|---|---|
| 看版本（短） | `uv self version --short` | 输出 `0.13.0`；`uv --version` 输出含 commit hash 的完整行 |
| 列已装 Python | `uv python list --only-installed` | tab 分隔 `<name> <path>`；加 `--all-versions` 看历史 patch |
| 装一个新 Python | `uv python install 3.12` | 装到 `%LOCALAPPDATA%\uv\python`；可一次装多个如 `3.12 3.13` |
| 列已装 Python 包 | `uv pip list` | 默认 column；先打一行 `Using Python ... environment at: ...`（见踩坑） |
| 查一个包的详情 | `uv pip show <pkg>` | `-f` 加 `--files` 看安装文件清单 |
| 导出 requirements 格式 | `uv pip list --format=freeze` | 同样有头一行；`--format=json` 见踩坑 |
| 装包 | `uv pip install <pkg>` | 多包空格分隔；`-r requirements.txt`；加 `--quiet` 抑制进度 |
| 按需求解析锁文件 | `uv pip compile requirements.in -o requirements.txt` | 支持 `--universal` 跨平台；`--generate-hashes` 落 hash |
| 按锁文件对齐环境 | `uv pip sync requirements.txt` | **会卸载**锁里没有的多余包 |
| 依赖树 | `uv pip tree` | `--depth N` 限深；`--invert --package <x>` 看谁依赖 x |
| 创建虚拟环境 | `uv venv` | 默认 `.venv`；`--python 3.12` 指定版本；`--seed` 装 pip/setuptools/wheel |
| 跑脚本（自动建 venv+装依赖） | `uv run script.py` 或 `uv run python -m <mod>` | `--with <pkg>` 临时加包；`--script` 走文件内联 metadata |
| 跑命令 + 临时依赖 | `uv run --with <pkg> -- <cmd>` | 等价 pipx 一次性跑；不污染项目 venv |
| 初始化项目 | `uv init [name]` | 生成 `pyproject.toml` + `.python-version` + 最小结构；`--lib` / `--app` / `--script` 选形态 |
| 加依赖到项目 | `uv add <pkg>` | 写入 `pyproject.toml` 并同步 venv；`--dev` 进开发组；`--optional <extra>` |
| 锁 / 同步项目环境 | `uv lock` / `uv sync` | `sync` 默认会把 venv 调到与 `uv.lock` 一致 |
| 装一个工具（pipx 风格） | `uv tool install <pkg>` | 落到 `%LOCALAPPDATA%\uv\tools`；`uv tool list` 看已装；`uvx <cmd>` 是别名 |
| 临时跑一个工具 | `uvx <cmd>` 或 `uv tool run --from <pkg> <cmd>` | 不装到全局，临时 venv |
| 缓存/凭据路径 | `uv cache dir` / `uv auth dir` | cache → `%LOCALAPPDATA%\uv\cache`；credentials → `%APPDATA%\uv\credentials`（仅目录，凭据在 Windows Credential Manager） |

**破坏性命令（执行前先向用户确认，不要默认跑）**：
- `uv pip uninstall <pkg>`、`uv pip sync`（卸载锁里没有的包）
- `uv python uninstall <ver>`、`uv venv --clear/--force`（删已有 venv）
- `uv tool uninstall <pkg>`
- `uv self update`（升级 uv 本体）
- `uv cache clean` / `uv cache prune`（删缓存）

## 输出与解析

- **`uv pip list` 所有 format 都先打一行 `Using Python ... environment at: ...`**，再才是数据。直接 `jq` / `awk` 会撞到非 JSON/非 tabular 噪声。两种修法：
  1. 加 `--quiet` 抑制头一行。
  2. `tail -n +2`（或脚本里 `skipFirstLine`）丢掉头一行再 parse。
- **`uv pip list --format=json`**：加 `--quiet` 后是干净的 JSON 数组 `[{"name","version"}]`。
- **`uv sync --output-format json`**：同样会在 JSON 之外打 `Resolved N packages ...` / `Prepared N packages ...` 进度行；解析时丢。
- **`uv pip tree`** 默认 `--depth 255`（即不裁）；加 `--depth 1` 看直接依赖。
- **`uv --color never`**：写脚本解析时禁掉 ANSI 色码（默认 `--color auto` 在非交互终端会判无色但偶发染色）。
- **`uv python list --only-installed`**：tab 分隔 `<dist>-<ver>-<platform>-<arch> <abs-path>`，每行一条。
- **`uv tool list`**：默认显示 `pkg name ver` + 缩进的 `- executable`；`--show-paths` 加打环境路径。

## 踩坑

- **不要自动加 `uv auth login`**：公共 PyPI 不需要登录。只有当用户明确提到「私有仓库 / 内部 index」时，提醒一句 `uv auth login <url> -t <token>`，**不要替他读 token**。
- **`uv pip install --system`** 默认会被拒（EXTERNALLY-MANAGED 标记保护），要显式 `--break-system-packages`；除非用户明确要装到系统 Python，否则用 `uv venv` 或 `uv run`。
- **`uv pip sync`** 会**卸载**锁里没有的多余包（精确对齐）；同义词 `--inexact`（在 `uv sync` 里是 `--inexact`，在 `uv pip install` 是 `--exact`）控制策略——跑前看清。
- **`uv venv` 不依赖系统 Python**——它会自动装一个 uv-managed CPython 到 `%LOCALAPPDATA%\uv\python\`，`--python 3.12` 缺该版本时会先下后建。
- **`uv run` 自动同步 venv**：缺依赖会先装再跑；要「不更新锁就只是跑」加 `--frozen`；要「不摸 venv」加 `--no-sync`。
- **`uv tool run` / `uvx` 临时 venv** 复用 `%LOCALAPPDATA%\uv\cache`；不会把工具装进 PATH。要全局可用用 `uv tool install`。
- **`uv add`/`sync`/`lock` 默认作用于当前目录的 `pyproject.toml`**；在 monorepo 子目录跑会失败或作用到根——加 `--project <dir>` 或 `--directory <dir>` 锁范围。
- **`where uv` 查不到可能是正常的**（pip 装的 uv 落到 `%APPDATA%\Python\<ver>\Scripts\` 不进 PATH）；用绝对路径或重装到 `~/.local/bin`（见 INSTALL.md）。
- **输出颜色**：脚本里 `uv --color never` 更稳；裸跑交互式终端默认 auto。
- **私有 index**：用 `UV_INDEX_URL` / `--index <url>` 设源；token 走 `uv auth login <url> -t <token>` 存 keyring，**不要**写进 `requirements.txt` 或环境变量文件。

## 更多资料与经验项（CLI 空间）

CLI 空间：`{{CLI_SPACE}}`

- `reference.md`：全部命令索引（53 条），含全局参数总表。
- `commands/<命令>.md`：单条命令的完整参数 help（按需读，不要整份读）。
- `INSTALL.md`：本机安装方式、版本与踩坑（PATH/代理/ExecutionPolicy）。
- `notes/*.md`：经验项。**用之前先扫一眼标题**——比如 `pip-installs-outside-path.md` 解释 `where uv` 找不到时的排查链；`auth-per-service-model.md` 解释为什么连接器没有登录页；`cache-vs-credentials-paths.md` 分清 Local 与 Roaming 两个 AppData 子目录。
- **踩到新坑、确认了值得复用的事实**：在 `{{CLI_SPACE}}/notes/<短横线-slug>.md` 追加一条：

  ```markdown
  ---
  title: <一句话结论>
  source: session
  updated: <YYYY-MM-DD>
  ---
  现象 / 原因 / 做法（≤ 30 行）
  ```

  不写任何凭据；已有同主题的就更新那一条，不重复建。

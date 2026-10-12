---
title: uv 鉴权是 per-service 无全局态，连接器选 auth:none
source: wizard
updated: 2026-10-11
---
uv 的 `auth login` / `auth logout` / `auth token` **全部按 service（PyPI / 私有仓库 / ghcr 等）维度**操作，没有「uv 当前用户」这个全局概念，也没有 whoami。

## 关键事实

- 公共 PyPI 访问完全不要登录：`uv pip install / uv venv / uv run / uv add / uv sync / uv lock / uv tool` 对未登录用户 100% 可用。
- 需要凭据的场景只有两类：
  - `uv publish`：推包到 PyPI/私有仓库，需要 token；
  - `uv pip install --index <私有 URL>`：私有仓库凭据。
- 凭据存放在系统 keyring（Windows Credential Manager），存的位置用 `uv auth dir` 查：`C:\Users\Shannon\AppData\Roaming\uv\credentials`（仅是目录，凭据不会落成文件，是 keyring 的引用）。
- 登录方式是命令行 flag，非 OAuth/非 device-code：`uv auth login <service-url> -t <token>`（`-u` 用户名 + `-p` 密码亦可，但 token 是主流）。

## 为什么连接器不内置登录页

connector 的「登录页 + status 判定」模型预设「一个 CLI 一个全局登录态」，uv 是 per-service，无全局态；强行套会出现「该判定哪个 service URL 才算已登录」这种没法拍板的题。

实际**绝大多数用法不需要登录**，要做 publish / 私有 index 时直接给一句 `uv auth login <url> -t $TOKEN` 就够。

## 给模型会话的旁注

- 写 bash 命令**不要**自动加 `uv auth login`：默认就是无凭据工作。
- `--index <私有 url>` 出现时，若用户没主动登录，提醒他跑 `uv auth login <url> -t <token>`，**不要替用户读 token**。

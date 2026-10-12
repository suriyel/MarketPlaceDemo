---
name: gh-2
description: |
  Use this skill whenever the user wants to read or act on GitHub data via the official `gh` CLI —
  issues, pull requests (list/view/diff/checks/create/merge), Actions runs and workflows, releases,
  repos (view/clone/create), code/issue/PR search, GraphQL/REST API calls (`gh api` / `gh api graphql`),
  comments, gists, or the personal dashboard (`gh status`). Loads on `gh …` requests, GitHub
  PR/issue/CI triage, "open / merge / review / close", "see CI checks", and any time the user wants
  to act on github.com / GHE from the terminal. Not for raw `git` operations unrelated to GitHub.
---

# gh (GitHub CLI)

GitHub on the command line. Brings PRs, issues, releases, Actions, and the REST/GraphQL API to the
terminal next to where `git` already runs. 本机版本 **2.102.0**（`D:\Program Files\GitHub CLI\gh.exe`），
已登录账号 `suriyel`，token scopes = `gist, read:org, repo, workflow`，凭据存 wincred。

## 使用前：确认已登录

1. 先跑 `gh auth status --json hosts --jq '.hosts | add | {hostname,active_account,user}'`：返回
   非空 + 含 `user.login` ⇒ 已登录；若 `exit 1` 或 JSON 无 `user` ⇒ 凭据异常。
2. 没登录 / 凭据失效时，执行 `auth-present gh-2 --reason "<为什么需要登录>"`，由用户在弹出的登录页里完成；
   **不要自己跑 `gh auth login`**（要真终端 + 浏览器交互），也不要向用户索要 token / 密码。
   登录页默认走 **web 流**（`--web --clipboard`），备选 **token 粘贴**（`--with-token < token.txt`，
   classic PAT，scopes = `repo, read:org, gist`）。
3. 用户已在线但脚本误判 red ⇒ 不要让他重登 —— 看 `auth/status.cjs` 的原始回包校准脚本，然后
   `auth-present gh-2 --recheck`，让框架重跑 status 写回执。
4. 自动化（CI / 旁路登录态）才用 `GH_TOKEN` / `GITHUB_TOKEN` 环境变量；交互场景一律走 keyring。

## 常用任务（只读优先）

> 仓库不是 cwd 时统一加 `--repo OWNER/REPO`；下面示例都显式带。
> 默认 `--limit 30`；默认 state = `open`；JSON 字段名是命令自带的，别猜（写错会报 `Unknown JSON field: …`）。

| 任务 | 命令 | 关键点 |
|---|---|---|
| 我的登录态 | `gh auth status --json hosts --jq '.hosts \| add \| {hostname,user,active_account,scopes}'` | 退出码 0 + 含 user = 已登录；ANSI 颜色要剥 |
| 当前 dashboard | `gh status` | 人类可读：Assigned Issues / PRs / Review Requests / Mentions / Repo Activity |
| 仓库信息 | `gh repo view OWNER/REPO --json name,nameWithOwner,description,defaultBranchRef,stargazerCount,url` | 字段名 `stargazerCount` 单数 |
| 列 open issues | `gh issue list --repo OWNER/REPO --limit N --json number,title,state,url,author,createdAt` | state 改 `all` / `closed`；`--search` 支持 `label:bug is:open` 等 |
| 看 issue | `gh issue view N --repo OWNER/REPO --json number,title,state,body,author,labels,comments,createdAt,updatedAt,url` | labels 是数组，每项含 `name/description/color` |
| 列 open PRs | `gh pr list --repo OWNER/REPO --limit N --json number,title,state,url,headRefName,baseRefName,author` | state 改 `merged` / `closed` / `all`；`--author "@me"` / `--head BR` |
| 看 PR | `gh pr view N --repo OWNER/REPO --json number,title,state,body,author,additions,deletions,changedFiles,headRefName,baseRefName,url,createdAt` | 默认 PR 当前分支；`--comments` 看评论列表 |
| PR diff | `gh pr diff N --repo OWNER/REPO` | 走 unified diff 文本；想截取用 `--patch` 或 piping `head -n 200` |
| PR CI checks | `gh pr checks N --repo OWNER/REPO` | 退出码 = 失败检查数；脚本化用 `--json name,state,bucket,link` |
| 列 Actions runs | `gh run list --repo OWNER/REPO --limit N --json name,status,conclusion,headBranch,headSha,createdAt,event,url,databaseId` | `databaseId` = 数字 run id（喂 `run view`/`run watch`/`run rerun`） |
| 看单次 run | `gh run view RUNID --repo OWNER/REPO` | 替换 RUNID；`--log` 看 job 日志；`--log-failed` 只看失败步 |
| 列 workflow | `gh workflow list --repo OWNER/REPO --json name,id,path,state` | `id` = 数字，喂 `workflow run --ref BR FILE` |
| 列 release | `gh release list --repo OWNER/REPO --json name,tagName,publishedAt,isDraft,isPrerelease` | **JSON 没有 `author`**（要看作者用 `release view --json`） |
| 全局搜仓库 | `gh search repos "stars:>1000 language:go" --limit N --json fullName,description,stargazersCount,language` | 字段 `fullName` 不是 `nameWithOwner` |
| 搜 issues/PRs | `gh search issues "repo:OWNER/REPO is:open label:bug" --json number,title,state,url,repository` | `search prs` 同形 |
| 任意 REST 调用 | `gh api repos/OWNER/REPO/issues/N/comments --jq 'length'` | 占位符 `{owner}/{repo}` **只在 git 仓 cwd 内**展开，否则报错 |
| GraphQL | `gh api graphql -F owner='OWNER' -F name='REPO' -f query='query(...){ repository(...) {...} }'` | `--paginate` 自动翻页；`--slurp` 拼成外层数组 |
| 克隆仓库 | `gh repo clone OWNER/REPO ./dir` | SSH 时 `gh repo set-default` 切默认；目标目录已存在会拒 |

## 写操作（先确认，再执行）

`gh` 是带状态副作用的：评论进入邮件通知、PR 合并触发 CI、issue 关闭改 issue 状态。
**没有用户明确要求时不发**；发前确认要做哪一步（PR 创建要的 `--fill` 自动填 / 合并要 `--merge|--squash|--rebase`）。

| 动作 | 命令 | 要确认的点 |
|---|---|---|
| 评 issue/PR | `gh issue comment N --repo OWNER/REPO --body "…"` / `gh pr comment N …` | 文本出自草稿还是用户嘴；多行用 `--body-file` |
| 创建 issue | `gh issue create --repo OWNER/REPO --title "…" --body "…"` | `body` 可省（之后追加评论）；标签用 `--label "bug,help wanted"` |
| 创建 PR | `gh pr create --repo OWNER/REPO --title "…" --body "…" --base main --head feature` | branch 已推；`--fill` 从 commit message 自动填；`--draft` 出草稿 |
| 看 PR review 状态 | `gh pr view N --repo OWNER/REPO --json reviewDecision,reviews,statusCheckRollup` | 想覆盖/approve 用 `gh pr review` |
| 合并 PR | `gh pr merge N --repo OWNER/REPO --squash --delete-branch` | 选 `--merge`/`--squash`/`--rebase`；默认即合 |
| close/reopen issue/PR | `gh issue close N --repo OWNER/REPO [-c "…"]` / `gh pr close N …` | `--delete-branch` 顺手删 head 分支 |
| 加 PR review | `gh pr review N --repo OWNER/REPO --approve` / `--request-changes --body "…"` / `--comment -b "…"` | 三选一 |
| 触发 workflow | `gh workflow run FILE --repo OWNER/REPO --ref BR [-f key=value]…` | FILE 是 yaml 路径（点斜杠开头）/ 直接用 `id` |
| 取消 / 重跑 run | `gh run cancel RUNID --repo OWNER/REPO` / `gh run rerun RUNID --repo OWNER/REPO [--failed]` | `rerun --failed` 只重试失败 job |
| 删 / 设 secret | `gh secret set NAME --repo OWNER/REPO --body "…"` / `gh secret delete …` | secret 落到 Actions，写前确认是什么仓 |

## 输出与解析

- **机器读一律 `--json <fields>`**：逗号分隔，字段名是命令自定义的。写错 `gh` 会回
  `Unknown JSON field: "X"` + `Available fields: …`（按它的清单修，不要猜）。
- **jq 取字段**：`gh … --json a,b,c --jq '.[] | {(.a): .b}'` 或 `'.[0]'` 取首项。
- **占位符展开**：`{owner}` / `{repo}` / `{branch}` 只在 git 仓 cwd 内自动填。不是 git 仓就
  `--repo OWNER/REPO` 显式指定（`gh api` 也遵守）。
- **搜索语法**：`gh search` 接 GitHub 搜索 DSL（`repo:` / `is:` / `label:` / `author:` /
  `in:title` / `sort:created-asc` …）；`gh issue/pr list --search` 同样接。
- **分页**：`--paginate`（API），或 `--limit N`（list）；分页默认 30，写脚本显式设上限。
- **状态字段统一**：
  - issue / pr.state ∈ `OPEN` / `CLOSED`，pr 多 `MERGED`（搜索里小写 `open`/`merged`）。
  - run.status ∈ `queued|in_progress|completed`；run.conclusion ∈ `success|failure|cancelled|skipped|…`（仅 status=completed 时有值）。

## 踩坑

- **输出带 ANSI**：`gh auth status` 头部有 `\x1b[32m`，脚本剥一下；`gh status` 默认彩。
- **凭据不要回显**：`gh auth status` 里有 含密钥前缀与星号掩码的 "Token: …" 行，**一律不要带回模型上下文**（`auth/status.cjs`
  也只取 `Logged in to` 那行的 account）。
- **JSON 字段名跨命令不通用**：`stargazerCount`（repo）、`stargazersCount`（search repos）、
  `nameWithOwner`（一些列表）vs `fullName`（search repos）；遇到 `Unknown JSON field` 就用回包里的清单。
- **GHES 域名**：自有 GitHub Enterprise 加 `GH_HOST=github.example.com` 或 `--hostname`；切多账号用 `gh auth switch`。
- **placeholder `{owner}/{repo}`** 不在 git 仓 cwd 时会 `unable to expand placeholder`；要么 `gh repo set-default` 一次，
  要么 `--repo OWNER/REPO` 显式指定，要么直接写完整路径（如 `repos/OWNER/REPO/issues`）。
- **`gh auth login` 需要真 PTY**：浏览器 + 一次性验证码 + 方向键。**不要** 在工具调用里发，**
  让用户走登录页**。
- **token 直跑的代价**：`GH_TOKEN` 环境变量直跑会让日志里出现明文 token，且不会进 wincred；
  仅 CI / 一次性脚本用，交互场景一律先 `gh auth login`。
- **`gh pr diff` 默认很长**：单次跑输出可达 MB；流处理时 `head -n 200` 截断，给模型只看头尾。
- **`release list` JSON 无 `author`**：要看作者走 `gh release view TAG --json author,…` 或
  `gh release view --web`。
- **`gh issue/pr list` 默认只看 `open`**：要看全部要 `--state all`，要找已合 `pr --state merged`。
- **磁盘行为**：`gh repo clone` 自动写入 `dir/`；目标已存在则报错；改 PATH 用 `gh repo fork` 后再 clone。
- **认证 host 多账号**：`gh auth status` 可能列出多个 host，主账号 = active account；要清列表
  `gh auth logout --hostname H --user U`。

## 更多资料与经验项（CLI 空间）

CLI 空间：`{{CLI_SPACE}}`

- `reference.md`：全部 195 条命令索引；`commands/<命令>.md`：单条完整 help（按需打开，别整份读）。
- `INSTALL.md`：本机安装方式（本机已装 winget 装的 2.102.0）。
- `notes/*.md`：经验项，**用前扫一眼标题**：
  - `notes/auth-decisions.md` — 鉴权细则、`auth status` 三态判据、登录方式 web/token/env 排序、
    已登录误判 red 时的排查路径。
- **踩到新坑 / 确认了值得复用的事实**：在 `{{CLI_SPACE}}/notes/<短横线-slug>.md` 追加：

  ```markdown
  ---
  title: <一句话结论>
  source: session
  updated: <YYYY-MM-DD>
  ---

  现象 / 原因 / 做法（≤ 30 行）
  ```

  **不写任何凭据**；已有同主题就在原文件 append 一段，不新建。

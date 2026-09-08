# 工作流市场仓规范（SPEC）

市场 = 一个 git 仓，任何 git 托管都行。对外契约只有**仓内文件布局**：没有服务端、没有鉴权。蚕丛（cancong）
按需部分克隆读目录、sparse-checkout 装单个工作流，并能把本地工作流以分支推回来。

## 布局

```
catalog.json                 # 生成物：scripts/build-catalog.js 扫出来
blueprints/<id>/             # 包目录，内部结构 = 蚕丛 blueprints/user/<id>/ 原样
scripts/build-catalog.js     # 扫 blueprints/*/blueprint.json → catalog.json（--check 只比对不写）
docs/SPEC.md                 # 本文
```

## 包定义 = `blueprint.json`

唯一来源（蚕丛引擎对未知顶层键宽容）。市场用到的顶层键：

| 键 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | **必须等于目录名**，也是安装名（`^[a-z0-9][a-z0-9_-]*$`，不得以 `bp-` 开头） |
| `title` | 是 | 名称 |
| `description` | 否 | 描述 |
| `version` | 是 | 作者自行维护的版本串。检查更新 = 字符串比对；推送门 = 必须高于市场上的同 id |
| `author` | 推送时必填 | 作者 |
| `tags` | 否 | 字符串数组 |
| `ext` | 否 | 自由对象，蚕丛只透传给目录/界面原样显示，不解释任何键 |
| `references[]` | 否 | 就是事实依赖声明：安装时本地缺的会列出来，同市场有的可一起安装（不递归） |

**包内不允许安装/卸载脚本**——安装卸载全是蚕丛侧动作（市场不做鉴权，不能让一次合入在用户机器上跑代码）。

## `catalog.json`

```json
{ "schemaVersion": 1,
  "blueprints": [ { "id": "", "title": "", "description": "", "version": "",
                    "author": "", "tags": [], "ext": {} } ] }
```

- 由 `node scripts/build-catalog.js` 生成，按 `id` 排序；刻意不放 `generatedAt`（合并冲突热点）。
- `schemaVersion` 只描述 catalog 自身；蚕丛读到不认识的值会拒绝并提示升级。
- 蚕丛推送时会连同重生成的 `catalog.json` 一起提交到分支，合入后目录立即正确。

## 版本与合入

- 版本只认 `version` 字段：无 sha、无 tag。
- 建议默认分支受保护、只接合并请求。蚕丛推送落到分支 `publish/<id>-<version>`，作者自己去开合并请求。
- 蚕丛访问市场的凭据靠本机 git credential helper 或 URL 内嵌 token，市场仓本身不管。

## 规范性检查

与蚕丛内置校验**同源**的脚本在蚕丛仓：`node <蚕丛仓>/scripts/bp-validate.cjs blueprints/<id>`
（退出码 0 通过 / 1 不通过 / 2 用法错误；只依赖 Node 内置模块，检出蚕丛仓即可跑，不用 `npm install`）。
目录同步用 `node scripts/build-catalog.js --check`。门禁怎么接、接在哪个平台，由市场维护者自定，本仓不带任何 CI 配置。

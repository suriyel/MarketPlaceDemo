# 工作流市场

一个只靠文件布局工作的蚕丛工作流市场，任何 git 托管都行。规范见 [docs/SPEC.md](./docs/SPEC.md)。

- **加包**：把蚕丛 `blueprints/user/<id>/` 整个目录拷到 `blueprints/<id>/`（`blueprint.json` 的 `id` 须等于目录名，推送需有 `author`/`version`），跑 `node scripts/build-catalog.js` 重生成 `catalog.json`，开合并请求。
- **从蚕丛推送**：蚕丛「📁 → 推送到市场…」会推到分支 `publish/<id>-<version>`（带重生成的 catalog），你再开合并请求合入默认分支。
- **规范性检查**：`node <蚕丛仓>/scripts/bp-validate.cjs blueprints/<id>`（与蚕丛内置校验同源）；目录同步 `node scripts/build-catalog.js --check`。门禁自建，本仓不带 CI 配置。

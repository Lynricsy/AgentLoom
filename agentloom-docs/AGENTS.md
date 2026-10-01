# Repository Guidelines

## 概述

AgentLoom 唯一文档站（VitePress 2，仅中文，base `/documentation/`），独立 lockfile，不属于根 workspace。分区：`guide/` 用户指南、`api/` API 与集成、`deploy/` 部署运维、`dev/` 贡献者。
维护规范：`dev/docs-maintenance.md`（页面类型、事实归属、变更 → 文档矩阵、写作门禁）。

## 本包硬规则

- 每页 frontmatter 有 `docType: tutorial|howto|reference|explanation|index`，一页只属一类。
- `_generated/` 由仓库根 `pnpm docs:gen` 生成，禁止手改；页面用 `<!--@include: -->` 引用。模块、队列、表、环境变量、节点、端口类型、技能、feature、路由等清单与任何计数都不手写。
- 新增或移动页面必须同步 `.vitepress/sidebar/<分区>.ts`；`ignoreDeadLinks: false`，死链即构建失败。
- 站内链接用绝对路径（`/guide/...`），不带 `.md`；`head` 中的资源路径须自带 `/documentation/` 前缀，其余由 base 处理。
- 仓库路径用反引号写完整相对路径（如 `agentloom-server/src/main.ts`），`docs:check` 会校验其存在；反引号中的环境变量名必须真实存在。
- `scripts/sync-openapi.mjs` 在源 `agentloom-server/sdk/openapi.json` 缺失时直接失败，不回退空 spec；`public/openapi.json` 是生成物，不提交。
- 教程与操作指南的命令输出必须来自真实运行；未实跑的块在页面顶部 `::: warning 未在本轮验证` 列出。
- `dev`/`build`/`preview` 保持 `node --no-experimental-webstorage` 调用方式。

## 命令

见本目录 `README.md`。

## 改动时更新

站点结构、分区或生成器变化 → 同步 `dev/docs-maintenance.md` 与 `dev/decisions/0002-docs-system.md` 的状态。

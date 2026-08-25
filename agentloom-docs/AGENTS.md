# Repository Guidelines

## Project Overview

`agentloom-docs` 是 AgentLoom 的 VitePress 2 文档站，正文以简体中文为主，同时保留英文入口。该目录拥有独立的 `pnpm-lock.yaml`，不属于根 `pnpm-workspace.yaml`；依赖安装与命令必须在本目录执行。

站点部署在 `/documentation/` 子路径。修改链接、静态资源或部署配置时，必须以 `.vitepress/config.mts` 中的 `base: '/documentation/'` 为准，不要假设站点位于域名根路径。

## Architecture & Data Flow

```text
agentloom-server/sdk/openapi.json
  -> scripts/sync-openapi.mjs
  -> public/openapi.json
  -> .vitepress/theme/index.ts 静态导入
  -> vitepress-openapi 的 <OASpec />

zh/**/*.md + en/**/*.md
  -> .vitepress/config.mts
  -> VitePress 静态站点
```

- `srcDir` 为包根目录，URL 使用无 `.html` 后缀的 clean URLs，并显示基于 Git 的最后更新时间。
- 中文导航和侧边栏覆盖指南、服务端、Studio、类型引擎、插件、移动端、API 与部署章节。
- `en/` 当前只有英文首页 stub；不要假定中文章节存在对应英文页面。
- 本地搜索按 `zh-CN` locale 提供 CJK 内容检索和中文界面文案。
- `withMermaid()` 包装 VitePress 配置；Markdown 中可直接使用 `mermaid` fenced code block。
- 跨包架构和契约约束以仓库根 `AGENTS.md` 为准，本文件只描述文档站边界。

## Key Directories

| 路径 | 用途 |
|---|---|
| `.vitepress/config.mts` | locale、导航、侧边栏、搜索、Mermaid 和站点元数据 |
| `.vitepress/theme/index.ts` | 默认主题扩展、OpenAPI 注册及静态 spec 导入 |
| `.vitepress/theme/custom.css` | 紫色品牌变量与浅色/深色主题覆盖 |
| `zh/guide/` | 入门、架构与核心概念 |
| `zh/server/`、`zh/studio/` | 服务端与 Studio 专题 |
| `zh/type-engine/`、`zh/plugins/`、`zh/mobile/` | 类型引擎、插件生态与移动端专题 |
| `zh/api/`、`zh/deployment/` | API 参考与部署运维 |
| `en/index.md` | 英文入口 stub |
| `public/brand/` | favicon、顶栏和首页使用的品牌资源 |
| `public/openapi.json` | 构建前生成的 OpenAPI 静态输入 |
| `scripts/sync-openapi.mjs` | OpenAPI 同步与 URL 规范化脚本 |

## Development Commands

在 `agentloom-docs/` 中运行：

```bash
pnpm install          # 使用本目录独立 lockfile 安装依赖
pnpm dev              # 启动 VitePress 开发服务器
pnpm prebuild         # 单独同步 public/openapi.json
pnpm build            # 自动先运行 prebuild，再生成生产站点
pnpm preview          # 预览生产构建
pnpm lint:md           # 仅检查 zh/**/*.md
```

`dev`、`build`、`preview` 通过 Node 的 `--no-experimental-webstorage` 启动 VitePress；保留这一调用方式，除非运行时约束明确改变。

## Code Conventions & Common Patterns

- Markdown 页面沿用相邻文件的 frontmatter、标题层级、表格和代码块风格；站内链接使用 `/zh/...` 或 `/en/...` 路径。
- 新增、移动或重命名中文页面时，同步修改 `.vitepress/config.mts` 的对应 `nav` 或 `sidebar` 项。
- Markdown lint 允许长行和内嵌 HTML（`MD013`、`MD033` 已关闭），其余规则以 `.markdownlint-cli2.jsonc` 为准。
- API 参考页通过 `<OASpec />` 渲染完整规范；组件来自主题注册，不要在每个页面重复初始化。
- 主题扩展必须继续调用 `vitepress-openapi` 的 `theme.enhanceApp`，否则 OpenAPI 组件不会完成注册。
- Mermaid 集成集中在站点配置中，不要为单个页面引入第二套渲染插件。

## Important Files

- `.vitepress/config.mts` — `base`、中英文 locale、中文导航/侧边栏、本地搜索和 Mermaid 的唯一配置入口。
- `.vitepress/theme/index.ts` — 导入 `public/openapi.json`，以中文 locale、按 tag 分组注册 `vitepress-openapi`。
- `zh/api/index.md` — 手写 API 使用说明与 `<OASpec />` 渲染入口。
- `scripts/sync-openapi.mjs` — 从 `agentloom-server/sdk/openapi.json` 读取规范；将相对 `servers[].url` 以 `http://localhost:3000` 规范化为绝对 URL。
- `package.json` — VitePress 2、Mermaid、OpenAPI 和 Markdown lint 的脚本与依赖定义。

## Runtime/Tooling Preferences

- 只使用 pnpm，并在本目录独立安装；不要用根 workspace filter 管理此包。
- OpenAPI 源文件缺失时，同步脚本会覆盖 `public/openapi.json`，写入空 `paths` 的 OpenAPI 3.0 stub；需要完整 API 文档时先在 `agentloom-server/` 运行 `pnpm openapi:export`，再回到本目录同步。
- `public/openapi.json` 是同步产物。API 契约应在 server 源头修改，不要把手改该 JSON 当作持久修复。

## Testing & QA

- 内容改动至少运行 `pnpm lint:md`；注意该脚本不覆盖根入口或英文页面，修改这些文件时需人工检查 Markdown 结构。
- 导航、主题、OpenAPI 或 Mermaid 改动应运行 `pnpm build`，确认无死链和静态导入错误；`ignoreDeadLinks` 为 `false`。
- 构建后用 `pnpm preview` 检查 `/documentation/` 基路径、中文导航、本地搜索、Mermaid 图表与 API 参考页。

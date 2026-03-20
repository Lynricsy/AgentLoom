# agentloom-docs 知识库

VitePress 2 文档站，提供 AgentLoom 平台的中英双语用户文档。

## 技术栈

- VitePress `2.0.0-alpha.17`
- vitepress-openapi — OpenAPI spec 渲染（静态 JSON import）
- vitepress-plugin-mermaid — Mermaid 图表支持
- markdownlint-cli2 — Markdown lint

## 目录结构

```
agentloom-docs/
├── .vitepress/
│   ├── config.mts           # VitePress 配置 (双语 locale: zh/en, 完整 nav/sidebar/socialLinks)
│   └── theme/
│       ├── index.ts         # 主题入口 (自定义品牌色 + vitepress-openapi + mermaid 注册)
│       └── style.css        # 品牌色变量: #7c3aed (light) / #a78bfa (dark)
├── zh/                      # 中文文档 (36 个 Markdown 文件，内容完整)
│   ├── api/                 # API 参考 (OpenAPI 渲染)
│   ├── deployment/          # 部署指南
│   ├── guide/               # 使用指南
│   ├── mobile/              # 移动端文档
│   ├── plugins/             # 插件开发
│   ├── server/              # 服务端文档
│   ├── studio/              # Studio 文档
│   ├── type-engine/         # 类型引擎文档
│   └── index.md             # 中文首页
├── en/                      # 英文文档
│   └── index.md             # 英文首页
├── public/
│   └── openapi.json         # OpenAPI 3.0 spec 静态文件 (由 prebuild 同步)
├── scripts/
│   └── sync-openapi.mjs     # prebuild: 从 server 同步 OpenAPI spec 到 public/openapi.json
├── index.md                 # 站点根入口 (重定向)
└── package.json
```

## 命令

```bash
pnpm install && pnpm dev     # 开发 (VitePress dev server)
pnpm build                   # 生产构建 (prebuild 自动执行 sync-openapi)
pnpm prebuild                # 仅执行 OpenAPI spec 同步
pnpm lint:md                 # Markdown lint (仅 zh/)
```

## 约定

- `srcDir: '.'` — 文档根目录为包根目录
- `cleanUrls: true` — 无 `.html` 后缀
- `lastUpdated: true` — 基于 git 的最后更新时间
- 双语结构: `zh/` 和 `en/` 为平行目录
- prebuild hook (`scripts/sync-openapi.mjs`): 构建前同步 OpenAPI spec 到 `public/openapi.json`
- Markdown lint 范围仅限 `zh/**/*.md`
- 品牌色: `#7c3aed` (亮色模式) / `#a78bfa` (暗色模式)，紫罗兰/紫色主题
- 本地搜索已启用 CJK（中日韩）分词支持

## 内容概览

8 个文档章节，共 36 个中文 Markdown 文件（内容完整）：

| 章节 | 路径 | 内容 |
|------|------|------|
| 使用指南 | `zh/guide/` | 快速入门、工作流概念、画布操作 |
| 服务端 | `zh/server/` | 部署、模块架构、API 说明 |
| Studio | `zh/studio/` | 前端界面、功能说明 |
| 类型引擎 | `zh/type-engine/` | WASM 端口兼容性检查器 API |
| 插件开发 | `zh/plugins/` | SDK、CLI、发布流程 |
| 移动端 | `zh/mobile/` | Flutter 应用使用说明 |
| API 参考 | `zh/api/` | OpenAPI 渲染，基于 vitepress-openapi |
| 部署 | `zh/deployment/` | Docker Compose、Helm、私有化部署 |

## 注意事项

- OpenAPI 同步脚本 (`scripts/sync-openapi.mjs`) 在构建前从 server 拉取最新 spec 写入 `public/openapi.json`；若 server 不可达则使用已有静态文件
- `vitepress-openapi` 通过 `theme/index.ts` 注册，使用 `public/openapi.json` 静态导入渲染 API 参考页
- `vitepress-plugin-mermaid` 在 `config.mts` 的 `markdown.config` 中注册，支持文档内嵌 Mermaid 图表

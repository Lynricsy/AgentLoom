# agentloom-docs 知识库

VitePress 2 文档站，提供 AgentLoom 平台的中英双语用户文档。

## 技术栈

- VitePress 2 (alpha)
- vitepress-openapi — OpenAPI spec 渲染
- vitepress-plugin-mermaid — Mermaid 图表
- markdownlint-cli2 — Markdown lint

## 目录结构

```
agentloom-docs/
├── .vitepress/
│   ├── config.mts           # VitePress 配置 (双语 locale: zh/en)
│   └── theme/index.ts       # 主题入口
├── zh/                      # 中文文档
│   ├── api/                 # API 参考
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
├── scripts/
│   └── sync-openapi.mjs     # prebuild: 同步 OpenAPI spec (占位)
├── index.md                 # 站点根入口 (重定向)
└── package.json
```

## 命令

```bash
pnpm install && pnpm dev     # 开发 (VitePress dev server)
pnpm build                   # 生产构建 (prebuild 自动执行 sync-openapi)
pnpm lint:md                 # Markdown lint (仅 zh/)
```

## 约定

- `srcDir: '.'` — 文档根目录为包根目录
- `cleanUrls: true` — 无 `.html` 后缀
- `lastUpdated: true` — 基于 git 的最后更新时间
- 双语结构: `zh/` 和 `en/` 为平行目录
- prebuild hook (`scripts/sync-openapi.mjs`): 构建前从 server 同步 OpenAPI spec
- Markdown lint 范围仅限 `zh/**/*.md`

## 注意事项

- 当前为脚手架状态，各文档目录仅有占位 `index.md`
- OpenAPI 同步脚本为占位实现，实际同步逻辑待补充
- nav/sidebar/socialLinks 配置为空，待内容就绪后填充

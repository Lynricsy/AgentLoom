# agentloom-docs

AgentLoom 唯一的文档站（VitePress，仅中文，部署在 `/documentation/` 子路径）。不是根 pnpm workspace 成员，依赖用本目录自己的 lockfile 安装。

|分区|目录|读者|
|---|---|---|
|用户指南|`guide/`|使用 Studio / 移动端的用户|
|API 与集成|`api/`|调用 REST / Agent API / Webhook、开发插件的集成方|
|部署运维|`deploy/`|自托管部署与运维人员|
|贡献者|`dev/`|修改本仓库代码的开发者|

`_generated/` 是从代码生成的清单（模块、队列、表、环境变量、节点、端口类型等），页面通过 `<!--@include: -->` 引用，禁止手改。

## 开发命令

```bash
# 仓库根：再生成 / 校验 _generated 与文档引用
pnpm docs:gen
pnpm docs:check

# 本目录
pnpm install
pnpm dev          # predev 先把 agentloom-server/sdk/openapi.json 同步到 public/openapi.json
pnpm build        # prebuild 同步 OpenAPI；死链即失败
pnpm preview
pnpm lint:md

# 仓库根：构建部署镜像
docker build -f agentloom-deploy/docker/docs.Dockerfile .
```

## 文档

- 维护规则（页面类型、事实归属、变更 → 文档矩阵）：`dev/docs-maintenance.md`

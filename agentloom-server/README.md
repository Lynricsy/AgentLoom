# agentloom-server

AgentLoom 的 NestJS 11 + Fastify 5 后端：多租户 REST API（`/api/v1`）、Socket.IO 实时事件、BullMQ 后台任务、Drizzle/PostgreSQL 持久化，以及独立的 ACP stdio 入口。同一镜像以 server 与 worker 两种角色运行。设计说明见文档站「贡献者 → 服务端」。

## 开发命令

依赖安装在仓库根执行一次 `pnpm install`；以下命令在 `agentloom-server/` 内运行。本地环境变量与依赖服务的准备步骤见 `agentloom-docs/dev/setup.md`。

```bash
pnpm start:dev                    # Nest watch 模式，默认端口 3000（APP_PORT）
pnpm start:debug                  # debug + watch
pnpm build                        # nest build
pnpm start:prod                   # 运行 dist/src/main.js
pnpm start:acp:stdio              # 先静默构建，再运行 dist/src/acp-stdio.js（ACP JSON-RPC stdio）
pnpm typecheck                    # tsc --noEmit
pnpm lint                         # ESLint，脚本自带 --fix
pnpm format                       # Prettier 写入 src/ 与 test/

pnpm test                         # Vitest 单元测试（src/**/*.spec.ts）
pnpm test:watch                   # Vitest watch
pnpm test:cov                     # V8 覆盖率，四项阈值 80%
pnpm test:e2e                     # E2E（Testcontainers PostgreSQL，需要 Docker）
pnpm test:e2e -- api-key          # 按文件名模式过滤 E2E

pnpm db:generate                  # 根据 schema 生成迁移
pnpm db:migrate                   # 应用迁移
pnpm db:push                      # 直接同步开发数据库 schema
pnpm db:studio                    # Drizzle Studio
pnpm db:seed                      # 导入模板种子（只读进程环境中的 APP_DATABASE_URL）
pnpm db:migrate:agent-input-nodes # 一次性预迁移 Agent / Workflow 输入节点
pnpm db:backfill:workflow-ports   # 一次性回填 workflow 端口定义

pnpm openapi:export               # build 后导出 sdk/openapi.json
pnpm sdk:generate:models          # 生成 @agentloom/api-client 使用的纯 interface
pnpm sdk:generate                 # 导出 OpenAPI 并生成 TypeScript / Python SDK
```

跨包再生成（OpenAPI → models → api-client）用仓库根的 `pnpm contracts:regen`。Swagger UI 在运行中的服务 `/docs`。

## 文档

- 服务端总览与模块清单：`agentloom-docs/dev/server/index.md`
- 请求管线、安全、数据库、队列、实时、Agent 运行态、ACP、插件、生成应用：`agentloom-docs/dev/server/`
- 新增模块 / 环境变量 / Socket 事件：`agentloom-docs/dev/howto/`
- 环境变量参考：`agentloom-docs/deploy/configuration.md`

# Repository Guidelines

## Project Overview

`agentloom-server` 是 AgentLoom 的 NestJS 11 + Fastify 5 后端，负责多租户 REST API、Socket.IO 实时事件、BullMQ 后台任务、Drizzle/PostgreSQL 持久化，以及独立 ACP stdio 服务。
跨包 wire contract、生成链路和 monorepo 级约束见根 `../AGENTS.md`；本文件只描述 server 包内实践。

## Architecture & Data Flow

- HTTP 入口是 `src/main.ts`：创建 Fastify 应用并启用 `rawBody`，注册 multipart（单文件 50 MiB、最多 50 个文件）、Redis Socket.IO adapter、全局前缀 `api/v1`、CORS、异常过滤器、Zod pipe 与 Swagger `/docs`。
- Redis Socket.IO adapter 连接失败时退回单实例广播；多实例实时推送不能依赖此退化模式。
- 请求顺序为 `TenantMiddleware` → `TenantTransactionInterceptor` → `CustomThrottlerGuard` → `AuthGuard` → `TenantGuard` → `RolesGuard` → controller/service。
- `TenantMiddleware` 从 JWT 提取租户；存在 `X-Api-Key` 时由后续认证链解析租户。公开路由必须同时使用相应公开元数据，并在 `AppModule.configure()` 中按需排除租户中间件。
- `CustomThrottlerGuard` 使用 Redis storage，默认 100 次/60 秒，并按租户资源治理配置处理分钟限流与每日调用配额。
- `AuthGuard` 优先 Bearer JWT，缺少 JWT 时回退 `X-Api-Key`；`TenantGuard` 校验租户 UUID；`RolesGuard` 执行缓存 RBAC。
- 租户请求由 `TenantTransactionInterceptor` 放入 AsyncLocalStorage 管理的 Drizzle 事务；业务代码应复用当前事务，不另开绕过 RLS 的连接。
- 工作流主链是 controller/service → `execution-queue` → execution worker → DAG scheduler → agent/plugin 等专用队列；状态变化经 EventEmitter2 广播意图交给 gateway。
- Socket.IO gateway 使用独立 namespace、`WsJwtGuard`、握手 JWT/黑名单校验、租户房间和显式 subscribe/unsubscribe ACK。execution 与 agent conversation gateway 均维护 500 条背压队列和 100 ms drain timer，并在销毁时清理。
- 实时事件使用 camelCase contract；execution 重连通过 `lastEventId` 和 `StateReplayService` 恢复，不要直接从 service 绕过 `EventBridgeService` 向 socket 广播。
- `src/acp-stdio.ts` 以无 logger 的 `AcpStdioModule` application context 启动单连接 JSON-RPC stdio。stdin 每行独立异步处理，stdout 写入由 `writeChain` 串行化且只承载协议帧；诊断写 stderr。
- ACP 连接关闭会取消已跟踪 session、结清 in-flight 请求并关闭 Nest context。`pnpm start:acp:stdio` 由 `scripts/start-acp-stdio.mjs` 构建并运行 `dist/src/acp-stdio.js`。

## Key Directories

- `src/common/`：guards、middleware、interceptors、filters、pipes、Redis/HTTP/Socket.IO 基础设施与共享服务。
- `src/config/`：环境变量 schema 和 Nest ConfigModule。
- `src/database/schema/`：Drizzle `pgTable`、enum、关系、索引和 RLS policy；公共 barrel 是 `schema/index.ts`。
- `src/database/migrations/`：按序 SQL 迁移及 Drizzle meta；`drizzle.config.ts` 的 schema/out 分别指向上述两个路径。
- `src/database/seeds/`：模板、Skill、LLM provider 与 routing benchmark seed。
- `src/infrastructure/`：MinIO 等外部基础设施适配器。
- `src/modules/`：按业务域放置 module/controller/service/repository/worker/gateway/dto。
- `test/`：跨模块 E2E；`test/rls/` 放 PostgreSQL RLS 场景及 Testcontainers 公共工具。
- `scripts/`：ACP 启动、E2E runner、OpenAPI 导出、SDK 后处理和一次性数据迁移工具。
- `sdk/`：OpenAPI 与生成 SDK；生成内容不要手工修改。

### Module Inventory

- 身份与租户：`auth`、`organization`、`api-key`、`platform-api-token`、`tenant-key`、`user-preference`、`private-deployment`。
- Agent：`agent`、`agent-definition`、`agent-conversation`、`agent-execution`、`agent-memory`、`self-evolution`、`acp-gateway`。
- Workflow 与执行：`workflow-definition`、`workflow`（共享 DTO）、`execution`、`execution-record`、`trigger`、`intervention-policy`、`reusable-block`、`template`。
- 能力与内容：`llm`、`smart-routing`、`mcp`、`skill`、`knowledge`、`workspace`、`sandbox`、`shared-resources`。
- 生态与分发：`plugin`、`marketplace`、`share`、`resource-source`、`generated-app`。
- 治理与运维：`resource-governance`、`monitoring`、`optimization-suggestion`、`evidence`、`notification`、`health`。

## Development Commands

在 `agentloom-server/` 内执行：

```bash
pnpm start:dev                 # Nest watch 模式
pnpm start:debug               # debug + watch
pnpm build                     # nest build
pnpm start:prod                # 运行 dist/src/main.js
pnpm start:acp:stdio           # 构建并启动 ACP stdio
pnpm test                      # src/**/*.spec.ts
pnpm test:watch                # Vitest watch
pnpm test:cov                  # V8 coverage，四项阈值均 80%
pnpm test:e2e                  # test/**/*.e2e-spec.ts
pnpm test:e2e -- api-key       # 将过滤参数透传给 Vitest
pnpm db:generate               # 根据 schema 生成迁移
pnpm db:migrate                # 应用迁移
pnpm db:push                   # 直接同步开发数据库 schema
pnpm db:studio                 # Drizzle Studio
pnpm db:seed                   # 模板 seed
pnpm openapi:export            # build 后导出 OpenAPI
pnpm sdk:generate:models       # 生成纯 TypeScript models
pnpm lint                      # ESLint，脚本自带 --fix
pnpm format                    # Prettier 写入 src/ 与 test/
```

数据库命令依赖 `APP_DATABASE_URL`；HTTP/worker 本地运行还需要 `.env.example` 所列 PostgreSQL、Redis、MinIO、Supabase 等配置。

## Code Conventions & Common Patterns

- 使用 Fastify 类型和 API，不引入 Express 专用 middleware；ORM 使用 Drizzle，测试使用 Vitest。
- 文件采用 kebab-case 和语义后缀：`.module.ts`、`.controller.ts`、`.service.ts`、`.repository.ts`、`.worker.ts`、`.gateway.ts`、`.dto.ts`、`.schema.ts`、`.exceptions.ts`。
- DTO 先定义命名 Zod schema。需要 Nest metadata/OpenAPI 的请求类使用 `class XxxDto extends createZodDto(XxxSchema) {}`；纯内部或手动 pipe 边界可导出 `z.infer<typeof XxxSchema>`，遵循所在模块现有模式。
- 响应 DTO 使用独立 response schema；不要把含请求默认值或输入 coercion 的 schema 直接复用于响应。
- HTTP 域错误继承 `DomainException`，提供稳定的 `type/title/status/detail`，必要时附 `errors` 或 `extensions`。`AllExceptionsFilter` 输出 `application/problem+json`；Zod 校验失败为 422。
- WebSocket handler 使用 `WsException`/ACK 表达客户端错误，不能把 HTTP exception shape 假设为 socket contract。
- 依赖通过构造器注入。基础设施或 port 使用 Symbol token，例如 `DRIZZLE`、`AGENT_RUNTIME`、`SANDBOX_RUNTIME_DRIVER`；动态 provider 用显式 `useFactory` 与 `inject`。
- 新 service 应加入所属 module 的 `providers`，跨模块消费则从拥有者 module `exports`；不要在消费方重复 provision 同一 service。
- server `src/` 保持无 `forwardRef`，通过模块边界、事件或 port 拆除循环依赖。
- `@mariozechner/pi-agent-core` 与 `@mariozechner/pi-ai` 是纯 ESM。CJS Nest 代码只能经 `src/modules/agent/pi-imports.ts` 的 `await import()` 加载；允许 `import type`，禁止顶层 runtime static import。
- 复杂域以 facade + 注入的 repository/service 组合，不通过 service 继承复用实现；纯转换逻辑放 `.util.ts` 或无 DI 模块。
- 跨包事件和 runtime 类型从 `@agentloom/contracts` re-export，不在 server 复制 wire interface。

## Database & Migrations

- `DatabaseModule` 是全局模块，以 `DRIZZLE` Symbol 提供带完整 schema 的 `PostgresJsDatabase`，连接池默认 `max: 20`、`idle_timeout: 30`，模块销毁时关闭 client。
- 新租户表应包含 `tenant_id`、必要索引，并在 `pgTable` extra config 中使用 `createDirectTenantPolicies()`；无 `tenant_id` 的子表使用 `createJoinTenantPolicies()`。
- append-only 租户数据使用 `createAppendOnlyTenantPolicies()`，只生成 SELECT/INSERT policy，不应添加 UPDATE/DELETE 路径。
- RLS 条件以 `get_tenant_id()`/`app.current_tenant` 为边界；不要仅依赖 service 查询条件代替数据库隔离。
- 修改 `src/database/schema/*.schema.ts` 后通过 `pnpm db:generate` 生成迁移，检查 SQL、外键、索引、RLS 与 `--> statement-breakpoint` 分隔，再应用迁移。
- schema 文件必须从 `src/database/schema/index.ts` 导出，否则 Drizzle client、迁移生成和测试无法看到该表。

## Important Files

- `src/main.ts` — HTTP/Fastify/Socket.IO/Swagger 启动。
- `src/app.module.ts` — 域模块注册、全局 interceptor/guard 和公开路由 middleware exclusion。
- `src/acp-stdio.ts` — ACP JSON-RPC stdio transport 生命周期。
- `src/modules/acp-gateway/` — ACP router、handler、session 与 fs/terminal sandbox 边界。
- `src/modules/agent/pi-imports.ts` — pi ESM/CJS 唯一运行时导入边界。
- `src/common/exceptions/domain.exception.ts` 与 `src/common/filters/all-exceptions.filter.ts` — HTTP problem details 契约。
- `src/database/schema/rls-policies.ts` — 直接、append-only、join 三类租户 policy factory。
- `drizzle.config.ts` — PostgreSQL schema 与 migration 路径。
- `vitest.config.ts` / `vitest.e2e.config.ts` — unit/coverage 与 E2E 配置。

## Runtime/Tooling Preferences

- Node.js 22、pnpm、TypeScript 5.9、NestJS 11、Fastify 5、Vitest 4；版本统一规则见根 workspace catalog。
- REST 服务默认监听 `APP_PORT` 或 3000，绑定 `0.0.0.0`；全局 API 前缀为 `/api/v1`。
- PostgreSQL 使用 postgres.js + Drizzle；Redis 同时服务 BullMQ、throttling、缓存和 Socket.IO adapter；对象存储使用 MinIO。
- ACP stdio 的 stdout 是机器协议通道，任何日志、调试信息或错误都不得写 stdout。

## Testing & QA

- 单测与源码同目录，命名 `*.spec.ts` 或放在 `__tests__/`；E2E 命名 `test/**/*.e2e-spec.ts`。
- `vitest.config.ts` 默认只收集 `src/**/*.spec.ts`；显式运行 `test/` 时加载 `test/setup-e2e.ts`。正式 E2E 脚本使用独立 `vitest.e2e.config.ts`。
- coverage 使用 V8，statements、branches、functions、lines 均要求 80%；DTO、schema、迁移、入口和 spec 文件不计入覆盖率。
- 数据库/RLS E2E 使用 `@testcontainers/postgresql` 的 `postgres:16-alpine`；测试启动容器、创建 Supabase 角色/auth schema，并按 `--> statement-breakpoint` 顺序执行所有迁移。
- RLS 测试通过事务内 `SET LOCAL ROLE authenticated` 和 `set_config('app.current_tenant', ..., true)` 建立租户上下文；必须覆盖同租户可见、跨租户不可见和缺失上下文 fail-closed。
- gateway 测试应覆盖握手认证、租户房间/订阅 ACK、事件信封、断线重放及 timer/队列清理；不要只断言私有方法调用。
- ACP stdio E2E 应校验 JSON-RPC 帧、并发 cancel、permission request/response 和 stdout hygiene；测试专用 fake runtime 仅由 `ACP_TEST_FAKE_RUNTIME=1` 启用。

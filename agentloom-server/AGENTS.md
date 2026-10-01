# Repository Guidelines

## 概述

NestJS 11 + Fastify 5 后端：多租户 REST、Socket.IO、BullMQ、Drizzle/PostgreSQL、ACP stdio。跨包规则见根 `AGENTS.md`。
架构与内部设计：`agentloom-docs/dev/server/`（先读 `index.md`、`request-pipeline.md`）；本地运行：`agentloom-docs/dev/setup.md`。

## 本包硬规则

- 使用 Fastify 类型和 API，不引入 Express 专用 middleware；ORM 用 Drizzle，测试用 Vitest。
- 文件 kebab-case + 语义后缀：`.module.ts`、`.controller.ts`、`.service.ts`、`.repository.ts`、`.worker.ts`、`.gateway.ts`、`.dto.ts`、`.schema.ts`、`.exceptions.ts`。
- DTO 先定义命名 Zod schema；需要 Nest metadata/OpenAPI 的请求类用 `class XxxDto extends createZodDto(XxxSchema) {}`；纯内部边界导出 `z.infer<typeof XxxSchema>`，遵循所在模块现有模式。
- 响应 DTO 用独立 response schema，不复用含请求默认值或输入 coercion 的 schema。
- HTTP 域错误继承 `DomainException`（稳定的 `type/title/status/detail`，必要时 `errors`/`extensions`）；`AllExceptionsFilter` 输出 problem+json，Zod 校验失败 422。
- WebSocket handler 用 `WsException`/ACK 表达客户端错误，不假设 HTTP exception shape。
- 构造器注入；基础设施/port 用 Symbol token（`DRIZZLE`、`AGENT_RUNTIME`、`SANDBOX_RUNTIME_DRIVER`）；动态 provider 用显式 `useFactory` + `inject`。
- 新 service 加入所属 module 的 `providers`，跨模块消费从拥有者 module `exports`；不在消费方重复 provision。
- `src/` 不使用 `forwardRef`，用模块边界、事件或 port 拆循环依赖。
- pi-mono 包是纯 ESM：运行时只能经 `src/modules/agent/pi-imports.ts` 的 `await import()` 加载；允许 `import type`，禁止顶层 runtime static import。
- 复杂域用 facade + 注入的 repository/service 组合，不用 service 继承；纯转换放 `.util.ts`。
- 跨包事件与 runtime 类型从 `@agentloom/contracts` re-export，不在 server 复制 wire interface。
- 实时推送只经 `EventBridgeService`，不从 service 直接向 socket 广播。
- 业务代码复用 `TenantTransactionInterceptor` 建立的租户事务，不另开绕过 RLS 的连接。
- ACP stdio 的 stdout 只承载协议帧，日志与诊断一律写 stderr。

## 数据库与测试硬规则

- 新租户表含 `tenant_id` 与必要索引，并在 `pgTable` extra config 用 `createDirectTenantPolicies()`；无 `tenant_id` 的子表用 `createJoinTenantPolicies()`；append-only 数据用 `createAppendOnlyTenantPolicies()`，不加 UPDATE/DELETE 路径。
- RLS 以 `get_tenant_id()` / `app.current_tenant` 为边界，不以 service 查询条件代替数据库隔离。
- schema 文件必须从 `src/database/schema/index.ts` 导出；改 schema 后 `pnpm db:generate`，检查 SQL、外键、索引、RLS 与 `--> statement-breakpoint` 再应用。
- RLS 测试覆盖同租户可见、跨租户不可见、缺失上下文 fail-closed；gateway 测试覆盖握手认证、订阅 ACK、事件信封、断线重放与 timer/队列清理，不只断言私有方法调用。

## 命令

见本包 `README.md`。

## 改动时更新

按 `agentloom-docs/dev/docs-maintenance.md` 的「变更 → 文档矩阵」：新模块/队列/表/环境变量/Socket 事件 → 仓库根 `pnpm docs:gen` 并更新对应 `dev/server/*.md`；REST 端点 → 根 `pnpm contracts:regen`。

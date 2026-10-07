# Repository Guidelines

## 项目

AgentLoom — 多智能体工作流编排平台：用户在可视化画布上把 AI Agent 组合为 DAG 工作流并执行。Agent 与 Workflow 是并列的顶层概念（Agent 有独立的定义/版本/对话/执行体系，可作为 workflow `agent` 节点执行）。
生产地址 `https://agentloom.ling.plus/`，文档站 `https://agentloom.ling.plus/documentation/`。仅开发环境，无 CI/CD。命令见根 `README.md` 与各包 `README.md`。

## 文档路由（改动前先读）

|主题|路径（`agentloom-docs/` 下）|
|---|---|
|仓库地图与读者路径|`dev/index.md`|
|架构总览（请求链、实时事件、类型流、Agent 双运行态、关键文件）|`dev/architecture.md`|
|本地开发环境|`dev/setup.md`|
|server 模块 / 请求管线 / 安全 / 数据库 / 队列 / 实时 / Agent 运行态 / ACP / 插件 / 生成应用|`dev/server/*.md`|
|Studio 架构 / 画布 / 状态管理|`dev/studio/*.md`|
|契约与再生成（contracts、api-client、PortDataType 同步）|`dev/contracts.md`|
|类型引擎|`dev/type-engine.md`|
|移动端|`dev/mobile.md`|
|Firecracker 运行时|`dev/firecracker-runtime.md`|
|runtime 插件（sandbox 运行态 dsh 内核、harness 节点、插件包开发与下发）|`dev/server/runtime-plugins.md`、`dev/server/agent-runtime.md`、`api/plugins/runtime.md`、`guide/agents/harness.md`|
|测试|`dev/testing.md`|
|新增模块 / 节点类型 / 环境变量 / Socket 事件|`dev/howto/*.md`|
|部署运维|`deploy/*.md`|
|对外 API、Webhook、插件开发|`api/*.md`|
|架构决策记录|`dev/decisions/`|
|文档维护规范|`dev/docs-maintenance.md`|
|从代码生成的清单（模块、队列、表、环境变量、节点、端口类型、路由等）|`_generated/`|

## 硬规则

- **技术选型**：Fastify 非 Express，Drizzle 非 TypeORM，Zod 非 class-validator，Vitest 非 Jest。包管理只用 pnpm。
- **格式化**：Prettier `singleQuote: true, trailingComma: 'all'`（`agentloom-server/.prettierrc`）；ESLint flat config + typescript-eslint；`no-explicit-any: off`（但应尽量避免）。
- **命名**：server/contracts 文件 kebab-case，后缀 `.service.ts / .controller.ts / .module.ts / .dto.ts / .schema.ts / .gateway.ts / .worker.ts / .util.ts`；Studio 组件 PascalCase、hooks `useCamelCase.ts`、store `<domain>.store.ts`、路由文件 TanStack `$param` 风格；Dart 文件 snake_case；Rust snake_case。跟随邻近代码，禁止引入第二套风格。
- **DTO 模式**：`dto/<name>.dto.ts` 中定义命名 Zod schema，再 `class XxxDto extends createZodDto(XxxSchema) {}`；全局 `ZodValidationPipe`。list/detail 响应由 Zod schema 单一定义，响应 schema 不得复用带 `.default()` 的请求 schema。
- **错误处理**：`DomainException`（type/title/status/detail）→ `AllExceptionsFilter` 输出 RFC problem+json；Zod 校验失败 422；WS 用 `WsException`；沙箱/运行时非法路径 fail-closed。
- **DI**：NestJS 构造器注入；端口/基础设施用 Symbol token（`DRIZZLE`、`AGENT_RUNTIME`、`SANDBOX_RUNTIME_DRIVER`），工厂用显式 `useFactory` + `inject`；server `src/` 不使用 `forwardRef`。
- **ESM 边界**：pi-mono 包纯 ESM；CJS Nest 侧必须经 `agentloom-server/src/modules/agent/pi-imports.ts` 的 `await import()` 惰性导入，禁止顶层静态 import（`import type` 可以）。
- **实时事件**：worker 只经 `EventBridgeService` 发广播意图，由 gateway `@OnEvent` 推送；Socket wire 保持 camelCase。
- **Studio 状态**：TanStack Query 是服务端实体唯一真相（query key 层级 `all → lists → list(filters) → details → detail(id)`）；Zustand 仅限本地/瞬态状态；列表筛选分页放 URL search params；REST 快照只 hydrate 一次，之后 socket 事件驱动，不被 refetch 覆盖。
- **大小写边界**：Studio ky client 只把 REST JSON 响应转为 camelCase，请求体大小写按目标 server DTO 决定；mobile 模型显式不用 `FieldRename.snake`。
- **Mobile**：Riverpod 3 手写 `Notifier/AsyncNotifier`（无 generator），async notifier 在 `await` 后检查 `ref.mounted`；模型用 `@freezed` + json_serializable；契约违规抛 `ApiContractException` 而非返回假空数据。
- **多租户**：新表必须挂 tenant RLS policy（`createDirectTenantPolicies` 等）；`tenant_encryption_keys` 等 append-only 表不做 UPDATE。
- **PortDataType**：全集定义在 `agentloom-contracts/src/port-data-type.ts`；Rust/plugin-sdk/Studio/server 的镜像由 `port-data-type.test.ts` 机械校验，改动必须同步所有端。
- **生成产物**：`agentloom-api-client/src/models.ts` 只能经 `pnpm contracts:regen` 再生成；`agentloom-docs/_generated/` 只能经 `pnpm docs:gen` 再生成。
- **Git**：原子化提交并推送，做完一点提交一点；commit message `<type>(<scope>): <gitmoji> <subject>`，末尾附 `Co-authored-by: Wine Fox <fox@ling.plus>`；禁止设置 local git config（user.name/user.email 等一律用全局配置）。
- **AI 工作流**：用 `record-agent-log` 记录"做了什么 + 为什么"（禁止手动创建/编辑日志文件，查历史用 `search-logs`）；前端页面开发必须用 `designer` agent；测试账号/测试模型凭据只能取自环境变量（`AGENTLOOM_TEST_EMAIL/PASSWORD`、`AGENTLOOM_TEST_MODEL_*`）或私有运维文档，禁止写入真实凭据。
- **AGENTS.md 规范**：只写规则、门禁与文档路由；事实写进文档站并在上表加路由；禁止 Story/Epic 编号、完成状态标记、变更历史、开发过程记录。

## 提交前门禁

- `pnpm typecheck:all && pnpm test:all`（`test:all` 含 `pnpm docs:check`）。
- 触碰 `agentloom-docs/dev/docs-maintenance.md`「变更 → 文档矩阵」中的来源文件：运行 `pnpm docs:gen` 并提交 `agentloom-docs/_generated/`，同时更新矩阵指向的页面。
- 新增用户可见功能必须补 `agentloom-docs/guide/` 页面。
- `agentloom-server` 的 `pnpm lint` 带 `--fix`，会改写文件。
- 不能遗留任何未通过的测试——未通过的测试视为本轮回归，必须查根因修复。

## 文档维护

- 一个事实只有一个家：命令 → README；规则 → AGENTS.md；清单 → `_generated/`；行为与设计 → `dev/`；用户操作 → `guide/`；决策 → `dev/decisions/`。
- 文档页按 Diátaxis 分类（frontmatter `docType`），新增页面同步 `.vitepress/sidebar/<分区>.ts`。
- 架构级决策写 ADR。完整规范见 `agentloom-docs/dev/docs-maintenance.md`。

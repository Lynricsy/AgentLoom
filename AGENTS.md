# Repository Guidelines

## Project Overview

AgentLoom — 多智能体工作流编排平台。用户在可视化画布上把 AI Agent 组合为 DAG 工作流并执行；Agent 与 Workflow 是两个并行的顶层概念（Agent 有独立的定义/版本/对话/执行体系，可通过 `WorkflowAgentAdapter` 作为 workflow `agent` 节点执行）。生产地址 `https://agentloom.ling.plus/`。仅开发环境，无 CI/CD。

## Architecture & Data Flow

pnpm monorepo，7 个 JS workspace 成员 + 3 个独立构建根（Rust / Go / Flutter）+ 2 个独立 lockfile 的文档站。

```text
agentloom-contracts (Zod 4)          ← server/studio/mobile wire 契约唯一来源
agentloom-api-client                 ← server OpenAPI → 纯 TS interface（生成产物，禁止手改）
agentloom-type-engine (Rust/WASM)    ← studio 端口兼容性检查（Web Worker + WASM）
agentloom-plugin-sdk (Zod 3)         ← 插件生态公共边界，含 RSA-PSS 签名

studio (React 19/Vite 7) ──REST /api/v1──→ server (NestJS 11 + Fastify 5)
                         ──Socket.IO────→ /execution /agent-conversation /knowledge /notification /memory
mobile (Flutter 3.41.2)  ──REST + Socket.IO(JWT)──→ server

server → PostgreSQL(Supabase/Drizzle) + Redis(BullMQ) + Qdrant + MinIO
server ──mTLS──→ agentloom-firecracker-runtime (Go, runtime manager) → Firecracker microVM (pi-coding-agent guest)
```

- **请求链**：TenantMiddleware → TenantTransactionInterceptor → CustomThrottlerGuard → AuthGuard(JWT→X-Api-Key) → TenantGuard → RolesGuard → 域模块 → 租户事务 Drizzle / BullMQ 队列。
- **实时事件**：worker 通过 `EventBridgeService` 发 EventEmitter2 广播意图 → gateway `@OnEvent` 订阅 → Socket.IO camelCase 信封（gateway 侧 500 cap / 100ms drain 背压）；断线重连用 `lastEventId` 增量回放。server `src/` 不使用 `forwardRef`。
- **类型流**：server DTO/OpenAPI → `agentloom-server/sdk/typescript-models` → `agentloom-api-client/src/models.ts`。根命令 `pnpm contracts:regen` 一键再生成（需要 Redis 可达）。
- **Agent 双运行态**：`no_sandbox` 走 `InProcessAgentAdapter → PiAgentCoreAdapter`（pi-agent-core 进程内）；`sandbox` 走 Firecracker guest 内 pi-coding-agent。`SandboxModule` 将 `SANDBOX_RUNTIME_DRIVER` 绑定到 `FirecrackerRuntimeService`（undici mTLS 调 manager）；server/worker 不持有 KVM/网络/cgroup 特权。
- **响应契约**：list/detail 响应由 Zod schema（`...SwaggerSchema` + `createZodDto`）单一定义，手写类型改为 `z.infer` 导出；响应 schema 不得复用带 `.default()` 的请求 schema。

## Key Directories

| 路径 | 用途 |
|---|---|
| `agentloom-server/src/modules/` | NestJS 域模块（controller/service/dto/worker/gateway 每域一目录） |
| `agentloom-server/src/database/schema/` | Drizzle `pgTable` 定义（`*.schema.ts`，tenant RLS 用 `createDirectTenantPolicies`） |
| `agentloom-server/src/common/` | 全局 guards/interceptors/middleware/filters |
| `agentloom-server/test/` | E2E（`*.e2e-spec.ts`，Testcontainers PostgreSQL） |
| `agentloom-studio/src/features/` | Feature-Slice；跨 feature 只能走 `index.ts` barrel（ESLint 强制） |
| `agentloom-studio/src/app/routes/` | TanStack Router 手动路由树 |
| `agentloom-studio/src/shared/ui/` | CVA + Radix + Tailwind 共享组件 |
| `agentloom-contracts/src/` | Zod wire schema（`port-data-type.ts`、`execution-events.ts`、`agent-runtime-config.ts` 等） |
| `agentloom-api-client/src/models.ts` | OpenAPI 生成产物，只能 `pnpm contracts:regen` 再生成 |
| `agentloom-plugin-sdk/src/` | 插件 SDK（validation/helpers/signing，Zod 3） |
| `agentloom-type-engine/src/` | Rust checker/types/validator/wasm；`pkg/` 含已提交的 WASM 产物 |
| `agentloom-firecracker-runtime/` | Go runtime manager（`cmd/runtime-manager`、`internal/{api,manager,runtime,network}`） |
| `agentloom_mobile/lib/features/` | Flutter feature（api/models/providers/screens），路由在 `lib/routes/app_router.dart` |
| `agentloom-deploy/` | Docker Compose、Helm、Firecracker 构建/PKI/备份脚本 |
| `agentloom-docs/` / `agentloom-user-docs/` | VitePress 2 文档站（独立 lockfile，非 workspace 成员） |

## Development Commands

```bash
# 根目录
pnpm install
pnpm test:all / typecheck:all / build:all      # 递归 7 个 JS workspace 成员
pnpm contracts:regen                            # OpenAPI 导出 → models 生成 → api-client sync+build

# Server (agentloom-server/)
pnpm start:dev                # watch 开发
pnpm start:acp:stdio          # ACP stdio 独立入口
pnpm test / test:cov          # 单测（80% 阈值）
pnpm test:e2e                 # E2E，需 Docker；支持模式过滤 pnpm test:e2e -- api-key
pnpm db:generate / db:migrate / db:seed / db:studio
pnpm openapi:export           # build + 导出 sdk/openapi.json
pnpm lint                     # 注意：带 --fix

# Studio (agentloom-studio/)
pnpm dev / test / typecheck / lint / build     # dev 端口 5173，/api 与 /socket.io 代理到 :3000

# Contracts / api-client / plugin-sdk / plugin-cli
pnpm --filter @agentloom/contracts test        # fixture + 端口集合机械同步测试
pnpm --filter @agentloom/api-client sync       # 通常用根 contracts:regen

# Type Engine (agentloom-type-engine/)
cargo test && cargo bench
wasm-pack build --target bundler --release

# Go (agentloom-firecracker-runtime/)
go test ./...

# Mobile (agentloom_mobile/，FVM 固定 Flutter 3.41.2)
flutter pub get && flutter analyze && flutter test
dart run build_runner build --delete-conflicting-outputs

# 部署（agentloom-deploy/）
docker compose -f docker-compose.supabase.yml up -d   # 首次：Supabase 栈
docker compose up -d                                   # 主应用栈；访问 http://localhost:8080
docker compose build --no-cache server && docker compose up -d server worker
./scripts/generate-firecracker-pki.sh
./firecracker/build-artifacts.sh && ./firecracker/build-runtime-image.sh && ./firecracker/firecracker-smoke.sh
```

## Code Conventions & Common Patterns

- **技术选型**：Fastify 非 Express，Drizzle 非 TypeORM，Zod 非 class-validator，Vitest 非 Jest。
- **格式化**：Prettier `singleQuote: true, trailingComma: 'all'`（`agentloom-server/.prettierrc`）；ESLint flat config + typescript-eslint；`no-explicit-any: off`（但应尽量避免）。
- **命名**：server/contracts 文件 kebab-case，后缀 `.service.ts / .controller.ts / .module.ts / .dto.ts / .schema.ts / .gateway.ts / .worker.ts / .util.ts`；Studio 组件 PascalCase、hooks `useCamelCase.ts`、store `<domain>.store.ts`、路由文件 TanStack `$param` 风格；Dart 文件 snake_case；Rust snake_case。跟随邻近代码，禁止引入第二套风格。
- **DTO 模式**：`dto/<name>.dto.ts` 中定义命名 Zod schema，再 `class XxxDto extends createZodDto(XxxSchema) {}`；全局 `ZodValidationPipe`。
- **错误处理**：`DomainException`（type/title/status/detail）→ `AllExceptionsFilter` 输出 RFC problem+json；Zod 校验失败 422；WS 用 `WsException`；沙箱/运行时非法路径 fail-closed。
- **DI**：NestJS 构造器注入；端口/基础设施用 Symbol token（`DRIZZLE`、`AGENT_RUNTIME`、`SANDBOX_RUNTIME_DRIVER`），工厂用显式 `useFactory` + `inject`。
- **ESM 边界**：pi-mono 包纯 ESM；CJS Nest 侧必须经 `src/modules/agent/pi-imports.ts` 的 `await import()` 惰性导入，禁止顶层静态 import（`import type` 可以）。
- **Studio 状态**：TanStack Query 是服务端实体唯一真相（query key 层级 `all → lists → list(filters) → details → detail(id)`）；Zustand 仅限本地/瞬态状态（画布草稿、执行 live 状态、socket）；列表筛选分页放 URL search params。REST 快照只 hydrate 一次，之后 socket 事件驱动，不被 refetch 覆盖。
- **大小写边界**：Studio 全局 ky hook 做 REST snake_case ↔ camelCase；Socket wire 保持 camelCase（mobile 模型显式不用 `FieldRename.snake`）。
- **Mobile**：Riverpod 3 手写 `Notifier/AsyncNotifier`（无 generator），async notifier 在 `await` 后检查 `ref.mounted`；模型用 `@freezed` + json_serializable（`*_dto.dart` + 生成的 `*.freezed.dart/*.g.dart`）；契约违规抛 `ApiContractException` 而非返回假空数据。
- **多租户**：新表必须挂 tenant RLS policy；`tenant_encryption_keys` 等 append-only 表不做 UPDATE。
- **PortDataType**：14 值全集定义在 `agentloom-contracts/src/port-data-type.ts`；Rust/plugin-sdk/Studio/server 的镜像由 `port-data-type.test.ts` 机械校验，改动必须同步所有端。
- **Git**：原子化提交并推送，做完一点提交一点；commit message `<type>(<scope>): <gitmoji> <subject>`，末尾附 `Co-authored-by: Wine Fox <fox@ling.plus>`；禁止设置 local git config（user.name/user.email 等一律用全局配置）。
- **AI 工作流**：用 `record-agent-log` 记录"做了什么 + 为什么"（禁止手动创建/编辑日志文件，查历史用 `search-logs`）；前端页面开发必须用 `designer` agent；测试账号/测试模型凭据只能取自环境变量（`AGENTLOOM_TEST_EMAIL/PASSWORD`、`AGENTLOOM_TEST_MODEL_*`）或私有运维文档，禁止写入真实凭据。
- **AGENTS.md 内容规范**：只写系统当前状态的事实性描述；禁止 Story/Epic 编号、完成状态标记、变更历史、开发过程记录。

## Important Files

- `agentloom-server/src/main.ts` — HTTP 启动（Fastify、Redis Socket.IO adapter、`api/v1`、Swagger `/docs`）
- `agentloom-server/src/app.module.ts` — 根模块 + 全局 guard 链
- `agentloom-server/src/acp-stdio.ts` — ACP JSON-RPC stdio 独立进程入口
- `agentloom-server/drizzle.config.ts` — schema `src/database/schema/index.ts`，迁移 `src/database/migrations`
- `agentloom-studio/src/app/{providers,router}.tsx` + `src/app/routes/__root.tsx` — Studio 启动/路由/auth guard
- `agentloom-studio/vite.config.ts` — Vite + Vitest 一体配置（无独立 vitest config）
- `agentloom-studio/src/shared/api/client.ts` — ky 客户端（Bearer 注入、401 refresh、大小写转换）
- `agentloom-contracts/src/index.ts` — 契约公共 barrel
- `agentloom-firecracker-runtime/cmd/runtime-manager/main.go` — Go manager 入口
- `agentloom_mobile/lib/main.dart` + `lib/routes/app_router.dart` — Flutter 入口/路由
- `pnpm-workspace.yaml` — 成员、catalog（typescript ~5.9.3 / vitest ^4 / zod ^4.3.6）、overrides
- `.env.example`：`agentloom-server/.env.example`（APP_* 全量）、`agentloom-studio/.env.example`（VITE_*）、`agentloom-deploy/.env.template`
- `.trellis/workflow.md` 与 `.trellis/spec/{backend,frontend,guides}/index.md` — 开发流程与分层规范入口

## Runtime/Tooling Preferences

- **Node 22 + pnpm**（lockfile v9；docs 镜像固定 pnpm 10.6.2，其余 corepack）。包管理只用 pnpm。
- **Flutter 3.41.2 via FVM**（`.fvmrc`），Dart `^3.11.0`。
- **Rust edition 2024** + wasm-pack（bundler target）；**Go 1.25**。
- Plugin SDK 固定 **Zod 3.x**（插件生态兼容），不引用 workspace zod catalog。
- `agentloom-docs` / `agentloom-user-docs` 非 workspace 成员，独立 `pnpm install`；prebuild 从 `agentloom-server/sdk/openapi.json` 同步 OpenAPI。
- 本地依赖：`docker-compose.dev.yml` 仅 Qdrant；PostgreSQL/Redis/MinIO 需外部或 Supabase 栈。

## Testing & QA

- **框架**：JS 全线 Vitest 4；mobile `flutter_test` + mocktail；Rust cargo test + Criterion bench + wasm-bindgen-test；Go 标准库 testing。
- **位置/命名**：server 单测与源码同目录 `*.spec.ts`（或 `__tests__/`），E2E 在 `test/*.e2e-spec.ts`；Studio/contracts/plugin 包用 `*.test.ts(x)` 同目录放置。
- **覆盖率**：server 80% 阈值（statements/branches/functions/lines，`vitest.config.ts`）；Studio 无阈值。
- **Mock 模式**：`vi.hoisted()` + `vi.mock()` 工厂广泛使用；Drizzle 链式 mock 用 `mockReturnThis`；Studio 全局 mock 在 `src/test-setup.ts`（Supabase/theme/react-pdf/浏览器 API shims）。
- **E2E**：`@testcontainers/postgresql`（postgres:16-alpine），beforeAll 起容器并按 `--> statement-breakpoint` 切分手动执行迁移 SQL；RLS 测试公用 `test/rls/rls-test-utils.ts`；`pnpm test:e2e -- <pattern>` 过滤用例。
- **契约测试**：`agentloom-contracts/src/fixtures.test.ts` 校验 `fixtures/` 下 server wire JSON；`port-data-type.test.ts` 机械比对四端端口字面量。
- **纪律**：不能遗留任何未通过的测试——未通过的测试都视为本轮回归，必须查根因修复。

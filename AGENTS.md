# AGENTLOOM 项目知识库

> **Generated:** 2026-03-09 | **Commit:** 5092f50 | **Branch:** main

## 自动化开发循环规则

你正身处一个自动化开发循环,没有用户能回复你.

1. 进行开发时,请及时进行原子化提交.不要问"要不要提交",直接提交.如果工作开始时发现工作区不干净,那先把未提交的文件提交或者需要ignore的文件ignore再开始工作.任务完成后,**必须**进行提交
2. 不能停止工作并等待pty或后台agent,必须持续轮询.如果认为还需要很长时间才能完成,可以设置较长的阻塞时间.你一旦停止,系统将认为你的工作已经完成并直接交接给下一步,你将等不到后台工作完成提醒.
3. 不能遗留任何没通过的测试。即使一个未能通过的测试你认为是之前就存在的问题，那也要去找到导致未通过的根本原因并进行修复。又因为之前开发轮次也会执行这条要求，所以理应不会有之前的"遗留问题"导致的未通过的测试，未通过的测试应该都是本次开发导致的回归。
4. 开发时及时使用init-deep更新各个 AGENTS.md，确保知识库与代码保持同步。
5. 如果你是作为code reviewer,同时你发现当前story的部分内容确实依赖于后面的story才能完成,那如果当前story除了这个被阻塞的部分之外其他部分都已经完成的话,可以提前标记为done,但是必须在它所依赖的那个story加上完成这部分被阻塞的任务的任务,确保那个被依赖的story完成后,当前这个未完成的任务会被完成.
6. 为了提高工作效率，请在确保不冲突的情况下尽量并行使用多个subagent来完成任务
7. **AGENTS.md 内容规范**：AGENTS.md 是**持久性架构知识库**，仅记录当前系统状态的事实性描述。**严禁写入**以下内容：
   - Story/Epic 编号引用（如 "Story 8-3"、"Epic 2"）
   - 完成状态标记（如 "已完成"、"已收口"、"✅"、"code-review remediation"）
   - 变更历史日志（如 "X 现在变为 Y"、"从 A 改为 B"）
   - 开发过程记录（如 "审查修复补充"、"某 Story 补充"）
   
   正确写法：描述系统**当前是什么**，而非**曾经发生了什么**。工作日志请使用 `record-agent-log` 工具记录。

## 概览

AgentLoom — 多智能体工作流编排平台。用户通过可视化画布将 AI Agent 组合为 DAG 工作流并执行。

## 项目结构

```
AgentLoomAUTO/
├── agentloom-server/         # NestJS v11 + Fastify v5 后端 (见子 AGENTS.md)
├── agentloom-studio/         # React 19 + Vite 7 前端 (见子 AGENTS.md)
├── agentloom-type-engine/    # Rust WASM 端口兼容性检查器 (见子 AGENTS.md)
├── agentloom-plugin-sdk/     # TypeScript 插件开发 SDK (Zod 3 + tsup dual output)
├── agentloom-plugin-cli/     # 插件脚手架 CLI (create/dev/build/keys/publish 命令)
├── agentloom-plugin-template/ # 示例插件模板 (text-to-uppercase)
├── agentloom_mobile/         # Flutter 3.41.2 移动端应用 (Riverpod + GoRouter + Dio)
├── docker-compose.dev.yml    # 仅 Qdrant (其余服务为外部/Supabase)
├── _bmad/                    # BMAD agent 系统配置 (勿修改)
├── _bmad-output/             # BMAD 生成的文档
└── package.json              # 根 package (仅 @modelcontextprotocol/sdk)
```

**非标准 monorepo**: 无 pnpm-workspace.yaml，各包各自独立管理依赖和 lockfile。

## 在哪找什么

| 任务 | 位置 | 备注 |
|------|------|------|
| 添加后端 API 端点 | `agentloom-server/src/modules/` | NestJS 模块，每模块有 controller/service/dto |
| 添加数据库表 | `agentloom-server/src/database/schema/` | Drizzle ORM，需 `pnpm db:generate` |
| 修改全局中间件/守卫 | `agentloom-server/src/common/` | guards/interceptors/middleware/filters |
| 管理服务端插件注册与生态 | `agentloom-server/src/modules/plugin/` | `.alp` multipart 注册 + canonical archive RSA-PSS 验签、`plugins`/`plugin_developer_keys`/`plugin_usage_records`/`plugin_earnings` 表、`PluginSandboxService`（Extism WASM 沙箱）、开发者密钥管理 API、`plugin-execution`/`earnings-settlement` 队列、插件市场 CRUD、使用量记录、收益结算 |
| 管理工作流分享链接 | `agentloom-server/src/modules/share/` | 管理端 `/workflow-shares`，公共短链 `/s/:token` |
| 添加前端路由 | `agentloom-studio/src/app/routes/` | TanStack Router，手动路由树 |
| 添加前端 feature | `agentloom-studio/src/features/` | Feature-Slice 架构 |
| 添加画布节点类型 | `agentloom-studio/src/features/canvas/` | 见 canvas 子 AGENTS.md |
| 修改端口类型兼容性 | `agentloom-type-engine/src/checker/` | Rust，需 `wasm-pack build` |
| 添加插件 SDK 类型/校验/辅助函数 | `agentloom-plugin-sdk/src/` | standalone TS 包，输出 ESM+CJS |
| 共享 UI 组件 | `agentloom-studio/src/shared/ui/` | CVA + Radix + Tailwind |
| 添加移动端 feature | `agentloom_mobile/lib/features/` | Feature 目录，每 feature 含 screens/ |
| 修改移动端路由 | `agentloom_mobile/lib/routes/` | GoRouter + StatefulShellRoute |
| 移动端共享组件 | `agentloom_mobile/lib/shared/` | providers/models/widgets |
| 环境变量 | `agentloom-server/.env.example` / `agentloom-studio/.env.example` / `agentloom_mobile/.env.*` | |

## 跨包架构

```
type-engine (Rust/WASM)
  └── studio（TypeEngineService + Web Worker/WASM runtime + 受控 fallback）

studio (React) ──HTTP REST──→ server (/api/v1)
              ──Socket.IO──→ server (/execution, /knowledge, /notification)

mobile (Flutter) ──HTTP REST──→ server (/api/v1)
              ──Socket.IO──→ server (/execution namespace, JWT auth)

server (NestJS) → PostgreSQL (Supabase/Drizzle) + Redis (BullMQ) + Qdrant + MinIO
```

**类型共享**: 无共享包。通过约定/手动镜像同步（有漂移风险）。
**大小写转换**: Studio 全局 ky hook 自动 snake_case ↔ camelCase。

## 关键约定

- **NO CI/CD** — 仅开发环境
- **Fastify** 非 Express，**Drizzle** 非 TypeORM，**Zod** 非 class-validator，**Vitest** 非 Jest
- **ESLint**: flat config + typescript-eslint + prettier (singleQuote, trailingComma:all)
- **`no-explicit-any: off`** — 项目允许 any（但应尽量避免）
- **Server 80% 覆盖率阈值**，Studio 无阈值
- **Plugin SDK** 使用 **Zod 3.x**（面向插件生态兼容），通过 **tsup** 输出 ESM+CJS + `.d.ts/.d.cts`，包含 `signing/` 模块提供 RSA-PSS 签名与验证工具函数
- **多租户**: 全局中间件链 TenantMiddleware → TenantTransactionInterceptor → AuthGuard → TenantGuard → RolesGuard
- **vi.hoisted()** 在测试中广泛使用，mock factory 函数模式
- **Testcontainers PostgreSQL** 用于 E2E 测试

## 命令

```bash
# Server
cd agentloom-server
pnpm install && pnpm start:dev    # 开发 (watch mode)
pnpm test                          # 单元测试
pnpm test:e2e                     # E2E (需 Docker)
pnpm test:cov                     # 覆盖率 (80% 阈值)
pnpm db:generate                  # 生成 Drizzle 迁移
pnpm db:migrate                   # 执行迁移
pnpm db:seed                      # 种子数据 (5 个预置模板)
pnpm db:studio                    # Drizzle Studio UI
pnpm openapi:export               # 导出 OpenAPI 3.0 spec 到 sdk/openapi.json
pnpm sdk:generate                 # 顺序执行 spec 导出 + TS/Python SDK 生成
pnpm sdk:build:ts                # 校验 TypeScript SDK 类型

# Studio
cd agentloom-studio
pnpm install && pnpm dev          # 开发 (Vite)
pnpm test                          # 单元测试
pnpm typecheck                    # tsc --noEmit
pnpm build                        # 生产构建

# Type Engine
cd agentloom-type-engine
cargo test                         # 测试
cargo bench                       # 基准测试
wasm-pack build --target bundler --release  # 构建 WASM

# Plugin SDK
cd agentloom-plugin-sdk
pnpm install                       # 安装依赖
pnpm build                         # tsup 输出 ESM+CJS + 类型声明
pnpm test                          # Vitest 测试
pnpm typecheck                     # tsc --noEmit

# Plugin CLI
cd agentloom-plugin-cli
pnpm install                       # 安装依赖
pnpm build                         # tsup 构建
pnpm test                          # Vitest 测试

# Plugin Template
cd agentloom-plugin-template
pnpm install                       # 安装依赖
pnpm build                         # tsup 构建
pnpm test                          # Vitest 测试

# Mobile (需 Flutter 3.41.2 via FVM)
cd agentloom_mobile
flutter pub get                    # 安装依赖
flutter analyze                    # 静态分析
flutter test                       # 单元测试
flutter test --coverage            # 覆盖率
dart run build_runner build        # 代码生成 (freezed/json_serializable)
```

## 注意事项

- **E2EE**: `TenantKeyModule` 管理 RSA-4096 公钥，`LlmEncryptionService` 执行 hybrid RSA-OAEP + AES-256-GCM 加密。`AgentTaskWorker` 在完成路径加密 LLM 输出，`EvidenceService` 加密 `agent_decision`/`tool_output` 证据。`tenant_encryption_keys` 为 append-only 历史模型（`organization_id + key_fingerprint` 唯一 + 单 active partial unique index）。Studio 私钥以 PKCS8 二进制存入 IndexedDB，解密时导入 non-extractable CryptoKey
- **Smart Routing**: `SmartRoutingModule` 提供 6 种路由策略（TOKEN_OPTIMIZED / COST_OPTIMIZED / QUALITY_FIRST / LATENCY_FIRST / HISTORICAL_BEST / FALLBACK_CHAIN）。`FALLBACK_CHAIN` 支持非认证失败时自动切换模型重试。`routing_decisions.selected_model_id` 为 nullable。Studio 端 `smart-routing` 节点 canonical 端口为 `model-in-0` / `model-in-1` / `model-out`，默认策略为 `FALLBACK_CHAIN`
- **PortDataType**: Rust / Studio / Server 统一使用 canonical 8 值 `model|text|json|image|audio|tool|sandbox|knowledge`，Studio `mcpToolMapping` 兼容 legacy `number`/`boolean -> json` 回退
- **Socket.IO `/execution` 协议**: typed `ExecutionEvent<T>` 信封（含 monotonic eventId），`execution:subscribe`/`execution:unsubscribe` + ACK，事件名 `execution.node.*` + `execution.status.changed`。Gateway 含背压队列（500 cap, 100ms drain），断线重连支持 `lastEventId` 增量回放。`/knowledge` namespace 仍为隐式契约
- **Workflow Session**: 持久化到 `execution_steps.checkpointData.session`；工具权限端点 `/executions/:executionId/steps/:stepId/tool-calls/:toolCallId/resolve`；`awaiting_permission` 是 tool-level 状态且 step 保持 `running`
- **ShareModule**: 管理端 `/workflow-shares` RBAC + 公开只读 `/s/:token`。分享创建要求 `publishedVersionId` 非空，公开读取从 snapshot 返回 `nodes/edges/viewport`，原子递增 `view_count/copy_count`
- **Studio 认证占位**: `useAuthToken` 使用 `localStorage('auth_token')` + `useSyncExternalStore`，标记 `TODO(auth)` 待替换为真实 Supabase 认证。Studio 无 Supabase 客户端/auth store
- **执行触发**: VersionToolbar Run → `useStartExecution` → `POST /workflow-definitions/:id/run` → `executionStore.initExecution(id)`。WorkflowStatusBar 显示 6 状态 + 进度
- **通知模块**: `NotificationModule` 提供 REST + BullMQ queue + Socket.IO `/notification` namespace。fan-out 创建 `completed` / `failed` / `intervention_required` 通知。支持 `in_app` / `email` / `push` 三通道
- **Trigger 系统**: 支持 `cron` / `webhook` / `api_event`(preview-only) 三种类型。Webhook 签名验证失败记录 `signature_failed` 历史。`api_event` 仅可查看不可创建/编辑/启用。执行创建在租户事务提交后才入队
- **Intervention Policy**: `intervention_policies` 表驱动介入策略，支持 approve/reject/escalate timeout 动作，`MAX_ESCALATION_ATTEMPTS = 3`
- **工作流输入参数**: `input_schema` JSONB 列存储 `WorkflowInputSchema`，支持 `form|conversation|hybrid` 三种 `collectionMode`。`RunWorkflowDto` 支持 `launchSource`
- **PluginModule**: `plugins` 表保存租户插件元数据（`org_id + plugin_id` 唯一，含 `manifest`、`node_definitions`、`signature`、`content_hash`、`wasm_bundle_url`、`occ_version` 与 tenant RLS）。`plugin_developer_keys` 表管理开发者 RSA 公钥（`org_id + key_fingerprint` 唯一，active/revoked 状态）。`plugin_usage_records` 表记录每次插件执行的使用量（含 billingAmount、executionDurationMs、inputTokens、outputTokens）。`plugin_earnings` 表记录收益结算周期（含 totalRevenue、developerShare、platformShare、listingCommission，`payoutStatusEnum`: pending/processing/completed/failed）。收益分成模型：总收入 × 0.70 = 开发者毛收入，毛收入 × 0.15 = 上架佣金，开发者净收入 = 毛收入 - 佣金（≈59.5%），平台份额 = 总收入 × 0.30。`/plugins` 提供 `.alp` multipart 注册、列表、详情、状态更新与删除；`/plugins/marketplace` 提供插件上架/列表/详情/更新 CRUD；`/plugins/developer-keys` 提供开发者密钥管理。`PluginExecutionWorker` 执行成功后 fire-and-forget 调用 `PluginUsageService.recordUsage()`。`EarningsSettlementWorker`（`earnings-settlement` 队列）按周期汇总使用量并计算收益分成，含幂等性检查。`PluginSandboxService` 使用 `@extism/extism` 创建隔离 WASM 实例（`runInWorker: true`），平台硬限制固定 `timeoutMs=30000` / `maxMemoryPages=4096`
- **Marketplace**: 公共 browse/search/detail/reviews/install 链路。安装 RBAC `owner/admin/creator/operator`。发布审核基于 `workflowDefinitions.status + publishedVersionId`。`marketplace_listings` 支持 `listingType`（workflow/plugin）和 `pricingModel`（free/per_execution），`workflowVersionId` 为 nullable 以支持插件上架
- **导出/导入**: 导出使用 `agentloom-workflow-v1` 信封 + `sanitizeDefinition()` 递归剥离敏感信息。导入含 Zod 校验 + `cloneDefinitionWithNewIds()`。创建工作流支持 `template_slug` / `share_token` / `marketplace_listing_id` 三种克隆源（互斥）
- **Open API & SDK**: `PlatformApiTokenModule` 管理 API Key（`al_` prefix + SHA-256 hash）。`AuthGuard` 双重认证 JWT → X-Api-Key fallback。`CustomThrottlerGuard` 100 req/min 限流。支持 TS-fetch / Python SDK 生成
- **docker-compose.dev.yml 仅 Qdrant**: PostgreSQL/Redis/MinIO 需外部部署或使用 Supabase
- **WASM 产物已提交**: `agentloom-type-engine/pkg/` 包含构建后的 `.wasm` 文件

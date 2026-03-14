# AGENTLOOM 项目知识库

> **Generated:** 2026-03-09 | **Commit:** 5092f50 | **Branch:** main

## 自动化开发循环规则

你正身处一个自动化开发循环,没有用户能回复你.

1. 进行开发时,请及时进行原子化提交.不要问"要不要提交",直接提交.如果工作开始时发现工作区不干净,那先把未提交的文件提交或者需要ignore的文件ignore再开始工作.任务完成后,**必须**进行提交
2. 不能停止工作并等待pty或后台agent,必须持续轮询.如果认为还需要很长时间才能完成,可以设置较长的阻塞时间.你一旦停止,系统将认为你的工作已经完成并直接交接给下一步,你将等不到后台工作完成提醒.
3. 不能遗留任何没通过的测试。即使一个未能通过的测试你认为是之前就存在的问题，那也要去找到导致未通过的根本原因并进行修复。又因为之前开发轮次也会执行这条要求，所以理应不会有之前的"遗留问题"导致的未通过的测试，未通过的测试应该都是本次开发导致的回归。
4. 开发时及时更新各个 AGENTS.md，确保知识库与代码保持同步。
5. 如果你是作为code reviewer,同时你发现当前story的部分内容确实依赖于后面的story才能完成,那如果当前story除了这个被阻塞的部分之外其他部分都已经完成的话,可以提前标记为done,但是必须在它所依赖的那个story加上完成这部分被阻塞的任务的任务,确保那个被依赖的story完成后,当前这个未完成的任务会被完成.
6. 为了提高工作效率，请在确保不冲突的情况下尽量并行使用多个subagent来完成任务
## 概览

AgentLoom — 多智能体工作流编排平台。用户通过可视化画布将 AI Agent 组合为 DAG 工作流并执行。

## 项目结构

```
AgentLoomAUTO/
├── agentloom-server/         # NestJS v11 + Fastify v5 后端 (见子 AGENTS.md)
├── agentloom-studio/         # React 19 + Vite 7 前端 (见子 AGENTS.md)
├── agentloom-type-engine/    # Rust WASM 端口兼容性检查器 (见子 AGENTS.md)
├── agentloom_mobile/         # Flutter 3.41.2 移动端应用 (Riverpod + GoRouter + Dio)
├── docker-compose.dev.yml    # 仅 Qdrant (其余服务为外部/Supabase)
├── _bmad/                    # BMAD agent 系统配置 (勿修改)
├── _bmad-output/             # BMAD 生成的文档
└── package.json              # 根 package (仅 @modelcontextprotocol/sdk)
```

**非标准 monorepo**: 无 pnpm-workspace.yaml，四个包各自独立管理依赖和 lockfile。

## 在哪找什么

| 任务 | 位置 | 备注 |
|------|------|------|
| 添加后端 API 端点 | `agentloom-server/src/modules/` | NestJS 模块，每模块有 controller/service/dto |
| 添加数据库表 | `agentloom-server/src/database/schema/` | Drizzle ORM，需 `pnpm db:generate` |
| 修改全局中间件/守卫 | `agentloom-server/src/common/` | guards/interceptors/middleware/filters |
| 添加前端路由 | `agentloom-studio/src/app/routes/` | TanStack Router，手动路由树 |
| 添加前端 feature | `agentloom-studio/src/features/` | Feature-Slice 架构 |
| 添加画布节点类型 | `agentloom-studio/src/features/canvas/` | 见 canvas 子 AGENTS.md |
| 修改端口类型兼容性 | `agentloom-type-engine/src/checker/` | Rust，需 `wasm-pack build` |
| 共享 UI 组件 | `agentloom-studio/src/shared/ui/` | CVA + Radix + Tailwind |
| 添加移动端 feature | `agentloom_mobile/lib/features/` | Feature 目录，每 feature 含 screens/ |
| 修改移动端路由 | `agentloom_mobile/lib/routes/` | GoRouter + StatefulShellRoute |
| 移动端共享组件 | `agentloom_mobile/lib/shared/` | providers/models/widgets |
| 环境变量 | `agentloom-server/.env.example` / `agentloom-studio/.env.example` / `agentloom_mobile/.env.*` | |

## 跨包架构

```
type-engine (Rust/WASM)
  └── studio（Story 2-4a 已接通：TypeEngineService + Web Worker/WASM runtime + 受控 fallback）

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

# Mobile (需 Flutter 3.41.2 via FVM)
cd agentloom_mobile
flutter pub get                    # 安装依赖
flutter analyze                    # 静态分析
flutter test                       # 单元测试
flutter test --coverage            # 覆盖率
dart run build_runner build        # 代码生成 (freezed/json_serializable)
```

## 注意事项

- **Story 5.8 已完成**: workflow session 现持久化到 `execution_steps.checkpointData.session`；工具权限端点为 `/executions/:executionId/steps/:stepId/tool-calls/:toolCallId/resolve`；`awaiting_permission` 是 tool-level 状态且 step 保持 `running`；`ToolCallEvent` 现包含 `transitions[{ from?, to, source, timestamp }]`
- **Studio 执行历史/调试视图已接通**: `WorkflowCanvasPage` 可按需展开 `ExecutionHistoryPanel` 浏览 `/workflow-definitions/:id/executions`，点击 `RunCard` 跳转 `/executions/$executionId`；调试页为只读 React Flow + 垂直时间线 + 节点详情三栏布局（移动端纵向堆叠），中间栏使用 `ExecutionTimelineVertical` + `useTimelineData` hook，节点详情读取真实 `execution_steps.input` JSONB
- **Story 2-4a 已完成**: Studio 现通过 `agentloom-studio/src/features/canvas/lib/typeEngine/` 中的 `TypeEngineService -> TypeEngineRuntime -> runtime.worker.ts` 接入 WASM；主线程保留同步 guard/cache 读取，慢检查走单例 worker + cache + 受控 fallback；`canvasStore.updateNodeData()` 仅在端口契约签名变化时重算相邻边并触发 autosave 持久化新的 `edge.data`
- **PortDataType 对齐已收口**: Rust 与 Studio 使用 canonical 8 值；Server 的 MCP DTO 与执行/发布诊断链路现已对齐该集合。Studio `mcpToolMapping` 现直接消费 `model|text|json|image|audio|tool|sandbox|knowledge`，并兼容 legacy `number`/`boolean -> json` 回退
- **Socket.IO `/execution` 事件协议已统一**: typed `ExecutionEvent<T>` 信封 (含 monotonic eventId)，`execution:subscribe`/`execution:unsubscribe` + ACK，事件经 EventBridgeService → ThrottleService → broadcastTypedEvent() 管线。事件名称统一为 `execution.node.*` 前缀 (`status-changed`, `agent-event`, `retrying`, `output-chunk`) + `execution.status.changed`。Gateway 含背压队列 (500 cap, 100ms drain)。认证失败返回 close code 4001，订阅拒绝返回 `{status:'error', error:'FORBIDDEN'}`。断线重连支持 `lastEventId` 增量回放 (EventBridgeService 环形缓冲 500 事件)。但 `/knowledge` namespace 仍为隐式契约
- **通知模块已接通**: Server 新增 `NotificationModule`（REST 列表/偏好、BullMQ `notification` 队列、`/notification` namespace）。`EventBridgeService.emitExecutionStatusChanged()` 会发出 `execution.status.changed`，`emitInterventionRequired()` 会额外发出 `execution.node.intervention-required`；`NotificationListener` 会向租户内 `owner/admin/creator`（Editor+）fan-out 创建 `completed` / `failed` / `intervention_required` 通知，body 含 `workflowId/workflowName/executionId/timelineUrl` 及错误/干预上下文，实时事件名为 `notification.new` / `notification.unread-count`。Studio 的首次成功庆祝现使用 workflow-scoped key `agentloom:workflow:{workflowId}:first-success-celebrated`
- **Studio 认证占位**: `useAuthToken` 使用 localStorage('auth_token') + useSyncExternalStore，标记 TODO(auth) 待替换为真实 Supabase 认证。`useExecutionSocket` 已支持 `authToken?` 参数。Studio 无 Supabase 客户端/auth store
- **执行触发已接通**: VersionToolbar Run 按钮 → `useStartExecution` → POST /workflow-definitions/:id/run → executionStore.initExecution(id)。WorkflowStatusBar 显示 ExecutionStatusIndicator (6 状态 + 进度)
- **docker-compose.dev.yml 仅 Qdrant**: PostgreSQL/Redis/MinIO 需外部部署或使用 Supabase
- **WASM 产物已提交**: `agentloom-type-engine/pkg/` 包含构建后的 .wasm 文件
- **Story 6-1 已完成**: EvidenceModule 已实现（Server: schema + DTO + service + controller + module + exceptions + events；Studio: types + api + query hooks + barrel）。证据记录支持 5 种 source type (`rag_retrieval`/`agent_decision`/`tool_output`/`user_input`/`intervention`)，`parent_evidence_id` 现为自引用 FK。自动证据事件来源为 `knowledge.rag.retrieved`、`execution.node.agent-event`、`execution.node.tool-call-status`、`execution.node.intervention-resolved`；`RagService.search()` 支持 `evidenceContext { executionId, stepId, parentEvidenceId? }`。完整性校验为服务端 source-payload SHA-256 重算，返回 `{ evidenceId, valid, integrityWarning, currentHash }`。批量写入支持 50ms buffer flush。REST 端点: GET `/executions/:id/evidence` (分页) + GET `/:evidenceId` + GET `/:evidenceId/verify`
- **Story 6-2 已完成**: 溯源链自动构建与完整性校验。Server: `EvidenceService.buildChain()` 使用递归 CTE 沿 `parent_evidence_id` 向上追溯；未传 `nodeId` 时从 execution 的叶子 evidence 锚定全量 ancestry，传入 `nodeId` 时通过 `execution_steps.node_id`（plain-text workflow node identifier）筛选并返回 ancestor-first roots（`maxDepth=50` + `path` 防循环）。每节点返回 `packetSummary`、`sourceUnavailable` / `sourceModified` / `unavailableReason` / `originalSnapshot` / `hashValid`，响应为 `{ roots, chainCompleteness, totalNodes, integrityStatus, cachedAt? }`，其中 `integrityStatus` 含 `nodesWithPhysicalLocation`、`completenessLabel`、`integrityIssues`。`GET /executions/:id/evidence/chain?nodeId=xxx` 使用 300s Redis 缓存并返回 `X-Cache-Hit`；`verifyChainIntegrity()` 始终绕过缓存进行实时校验。Studio: 对齐 `EvidencePacketSummary` / `IntegrityIssue` / `ChainIntegrityStatus` / `EvidenceChainResponse`，并提供 `fetchEvidenceChain`、`evidenceKeys.chain`、`useEvidenceChain`（`staleTime` 5min）及 barrel exports
- **Story 6-3 已完成**: 执行时间线垂直视图与决策注解。Server: `QueryEvidenceSchema` 新增 `sourceType` / `stepId` / `nodeId` 可选过滤参数，`findByExecution()` 支持按 `sourceType` 直接过滤、按 `stepId` 过滤步骤证据、按 `nodeId` 通过 execution_steps 关联查找；`sourceType` 查询类型已与 `EvidenceSourceType` enum 对齐，避免 Drizzle enum 构建时报错。Studio: evidence 层新增 `fetchAllEvidenceByExecution()` 与 `useAllEvidenceRecords()`，通过分页拼平规避 server `limit.max(100)`；`useTimelineData` 会按 step 选择最新 `agent_decision` / `intervention` evidence，并从 `checkpointData` / evidence / `nodeData` fallback 推导 autonomyMode（Agent 节点默认 `FIXED`）。`DecisionAnnotation` 使用 `react-markdown` + `skipHtml` 渲染 reasoning markdown，折叠态也保留 AutonomyBadge / InterventionTag；`TimelineIO` 提供折叠预览、耗时/重试摘要与展开结构化 JSON tree；`FailedNodeError` 优先消费结构化 `errorDetail` 呈现 RFC7807 细节。`ExecutionDebugView` 中间栏已替换为新垂直时间线。
- **Story 6-4 已完成**: 证据引用面板与文档精准跳转。Server: `StorageService.getPresignedUrl()` 现先 `statObject()` 校验对象存在并映射 `StorageKeyInvalidException` / `StorageObjectNotFoundException` / `StorageUnavailableException`；`DocumentService.getDocumentContentUrl()` 返回 `{url, fileName, mimeType, expiresIn}`，并把缺失 `storageKey`、对象已删除、MinIO 不可用分别映射为 `DocumentContentNotFoundException` / `DocumentContentUnavailableException`；`KnowledgeBaseController GET :kbId/documents/:docId/content` 端点（VIEWER+）；`QueryEvidenceSchema.includeChunkContent` 布尔参数继续驱动 `EvidenceService.enrichWithChunkContent()` 注入 `chunkContent`。同时 `PhysicalLocation` 与 RAG packet summary metadata 均新增 `knowledgeBaseId`，完整性校验响应新增 `currentHash`。Studio: `evidenceUiStore`（Zustand）现管理 `panelExecutionId/panelNodeId/panelNodeName/selectedEvidenceId/highlightUntil/documentViewer`，`openPanel()` 会在切换节点上下文时清空旧 viewer/旧选中/旧高亮；`useDocumentContent` hook 复用在 `evidenceQueries.ts` 中并按 `expiresIn * 0.8` 设置 staleTime；`EvidenceReferencePanel` 400px 右滑面板按 `executionId + nodeId` 拉链，异步链数据到达后仍会滚动到预选证据卡片，并支持 Escape 关闭与 2 秒高亮；`EvidenceCard` 使用真实 `EvidenceRecord` + lazy verify 结构化渲染 5 种 source type；`SourceStatusBadge` 展示 modified/unavailable tooltip 与原始快照；`LocationLink` 直接打开基于 `PhysicalLocation` 的文档查看器；`DocumentViewer` 改为 `react-pdf` / `markdown-it` / 文本 `<pre>`，其中 PDF 分支通过 `customTextRenderer` 按 `offset/length` 在文本层输出 `<mark>` 精确高亮，若缺精确范围才回退整页覆盖；`EvidenceChips` 与 `InlineEvidenceRef` 均透传 node 上下文，后者支持 tooltip 预览与面板高亮；已集成到 `ExecutionDebugView`
- **Story 7-1 已完成**: TemplateModule (无认证公共 API)。Server: `workflow_templates` 表（无 RLS、无 tenant_id，系统级公共资源），partial index on category (is_published=true)、GIN index on tags、unique on slug；template `definition` 与 `workflowDefinitions.definition` 同构，`nodes/edges/viewport` 均为必填。`TemplateService.findAll(category?, page, pageSize)` 排除 definition 字段，按 displayOrder+createdAt 排序；`findBySlug(slug)` 返回含 definition 完整详情。DTO category 使用 `z.enum(['analysis','content','development','automation','reporting'])`。`AppModule.configure()` 已通过 `TenantMiddleware.exclude({ path: 'templates', method: RequestMethod.ALL }, { path: 'templates/{*splat}', method: RequestMethod.ALL })` 显式放行模板公共路由。5 个预置种子模板（upsert on slug）：daily-competitor-analysis、customer-feedback-classifier、tech-blog-writer、code-review-assistant、auto-data-report。CLI 种子脚本 `pnpm db:seed`。Studio: `features/template/` 提供 `TemplateCategory`、`TemplateDefinition/TemplateMetadata/TemplateListItem/TemplateDetail`、API client (fetchTemplates/fetchTemplateBySlug)、query hooks (`useTemplates` / `useTemplateBySlug`，`useTemplateDetail` 为兼容别名)，并显式设置 `staleTime=10min`、`gcTime=10min`
- **Story 7-2 已完成**: 模板浏览 UI 与三步快速创建流程。Server: `POST /api/v1/workflow-definitions` 端点（`WorkflowDefinitionCreateController`，独立于已有的 `:workflowId` 控制器）接受 `CreateWorkflowDefinitionDto {name, description?, template_slug?}`，`WorkflowVersionService.create()` 生成 slug、若有 template_slug 则调用 `TemplateService.findBySlug()` → `cloneDefinitionWithNewIds()` 重映射全部节点 UUID + 更新边引用 + 设置 `metadata.cloned_from_template {templateSlug, templateName, clonedAt}`；slug 冲突最多重试 3 次（`appendSlugSuffix`）。`workflowDefinitions` 新增 `metadata` jsonb 列（migration `0025`）。Studio: `TemplateBrowsePage`（`/templates` 路由）含 Tabs (全部 + 5 分类) + 搜索 + 网格 + 空态 + 加载态；`TemplateCard` 展示名称/分类/描述/复杂度/节点数；`TemplateWizardDialog` 含 ReactFlow 只读静态预览 (fitView + 全部交互禁用) + react-hook-form 表单 (名称预填"的副本" + 描述预填) → `useCreateWorkflow()` → 跳转画布。Header 导航新增"模板"入口
- **Story 6-5 已完成**: 节点级错误诊断与类型不匹配报告。Server: `isPortTypeCompatible(source, target)` 端口类型兼容判断（同类型或目标为 json 即兼容）；`NodeTypeMismatchException` 结构化异常包含 `TypeMismatchDetail {sourcePortId, targetPortId, sourceType, targetType, sourceNodeId, targetNodeId, edgeId?}`；`NodeSchedulerService.checkEdgePortTypeCompatibility()` 运行时类型校验抛出 `NodeTypeMismatchException`；`WorkflowVersionService.publish()` 返回 `PublishResult {data, warnings}`，`validateEdgeTypeCompatibility()` 检测不兼容边生成 `PublishWarning[]`；`EventBridgeService.emitStepStatusChanged()` 当 `payload.to==='failed'` 时额外通过 NestJS EventEmitter 发射事件供 evidence 监听；`EvidenceService.handleStepFailed()` 监听步骤失败自动创建 `node_error` 类型证据（含 errorMessage/errorType/errorTitle/typeMismatch/stack）；`buildPacketSummary` 支持 `node_error` 摘要生成；`execution-response.dto.ts`、`state-replay.service.spec.ts` 与 `workflow-version.e2e-spec.ts` 现分别补齐结构化错误契约、`errorDetail` 快照透传与发布 warnings E2E 覆盖。Studio: `EvidenceSourceType` 新增 `node_error`；`EvidenceCard` 渲染 `node_error` 错误摘要与类型不匹配对比视图；`FailedNodeError` 结构化展示 RFC7807 + typeMismatch + retryHistory + validationErrors；`normalizeExecutionDetail` retryHistory 支持从 errorMessage.attempts 回退；`PublishSheet` 展示发布类型不匹配警告；`executionStore` 对齐 `StructuredErrorDetail` 类型；`versionMutations` 对齐 `PublishResult` 返回格式；`mcpToolMapping` 已对齐 canonical 8-value backend 端口类型并保留 legacy fallback
- **Story 7-3 已完成**: Flutter 移动端应用骨架与导航壳。`agentloom_mobile/` 使用 Flutter 3.41.2 (Dart 3.11.0)，依赖 flutter_riverpod ^3.2.1、go_router ^17.1.0、dio ^5.9.2、flutter_dotenv、freezed。目录结构: `lib/{app,config,routes,shared,features}/`。`ShellScaffold` 使用 Material 3 NavigationBar (Dashboard/Workflows/Settings 三 tab) + 简化 `goBranch(index)` 调用，路由为 `StatefulShellRoute.indexedStack` 保持 tab 状态。`main.dart` 先 `AppEnvironment.fromString()` 校验环境名再加载 dotenv（防止未知 ENV 触发 FileNotFoundError）。`EnvConfig` 支持 dev/staging/prod 三环境 `.env.*`（均 git-tracked，mobile `.gitignore` 含 negation 规则覆盖根 `.gitignore`）。`apiClientProvider` (Dio) 配置 baseUrl + 10s connect/30s receive timeout。37 个测试全部通过（含 NavigationBar highlight 同步与重复 tab 点击测试）
- **Story 7-4 已完成**: 移动端工作流概览与详情视图。Server: `WorkflowDefinitionCreateController` 新增 `GET /workflow-definitions`（分页 + status/search 筛选，排除 nodes/edges/viewport）和 `GET /workflow-definitions/:id`（详情，同样排除大字段），`WorkflowVersionService` 新增 `findAllDefinitions()` 和 `findDefinitionById()`。单元测试 + E2E 测试全覆盖。Flutter: `PaginatedResponse<T>` 泛型分页模型（`@JsonSerializable(genericArgumentFactories: true)`）；Freezed `WorkflowDefinitionDto` + `ExecutionSummaryDto`（snake_case JSON）；`WorkflowApi` Dio 封装（list/get/executions/run）；`WorkflowListNotifier`（AsyncNotifier，300ms 搜索防抖 + 状态筛选 + 无限滚动 loadMore）；`workflowDetailProvider` / `workflowExecutionsProvider`（FutureProvider.family）；`recentWorkflowsProvider`（Dashboard 5 条发布工作流）。UI: `WorkflowsScreen`（搜索 + FilterChip + RefreshIndicator + ListView.builder）、`WorkflowDetailScreen`（CustomScrollView + 元数据卡 + 执行列表 + FAB 运行按钮仅发布态）、`DashboardScreen`（QuickAccessSection + RecentExecutionsSection）、6 个共享 Widget。`workflowDetail` 子路由（GoRoute `:workflowId`）。94 个 Flutter 测试全部通过。
- **Story 7-3a 已完成**: 移动端认证与会话管理。Flutter: `features/auth/` 完整认证链路 — `AuthTokens`/`AuthState`(sealed)/`LoginUser` Freezed 模型；`TokenStorage` 封装 `flutter_secure_storage`；`AuthApi`(独立 Dio 避免循环) 支持 login(含 MFA 分支)/register(含邮件确认)/refresh/logout；`AuthNotifier`(AsyncNotifier) 管理认证状态(login/logout/refreshTokens/forceLogout)；`AuthInterceptor`(QueuedInterceptorsWrapper) 自动附加 Bearer + 4 种 401 type 处理(token-expired→刷新重试, token-revoked/invalid/missing→强制登出)；`apiClientProvider` 注入 AuthInterceptor；GoRouter redirect guard 通过 `AuthRouteNotifier`(ChangeNotifier) 桥接 Riverpod；`LoginScreen` 含 email/password 表单验证 + 错误/MFA/加载态；`AuthTextField` 可复用组件。168 个测试全部通过（含 50 个新增认证测试）
- **Story 2-1a 已完成**: 工作流 CRUD、查询与自动保存 API。Server: `PATCH /workflow-definitions/:id` 自动保存端点现按 AC 收敛为 Creator/Admin/Owner 可写（OCC 乐观并发控制，`version` 字段 WHERE 条件 + 自增）；`DELETE /workflow-definitions/:id` 软删除（委托 archive）；`GET /workflow-definitions/:id` 返回含 nodes/edges/viewport 的完整详情；列表查询支持 `sort=updatedAt|createdAt|name`，并兼容 story 文案中的 `updated_at|created_at` alias，`order=asc|desc`；`UpdateWorkflowDefinitionDto` 使用 Zod `.strict()` + version 必填；`DomainException` / `ProblemDetails` 支持顶层扩展字段透传，`WorkflowVersionConflictException` (409) 会在顶层返回 `currentVersion`；`AllExceptionsFilter` 仍防御性处理 ZodValidationException（修复 Zod v4 `z.record()` 单参数 bug 导致的 500）。本轮 BMAD code-review 复验已通过 `pnpm test`、`pnpm test:e2e` 与 `pnpm build`
- **Studio MCP Tool Library / Import Dialog 已对齐 3-6a AC1/AC2 前端合同**: `agentloom-studio/src/features/mcp/` 现以 shared data layer 统一承载 `/mcp/test` / `/mcp/discover` / `/mcp/import` / `/mcp/configs/:id/test` / `/mcp/configs/:id/rediscover` / `/mcp/configs/:id/reimport` 前端类型与 mutations；`McpImportDialog` 已收口为真正四步流（配置连接 → 测试连接 → 发现/选择工具 → 导入并同页复核回执），import 模式支持 `stdio | sse | streamable_http` 传输选择并保留跨步骤上下文，reimport 模式现先走 saved-config test 再独立 rediscover；`ToolLibraryPage` 的停用确认也已切到 Radix Dialog + 焦点恢复。`features/canvas/api/mcpToolQueries.ts` / `mcpToolKeys.ts` 兼容层继续复用 shared query key，确保工具库与 NodePalette 的 `Imported Tools` 同步刷新
- **Story 7-4a 已完成**: 移动端执行监控与实时状态更新。Flutter: `features/execution/` 完整实现 —— `ExecutionStatus`(6值)/`StepStatus`(8值) 枚举含 color/icon/label/isTerminal；`ExecutionEventEnvelope`/`ExecutionStateSnapshot`/`StepSnapshot`/`SubscribeAck` Freezed 模型；`ExecutionSocketService` 通过 `resolveExecutionSocketUrl()` 去掉 `/api`/`/api/v1` 后连接 Socket.IO `/execution` namespace（JWT auth、`['websocket']` transport、subscribe ACK、7 个 StreamController 事件流）；`ExecutionMonitorNotifier` 使用 `AsyncNotifierProvider.autoDispose.family`，支持 REST execution detail `steps[]` → snapshot 映射、graph metadata 提取、ACK/WS snapshot metadata merge（含 reconnect ACK）、5s polling fallback、re-subscribe with `lastEventId` 与 terminal cleanup；`ExecutionMonitorScreen` + `ExecutionStatusHeader`/`ExecutionAlertBanner`/`StepTimeline`/`StepTimelineItem`/`ConnectionModeIndicator` 5 子组件现已支持 `Disconnected` 模式、failed banner 节点名 + 错误摘要、timeline `nodeName/nodeType` 展示；Dashboard 新增 `recentExecutionsProvider` 聚合最近执行，`WorkflowDetailScreen` FAB 真实调用 `runWorkflow()` 并跳转 `/executions/:executionId`。移动端 `fvm flutter test` 已达 307 passed。
- **Story 7-5 已完成**: `workflow_definitions` 新增 `input_schema` JSONB 列（migration `0027_tidy_marauders.sql`）；Server 新增 canonical `WorkflowInputSchema` Zod DTO（`agentloom-server/src/modules/workflow/dto/workflow-input-schema.dto.ts`）与 `GET /api/v1/workflow-definitions/:workflowId/input-schema`（operator+，未发布返回 409，空值返回 `{ version:1, collectionMode:'form', fields:[] }`）；`WorkflowVersionSnapshot` 现可携带 `inputSchema?`；`RunWorkflowDto` 新增可选 `launchSource`，`ExecutionService.runWorkflow()` 会把它归并到 `workflow_executions.input_params._meta.launchSource`；5 个预置模板 seed 现把 `inputSchema` 存在 `workflow_templates.definition.inputSchema` 并在模板克隆时复制到 `workflow_definitions.input_schema`；为修复新覆盖暴露的权限缺口，`0027` 还补发了 `workflow_executions` / `execution_steps` 的 authenticated GRANT。Flutter: `features/workflows/` 新增 `WorkflowInputSchema`/`InputFieldDefinition`/`InputFieldValidation` Freezed 模型（snake_case JSON mapping）；`WorkflowApi` 扩展 `getInputSchema()`、`runWorkflow()` 新增 `inputParams`+`launchSource` 参数；`WorkflowLaunchNotifier`（`AsyncNotifierProvider.autoDispose.family`）sealed 状态机（Loading/SchemaLoaded/Submitting/Success/Error）+ DioException 409/401/timeout 分类处理；`ParameterInputScreen` 动态表单（ConsumerStatefulWidget + Form）按 `collectionMode` 分流对话模式/空参数确认/表单输入；7 个字段 widget（text_input_field/number_input_field/single_select_field/multi_select_field/input_field_builder/no_params_confirmation/conversation_mode_prompt）；GoRoute `/workflows/:workflowId/launch`；`WorkflowDetailScreen` FAB 改为导航到启动页。`fvm flutter test` 364 passed，`fvm flutter analyze` 0 issues。Server `pnpm test` 1192 passed，`pnpm build` 通过。
- **Story 7-6 已完成**: 移动端推送通知与设备注册。Server: 新增 `device_tokens` 表（无 RLS、无 tenant_id，`user_id` FK to users，UNIQUE(user_id, device_token)，migration `0028`）；`DeviceTokenService` 提供 upsert 注册（`onConflictDoUpdate`）、软删除注销、按 user 查询活跃 token、批量失活；`PushNotificationService`（`firebase-admin` SDK）实现 `OnModuleInit` 按 `FIREBASE_SERVICE_ACCOUNT` 环境变量条件初始化，`sendToUser()` 支持 150 token/batch 分片 + `sendEachForMulticast()` 按 index 检测无效 token（仅 `messaging/registration-token-not-registered`、`messaging/invalid-registration-token`）并自动调用 `deactivateTokens()`；`DeviceTokenController` 提供 `POST /api/v1/devices/register` + `DELETE /api/v1/devices/unregister`（AuthGuard）；`NotificationProcessor` 新增 `push` 通道分支（默认 opt-in：无偏好记录=启用），`NotificationService` 新增 `getPreferenceForChannel(tenantId, userId, type, channel)` 方法；`upsert-preference.dto.ts` channel 枚举扩展为 `['in_app', 'email', 'push']`；`notification.constants.ts` 新增 `NOTIFICATION_CHANNEL_PUSH`。Flutter: `features/notifications/` 新增完整 feature——`PushNotificationPayload` Freezed 模型（`fromFcmData` camelCase 解析）；`DeviceApi`（Dio register/unregister）；`NotificationService` 封装 `firebase_messaging` 初始化/权限/token/`onMessage` 前台 `flutter_local_notifications` 显示/`onMessageOpenedApp` + `getInitialMessage` 后台/终止态点击，以及 `getNotificationAppLaunchDetails()` 本地通知冷启动恢复 → `onNotificationTap` stream；`PushNotificationNotifier`（AsyncNotifier）管理 `initializeAfterAuth()` + `cleanupOnLogout()` + token 刷新去重；推送初始化现由 `AgentLoomApp` 监听认证状态边沿统一触发，`AuthNotifier.logout()`/`forceLogout()` 调用 `cleanupOnLogout()`。Android: `build.gradle.kts` google-services 插件 4.4.2 + `AndroidManifest.xml` POST_NOTIFICATIONS + default channel。iOS: `AppDelegate.swift` FirebaseCore/Messaging import + `registerForRemoteNotifications()`。pubspec: firebase_core ^3.13.0, firebase_messaging ^15.2.5, flutter_local_notifications ^19.2.1。Server `pnpm test` 1217 passed、`pnpm test:e2e` 165 passed、`pnpm build` 通过。Flutter `fvm flutter test` 416 passed，`fvm flutter analyze` 0 issues。
- **Story 8-1 已完成**: L2 字段映射高级拖拽与智能建议（纯前端）。Studio `features/canvas/` 新增：`lib/nestedFieldTree.ts`（`MAX_NESTED_DEPTH=5`，`buildSchemaTree`/`buildNestedFieldTree`/`collectLeafPaths`）、`lib/fieldSuggestionEngine.ts`（Levenshtein 0.4 + token overlap 0.3 + type compat 0.3 三维评分，`generateSuggestions` Top-3 + `getApplicableSuggestions` ≥0.70 阈值，含 `suggestedCoercion`）、`lib/coercionStrategies.ts`（`COERCION_REGISTRY` text↔json 10 种策略，`getAvailableStrategies`/`isCoercible`/`getStrategyLabel`）；`types.ts` 新增 `CoercionStrategy`/`TypeCoercionConfig`/`ConfidenceLevel`/`NestedFieldNode`/`MappingSuggestion`，`FieldMapping` 新增可选 `coercionConfig`；`NestedFieldTree.tsx` 树形字段展示（5 个可选 backward-compat props：`suggestedPaths`/`onFieldDragOver`/`onFieldDrop`/`renderFieldSuffix`/`disableLeafInteraction`）；`CoercionConfigPopover.tsx` Radix Popover 类型转换配置；`MappingSuggestionCard.tsx` 建议卡片；`FieldMappingPanel.tsx` 全面升级（flat list→NestedFieldTree、智能建议+MappingSuggestionCard、CoercionConfigPopover on type-mismatch、Ctrl/Cmd 批量多选拖拽+name matching via `normalizedLevenshteinSimilarity>0.3`、Apply All ≥0.70+skip manual+undo）；`canvasStore.ts` 新增 `batchUpdateFieldMappings`/`saveMappingSnapshot`(MAX=10)/`undoFieldMapping`。Studio `pnpm typecheck` 通过、`pnpm test` 978 passed。
- **Story 8-2 已完成**: 可复用块封装、导入与块库管理。Server: 新增 `reusable_blocks` 表（`org_id` FK + `tenant_id` + RLS，UUIDv7 PK，`definition` JSONB 含 nodes/edges/inputPorts/outputPorts，`metadata` JSONB 含 nodeCount/author/version，`tags` text[] GIN 索引，`version` OCC，migration `0029`）；`ReusableBlockModule` 提供完整 CRUD（`ReusableBlockService` 含 findAll 分页+搜索+分类过滤、findById、create 含定义校验、update OCC、remove 硬删除；`ReusableBlockController` 5 端点 RBAC：写 owner/admin/creator、读 viewer+；定义校验含边引用完整性与端口 dataType canonical 8 值）。Studio: `canvasStore` 新增 `selectedNodeIds: Set<string>` 多选（向后兼容 `selectedNodeId`）+ `toggleNodeSelection`/`selectNodes`/`clearSelection`/`deleteSelectedNodes`；自定义 Portal `CanvasContextMenu`（position:fixed，Delete + Encapsulate as Block ≥2 节点）；`lib/encapsulation.ts` 纯函数 `analyzeEncapsulation()`（边分类 internal/incoming/outgoing、端口推导+去重、质心计算）+ `replaceNodesWithBlock()`（节点替换+边重连）；`BlockCreateDialog` react-hook-form + Zod 表单；`'reusable-block'` 注册到 `NODE_TYPE_REGISTRY`（category control）；`types.ts` 新增 `BlockPort`/`BlockDefinition`/`BlockNodeData`/`BlockCategory`，`AddNodeInput` 扩展 block 字段；`ReusableBlockBody` 折叠/展开视图 + `ReusableBlockPanel` 配置面板 + `NodeConfigPanel` dispatch 集成；`features/block-library/` 独立 feature：`types/index.ts`、`api/` (blockApi/blockKeys/blockQueries + 5 mutation hooks)、`lib/blockExportImport.ts`（schema version `agentloom-block-v1`、max 5MB、导出/下载/校验/解析）+ `BlockImportDialog`；`BlockLibraryPanel` 搜索+分类过滤+网格 + `BlockLibraryItem` 可拖拽卡片 + `NodePalette` "My Blocks" 组。Server `pnpm test` 1229 passed、`pnpm build` 通过。Studio `pnpm typecheck` 通过、`pnpm test` 1011 passed。
- **Story 8-3 代码审查修复已收口**: TriggerModule 现继续沿用 `zod-ip.polyfill.ts` + `trigger-dto.compat.ts` 兼容层，并额外补齐审查缺口：`ExecutionService.runWorkflow()` 支持内部 `triggerType` override 与 `cron-trigger|webhook-trigger` launch source，且当触发器使用 `SYSTEM_TRIGGER_USER_ID` 时会回退到 `workflow.createdBy` 以满足 FK；cron 处理链路现写入 `triggerType='system'` + `_meta.launchSource='cron-trigger'`，webhook 处理链路现写入 `triggerType='webhook'` + `_meta.launchSource='webhook-trigger'`，并把请求 body 透传为 `inputParams`；`workflow_trigger_history.status` / DTO / migration 现新增 `signature_failed`；公开 `POST /api/v1/webhooks/:token` 成功返回 `202 { executionId, status: 'accepted' }`，签名/时间戳/IP/缺 rawBody 验证失败统一返回精确 `401 { error: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' }` 且记录 `signature_failed` 历史，停用 webhook 直接返回 404；`TriggerSchedulerService` 现持久化/清空 `workflow_triggers.next_fire_at`；普通 trigger list/detail/update/toggle 响应不再暴露 webhook secret，仅创建响应保留一次性展示；`api_event` 现已收紧为 preview-only，占位记录仅可查看，不允许创建、编辑或启用；租户事务中的 execution 创建现在会在提交后再 enqueue，并在入队失败时把 execution 标记为 `failed`，避免 webhook/cron 回滚后残留孤儿队列任务。Server 触发器单测与 `test/trigger.e2e-spec.ts` 已同步覆盖这些合同。

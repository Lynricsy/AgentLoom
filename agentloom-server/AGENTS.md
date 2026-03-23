# AGENTLOOM SERVER 知识库

NestJS v11 + Fastify v5 后端。多租户 SaaS，七层全局中间件/守卫链。

## 入口

`main.ts` → `NestFactory.create(AppModule, FastifyAdapter, { rawBody: true })` → multipart(50MB) → RedisIoAdapter → prefix `api/v1` → AllExceptionsFilter + ZodValidationPipe → Swagger `/docs` (Bearer + X-Api-Key auth, `createSwaggerDocument()` + OpenAPI 3.0 正规化) → listen(APP_PORT‖3000)

`acp-stdio.ts` → `NestFactory.createApplicationContext(AcpStdioModule, { logger: false, abortOnError: false })` → 单连接 ACP JSON-RPC stdio loop；stdin 每行消息独立异步处理，stdout 通过 `writeChain` 串行写出单行 JSON 协议帧，因此 prompt 期间仍可消费同连接的 `session/cancel`，同时保持 `stdout` 只输出协议帧，启动错误与致命错误写入 `stderr`。连接态支持 server-initiated `session/request_permission` request / client response 消费；取消会结清当前 pending permission request，并以 conversation-session 级 permission loop 恢复或拒绝工具调用。ACP 现已支持真实 `fs/read_text_file` / `fs/write_text_file`：initialize 对外使用 canonical `fs: { readTextFile, writeTextFile }` 能力声明，并兼容 legacy `read/write` initialize 输入；读取可走既有 `requestClient()` / `cancelClientRequest()` client-proxy transport，也可在 session 绑定 `serverSandbox.executionId` 时走 ACP-local sandbox workspace；写入无论 client-proxy 还是 server sandbox 都会先进入官方 `session/request_permission` 闭环并通过 `toolCall.content + toolCall.permissionRequest.resourcePaths` 展示规范化目标路径。ACP 现已支持真实 `terminal/create` / `terminal/output` / `terminal/wait_for_exit` / `terminal/kill` / `terminal/release`：initialize 仅在 client 同时声明 `terminal.create=true` 与 `terminal.output=true` 时才诚实暴露粗粒度 `terminal: { create: true }` 总开关，terminal lifecycle 绑定到 conversation session，走 server-sandbox-only exec，默认 1MB ring buffer、每 session 最多 5 个并发 terminal、默认 300s timeout kill、denylist 命令拦截与正式审计；`session/cancel` 与 stdio 连接关闭都会 kill + release 当前连接 session 的 terminal。`server_sandbox` 现已落地 `/workspace/` 边界、`realpath` / symlink / traversal 检查、10MB 默认上限、binary default-deny 与正式审计。ACP 现已支持 `session/load`：conversation session 使用 durable `acp_conversation_sessions` source-of-truth（`session_snapshot` + ordered `replay_entries`），handler 会先按顺序通过 `session/update` replay 全部历史，再返回 `session/load` success response，随后新的 `session/prompt` / `session/cancel` / `fs/*` 继续复用同一会话与 permission / cwd / serverSandbox 语义；若 durable session 带有 terminal continuity metadata 但当前进程内 registry 无法重绑，则 `session/load` 显式 fail-closed 为 `Failed to restore ACP terminal continuity`。`package.json` 的 `start:acp:stdio` 通过 `scripts/start-acp-stdio.mjs` 静默构建 `dist/src/acp-stdio.js` 后再把 stdio 交给编译产物；`ACP_TEST_FAKE_RUNTIME=1` 的 stdio E2E 还会启用 host-side fake exec，以在不依赖真实 Docker daemon 的情况下验证 terminal 主链与 stdout hygiene。

## 全局中间件/守卫链 (执行顺序)

```
TenantMiddleware (extract tenantId from JWT no-verify; skip when X-Api-Key present)
  → TenantTransactionInterceptor (AsyncLocalStorage, Drizzle tenant tx)
    → CustomThrottlerGuard (tenant-aware `apiRateLimitPerMinute` / `dailyApiCallLimit` 治理；JWT 与 X-Api-Key 都会解析 tenant；分钟级 API 限流返回 429 + Retry-After + X-RateLimit-*，其它治理/配额阻断返回 409 `ResourceGovernanceDecisionBlockedException`；Redis storage via @nestjs/throttler v6 + @nest-lab/throttler-storage-redis)
      → AuthGuard (JWT priority → X-Api-Key fallback; ModuleRef lazy-loads PlatformApiTokenService)
        → TenantGuard (validate UUID tenantId)
          → RolesGuard (Redis-cached RBAC: owner>admin>creator>operator>viewer)
```

### 双重认证
- AuthGuard 优先检查 Bearer JWT，无 JWT 时回退 X-Api-Key 头
- API Key 认证链路: `extractApiKeyFromHeader()` → `PlatformApiTokenService.validateToken()` (SHA-256 hash lookup + revoked/expired check) → `RbacCacheService.getUserRole()` → `setRequestAuth(request, payload, 'api_key')`
- `req.authMethod: 'jwt' | 'api_key'` 标识当前认证方式
- API Key 认证时 AuthGuard 直接设置 `req.tenantId`，TenantMiddleware 检测到 `x-api-key` 头后跳过 JWT decode
- `PlatformApiTokenService` 通过 `ModuleRef.get({strict:false})` 延迟解析，避免全局 APP_GUARD 的跨模块 DI 问题；API Key 认证成功时会把 `tokenPrefix` 写入 `req.apiKeyPrefix`

### 速率限制
- `CustomThrottlerGuard` (`src/common/guards/custom-throttler.guard.ts`): 先从原始 `x-api-key` / `authorization` 头提取 tracker，返回 `apikey:{prefix}` 或 `jwt:{sub}`，无认证回退 `req.ip`；随后按 tenant-aware `apiRateLimitPerMinute` 动态替换分钟级 limit，并在 API key 路径通过 `PlatformApiTokenService.validateToken()` 懒解析 tenantId / tokenPrefix / userId
- API 请求治理区分两类路径：`apiRateLimitPerMinute` 命中时返回 429 + `Retry-After` / `X-RateLimit-*`；`dailyApiCallLimit` 命中时返回 409 `ResourceGovernanceDecisionBlockedException`，响应体保留 canonical `decision/category/scope/reason/effectiveState/blockedAt/metadata` explain
- `@SkipThrottle({ default: true })` 用于 HealthController (v6 语法: `Record<string, boolean>`)
- ThrottlerModule: `{ ttl: 60_000, limit: 100 }` (100 req/min, ttl 单位为毫秒 — v6 breaking change)；`AppModule.onModuleDestroy()` 会主动关闭 throttler 内联 Redis 连接

## 模块地图

| 模块 | 路径 | 职责 | 关键依赖 |
|------|------|------|----------|
| auth | `modules/auth/` | JWT 注册/登录/刷新/登出/OAuth/MFA/密码修改/会话列表/会话撤销；OAuth 支持 `?platform=mobile` 移动端重定向（`agentloom://auth/callback?access_token=...`） | Supabase |
| org | `modules/organization/` | 组织 CRUD + 邀请 + 角色管理 | RBAC cache |
| resource-governance | `modules/resource-governance/` | 租户资源配额与异常执行治理：`tenant_quotas` / `execution_governance_controls` typed store、治理读写 API、anomalous execution termination contract、治理事件 / 审计 / 通知 explain | EvidenceModule, EventEmitter2 |
| monitoring | `modules/monitoring/` | 组织级 owner/admin 只读监控 dashboard：`GET /organizations/:id/monitoring`，按 `15m|1h|24h` 聚合 `workflow_executions`、`agent_execution_records`、governance state、notifications、audit logs 与当前 `agent-task` queue snapshot；趋势图聚焦 execution trend，queue depth 仅表示当前 snapshot，输出 summary/alerts/hotspots/riskSummary deep link contract | ResourceGovernanceModule, BullMQ, DrizzleDB |
| private-deployment | `modules/private-deployment/` | 组织级私有部署设置 API：`GET/PUT /organizations/:id/private-deployment`，typed SMTP/LLM Proxy/Certificates/License contract、受管 secret ref 脱敏响应、RSA-PSS license 验签与组织级审计写入；仅 owner/admin 可访问 | EvidenceModule, ApiKeyModule, ConfigModule |
| api-key | `modules/api-key/` | API Key CRUD + 轮换 (AES 加密) | ConfigModule |
| workflow-def | `modules/workflow-definition/` | 工作流版本 CRUD + 发布/归档/回滚 + 空白/模板创建 (`POST /workflow-definitions`) + 列表/详情查询 (`GET /workflow-definitions`, `GET /workflow-definitions/:id`) + 导出（`GET /workflow-definitions/:id/export`，返回已清洗的 `agentloom-workflow-v1` envelope，移除 API key/credentials/tenant/org/user 标识等敏感字段） + 自动保存/更新 (`PATCH /workflow-definitions/:id`，Creator/Admin/Owner 可写，OCC version 乐观并发，409 顶层 `currentVersion`) + 软删除 (`DELETE /workflow-definitions/:id` → archive) + 列表排序别名 (`updatedAt/createdAt/name` + `updated_at/created_at`) | TemplateModule |
| llm | `modules/llm/` | LLM 模型/提供商配置 + catalog | ApiKeyModule |
| mcp | `modules/mcp/` | MCP 服务器 测试/已保存配置测试/发现/导入/重导入/停用 | ApiKeyModule |
| acp-gateway | `modules/acp-gateway/` | **Command Handler 模式**，在 HTTP app 和 stdio app 两个 NestJS 应用中注册；**ANTI-PATTERN**: providers[] 手动 re-provision 服务而非 import 父模块；使用 JSON-RPC auth（非 HTTP guards）。ACP stdio 协议适配层：严格 initialize 版本协商、authenticate、连接级 session registry、`session/new` / `session/load` / `session/prompt` request、`session/cancel` fire-and-forget 处理、真实 `fs/read_text_file` / `fs/write_text_file` client-proxy + server-sandbox surface、真实 `terminal/create` / `terminal/output` / `terminal/wait_for_exit` / `terminal/kill` / `terminal/release` server-sandbox surface、canonical `readTextFile` / `writeTextFile` 能力协商（兼容 initialize legacy alias），以及仅在 client 同时启用 `terminal.create` 与 `terminal.output` 时暴露的粗粒度 `terminal: { create: true }` 总开关、写入前 `session/request_permission` bridge、基于 `sandbox_sessions` 的 ACP-local sandbox workspace 解析、`/workspace/` 边界 + `realpath` / symlink / traversal / oversize / binary guardrails、session-bound terminal registry + durable continuity metadata、默认 1MB terminal ring buffer / 每 session 5 并发 / 300s timeout kill / denylist 审计、runtime `plan/message_chunk/tool_call/decision/done` → `session/update` / `stopReason` 映射、`session/load` replay-before-response 历史回放与 terminal continuity fail-closed、官方 `session/request_permission` request/response 语义、conversation-session 级 approve/deny/cancel 工具权限闭环、JSON-RPC 2.0 错误映射、`initialized` no-op、独立 `AcpStdioModule` bootstrap | AppConfigModule, DatabaseModule, LlmModule, TokenBlacklistModule, `AGENT_RUNTIME -> ACP_TEST_RUNTIME_PROVIDER`（默认 `InProcessAgentAdapter`，`ACP_TEST_FAKE_RUNTIME=1` 时切到 `AcpTestRuntime`） |
| sandbox | `modules/sandbox/` | Docker 沙箱生命周期管理 | BullMQ |
| agent | `modules/agent/` | **六边形架构**: ports/AgentRuntime → InProcess\|Sandbox 适配器 | LlmModule, SandboxModule |
| agent-definition | `modules/agent-definition/` | Agent 定义 CRUD + 版本管理 + canvas 保存 + 发布/归档；`agent_definitions`/`agent_versions` 表；runtime config 接口定义 Agent 运行参数（CPU/memory/timeout/lifecycle） | WorkspaceModule |
| agent-conversation | `modules/agent-conversation/` | Agent 对话生命周期管理：创建/列表/消息历史/发送消息 API；`agent_conversations`/`agent_messages` 表 | AgentDefinitionModule |
| agent-execution | `modules/agent-execution/` | Agent 对话执行引擎：`AgentExecutionWorker` 处理对话消息、`AgentConversationGateway`（Socket.IO `/agent-conversation` namespace）实时推送、`WorkspaceIntegrationService` 文件集成、`WorkflowAgentAdapter` 桥接工作流 `agent` 节点执行 | AgentModule, SandboxModule, Socket.IO |
| shared-resources | `modules/shared-resources/` | 通用共享资源注册表：`SharedResourceRegistry` 提供 `SharedResourceProvider<TConfig, TInstance>` 接口（type/create/destroy/share），sandbox 为首个 provider 实现，支持跨 workflow/agent 的资源复用 | SandboxModule |
| workspace | `modules/workspace/` | Workspace 持久化服务：管理 `workspace_snapshots` 表，支持 Agent 对话与工作流执行的文件状态快照 | DatabaseModule |
| knowledge | `modules/knowledge/` | RAG: 解析 → 分块 → Qdrant 向量索引；`VECTOR_STORE` token 以 `useClass: QdrantVectorStoreService` 注入；`parsers/` 含 4 个解析器 + dispatcher | BullMQ, Qdrant |
| execution | `modules/execution/` | DAG 调度 + 状态机 + BullMQ workers；**最高耦合模块**（imports 9 modules, exports 9 services）；含 `EventBridgeService`（monotonic eventId + ring buffer）、`StepStateMachineService`、`DagResolverService`、`CheckpointService`；CQRS-adjacent: `execution/`（write）vs `execution-record/`（analytics read-model） | AgentModule, Socket.IO |
| trigger | `modules/trigger/` | 事件驱动触发系统：工作流 trigger CRUD（cron/webhook/api_event 三种类型）、cron 调度、webhook 验签与触发历史、`POST /api-events` api_event 接入端点与 fan-out、`EventSourceAdapterRegistry` + `GithubWebhookAdapter`（HMAC-SHA256 验签）+ `GenericEventAdapter`（通用透传） | BullMQ, ExecutionModule, crypto HMAC |
| notification | `modules/notification/` | 用户通知列表/偏好 + BullMQ 分发 + `/notification` WebSocket + 设备 token 注册/注销 + FCM 推送 (firebase-admin) | BullMQ, EventEmitter, firebase-admin |
| plugin | `modules/plugin/` | 服务端插件注册与安全管理：`.alp` multipart 上传 + RSA-PSS 签名验证 + MinIO 归档/WASM 上传、使用 `@agentloom/plugin-sdk` 校验 manifest、`plugins` + `plugin_developer_keys` + `plugin_usage_records` + `plugin_earnings` 表 CRUD、`PluginSignatureService` RSA-PSS + SHA-256 签名验证、`PluginSandboxService` 封装 `@extism/extism` WASM 沙箱执行、`PluginExecutionWorker` 从 MinIO 下载 WASM 执行 + fire-and-forget 使用量记录、`PluginUsageService` 使用量 CRUD + 聚合统计、`PluginEarningsService` 收益分成计算与结算记录管理、`EarningsSettlementWorker` 周期性收益结算、`PluginMarketplaceController` 插件上架/列表/详情/更新 CRUD | BullMQ, JSZip, @extism/extism, node:crypto |
| evidence | `modules/evidence/` | **双域合并**: 证据链 + 审计日志系统；注册全局 `APP_INTERCEPTOR`（`AuditLogInterceptor`）+ `@CaptureAuditLog(config)` 装饰器 opt-in capture；含 `EvidenceExportAccessGuard`；管理 3 个 BullMQ 队列（`audit-log-retention` + 2 个 evidence 内部队列）。证据记录 CRUD + 自动 evidence 监听 + 批量缓冲 + SHA-256 完整性校验 + 溯源链构建 (递归 CTE) + 来源可用性检测 + chunk content 嵌入 + Redis 缓存 + node_error 自动证据 (步骤失败监听) + 审计日志统一写入/查询/资源序列回放 + `audit-log-retention` 归档调度/worker。`evidence.service.ts`（1981L）为最大非测试生产文件，承担 4 项职责（重构候选） | EventEmitter, RedisCacheService, BullMQ |
| template | `modules/template/` | 工作流模板浏览 (public, 无认证，AppModule 中显式从 TenantMiddleware 排除) | — |
| skill | `modules/skill/` | `SkillModule`：Skill CRUD REST API（`/skills`）、`SkillStorageService`（SKILL.md 上传/下载/MinIO 存储 + YAML frontmatter 解析）、`SkillResolverService`（按 tenant 查询 enabled skills 并生成 `<available_skills>` XML 片段，在 agent 对话与 workflow 执行启动时注入系统提示）。`skills` 表含 `tenantId/slug/name/description/content/frontmatter/isBuiltin/status/fileCount/totalSizeBytes/occVersion`。5 个内置 Skill 由 `seedSkills()` 以 sentinel UUID 标记、slug-based onConflictDoUpdate 幂等写入。`isBuiltin=true` 不可删除，RBAC 读 viewer+，写 creator+ | MinioModule, DatabaseModule |
| smart-routing | `modules/smart-routing/` | 智能模型路由：6 种策略纯函数 (TOKEN_OPTIMIZED/COST_OPTIMIZED/QUALITY_FIRST/LATENCY_FIRST/HISTORICAL_BEST/FALLBACK_CHAIN)，路由决策持久化 (`routing_decisions` 表)，`GET /routing-decisions` 现通过 `execution_steps.execution_id` 做 execution 级查询，并支持近 30 天历史指标聚合（按 routing decision 序列 + downstream agent step 真正终态统计） | LlmModule |
| marketplace | `modules/marketplace/` | 工作流 Marketplace：上架/下架/复审、我的上架列表、public browse (`/marketplace/browse`) 含 `listingType` 过滤（workflow/plugin）、详情/评论、一键安装复用到当前租户、用户评分聚合 (`use_count/avg_rating/review_count`) | WorkflowDefinitionModule, PluginModule, users, workflowVersions |
| share | `modules/share/` | 工作流分享链接管理：租户内创建/分页/撤销分享，公开短链 `/s/:token` 只读访问，view/copy 计数原子递增 | ConfigModule, workflowVersions |
| platform-api-token | `modules/platform-api-token/` | Platform API Token CRUD：生成 (al_ 前缀 + SHA-256)、列表 (分页+状态过滤)、撤销、验证；每租户 20 token 上限 | RbacCacheService |
| execution-record | `modules/execution-record/` | Agent 执行遥测数据自动记录：`@OnEvent` 监听步骤完成/失败写入 `step_telemetry`（`telemetry_data`，toolCalls/errors/selfRepairs/ioSnapshots/llmInteractions），监听执行完成/失败聚合 `execution_summary`（`summary_data`）；写入时显式持久化 `tenant_id`；`GET /execution-records` 在租户事务内先校验 `workflow_executions` 是否存在，不存在/不可访问抛 `ExecutionNotFoundException` 404，存在但无记录返回空数组；`sanitizeTelemetryData` 对对象/数组做结构化 `[TRUNCATED]` 截断并保留 token 计数字段 | EventEmitter, DrizzleDB |
| optimization-suggestion | `modules/optimization-suggestion/` | 基于 `agent_execution_records` 的规则分析建议闭环：四类 analyzer、使用 `upsertJobScheduler()` 注册的 `optimization-analysis` 周期任务、建议 list/apply/dismiss/stats API、带 workflow OCC + pending status guard 的工作流节点配置手术式更新 | ExecutionRecordModule, BullMQ |
| health | `modules/health/` | 健康检查 (public) | — |
| agent-memory | `modules/agent-memory/` | 图拓扑 Agent 记忆系统：`MemoryNodeService` / `MemoryEdgeService`（循环检测）/ `MemoryVersionService`（create/patch/append + 版本回滚）/ `PathResolverService`（URI 域寻址 `domain://path/segments`）/ `GlossaryService`（Aho-Corasick 词汇表自动标注）/ `BootProtocolService`（`system://boot\|index\|glossary` 启动协议）/ `MemorySearchService`（纯 PostgreSQL FTS，无 Qdrant）/ `MemoryFusionService`（多实例融合）/ `MemoryToolsService`（7 个 Agent 工具）；25 个 REST 端点（`/memory-instances`）；Socket.IO `/memory` namespace；`MemoryResourceProvider` 注册于 `SharedResourceRegistry`；`memory_sessions` 双 FK 对齐 `sandbox_sessions` 设计 | SharedResourcesModule, EvidenceModule |

### ACP terminal 补充事实

- `AcpTerminalProxyService` 在 spawn 前会同时做命令 basename 归一化 denylist 校验、危险 shell/pattern 拒绝、`cwd` `/workspace` 边界校验，以及赋值式 flag 路径参数（如 `--directory=../../..`）的 fail-closed 检查；拒绝路径统一写 `acp.terminal.server_sandbox.rejected` 正式审计。
- `terminal/output` 兑现 per-request `outputByteLimit` bounded retrieval；对 `exited` / `killed` terminal 会返回稳定 `terminal_output_unavailable` JSON-RPC 错误，而不是继续暴露残留 buffer。
- `terminal/wait_for_exit` 同时支持 request-local `timeoutMs`（返回 `terminal_wait_timeout`，不主动 kill 进程）与 server lifetime timeout（返回 `terminal_timeout`）；manual `terminal/kill` 与 `session/cancel` / disconnect cleanup 触发的 kill 都会写 `acp.terminal.server_sandbox.killed` 审计。

## 执行流 (核心业务)

### Plugin 模块补充
- `PluginController` 的实际注册路由为 `POST /api/v1/plugins`（类级 `@Controller('plugins')` + 方法级 `@Post()`），不要把 story 文本中的 `/plugins/register` 当成真实接口。
- `PluginService.parseManifest()` 以 `@agentloom/plugin-sdk` 的 `validateManifest()` 与 `PluginManifestSchema` 为唯一规则源；若归档仅提供 legacy `pluginId`，service 会先 canonicalize 到 `id` 再持久化 canonical manifest。
- `PluginValidationException` 接受单条或多条校验错误，并按 `field: message` 形式映射到 RFC7807 `ProblemDetails.errors[]`。
- `PluginSandboxService` 使用 `@extism/extism` 在独立 worker 中执行 WASM（`runInWorker: true`，必须开启以支持 `timeoutMs` / `allowedHosts`）。平台硬限制保持 `timeoutMs=30000`、`maxMemoryPages=4096`、`allowedPaths={}`、`useWasi=false`；`buildSandboxConfig()` 仅在 manifest 同时声明 `permissions` 包含 `network:outbound` 且 `sandbox.allowedHosts` 为字符串数组时开放 host 白名单，文件系统仍保持关闭；错误按超时 / 权限拒绝 / 资源耗尽 / 通用沙箱错误分类到插件域异常。
- `PluginSignatureService` 复用 `@agentloom/plugin-sdk` 的 canonical archive helper 进行验签：先重建剥离 `signature` / `contentHash` / `developerKeyFingerprint` 的 canonical unsigned archive payload，再计算 SHA-256 / RSA-PSS 验证。`verifyArchiveSignature()` 返回 `{valid, contentHash}`；`validatePublicKey()` 验证 RSA ≥ 2048 位且拒绝私钥；`computeKeyFingerprint()` 计算 SPKI DER 的 SHA-256 指纹。
- `PluginDeveloperKeyService` 管理开发者 RSA 公钥：注册时验证 + 计算指纹 + 查重；支持按 fingerprint 查找 active 密钥、按 orgId 分页列表、撤销（设置 revokedAt）。
- `PluginDeveloperKeyController` 挂载于 `/plugins/developer-keys`，提供 POST（注册）、GET（列表）、GET :id（详情）、DELETE :id（撤销），RBAC 为 creator+。
- `PluginController.register()` 流程：解析 .alp → 强制要求 manifest 同时包含 `signature` / `contentHash` / `developerKeyFingerprint` → 按 fingerprint 查找活跃开发者公钥 → canonical payload 验签并比对 `contentHash` → 通过后才上传归档到 MinIO / 提取 WASM / 调用 `PluginService.register()` 写入 signature/contentHash/wasmBundleUrl。缺失 metadata、找不到 active key、验签失败或 hash 不一致都会在存储/入库前 fail-closed。
- `PluginExecutionWorker` 流程：`findActiveByPluginId()` → 检查 `wasmBundleUrl` → 从 MinIO 下载 WASM → `buildSandboxConfig()` → runtime config 仅允许进一步收紧 `timeoutMs` / `maxMemoryPages` / `allowedHosts`，不可放宽 → `resolveFunctionName()` 取 `config.functionName`，默认回落到 `'execute'` → `PluginSandboxService.execute()` → `normalizeOutputs()`。

```
HTTP POST /executions
  → ExecutionController
    → ExecutionService.runWorkflow()
      → enqueue execution-queue (BullMQ)
        → ExecutionWorker
          → initializeSteps()
            → NodeScheduler.startExecution()
              → DAG 解析 → 并行执行就绪节点
                ├→ AgentTaskWorker (agent-task-queue)
                │   → AgentAdapterFactory → InProcess|Sandbox
                └→ PluginExecutionWorker (plugin-execution)
                    → MinIO WASM 下载 → 沙箱执行

实时推送管线 (所有广播统一走此路径):
  StepStateMachineService ─┐
  ExecutionService ────────┤── EventBridgeService (monotonic eventId 信封)
  AgentTaskWorker ─────────┘        │
                            ┌───────┴──────────┐
                            │  output_chunk     │  其他事件
                            ▼                   ▼
                     ThrottleService        直接 broadcastTypedEvent()
                     (50ms merge window)         │
                     (100 events/s bucket)       │
                             │                   │
                             └───────┬───────────┘
                                     ▼
                           ExecutionGateway.broadcastTypedEvent()
                                     │
                             tryConsume(token bucket)
                             ├── 通过 → Socket.IO emit
                             └── 限流 → enqueueEvent() → scheduleDrain()
                                         (500 cap, 100ms interval)
```

## 断点恢复与检查点

- `CheckpointService` (`checkpoint.service.ts`) 在节点完成后保存 dagState 快照 (`saveCheckpoint`)，支持恢复失败执行 (`resumeExecution`)
- 检查点数据存储在 `execution_steps.checkpoint_data` (JSONB): `{ output, completedAt, dagState: { completedNodes[], pendingNodes[] }, attempts[] }`
- `execution_steps.attempt_count` (integer, default 0): 在 AgentTaskWorker 重试/最终失败时更新为 `job.attemptsMade+1`，恢复时重置为 0
- 恢复 API: `POST /executions/:id/resume` (202 Accepted, Editor+ 角色)，可选 `{ fromNodeId }` 指定恢复起点（BFS 重置目标+下游）；仅 `failed` 状态可恢复，`paused` 返回 409
- 恢复流程: Controller → `executionQueue.add('resume-execution', ...)` → ExecutionWorker 分发 → `nodeScheduler.resumeScheduling()`，确保通过 BullMQ 统一 job 生命周期
- `STEP_TRANSITIONS` 已新增 `failed→pending`、`cancelled→pending`，`NodeSchedulerService.resumeScheduling()` 会跳过 `completed` 节点并继续调度 `pending` 节点
- Agent 重试追踪已写入 `checkpointData.attempts[]`，记录每次重试的 `{ attempt, error, timestamp }`

## 人工介入系统

- **事件**: `EventBridgeService` 新增 `emitInterventionRequired()` + `emitInterventionResolved()`，走统一信封 + broadcast 管线
- **触发**: `AgentTaskWorker` 处理 `intervention_required` stopReason → `updateStepStatus('waiting_intervention')` → 写入 `checkpointData.interventionRequestedAt/interventionNodeName/decision/partialContent` → `emitInterventionRequired()` → `enqueueInterventionTimeout()`
- **解决**: `NodeSchedulerService.resolveIntervention()` 现在接收 `userId`，先通过 `StepStateMachineService.updateStepStatus(tenantId, stepId, 'running', ...)` 原子抢占 `waiting_intervention -> running` 并写入 `checkpointData.intervention { requested_at, resolved_at, action, instruction, resolved_by_user_id, timeout? }`，再 `updateExecutionStatus()`、`emitInterventionResolved()`、`removeInterventionTimeout()` 并入队后续 `agent-task`
- **超时**: 默认仍可回退到 24h，但 `NodeSchedulerService.enqueueInterventionTimeout()` 现会先解析 intervention policy 的 `timeoutSeconds`；普通任务使用 `intervention-timeout:{stepId}`，escalation 任务使用 `intervention-timeout:{stepId}:escalated:{count}` 唯一 jobId，避免 BullMQ 因重复 `jobId` 吞掉新的 delayed job。`removeInterventionTimeout()` 会同时清理 base job 与 1..`MAX_ESCALATION_ATTEMPTS` 的全部 escalation 变体；到期后 `AgentTaskWorker.handleInterventionTimeout()` 检查 step 是否仍为 `waiting_intervention`，再按策略执行 approve/reject/escalate 或以 `resolved_by_user_id = 'system_timeout'` 自动处理。
- **API**: `POST /executions/:executionId/steps/:stepId/intervene` (202 Accepted)，Body: `{ action: 'approve'|'modify'|'reject', feedback?, modifiedContent? }`
- **事件载荷**: `InterventionRequiredPayload { stepId, nodeId, nodeName, decision?, partialContent?, requestedAt }`、`InterventionResolvedPayload { stepId, nodeId, action, feedback?, modifiedContent?, resolvedBy, resolvedAt, timeout? }`
- **结构化内容**: `decision.suggestedContent`、`modifiedContent` 和审计 `instruction` 均允许 `unknown`，worker 会保留结构化内容并在 snapshot/output 恢复时继续透传
- **快照恢复**: `StateReplayService.getExecutionSnapshot()` 现包含 `step.checkpointData`，所以订阅 ACK / 重连快照即可恢复 `waiting_intervention` 面板，无需只依赖 event replay
- **Evidence 自动创建**: `EventBridgeService.emitStepAgentEvent()`、`emitToolCallStatus()`、`emitInterventionResolved()` 现都会同步转发到 `EventEmitter2`，`EvidenceService` 监听这些内部事件以及 `knowledge.rag.retrieved` 自动创建 evidence records。`RagService.search()` 支持可选 `evidenceContext { executionId, stepId, parentEvidenceId? }`，当提供时会 emit `knowledge.rag.retrieved`。`EvidenceService.verifyContentHash()` 基于 source payload 重算 SHA-256 并返回 `{ evidenceId, valid, integrityWarning, currentHash }`。
- **溯源链构建**: `EvidenceService.buildChain(tenantId, executionId, nodeId?)` 使用递归 CTE 沿 `parent_evidence_id` 向上追溯（`CHAIN_MAX_DEPTH=50` + `path` 防循环）；未传 `nodeId` 时从 execution 的叶子 evidence 锚定全量 ancestry，传入 `nodeId` 时通过 plain-text `execution_steps.node_id` 过滤特定 workflow node 的 ancestry，最终 flat→tree 为 ancestor-first roots。对 `rag_retrieval` 节点批量查询 `document_chunks`：缺失 chunk → `sourceUnavailable`，live `document_chunks.content` 的 SHA-256 与捕获时 `retrievedContent` 快照哈希不一致 → `sourceModified`，并保留 `packet.semanticLocation.context` 为 `originalSnapshot`；每节点继续执行 packet SHA-256 校验。响应为 `{ roots, chainCompleteness, totalNodes, integrityStatus, cachedAt? }`，其中 `integrityStatus` 含 `nodesWithPhysicalLocation`、`completenessLabel`、`integrityIssues`。Redis 缓存 key `evidence:chain:{executionId}:{nodeId||'all'}`，TTL 300s，evidence 写入时按 executionId pattern 自动失效；`GET /executions/:id/evidence/chain?nodeId=xxx` 响应含 `X-Cache-Hit` header。`verifyChainIntegrity()` 通过 `buildChain(..., { bypassCache: true })` 执行实时校验，不复用缓存。

- **Evidence 查询过滤**: `QueryEvidenceSchema` 新增 `sourceType` (EvidenceSourceType enum)、`stepId` (string, min 1) 和 `nodeId` (string, min 1) 可选过滤参数。`findByExecution()` 支持按 `sourceType` 直接 `eq()` 过滤、按 `stepId` 过滤单步证据、按 `nodeId` 先查 `execution_steps` 获取匹配的 step IDs 再 `inArray()` 过滤。实现中 `sourceType` 查询类型已收紧为 `EvidenceSourceType`，避免与 Drizzle enum 列类型漂移。Controller 直接透传 query 参数。

- **Storage 与 Evidence UI 基础设施**: `StorageService.getPresignedUrl(key, expirySeconds=3600)` 现会先 `statObject()` 校验对象是否存在，并将空 key / 缺失对象 / MinIO 不可用分别映射为 `StorageKeyInvalidException` / `StorageObjectNotFoundException` / `StorageUnavailableException`。`DocumentService.getDocumentContentUrl(kbId, docId, expirySeconds?)` 返回 `{url, fileName, mimeType, expiresIn}`，并把空 `storageKey` / 删除对象 / 存储不可用映射为 `DocumentContentNotFoundException` / `DocumentContentUnavailableException`。`KnowledgeBaseController GET :id/documents/:documentId/content`（VIEWER+）返回预签名 URL。`QueryEvidenceSchema.includeChunkContent` 布尔参数继续驱动 `EvidenceService.enrichWithChunkContent()` 批量查询 `documentChunks.content` 并注入到 `rag_retrieval` 记录的 `packet.physicalLocation.chunkContent`。同时 `PhysicalLocationSchema` 与 RAG packet summary metadata 现已包含 `knowledgeBaseId`，供 Studio 直接打开文档内容端点。

- **节点错误诊断与端口类型校验**: `isPortTypeCompatible(source, target)` 判断端口类型兼容性（同类型或目标为 `json` 即兼容）。`NodeTypeMismatchException` 含 `TypeMismatchDetail { sourcePortId, targetPortId, sourceType, targetType, sourceNodeId, targetNodeId, edgeId? }`。`NodeSchedulerService.checkEdgePortTypeCompatibility()` 在运行时校验边的端口类型。`scheduleNode()` 通过 try-catch 捕获 `resolveNodeInput()` 抛出的 `NodeTypeMismatchException`，写入结构化 `errorMessage`（含 `type/title/detail/typeMismatch/nodeId`）后调用 `onNodeFailed()`。`WorkflowVersionService.publish()` 返回 `PublishResult { data, warnings }`，其中 `validateEdgeTypeCompatibility()` 生成不兼容边的 `PublishWarning[]`。`EventBridgeService.emitStepStatusChanged()` 当步骤完成或失败时额外通过 NestJS EventEmitter 发射事件，`EvidenceService.handleStepFailed()` 监听该事件创建 `node_error` 类型证据（含 errorMessage/errorType/errorTitle/typeMismatch/stack），`ExecutionRecordService` 监听该事件提取 step_telemetry 遥测数据。

- DLQ 管理 API: `GET /api/v1/dlq` (分页查询当前租户死信队列)、`POST /api/v1/dlq/:jobId/retry` (重试)、`POST /api/v1/dlq/:jobId/discard` (丢弃)，基于 BullMQ 原生 `getFailed()`/`job.retry()`/`job.remove()`，并校验 `job.data.tenantId` 防止跨租户访问

## BullMQ 队列

| 队列 | 重试 | 用途 |
|------|------|------|
| execution-queue | 1次 | 工作流执行入口 |
| agent-task-queue | 首次执行 + 3次重试 exp (2s base) | 单节点 Agent 任务 |
| agent-conversation-queue | 3次重试 exp (2s base) | Agent 对话消息执行 |
| plugin-execution | 3次 exp (2s base) | `plugin` 节点 WASM 沙箱执行 worker |
| optimization-analysis | 1次 | Agent 配置优化建议周期分析 |
| audit-log-retention | 1次 | 审计日志热层归档与 hot/archive 回查基线维护 |
| trigger-scheduler | 3次 exp (2s base) | cron trigger repeatable jobs + webhook/cron 历史记录联动 |
| notification | 3次 exp (1s base) | 通知分发与 WebSocket 推送 |
| earnings-settlement | 1次 | 插件收益周期结算 |
| sandbox-lifecycle-queue | 3次 exp | Docker 容器生命周期 |
| document-processing-queue | — | 文档解析 |
| document-indexing-queue | — | Qdrant 向量索引 |

## Trigger 系统

- 数据表：`workflow_triggers` + `workflow_trigger_history`，schema 位于 `src/database/schema/workflow-triggers.schema.ts`
- 触发类型：`cron | webhook | api_event`；三种类型均支持完整 CRUD 与启停操作
- `api_event` 接入：`POST /api/v1/api-events` 为公开接入端点，由 `ApiEventIngestionController` 接收外部事件，`ApiEventIngestionService` 通过 `EventSourceAdapterRegistry` 分发到注册的适配器：`GithubWebhookAdapter`（HMAC-SHA256 验签，`x-hub-signature-256` 头）、`GenericEventAdapter`（通用透传）。匹配 enabled `api_event` trigger 后 fan-out 触发工作流执行
- REST：`/workflow-definitions/:workflowId/triggers` 提供 create/list/detail/update/delete/toggle/history；RBAC 为读 viewer+、写 creator+
- Public webhook：`POST /api/v1/webhooks/:token`，`AppModule.configure()` 已通过 `TenantMiddleware.exclude()` 放行 `webhooks` 与 `webhooks/{*splat}`
- Public share：`GET /api/v1/s/:token`，`SharePublicController` 类级 `@Public()`，`AppModule.configure()` 仅对 `s` 与 `s/{*splat}` 排除 `TenantMiddleware`；管理端 `/api/v1/workflow-shares` 仍保留租户上下文与 RBAC。`ShareService` 通过 `workflow_shares -> workflow_definitions -> workflow_versions.snapshot` 返回公开定义，并使用 `sql\`view_count + 1\`` / `sql\`copy_count + 1\`` 原子更新访问与复制计数
- 验签：`WebhookService.verifySignature()` 使用 `x-agentloom-signature` + `x-agentloom-timestamp`，按 `${timestamp}.${rawBody}` 做 HMAC-SHA256，支持 IP 白名单；验签失败/缺 rawBody/时间戳问题/IP 白名单失败统一在 `WebhookController` 中映射为精确 `401 { error: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' }`
- 历史：`workflow_trigger_history.status` 现包含 `success | failed | skipped | signature_failed`；公开 webhook 验签失败会写入 `signature_failed`，成功/失败继续保留 request body / clientIp payload
- cron：`TriggerSchedulerService` 在 module init 时同步全部 enabled cron trigger 到 `trigger-scheduler` 队列；register/remove 会持久化/清空 `workflow_triggers.next_fire_at`；`TriggerSchedulerProcessor` 通过 `runInTenantTransaction()` 触发执行、写历史并回写 `lastTriggeredAt/triggerCount/nextFireAt`
- 执行：`ExecutionService.runWorkflow()` 现支持内部 `triggerType` override 与 `cron-trigger|webhook-trigger` launch source；cron 执行写入 `triggerType='system'` + `_meta.launchSource='cron-trigger'`，webhook 执行写入 `triggerType='webhook'` + `_meta.launchSource='webhook-trigger'`，并把 webhook request body 透传为 `inputParams`。当调用方使用 `SYSTEM_TRIGGER_USER_ID` 时，`createdBy` 会回退到 `workflow.createdBy` 以满足外键约束；若在租户事务中调用，execution job 会延迟到提交后再 enqueue，且入队失败会把 execution 标记为 `failed`，避免回滚后残留孤儿任务
- Webhook 停用语义：停用的 webhook token 现在直接返回 404；普通 trigger CRUD/list/detail/update/toggle 响应不再暴露 webhook secret，仅创建响应保留一次性明文展示
- DTO 兼容：由于预置 `trigger.dto.ts` 使用了当前 zod 运行时不存在的 `z.string().ip()`，模块现通过 `src/modules/trigger/dto/zod-ip.polyfill.ts` + `src/modules/trigger/trigger-dto.compat.ts` + `src/types/zod-ip-compat.d.ts` 做运行时/类型层兼容，避免直接修改 T1-T3 预置文件

## 数据库 (Drizzle + PostgreSQL)

Schema 在 `src/database/schema/`，启用 RLS (`rls-policies.ts`，RLS 策略以 TypeScript 函数定义于 Drizzle schema 层)。租户上下文链: `common/interceptors/tenant-transaction.context.ts`（AsyncLocalStorage）→ `common/providers/tenant-aware-db.provider.ts`（scoped Drizzle 注入）。`workflow_templates` 表为系统级公共资源（无 RLS、无 tenant_id）。`device_tokens` 表为用户级资源（无 RLS、无 tenant_id，直接通过 user_id 关联）。`platform_api_tokens` 表为用户级 API Token 存储（无 RLS、通过 userId FK 关联，tokenHash UNIQUE + 租户-用户-状态复合索引 + prefix 索引）。`plugins` 表保存租户插件清单：`org_id + plugin_id` 唯一，状态枚举为 `registered|active|disabled|error`，并持久化 `manifest`、`node_definitions`、`permissions`、`signature`（text）、`content_hash`（varchar 64）、`wasm_bundle_url`（varchar 512）、`occ_version` 与 tenant-scoped RLS。`plugin_developer_keys` 表管理开发者 RSA 公钥：`org_id + key_fingerprint` 唯一，状态枚举 `active|revoked`，含 `public_key`（text）、`label`、`revoked_at` 与 tenant-scoped RLS。`agent_execution_records` 表存储 Agent 执行遥测记录：`tenant_id` 直连租户、`execution_id` FK → `workflow_executions` (cascade)、`step_id` FK → `execution_steps` (set null)、`record_type` 枚举 `step_telemetry|execution_summary`、`telemetry_data` JSONB（StepTelemetryData，��� step telemetry）、`summary_data` JSONB（ExecutionSummaryData，仅 execution summary），并通过 payload check 约束保证两类记录互斥；该表使用 `createDirectTenantPolicies` 做直接租户 RLS，并额外建立 `tenant_id` / `(tenant_id, execution_id)` 索引。`audit_logs` 与 `audit_log_archives` 为 evidence 域 append-only 审计双表，字段同构（`tenant_id/actor_id/actor_type/event_type/resource_type/resource_id/execution_id/summary/before/after/metadata/created_at`），只对 `authenticated` 授予 `SELECT/INSERT`，并通过 append-only tenant policy 保持 hot/archive 都不可 update/delete；两表均建立 `(tenant_id, created_at)`、`(tenant_id, event_type, created_at)`、`(tenant_id, resource_type, resource_id, created_at)`、`(tenant_id, execution_id, created_at)` 索引。`optimization_suggestions` 表保存按租户隔离的配置建议，字段包括 `workflow_definition_id/node_id/suggestion_type/status/confidence/current_value/suggested_value/rationale/impact_estimate/analysis_metadata/analysis_period_*` 与 apply/dismiss 审计列；该表启用 direct tenant RLS，并额外通过 migration 为 `authenticated` 授予 `SELECT/INSERT/UPDATE/DELETE`。Marketplace 现同时包含 `marketplace_listings`（上架记录 + `category/use_count/avg_rating/review_count` 聚合字段）与 `marketplace_reviews`（用户评分/评论，`listing_id + user_id` 唯一约束，评分 1..5 check）。
关键：`workflowDefinitions` 存储 ReactFlow JSON (JSONB)，含 `metadata` jsonb 列（模板克隆信息等）；`documentChunks` 含 vector 列。
- `acp_conversation_sessions` 是 ACP conversation durable recovery source-of-truth，字段为 `session_id` 主键、`tenant_id uuid`、`agent_id`、`session_snapshot jsonb`、`replay_entries jsonb`、`created_at/updated_at`，使用 direct tenant RLS、authenticated `SELECT/INSERT/UPDATE/DELETE` grant 与 tenant/agent 索引；`session/load` 与 fake runtime E2E 都依赖它完成跨连接历史恢复。
补充：`workflow_definitions` 现新增 `input_schema` JSONB；`WorkflowVersionController GET /workflow-definitions/:workflowId/input-schema` 返回 canonical `WorkflowInputSchema`（operator+，未发布 409，空值默认 `{ version:1, collectionMode:'form', fields:[] }`）；`RunWorkflowDto.launchSource` 会被 `ExecutionService` 归并到 `workflow_executions.input_params._meta.launchSource`；模板 seeds 通过 `workflow_templates.definition.inputSchema` 承载示例 schema，并在克隆时复制到 `workflow_definitions.input_schema`。migration `0027_tidy_marauders.sql` 同时补齐了 `workflow_executions` / `execution_steps` 对 authenticated 的 GRANT，以修复 execution RLS 测试路径中的权限缺口。
- **资源治理表**: `tenant_quotas` 提供 7 个 canonical quota 字段（`maxConcurrentExecutions`、`dailyExecutionLimit`、`dailyApiCallLimit`、`storageQuotaMb`、`apiRateLimitPerMinute`、`maxSandboxCpuPercent`、`maxSandboxMemoryMb`），使用 direct tenant RLS 与 `organization_id` 唯一索引；`execution_governance_controls` 以 `scope + targetId + status + reason` 保存 tenant/workflow 治理暂停状态，使用 `(organization_id, scope, target_id)` 唯一索引与 direct tenant RLS。
- **私有部署表**: `private_deployment_settings` 保存组织级 SMTP、LLM Proxy、证书与 License 加密 envelope，依赖 `private_cloud_auth_method` / `private_deployment_certificate_source` enum，使用 `organization_id` 唯一索引、`tenant_id` 索引、direct tenant RLS 与 authenticated `SELECT/INSERT/UPDATE/DELETE` grant；license 公钥不入库，运行时通过 `APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY` 做 RSA-PSS 验签。
- **治理通知枚举扩展**: `notifications.notification_type_enum` 现包含 `resource_governance_execution_blocked`、`resource_governance_quota_updated`、`resource_governance_controls_updated`、`resource_governance_execution_terminated`，供 `/notification` socket、通知列表与治理审计链路复用。
- **Agent 表**: `agent_definitions` 存储 Agent 定义（名称/描述/配置/状态/canvas JSON），`agent_versions` 管理版本历史（snapshot/发布状态）。`agent_conversations` 记录对话会话（关联 agent_definition_id），`agent_messages` 存储对话消息序列（role/content/metadata）。四表均使用 tenant-scoped RLS。
- **Workspace 表**: `workspace_snapshots` 存储文件状态快照，支持 Agent 对话与工作流执行场景。
- **sandbox_sessions 双 FK**: `sandbox_sessions` 表使用 `execution_id` 与 `agent_conversation_id` 双 FK + CHECK 约束（至少一个非空），实现沙箱会话在工作流执行与 Agent 对话间的复用。
- **Agent Memory 表**: 七张表均使用 `createDirectTenantPolicies` 做 direct-tenant RLS：`agent_memory_instances`（记忆实例，含 `name/description/config/system_prompt_override/valid_domains/core_memory_uris/status/occ_version`，状态枚举 `active|archived|deleted`）；`memory_nodes`（图节点，含 `instance_id/content_type/metadata/disclosure_level`）；`memory_edges`（图边，含 `instance_id/parent_node_id/child_node_id/name/priority/disclosure`，创建时循环检测）；`memory_paths`（URI 路径绑定，含 `instance_id/domain/path_string/node_id`）；`memory_node_versions`（节点版本历史，含 `node_id/content/mode/review_status/deprecated_at`，支持 `create|patch|append` 三种写入模式与 approved/rejected/pending review 状态）；`memory_sessions`（会话，双 FK `execution_id` OR `agent_conversation_id` + CHECK 至少一个非空，对齐 `sandbox_sessions` 设计，含 `memory_instance_id/role/status/config`）；`memory_glossary_keywords`（词汇表关键词，供 `GlossaryService` Aho-Corasick 自动标注使用）。
- **WorkflowInputSchema 规范**: canonical `WorkflowInputSchema` 现同时承载 form baseline 的 `visibility: { fieldId, equals }` 与 `conversationPlan { systemPrompt, maxTurns }` / 字段级 `collectionHint?: string`；`GET/PATCH /workflow-definitions/:id` 继续承担 draft hydrate/persist，`inputSchema.version` 只在逻辑 schema diff 时递增，仍独立于 workflow OCC `version`。`POST /workflow-definitions/:id/run` 接受 `schemaVersion` / `schema_version`，`ExecutionService` 会基于 published schema 做 required/default/visibility/type/unknown-field 校验，并把规范化结果写入 `_meta.launchConfig { workflowId, schemaVersion, collectionMode, resolvedInputs, unresolvedFieldIds, launchSource }`；客户端可以做 staged collection，但 server 仍是 launch normalization 的唯一权威，不信任客户端自报的 unresolved/option semantics。`WorkflowLaunchSchemaVersionMismatchException` 返回 409，`WorkflowLaunchInputValidationException` 返回 422。
迁移命令: `pnpm db:generate` → `pnpm db:migrate`。种子数据: `pnpm db:seed` (5 个预置模板 + 5 个内置 Skill，upsert on slug)。
种子脚本入口: `drizzle/seed/templates.ts`，种子数据: `src/database/seeds/template-seeds.ts` + `src/database/seeds/skill-seeds.ts`（含 5 个内置 SKILL.md 文件于 `src/database/seeds/skills/`）。
模板 `definition` 现与 `workflowDefinitions.definition` 保持同构，`nodes/edges/viewport` 均为必填；公共模板路由在 `AppModule.configure()` 里通过 `TenantMiddleware.exclude({ path: 'templates', method: RequestMethod.ALL }, { path: 'templates/{*splat}', method: RequestMethod.ALL })` 绕过租户中间件。

## Agent Memory

- **图拓扑模型**: 记忆以 `Node → Edge → Path` 三层图结构组织。`MemoryEdgeService.createEdge()` 在建边前通过 BFS 检测循环，循环返回 409。`PathResolverService` 负责 URI 域寻址（格式 `domain://path/segments`），将 URI 解析为节点，并支持别名 `addAlias()`。
- **版本控制**: `MemoryVersionService` 支持三种写入模式：`create`（全量替换）、`patch`（字符串替换 oldString→newString）、`append`（内容追加）；版本有 `pending|approved|rejected` review 状态；`rollbackToVersion()` 创建新版本并将旧版本标记为 deprecated，保持版本链不可变历史。
- **启动协议**: `BootProtocolService` 在 Agent 对话或工作流执行建立 memory session 时自动解析 `system://boot`（根引导节点）、`system://index`（记忆索引）、`system://glossary`（词汇表挂载点）三个保留 URI，确保 Agent 拥有结构化的起始上下文。
- **纯 PostgreSQL FTS**: `MemorySearchService` 使用 PostgreSQL 全文搜索（`to_tsvector` / `to_tsquery`）索引 memory node 内容，不依赖 Qdrant；支持 `minDisclosure` 阈值过滤，限制 Agent 可见度。
- **Aho-Corasick 词汇表**: `GlossaryService` 维护 `memory_glossary_keywords` 词汇表；节点写入时自动多关键词匹配并写入 `metadata.glossaryMatches`，为 Agent 提供跨节点语义关联。
- **7 个 Agent 工具**: `MemoryToolsService` 实现 `read_memory`（URI → 内容）、`create_memory`（URI + content 写入新节点）、`update_memory`（patch/append 模式）、`delete_memory`（URI 删除节点）、`add_alias`（添加别名 URI）、`manage_triggers`（节点触发条件管理）、`search_memory`（FTS 查询），均实现 `SessionToolProvider` 接口，工具超时 2000ms。
- **REST API**: 25 个端点挂载于 `/memory-instances`；实例 CRUD（5）+ 图操作（7：节点列表/详情/创建/子节点/URI 解析/搜索/图全量）+ 路径与别名（4）+ 边操作（3）+ 版本管理（3：列表/创建/回滚）+ 审计与审核（3：审计日志/版本审核/待审核列表）；RBAC 读操作为 viewer+，写操作为 creator+。
- **SharedResourceRegistry 集成**: `MemoryResourceProvider` 实现 `SharedResourceProvider<MemoryResourceConfig, MemoryResourceInstance>` 接口（type `'memory'`），由 `SharedResourcesModule.onModuleInit()` 负责注册；`AgentMemoryModule.onModuleInit()` 仅做 DI smoke-check，不重复注册。`memory_sessions` 通过双 FK（`execution_id` OR `agent_conversation_id`）+ CHECK 约束对齐 `sandbox_sessions` 设计，实现跨 workflow 与 agent 对话的记忆会话复用。
- **模块导出**: `AgentMemoryModule` 导出 `MemoryToolsService`（供 Agent 执行引擎注入工具集）、`MemoryFusionService`（多实例融合）、`BootProtocolService`（启动序列）、`MemoryResourceProvider`（资源注册表集成）；其余服务（NodeService/EdgeService/VersionService/PathResolver/Glossary/Search）仅在模块内可见。

## Marketplace

- public browse 路由：`GET /marketplace/browse`、`GET /marketplace/browse/:id`、`GET /marketplace/browse/:id/reviews`，已在 `AppModule.configure()` 中显式从 `TenantMiddleware` 排除。
- `MarketplaceService.findPublicListings()` 支持 `category/search/sort(popular|rating|newest)`，并用 `array_to_string(tags, ' ') ILIKE` 补齐 tags 搜索；public browse 现返回 `{ data, meta }`，作者仅暴露 `displayName`。
- `MarketplaceService.findPublicById()` 只返回 `definition { nodes, edges, viewport }` 与 latest 20 reviews，不再暴露 `workflowVersionId`、`definition.inputSchema`、author id/avatar 等内部字段。
- `GET /marketplace/browse/:id/reviews` 现使用 `QueryPublicReviewsDto`（`pageSize.max(50)`）并返回 `{ data, meta }`；`MarketplaceReviewUserService.submitReview()` 返回精简 `{ id, rating, content, createdAt }`，重复评论继续映射 409。
- `POST /marketplace/listings/:id/install` 允许 `owner/admin/creator/operator` 安装公开 listing 到当前租户；内部仍通过 `WorkflowVersionService.create(..., { marketplace_listing_id })` 克隆 snapshot + inputSchema、写入 `metadata.cloned_from_marketplace`，并原子递增 `use_count`，但公开响应已收敛为 `{ workflowDefinitionId, name, message }`。

## WebSocket

- `/execution` namespace: `execution:subscribe`/`execution:unsubscribe` (带 ACK: `{status, currentState}`)
  - 订阅时验证 JWT blacklist + MFA，tenant 归属校验 (DB lookup)
  - 状态回放 tenant-scoped: `StateReplayService.getExecutionSnapshot(execId, tenantId)`
  - 事件协议: typed `ExecutionEvent<T>` 信封 (含 monotonic eventId)
  - 事件名称: `execution.node.status-changed`, `execution.node.agent-event`, `execution.node.retrying`, `execution.node.output-chunk`, `execution.node.intervention-required`, `execution.node.intervention-resolved`, `execution.status.changed`
  - 断线续传: 客户端发送 `lastEventId`，服务端从该点回放状态快照
  - 执行终态清理: `EventBridgeService` 先排空 Gateway backpressure queue，再 `forceFlush()` merge-window 内残留 `output_chunk`，随后立即广播终态事件；`ThrottleService` / `ExecutionGateway` 运行态状态即时释放，replay ring buffer 保留 30s 后清理
  - AC-1 认证失败: `createAuthError()` 返回 `err.data = { code: 4001, reason }` close frame
  - AC-2 订阅拒绝: 返回 `{status:'error', error:'FORBIDDEN', currentState:null}` (非抛异常)
  - AC-6 背压: Gateway 内置队列 (`eventQueue` Map)，速率限制时排队而非丢弃，500 事件上限/执行，100ms drain 间隔
- `/notification` namespace: 连接握手复用 JWT blacklist + MFA 校验，连接即加入 `tenant:{tenantId}:user:{userId}` 房间
  - 事件: `notification.new`（完整通知记录）、`notification.unread-count`（`{ count }`）
  - 订阅事件: `notification:subscribe` / `notification:unsubscribe`
  - 处理链路: `EventBridgeService.emitExecutionStatusChanged()` → `EventEmitter2('execution.status.changed')`，`emitInterventionRequired()` → `EventEmitter2('execution.node.intervention-required')`，以及 `ResourceGovernanceService` 发出的 `resource-governance.*` 事件 → `NotificationListener` → `NotificationService.create()` → `NotificationProcessor`
  - 接收人策略: `NotificationListener` 基于 execution + workflow + organization members 联表，向租户内 `owner/admin/creator`（Editor+）批量创建通知，不再只通知执行创建者
  - 载荷约定: `completed` / `failed` / `intervention_required` 通知 body 均包含 `workflowId`、`workflowName`、`executionId`、`timelineUrl`；失败额外含 `errorReason` / `suggestion`，人工介入额外含 `nodeId` / `nodeName` / `interventionReason` / `requestedAt`。资源治理通知类型包括 `resource_governance_execution_blocked`、`resource_governance_quota_updated`、`resource_governance_controls_updated`、`resource_governance_execution_terminated`，body 至少保留 `organizationId` 与对应 workflow/execution/reason/requestedAt/effectedAt 等结构化字段。
- `/knowledge` namespace: document status/kb updates (隐式契约，**无认证守卫**)
- `/memory` namespace: Agent 记忆实时事件推送，`WsJwtGuard` 认证（JWT blacklist + MFA）
  - 订阅/取消订阅 + ACK：`memory:subscribe` / `memory:unsubscribe`，payload 含 `instanceId`，加入房间 `memory:{tenantId}:{instanceId}`
  - 断线回放：订阅时携带 `lastEventId` query 参数，服务端重放 replay buffer 中该 ID 之后的事件（最大 1000 条/实例）
  - 事件名称：`memory.node.created`、`memory.node.updated`、`memory.node.deleted`、`memory.version.created`、`memory.version.rollback`、`memory.review.submitted`
  - 背压：per-instance 队列 500 事件上限，100ms drain 间隔；`flushMemoryQueue()` 供服务层在操作终态后立即排空
  - 认证失败：`createAuthError()` 返回 `err.data = { code: 4001, reason }` close frame
- `/agent-conversation` namespace: Agent 对话实时事件推送，与 `/execution` namespace 对称
  - 复用 EventBridge 模式，typed event 信封
  - 订阅/取消订阅 + ACK，支持 JWT + MFA 认证
  - 事件类型覆盖对话消息流、Agent 状态变更、工具调用等
- 均使用 `WsJwtGuard` 认证 (blacklist + MFA)

## common/ 目录

| 目录 | 内容 |
|------|------|
| `guards/` | AuthGuard (dual JWT/API-Key), CustomThrottlerGuard, TenantGuard, RolesGuard, WsJwtGuard |
| `interceptors/` | TenantTransactionInterceptor |
| `middleware/` | TenantMiddleware |
| `filters/` | AllExceptionsFilter |
| `pipes/` | ZodValidationPipe |
| `decorators/` | @CurrentUser, @Roles, @Public 等 |
| `redis/` | **完整嵌套子模块** (RedisModule)：RedisCacheService, RedisPubSubService |
| `providers/` | tenant-aware-db.provider (DRIZZLE token，scoped Drizzle 注入) |
| `adapters/` | RedisIoAdapter |

## 测试约定

- **Unit**: `__tests__/*.spec.ts`，NestJS `Test.createTestingModule` + `vi.fn()`
- **E2E**: `test/*.e2e-spec.ts`，Testcontainers PostgreSQL + NestFastifyApplication + `rls-test-utils.ts`
- `test/acp-stdio.e2e-spec.ts` 先构建 `dist/src/acp-stdio.js`，再通过 `scripts/run-acp-stdio-e2e-helper.mjs` 在 Vitest 外驱动 ACP stdio 对话；helper 以 `ACP_TEST_FAKE_RUNTIME=1` 切到 `AcpTestRuntime`，并启用 host-side fake exec 验证 terminal 主链。当前 E2E 覆盖 unsupported protocol version → `Invalid params`、canonical initialize capability negotiation（兼容 legacy alias）、`initialized` notification 静默、authenticate、`session/new`、`session/prompt`、`session/update` 顺序、真实 `fs/read_text_file` / `fs/write_text_file` client-proxy surface、写入前官方 `session/request_permission` allow/deny/cancel、真实 `server_sandbox` read/write success、`terminal/create + output + wait_for_exit` success、denylist reject、timeout kill、explicit release 后 output not-found、`session/cancel` terminal cleanup、`session/load` 对 active terminal continuity 的 fail-closed cold recovery、traversal / oversize / binary reject、parse error、非法 `id` invalid request、revoked token 与 stdout hygiene。该 E2E 锁定的是 stdio transport + ACP permission loop + terminal lifecycle + durable conversation recovery + sandbox guardrail 边界。 |
- `test/acp-stdio.e2e-spec.ts` 现额外锁定 bounded `terminal/output`、spawn 前危险参数/路径 reject、exited/killed terminal output unavailable、request-local wait timeout 与 server lifetime timeout 的稳定错误、manual kill 与 `session/cancel` cleanup killed audit，确保 ACP terminal contract 不会退回到“只通主链、不守安全语义”的状态。
- `package.json` 的 `test:e2e` 现通过 `scripts/run-e2e.mjs` 包装 `vitest.e2e.config.ts`，确保 `pnpm test:e2e -- <pattern>` 会把 pattern 正确前传给 Vitest 文件过滤。
- `test/resource-governance.e2e-spec.ts` 会在 testcontainer 数据库内 bootstrap `tenant_quotas` / `execution_governance_controls` 与资源治理通知枚举扩展，并额外清理 `notifications/notification_preferences/workflow_executions/workflow_versions/execution_steps` 等扩展表，避免旧 migrations 缺口导致 suite 漂移。
- `test/monitoring.e2e-spec.ts` 复用同一套 Testcontainers/RLS 基建，校验 monitoring route 的 owner/admin 门禁、`15m`→`24h` 窗口刷新、trend 中不伪造历史 queue depth，以及 resource governance / execution deep-link contract。
- `test/private-deployment.e2e-spec.ts` 复用同类 Testcontainers/RLS harness，并在 suite 内补齐资源治理表 bootstrap 以满足 `CustomThrottlerGuard`；覆盖 owner/admin 默认 GET、owner 更新后 secret ref 脱敏与 `organization.private-deployment.updated` 审计写入，以及 viewer 的 403 拒绝。
- **Mock**: `vi.hoisted()` + mock factory 函数 (`createMockXxxService`)
- **覆盖率**: 80% 阈值 (V8)，Vitest + SWC
- **Vitest 条件配置**: `vitest.config.ts` 通过运行时 `process.argv` 检测区分 unit vs E2E 配置
- `test/workflow-version.e2e-spec.ts` 初始化链路较重；为避免全量 E2E 下的冷启动 hook timeout，suite 的 `beforeAll` 明确使用 `30_000ms` timeout，`afterAll` 使用可选关闭保证初始化失败时也能安全清理。

## OpenAPI & SDK

- Swagger 注解已覆盖所有公开控制器（MCP 8、Health 1、Evidence 5、Notification 6、DeviceToken 2、InterventionPolicy 6、KnowledgeBase 9、Template 2、PlatformApiToken 3）
- `src/openapi/swagger-document.ts`: 统一 `DocumentBuilder`、稳定 `operationIdFactory`，并在导出前做 OpenAPI 3.0 正规化（`const -> enum`、删除 `propertyNames`、折叠 snake_case alias、移除空 `license.url`）
- `main.ts`: 复用 `createSwaggerDocument()` 暴露 `/docs` + `/openapi.json`
- `scripts/export-openapi-spec.mjs`: 基于 compiled dist 模块导出 `sdk/openapi.json`，为 one-shot CLI 注入最小 env、执行 teardown，并在 `app.close()` 后 `process.exit(0)` 收尾
- `openapitools.json`: openapi-generator-cli v7.9.0，两个 generator：`typescript` (typescript-fetch → `sdk/typescript/`) 和 `python` (python → `sdk/python/`)
- package.json scripts: `openapi:export`、`sdk:export-spec`、`sdk:generate:ts`、`sdk:generate:py`、`sdk:generate`、`sdk:build:ts`
- `scripts/postprocess-typescript-sdk.mjs`: 为 oneOf union alias 补 `ToJSONTyped` shim，并向 `sdk/typescript/README.md` 注入 JWT / X-Api-Key 用法示例
- `scripts/postprocess-python-sdk.mjs`: 向 `sdk/python/README.md` 注入 JWT / X-Api-Key 用法示例
- `sdk/.gitignore`: 忽略 `typescript/` `python/`，保留 `openapi.json`

## 环境变量

见 `.env.example`。关键: `APP_DATABASE_URL`, `APP_DEPLOYMENT_MODE`, `APP_SUPABASE_*`, `APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY`, `APP_JWT_SECRET`, `APP_REDIS_URL`, `APP_MASTER_ENCRYPTION_KEY`, `APP_MINIO_*`, `APP_QDRANT_URL`, `FIREBASE_SERVICE_ACCOUNT` (可选, FCM 推送通知)

## 复杂度热点

- **Smart Routing 执行细节**: `NodeSchedulerService.executeSmartRouting()` 现默认使用 `FALLBACK_CHAIN`，会用 `estimateTokenCount()` 估算输入 tokens，并在 `HISTORICAL_BEST` 下调用 `SmartRoutingService.getHistoricalMetrics()` 注入近 30 天 `successRate/lastUsedAt/avgLatencyMs`；该历史统计不再看 workflow 终态，而是按同一 `routingStepId` 的 routing decision 序列与下游 agent step 的 `checkpointData.smartRouting` / `input` 匹配真实 terminal 状态。smart-routing step result 现会带 `routingStepId/routingNodeId/candidateModelIds/currentModelIndex/llmModelConfigId/tokenThreshold/evaluatedModels` 等 runtime metadata。`scheduleNode()` 通过 `buildAgentTaskJobData()` 从上游 smart-routing 输出中提取该 metadata，把 `llmModelConfigId` 注入下游 agent job，并在 `FALLBACK_CHAIN` 下强制 queue `attempts: 1`。`AgentTaskWorker` 则在最终 failed 之前处理跨模型 fallback：非 `authenticationFailed` 的 provider 错误会切换到下一个候选模型重新派队，同时补写新的 `routing_decisions` 记录并把前序失败摘要写入 `decision_reasoning`，再通过 `broadcastAgentEvent()` 发 `message_chunk` 说明；认证失败禁止 fallback；且只有 `FALLBACK_CHAIN` 的候选真正耗尽时才使用 `AllModelsFallbackExhaustedException`，其他 smart-routing 策略保留原始错误。另：`routing_decisions.selected_model_id` 通过 `0041_routing_decision_selected_model_nullable.sql` 改为 nullable，对齐 `ON DELETE SET NULL`。

最大非测试生产文件（按行数排序）:
- `evidence.service.ts` (1981L) — 证据记录 CRUD + 溯源链构建 + chunk content 嵌入 + node_error 证据 + 审计日志（4 项职责，重构候选）
- `agent-task.worker.ts` (1709L) — Agent 任务执行 + 人工介入 + fallback + 重试
- `node-scheduler.service.ts` (1643L) — DAG 调度核心，条件分支/沙箱/变换/插件节点入队/人工介入/介入超时管理/智能路由，scheduleNode() 捕获 NodeTypeMismatchException 写入结构化错误
- `workflow-version.service.ts` (1234L) — 版本管理逻辑 + PATCH 更新/OCC 并发控制 + 发布时端口类型兼容性警告 + 列表排序（camelCase + snake_case alias）
- `resource-governance.service.ts` (1129L) — 资源治理准入、quota、governance 暂停、异常执行终止
- `mcp.service.ts` (1124L) — MCP 服务器管理全流程
- `marketplace.service.ts` (1059L) — Marketplace 上架/浏览/安装/评论
- `output-format.service.ts` (529L) — L1-L4 输出格式逐级升级
- `auth.service.ts` (508L) — 认证全流程

其他:
- `execution-response.dto.ts` / `workflow-version.e2e-spec.ts` — 执行详情 DTO 已对齐 `errors/typeMismatch` 契约，工作流发布 E2E 已覆盖 `warnings[]` HTTP 路径

## E2EE 证据加密架构细节

- `EvidenceService` 现对 `agent_decision` / `tool_output` 使用 canonical `packet.encryptedPacket` envelope 持久化密文，并在 `findByExecution()` / `findById()` / `verifyContentHash()` / `buildChain()` 中兼容 legacy `encryptionMetadata.encryptedPayload + ciphertext-only hash` 记录，避免历史加密证据被误判为 `hash_mismatch`
- `buildPacketSummary()` 对加密证据使用 redacted summary，避免在 provenance chain / UI 中泄露明文 reasoning 或 tool output
- `tenant_encryption_keys` 已通过 `0038_tenant_key_rotation_history.sql` 从 `org_id` 单行 UNIQUE 调整为 append-only 历史模型：`organization_id + key_fingerprint` 唯一，且仅 `status='active'` 受 partial unique index 约束；`TenantKeyService.rotateKey()` 先将旧 key 置为 `rotating`，再插入新 `active` key，并在插入失败时回滚旧状态

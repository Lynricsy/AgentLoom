# AGENTLOOM SERVER 知识库

NestJS v11 + Fastify v5 后端。多租户 SaaS，七层全局中间件/守卫链。

## 入口

`main.ts` → `NestFactory.create(AppModule, FastifyAdapter, { rawBody: true })` → multipart(50MB) → RedisIoAdapter → prefix `api/v1` → AllExceptionsFilter + ZodValidationPipe → Swagger `/docs` (Bearer + X-Api-Key auth, `createSwaggerDocument()` + OpenAPI 3.0 正规化) → listen(APP_PORT‖3000)

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
| auth | `modules/auth/` | JWT 注册/登录/刷新/登出/OAuth/MFA | Supabase |
| org | `modules/organization/` | 组织 CRUD + 邀请 + 角色管理 | RBAC cache |
| resource-governance | `modules/resource-governance/` | 租户资源配额与异常执行治理：`tenant_quotas` / `execution_governance_controls` typed store、治理读写 API、anomalous execution termination contract、治理事件 / 审计 / 通知 explain | EvidenceModule, EventEmitter2 |
| monitoring | `modules/monitoring/` | 组织级 owner/admin 只读监控 dashboard：`GET /organizations/:id/monitoring`，按 `15m|1h|24h` 聚合 `workflow_executions`、`agent_execution_records`、governance state、notifications、audit logs 与当前 `agent-task` queue snapshot；趋势图聚焦 execution trend，queue depth 仅表示当前 snapshot，输出 summary/alerts/hotspots/riskSummary deep link contract | ResourceGovernanceModule, BullMQ, DrizzleDB |
| api-key | `modules/api-key/` | API Key CRUD + 轮换 (AES 加密) | ConfigModule |
| workflow-def | `modules/workflow-definition/` | 工作流版本 CRUD + 发布/归档/回滚 + 空白/模板创建 (`POST /workflow-definitions`) + 列表/详情查询 (`GET /workflow-definitions`, `GET /workflow-definitions/:id`) + 导出（`GET /workflow-definitions/:id/export`，返回已清洗的 `agentloom-workflow-v1` envelope，移除 API key/credentials/tenant/org/user 标识等敏感字段） + 自动保存/更新 (`PATCH /workflow-definitions/:id`，Creator/Admin/Owner 可写，OCC version 乐观并发，409 顶层 `currentVersion`) + 软删除 (`DELETE /workflow-definitions/:id` → archive) + 列表排序别名 (`updatedAt/createdAt/name` + `updated_at/created_at`) | TemplateModule |
| llm | `modules/llm/` | LLM 模型/提供商配置 + catalog | ApiKeyModule |
| mcp | `modules/mcp/` | MCP 服务器 测试/已保存配置测试/发现/导入/重导入/停用 | ApiKeyModule |
| sandbox | `modules/sandbox/` | Docker 沙箱生命周期管理 | BullMQ |
| agent | `modules/agent/` | **六边形架构**: ports/AgentRuntime → InProcess\|Sandbox 适配器 | LlmModule, SandboxModule |
| knowledge | `modules/knowledge/` | RAG: 解析 → 分块 → Qdrant 向量索引 | BullMQ, Qdrant |
| execution | `modules/execution/` | DAG 调度 + 状态机 + BullMQ workers | AgentModule, Socket.IO |
| trigger | `modules/trigger/` | 事件驱动触发系统：工作流 trigger CRUD、cron 调度、webhook 验签与触发历史 | BullMQ, ExecutionModule, crypto HMAC |
| notification | `modules/notification/` | 用户通知列表/偏好 + BullMQ 分发 + `/notification` WebSocket + 设备 token 注册/注销 + FCM 推送 (firebase-admin) | BullMQ, EventEmitter, firebase-admin |
| plugin | `modules/plugin/` | 服务端插件注册与安全管理：`.alp` multipart 上传 + RSA-PSS 签名验证 + MinIO 归档/WASM 上传、使用 `@agentloom/plugin-sdk` 校验 manifest、`plugins` + `plugin_developer_keys` + `plugin_usage_records` + `plugin_earnings` 表 CRUD、`PluginSignatureService` RSA-PSS + SHA-256 签名验证、`PluginSandboxService` 封装 `@extism/extism` WASM 沙箱执行、`PluginExecutionWorker` 从 MinIO 下载 WASM 执行 + fire-and-forget 使用量记录、`PluginUsageService` 使用量 CRUD + 聚合统计、`PluginEarningsService` 收益分成计算与结算记录管理、`EarningsSettlementWorker` 周期性收益结算、`PluginMarketplaceController` 插件上架/列表/详情/更新 CRUD | BullMQ, JSZip, @extism/extism, node:crypto |
| evidence | `modules/evidence/` | 证据记录 CRUD + 自动 evidence 监听 + 批量缓冲 + SHA-256 完整性校验 + 溯源链构建 (递归 CTE) + 来源可用性检测 + chunk content 嵌入 + Redis 缓存 + node_error 自动证据 (步骤失败监听) + 审计日志统一写入/查询/资源序列回放 + `audit-log-retention` 归档调度/worker | EventEmitter, RedisCacheService, BullMQ |
| template | `modules/template/` | 工作流模板浏览 (public, 无认证，AppModule 中显式从 TenantMiddleware 排除) | — |
| smart-routing | `modules/smart-routing/` | 智能模型路由：6 种策略纯函数 (TOKEN_OPTIMIZED/COST_OPTIMIZED/QUALITY_FIRST/LATENCY_FIRST/HISTORICAL_BEST/FALLBACK_CHAIN)，路由决策持久化 (`routing_decisions` 表)，`GET /routing-decisions` 现通过 `execution_steps.execution_id` 做 execution 级查询，并支持近 30 天历史指标聚合（按 routing decision 序列 + downstream agent step 真正终态统计） | LlmModule |
| marketplace | `modules/marketplace/` | 工作流 Marketplace：上架/下架/复审、我的上架列表、public browse (`/marketplace/browse`) 含 `listingType` 过滤（workflow/plugin）、详情/评论、一键安装复用到当前租户、用户评分聚合 (`use_count/avg_rating/review_count`) | WorkflowDefinitionModule, PluginModule, users, workflowVersions |
| share | `modules/share/` | 工作流分享链接管理：租户内创建/分页/撤销分享，公开短链 `/s/:token` 只读访问，view/copy 计数原子递增 | ConfigModule, workflowVersions |
| platform-api-token | `modules/platform-api-token/` | Platform API Token CRUD：生成 (al_ 前缀 + SHA-256)、列表 (分页+状态过滤)、撤销、验证；每租户 20 token 上限 | RbacCacheService |
| execution-record | `modules/execution-record/` | Agent 执行遥测数据自动记录：`@OnEvent` 监听步骤完成/失败写入 `step_telemetry`（`telemetry_data`，toolCalls/errors/selfRepairs/ioSnapshots/llmInteractions），监听执行完成/失败聚合 `execution_summary`（`summary_data`）；写入时显式持久化 `tenant_id`；`GET /execution-records` 在租户事务内先校验 `workflow_executions` 是否存在，不存在/不可访问抛 `ExecutionNotFoundException` 404，存在但无记录返回空数组；`sanitizeTelemetryData` 对对象/数组做结构化 `[TRUNCATED]` 截断并保留 token 计数字段 | EventEmitter, DrizzleDB |
| optimization-suggestion | `modules/optimization-suggestion/` | 基于 `agent_execution_records` 的规则分析建议闭环：四类 analyzer、使用 `upsertJobScheduler()` 注册的 `optimization-analysis` 周期任务、建议 list/apply/dismiss/stats API、带 workflow OCC + pending status guard 的工作流节点配置手术式更新 | ExecutionRecordModule, BullMQ |
| health | `modules/health/` | 健康检查 (public) | — |

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
| plugin-execution | 3次 exp (2s base) | `plugin` 节点 WASM 沙箱执行 worker |
| optimization-analysis | 1次 | Agent 配置优化建议周期分析 |
| audit-log-retention | 1次 | 审计日志热层归档与 hot/archive 回查基线维护 |
| trigger-scheduler | 3次 exp (2s base) | cron trigger repeatable jobs + webhook/cron 历史记录联动 |
| notification | 3次 exp (1s base) | 通知分发与 WebSocket 推送 |
| sandbox-lifecycle-queue | 3次 exp | Docker 容器生命周期 |
| document-processing-queue | — | 文档解析 |
| document-indexing-queue | — | Qdrant 向量索引 |

## Trigger 系统

- 数据表：`workflow_triggers` + `workflow_trigger_history`，schema 位于 `src/database/schema/workflow-triggers.schema.ts`
- 触发类型：`cron | webhook | api_event`；当前 V1 已落地 cron/webhook 执行链路，`GithubWebhookAdapter` 仅为 api_event 占位，且 `TriggerService.create/update/toggle` 会对 `api_event` 抛出 preview-only 409，禁止创建、编辑或启用
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

Schema 在 `src/database/schema/`，启用 RLS (`rls-policies.ts`)。`workflow_templates` 表为系统级公共资源（无 RLS、无 tenant_id）。`device_tokens` 表为用户级资源（无 RLS、无 tenant_id，直接通过 user_id 关联）。`platform_api_tokens` 表为用户级 API Token 存储（无 RLS、通过 userId FK 关联，tokenHash UNIQUE + 租户-用户-状态复合索引 + prefix 索引）。`plugins` 表保存租户插件清单：`org_id + plugin_id` 唯一，状态枚举为 `registered|active|disabled|error`，并持久化 `manifest`、`node_definitions`、`permissions`、`signature`（text）、`content_hash`（varchar 64）、`wasm_bundle_url`（varchar 512）、`occ_version` 与 tenant-scoped RLS。`plugin_developer_keys` 表管理开发者 RSA 公钥：`org_id + key_fingerprint` 唯一，状态枚举 `active|revoked`，含 `public_key`（text）、`label`、`revoked_at` 与 tenant-scoped RLS。`agent_execution_records` 表存储 Agent 执行遥测记录：`tenant_id` 直连租户、`execution_id` FK → `workflow_executions` (cascade)、`step_id` FK → `execution_steps` (set null)、`record_type` 枚举 `step_telemetry|execution_summary`、`telemetry_data` JSONB（StepTelemetryData，��� step telemetry）、`summary_data` JSONB（ExecutionSummaryData，仅 execution summary），并通过 payload check 约束保证两类记录互斥；该表使用 `createDirectTenantPolicies` 做直接租户 RLS，并额外建立 `tenant_id` / `(tenant_id, execution_id)` 索引。`audit_logs` 与 `audit_log_archives` 为 evidence 域 append-only 审计双表，字段同构（`tenant_id/actor_id/actor_type/event_type/resource_type/resource_id/execution_id/summary/before/after/metadata/created_at`），只对 `authenticated` 授予 `SELECT/INSERT`，并通过 append-only tenant policy 保持 hot/archive 都不可 update/delete；两表均建立 `(tenant_id, created_at)`、`(tenant_id, event_type, created_at)`、`(tenant_id, resource_type, resource_id, created_at)`、`(tenant_id, execution_id, created_at)` 索引。`optimization_suggestions` 表保存按租户隔离的配置建议，字段包括 `workflow_definition_id/node_id/suggestion_type/status/confidence/current_value/suggested_value/rationale/impact_estimate/analysis_metadata/analysis_period_*` 与 apply/dismiss 审计列；该表启用 direct tenant RLS，并额外通过 migration 为 `authenticated` 授予 `SELECT/INSERT/UPDATE/DELETE`。Marketplace 现同时包含 `marketplace_listings`（上架记录 + `category/use_count/avg_rating/review_count` 聚合字段）与 `marketplace_reviews`（用户评分/评论，`listing_id + user_id` 唯一约束，评分 1..5 check）。
关键：`workflowDefinitions` 存储 ReactFlow JSON (JSONB)，含 `metadata` jsonb 列（模板克隆信息等）；`documentChunks` 含 vector 列。
补充：`workflow_definitions` 现新增 `input_schema` JSONB；`WorkflowVersionController GET /workflow-definitions/:workflowId/input-schema` 返回 canonical `WorkflowInputSchema`（operator+，未发布 409，空值默认 `{ version:1, collectionMode:'form', fields:[] }`）；`RunWorkflowDto.launchSource` 会被 `ExecutionService` 归并到 `workflow_executions.input_params._meta.launchSource`；模板 seeds 通过 `workflow_templates.definition.inputSchema` 承载示例 schema，并在克隆时复制到 `workflow_definitions.input_schema`。migration `0027_tidy_marauders.sql` 同时补齐了 `workflow_executions` / `execution_steps` 对 authenticated 的 GRANT，以修复 execution RLS 测试路径中的权限缺口。
- **资源治理表**: `tenant_quotas` 提供 7 个 canonical quota 字段（`maxConcurrentExecutions`、`dailyExecutionLimit`、`dailyApiCallLimit`、`storageQuotaMb`、`apiRateLimitPerMinute`、`maxSandboxCpuPercent`、`maxSandboxMemoryMb`），使用 direct tenant RLS 与 `organization_id` 唯一索引；`execution_governance_controls` 以 `scope + targetId + status + reason` 保存 tenant/workflow 治理暂停状态，使用 `(organization_id, scope, target_id)` 唯一索引与 direct tenant RLS。
- **治理通知枚举扩展**: `notifications.notification_type_enum` 现包含 `resource_governance_execution_blocked`、`resource_governance_quota_updated`、`resource_governance_controls_updated`、`resource_governance_execution_terminated`，供 `/notification` socket、通知列表与治理审计链路复用。
- **WorkflowInputSchema 规范**: canonical `WorkflowInputSchema` 现同时承载 form baseline 的 `visibility: { fieldId, equals }` 与 `conversationPlan { systemPrompt, maxTurns }` / 字段级 `collectionHint?: string`；`GET/PATCH /workflow-definitions/:id` 继续承担 draft hydrate/persist，`inputSchema.version` 只在逻辑 schema diff 时递增，仍独立于 workflow OCC `version`。`POST /workflow-definitions/:id/run` 接受 `schemaVersion` / `schema_version`，`ExecutionService` 会基于 published schema 做 required/default/visibility/type/unknown-field 校验，并把规范化结果写入 `_meta.launchConfig { workflowId, schemaVersion, collectionMode, resolvedInputs, unresolvedFieldIds, launchSource }`；客户端可以做 staged collection，但 server 仍是 launch normalization 的唯一权威，不信任客户端自报的 unresolved/option semantics。`WorkflowLaunchSchemaVersionMismatchException` 返回 409，`WorkflowLaunchInputValidationException` 返回 422。
迁移命令: `pnpm db:generate` → `pnpm db:migrate`。种子数据: `pnpm db:seed` (5 个预置模板，upsert on slug)。
种子脚本入口: `drizzle/seed/templates.ts`，种子数据: `src/database/seeds/template-seeds.ts`。
模板 `definition` 现与 `workflowDefinitions.definition` 保持同构，`nodes/edges/viewport` 均为必填；公共模板路由在 `AppModule.configure()` 里通过 `TenantMiddleware.exclude({ path: 'templates', method: RequestMethod.ALL }, { path: 'templates/{*splat}', method: RequestMethod.ALL })` 绕过租户中间件。

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
- `/knowledge` namespace: document status/kb updates (隐式契约)
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
| `redis/` | RedisCacheService, RedisPubSubService |
| `providers/` | tenant-aware-db.provider (DRIZZLE token) |
| `adapters/` | RedisIoAdapter |

## 测试约定

- **Unit**: `__tests__/*.spec.ts`，NestJS `Test.createTestingModule` + `vi.fn()`
- **E2E**: `test/*.e2e-spec.ts`，Testcontainers PostgreSQL + NestFastifyApplication + `rls-test-utils.ts`
- `package.json` 的 `test:e2e` 现通过 `scripts/run-e2e.mjs` 包装 `vitest.e2e.config.ts`，确保 `pnpm test:e2e -- <pattern>` 会把 pattern 正确前传给 Vitest 文件过滤。
- `test/resource-governance.e2e-spec.ts` 会在 testcontainer 数据库内 bootstrap `tenant_quotas` / `execution_governance_controls` 与资源治理通知枚举扩展，并额外清理 `notifications/notification_preferences/workflow_executions/workflow_versions/execution_steps` 等扩展表，避免旧 migrations 缺口导致 suite 漂移。
- `test/monitoring.e2e-spec.ts` 复用同一套 Testcontainers/RLS 基建，校验 monitoring route 的 owner/admin 门禁、`15m`→`24h` 窗口刷新、trend 中不伪造历史 queue depth，以及 resource governance / execution deep-link contract。
- **Mock**: `vi.hoisted()` + mock factory 函数 (`createMockXxxService`)
- **覆盖率**: 80% 阈值 (V8)，Vitest + SWC
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

见 `.env.example`。关键: `APP_DATABASE_URL`, `APP_SUPABASE_*`, `APP_JWT_SECRET`, `APP_REDIS_URL`, `APP_MASTER_ENCRYPTION_KEY`, `APP_MINIO_*`, `APP_QDRANT_URL`, `FIREBASE_SERVICE_ACCOUNT` (可选, FCM 推送通知)

## 复杂度热点

- **Smart Routing 执行细节**: `NodeSchedulerService.executeSmartRouting()` 现默认使用 `FALLBACK_CHAIN`，会用 `estimateTokenCount()` 估算输入 tokens，并在 `HISTORICAL_BEST` 下调用 `SmartRoutingService.getHistoricalMetrics()` 注入近 30 天 `successRate/lastUsedAt/avgLatencyMs`；该历史统计不再看 workflow 终态，而是按同一 `routingStepId` 的 routing decision 序列与下游 agent step 的 `checkpointData.smartRouting` / `input` 匹配真实 terminal 状态。smart-routing step result 现会带 `routingStepId/routingNodeId/candidateModelIds/currentModelIndex/llmModelConfigId/tokenThreshold/evaluatedModels` 等 runtime metadata。`scheduleNode()` 通过 `buildAgentTaskJobData()` 从上游 smart-routing 输出中提取该 metadata，把 `llmModelConfigId` 注入下游 agent job，并在 `FALLBACK_CHAIN` 下强制 queue `attempts: 1`。`AgentTaskWorker` 则在最终 failed 之前处理跨模型 fallback：非 `authenticationFailed` 的 provider 错误会切换到下一个候选模型重新派队，同时补写新的 `routing_decisions` 记录并把前序失败摘要写入 `decision_reasoning`，再通过 `broadcastAgentEvent()` 发 `message_chunk` 说明；认证失败禁止 fallback；且只有 `FALLBACK_CHAIN` 的候选真正耗尽时才使用 `AllModelsFallbackExhaustedException`，其他 smart-routing 策略保留原始错误。另：`routing_decisions.selected_model_id` 通过 `0041_routing_decision_selected_model_nullable.sql` 改为 nullable，对齐 `ON DELETE SET NULL`。

- `node-scheduler.service.ts` (1400L+) — DAG 调度核心，条件分支/沙箱/变换/插件节点入队/人工介入/介入超时管理/智能路由，scheduleNode() 捕获 NodeTypeMismatchException 写入结构化错误
- `workflow-version.service.ts` — 版本管理逻辑 + PATCH 更新/OCC 并发控制 + 发布时端口类型兼容性警告 + 列表排序（camelCase + snake_case alias）
- `output-format.service.ts` (529L) — L1-L4 输出格式逐级升级
- `evidence.service.ts` (1582L) — 证据记录 CRUD + 溯源链构建 + chunk content 嵌入 + node_error 证据自动创建
- `execution-response.dto.ts` / `workflow-version.e2e-spec.ts` — 执行详情 DTO 已对齐 `errors/typeMismatch` 契约，工作流发布 E2E 已覆盖 `warnings[]` HTTP 路径
- `auth.service.ts` (508L) — 认证全流程

## E2EE 证据加密架构细节

- `EvidenceService` 现对 `agent_decision` / `tool_output` 使用 canonical `packet.encryptedPacket` envelope 持久化密文，并在 `findByExecution()` / `findById()` / `verifyContentHash()` / `buildChain()` 中兼容 legacy `encryptionMetadata.encryptedPayload + ciphertext-only hash` 记录，避免历史加密证据被误判为 `hash_mismatch`
- `buildPacketSummary()` 对加密证据使用 redacted summary，避免在 provenance chain / UI 中泄露明文 reasoning 或 tool output
- `tenant_encryption_keys` 已通过 `0038_tenant_key_rotation_history.sql` 从 `org_id` 单行 UNIQUE 调整为 append-only 历史模型：`organization_id + key_fingerprint` 唯一，且仅 `status='active'` 受 partial unique index 约束；`TenantKeyService.rotateKey()` 先将旧 key 置为 `rotating`，再插入新 `active` key，并在插入失败时回滚旧状态

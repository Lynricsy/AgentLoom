# AGENTLOOM SERVER 知识库

NestJS v11 + Fastify v5 后端。多租户 SaaS，六层全局中间件链。

## 入口

`main.ts` → `NestFactory.create(AppModule, FastifyAdapter, { rawBody: true })` → multipart(50MB) → RedisIoAdapter → prefix `api/v1` → AllExceptionsFilter + ZodValidationPipe → Swagger `/docs` → listen(APP_PORT‖3000)

## 全局中间件链 (执行顺序)

```
TenantMiddleware (extract tenantId from JWT, no-verify)
  → TenantTransactionInterceptor (AsyncLocalStorage, Drizzle tenant tx)
    → AuthGuard (JWT HS256 verify + blacklist + MFA check)
      → TenantGuard (validate UUID tenantId)
        → RolesGuard (Redis-cached RBAC: owner>admin>creator>operator>viewer)
```

## 模块地图

| 模块 | 路径 | 职责 | 关键依赖 |
|------|------|------|----------|
| auth | `modules/auth/` | JWT 注册/登录/刷新/登出/OAuth/MFA | Supabase |
| org | `modules/organization/` | 组织 CRUD + 邀请 + 角色管理 | RBAC cache |
| api-key | `modules/api-key/` | API Key CRUD + 轮换 (AES 加密) | ConfigModule |
| workflow-def | `modules/workflow-definition/` | 工作流版本 CRUD + 发布/归档/回滚 + 空白/模板创建 (`POST /workflow-definitions`) + 列表/详情查询 (`GET /workflow-definitions`, `GET /workflow-definitions/:id`) + 自动保存/更新 (`PATCH /workflow-definitions/:id`，Creator/Admin/Owner 可写，OCC version 乐观并发，409 顶层 `currentVersion`) + 软删除 (`DELETE /workflow-definitions/:id` → archive) + 列表排序别名 (`updatedAt/createdAt/name` + `updated_at/created_at`) | TemplateModule |
| llm | `modules/llm/` | LLM 模型/提供商配置 + catalog | ApiKeyModule |
| mcp | `modules/mcp/` | MCP 服务器 测试/已保存配置测试/发现/导入/重导入/停用 | ApiKeyModule |
| sandbox | `modules/sandbox/` | Docker 沙箱生命周期管理 | BullMQ |
| agent | `modules/agent/` | **六边形架构**: ports/AgentRuntime → InProcess\|Sandbox 适配器 | LlmModule, SandboxModule |
| knowledge | `modules/knowledge/` | RAG: 解析 → 分块 → Qdrant 向量索引 | BullMQ, Qdrant |
| execution | `modules/execution/` | DAG 调度 + 状态机 + BullMQ workers | AgentModule, Socket.IO |
| trigger | `modules/trigger/` | 事件驱动触发系统：工作流 trigger CRUD、cron 调度、webhook 验签与触发历史 | BullMQ, ExecutionModule, crypto HMAC |
| notification | `modules/notification/` | 用户通知列表/偏好 + BullMQ 分发 + `/notification` WebSocket + 设备 token 注册/注销 + FCM 推送 (firebase-admin) | BullMQ, EventEmitter, firebase-admin |
| evidence | `modules/evidence/` | 证据记录 CRUD + 自动 evidence 监听 + 批量缓冲 + SHA-256 完整性校验 + 溯源链构建 (递归 CTE) + 来源可用性检测 + chunk content 嵌入 + Redis 缓存 + node_error 自动证据 (步骤失败监听) | EventEmitter, RedisCacheService |
| template | `modules/template/` | 工作流模板浏览 (public, 无认证，AppModule 中显式从 TenantMiddleware 排除) | — |
| health | `modules/health/` | 健康检查 (public) | — |

## 执行流 (核心业务)

```
HTTP POST /executions
  → ExecutionController
    → ExecutionService.runWorkflow()
      → enqueue execution-queue (BullMQ)
        → ExecutionWorker
          → initializeSteps()
            → NodeScheduler.startExecution()
              → DAG 解析 → 并行执行就绪节点
                → AgentTaskWorker (agent-task-queue)
                  → AgentAdapterFactory → InProcess|Sandbox

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

## 断点恢复与检查点 (Story 5-5) ✅

- `CheckpointService` (`checkpoint.service.ts`) 在节点完成后保存 dagState 快照 (`saveCheckpoint`)，支持恢复失败执行 (`resumeExecution`)
- 检查点数据存储在 `execution_steps.checkpoint_data` (JSONB): `{ output, completedAt, dagState: { completedNodes[], pendingNodes[] }, attempts[] }`
- `execution_steps.attempt_count` (integer, default 0): 在 AgentTaskWorker 重试/最终失败时更新为 `job.attemptsMade+1`，恢复时重置为 0
- 恢复 API: `POST /executions/:id/resume` (202 Accepted, Editor+ 角色)，可选 `{ fromNodeId }` 指定恢复起点（BFS 重置目标+下游）；仅 `failed` 状态可恢复，`paused` 返回 409
- 恢复流程: Controller → `executionQueue.add('resume-execution', ...)` → ExecutionWorker 分发 → `nodeScheduler.resumeScheduling()`，确保通过 BullMQ 统一 job 生命周期
- `STEP_TRANSITIONS` 已新增 `failed→pending`、`cancelled→pending`，`NodeSchedulerService.resumeScheduling()` 会跳过 `completed` 节点并继续调度 `pending` 节点
- Agent 重试追踪已写入 `checkpointData.attempts[]`，记录每次重试的 `{ attempt, error, timestamp }`

## 人工介入系统 (Story 5-6) ✅

- **事件**: `EventBridgeService` 新增 `emitInterventionRequired()` + `emitInterventionResolved()`，走统一信封 + broadcast 管线
- **触发**: `AgentTaskWorker` 处理 `intervention_required` stopReason → `updateStepStatus('waiting_intervention')` → 写入 `checkpointData.interventionRequestedAt/interventionNodeName/decision/partialContent` → `emitInterventionRequired()` → `enqueueInterventionTimeout()`
- **解决**: `NodeSchedulerService.resolveIntervention()` 现在接收 `userId`，先通过 `StepStateMachineService.updateStepStatus(tenantId, stepId, 'running', ...)` 原子抢占 `waiting_intervention -> running` 并写入 `checkpointData.intervention { requested_at, resolved_at, action, instruction, resolved_by_user_id, timeout? }`，再 `updateExecutionStatus()`、`emitInterventionResolved()`、`removeInterventionTimeout()` 并入队后续 `agent-task`
- **超时**: 默认仍可回退到 24h，但 `NodeSchedulerService.enqueueInterventionTimeout()` 现会先解析 intervention policy 的 `timeoutSeconds`；普通任务使用 `intervention-timeout:{stepId}`，escalation 任务使用 `intervention-timeout:{stepId}:escalated:{count}` 唯一 jobId，避免 BullMQ 因重复 `jobId` 吞掉新的 delayed job。`removeInterventionTimeout()` 会同时清理 base job 与 1..`MAX_ESCALATION_ATTEMPTS` 的全部 escalation 变体；到期后 `AgentTaskWorker.handleInterventionTimeout()` 检查 step 是否仍为 `waiting_intervention`，再按策略执行 approve/reject/escalate 或以 `resolved_by_user_id = 'system_timeout'` 自动处理。
- **API**: `POST /executions/:executionId/steps/:stepId/intervene` (202 Accepted)，Body: `{ action: 'approve'|'modify'|'reject', feedback?, modifiedContent? }`
- **事件载荷**: `InterventionRequiredPayload { stepId, nodeId, nodeName, decision?, partialContent?, requestedAt }`、`InterventionResolvedPayload { stepId, nodeId, action, feedback?, modifiedContent?, resolvedBy, resolvedAt, timeout? }`
- **结构化内容**: `decision.suggestedContent`、`modifiedContent` 和审计 `instruction` 均允许 `unknown`，worker 会保留结构化内容并在 snapshot/output 恢复时继续透传
- **快照恢复**: `StateReplayService.getExecutionSnapshot()` 现包含 `step.checkpointData`，所以订阅 ACK / 重连快照即可恢复 `waiting_intervention` 面板，无需只依赖 event replay
- **Story 6-1 / Evidence**: `EventBridgeService.emitStepAgentEvent()`、`emitToolCallStatus()`、`emitInterventionResolved()` 现都会同步转发到 `EventEmitter2`，`EvidenceService` 监听这些内部事件以及 `knowledge.rag.retrieved` 自动创建 evidence records。`RagService.search()` 支持可选 `evidenceContext { executionId, stepId, parentEvidenceId? }`，当提供时会 emit `knowledge.rag.retrieved`。`EvidenceService.verifyContentHash()` 基于 source payload 重算 SHA-256 并返回 `{ evidenceId, valid, integrityWarning, currentHash }`。
- **Story 6-2 / Provenance Chain**: `EvidenceService.buildChain(tenantId, executionId, nodeId?)` 使用递归 CTE 沿 `parent_evidence_id` 向上追溯（`CHAIN_MAX_DEPTH=50` + `path` 防循环）；未传 `nodeId` 时从 execution 的叶子 evidence 锚定全量 ancestry，传入 `nodeId` 时通过 plain-text `execution_steps.node_id` 过滤特定 workflow node 的 ancestry，最终 flat→tree 为 ancestor-first roots。对 `rag_retrieval` 节点批量查询 `document_chunks`：缺失 chunk → `sourceUnavailable`，live `document_chunks.content` 的 SHA-256 与捕获时 `retrievedContent` 快照哈希不一致 → `sourceModified`，并保留 `packet.semanticLocation.context` 为 `originalSnapshot`；每节点继续执行 packet SHA-256 校验。响应为 `{ roots, chainCompleteness, totalNodes, integrityStatus, cachedAt? }`，其中 `integrityStatus` 含 `nodesWithPhysicalLocation`、`completenessLabel`、`integrityIssues`。Redis 缓存 key `evidence:chain:{executionId}:{nodeId||'all'}`，TTL 300s，evidence 写入时按 executionId pattern 自动失效；`GET /executions/:id/evidence/chain?nodeId=xxx` 响应含 `X-Cache-Hit` header。`verifyChainIntegrity()` 通过 `buildChain(..., { bypassCache: true })` 执行实时校验，不复用缓存。

- **Story 6-3 / Evidence Query Filters**: `QueryEvidenceSchema` 新增 `sourceType` (EvidenceSourceType enum)、`stepId` (string, min 1) 和 `nodeId` (string, min 1) 可选过滤参数。`findByExecution()` 支持按 `sourceType` 直接 `eq()` 过滤、按 `stepId` 过滤单步证据、按 `nodeId` 先查 `execution_steps` 获取匹配的 step IDs 再 `inArray()` 过滤。实现中 `sourceType` 查询类型已收紧为 `EvidenceSourceType`，避免与 Drizzle enum 列类型漂移。Controller 直接透传 query 参数。

- **Story 6-4 / Evidence UI Infrastructure**: `StorageService.getPresignedUrl(key, expirySeconds=3600)` 现会先 `statObject()` 校验对象是否存在，并将空 key / 缺失对象 / MinIO 不可用分别映射为 `StorageKeyInvalidException` / `StorageObjectNotFoundException` / `StorageUnavailableException`。`DocumentService.getDocumentContentUrl(kbId, docId, expirySeconds?)` 返回 `{url, fileName, mimeType, expiresIn}`，并把空 `storageKey` / 删除对象 / 存储不可用映射为 `DocumentContentNotFoundException` / `DocumentContentUnavailableException`。`KnowledgeBaseController GET :id/documents/:documentId/content`（VIEWER+）返回预签名 URL。`QueryEvidenceSchema.includeChunkContent` 布尔参数继续驱动 `EvidenceService.enrichWithChunkContent()` 批量查询 `documentChunks.content` 并注入到 `rag_retrieval` 记录的 `packet.physicalLocation.chunkContent`。同时 `PhysicalLocationSchema` 与 RAG packet summary metadata 现已包含 `knowledgeBaseId`，供 Studio 直接打开文档内容端点。

- **Story 6-5 / Node Error Diagnosis**: `isPortTypeCompatible(source, target)` 判断端口类型兼容性（同类型或目标为 `json` 即兼容）。`NodeTypeMismatchException` 含 `TypeMismatchDetail { sourcePortId, targetPortId, sourceType, targetType, sourceNodeId, targetNodeId, edgeId? }`。`NodeSchedulerService.checkEdgePortTypeCompatibility()` 在运行时校验边的端口类型。`scheduleNode()` 通过 try-catch 捕获 `resolveNodeInput()` 抛出的 `NodeTypeMismatchException`，写入结构化 `errorMessage`（含 `type/title/detail/typeMismatch/nodeId`）后调用 `onNodeFailed()`。`WorkflowVersionService.publish()` 返回 `PublishResult { data, warnings }`，其中 `validateEdgeTypeCompatibility()` 生成不兼容边的 `PublishWarning[]`。`EventBridgeService.emitStepStatusChanged()` 当步骤失败时额外通过 NestJS EventEmitter 发射事件，`EvidenceService.handleStepFailed()` 监听该事件创建 `node_error` 类型证据（含 errorMessage/errorType/errorTitle/typeMismatch/stack）。

- DLQ 管理 API: `GET /api/v1/dlq` (分页查询当前租户死信队列)、`POST /api/v1/dlq/:jobId/retry` (重试)、`POST /api/v1/dlq/:jobId/discard` (丢弃)，基于 BullMQ 原生 `getFailed()`/`job.retry()`/`job.remove()`，并校验 `job.data.tenantId` 防止跨租户访问

## BullMQ 队列

| 队列 | 重试 | 用途 |
|------|------|------|
| execution-queue | 1次 | 工作流执行入口 |
| agent-task-queue | 首次执行 + 3次重试 exp (2s base) | 单节点 Agent 任务 |
| trigger-scheduler | 3次 exp (2s base) | cron trigger repeatable jobs + webhook/cron 历史记录联动 |
| notification | 3次 exp (1s base) | 通知分发与 WebSocket 推送 |
| sandbox-lifecycle-queue | 3次 exp | Docker 容器生命周期 |
| document-processing-queue | — | 文档解析 |
| document-indexing-queue | — | Qdrant 向量索引 |

## Trigger 系统 (Story 8-3) ✅

- 数据表：`workflow_triggers` + `workflow_trigger_history`，schema 位于 `src/database/schema/workflow-triggers.schema.ts`
- 触发类型：`cron | webhook | api_event`；当前 V1 已落地 cron/webhook 执行链路，`GithubWebhookAdapter` 仅为 api_event 占位，且 `TriggerService.create/update/toggle` 会对 `api_event` 抛出 preview-only 409，禁止创建、编辑或启用
- REST：`/workflow-definitions/:workflowId/triggers` 提供 create/list/detail/update/delete/toggle/history；RBAC 为读 viewer+、写 creator+
- Public webhook：`POST /api/v1/webhooks/:token`，`AppModule.configure()` 已通过 `TenantMiddleware.exclude()` 放行 `webhooks` 与 `webhooks/{*splat}`
- 验签：`WebhookService.verifySignature()` 使用 `x-agentloom-signature` + `x-agentloom-timestamp`，按 `${timestamp}.${rawBody}` 做 HMAC-SHA256，支持 IP 白名单；验签失败/缺 rawBody/时间戳问题/IP 白名单失败统一在 `WebhookController` 中映射为精确 `401 { error: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' }`
- 历史：`workflow_trigger_history.status` 现包含 `success | failed | skipped | signature_failed`；公开 webhook 验签失败会写入 `signature_failed`，成功/失败继续保留 request body / clientIp payload
- cron：`TriggerSchedulerService` 在 module init 时同步全部 enabled cron trigger 到 `trigger-scheduler` 队列；register/remove 会持久化/清空 `workflow_triggers.next_fire_at`；`TriggerSchedulerProcessor` 通过 `runInTenantTransaction()` 触发执行、写历史并回写 `lastTriggeredAt/triggerCount/nextFireAt`
- 执行：`ExecutionService.runWorkflow()` 现支持内部 `triggerType` override 与 `cron-trigger|webhook-trigger` launch source；cron 执行写入 `triggerType='system'` + `_meta.launchSource='cron-trigger'`，webhook 执行写入 `triggerType='webhook'` + `_meta.launchSource='webhook-trigger'`，并把 webhook request body 透传为 `inputParams`。当调用方使用 `SYSTEM_TRIGGER_USER_ID` 时，`createdBy` 会回退到 `workflow.createdBy` 以满足外键约束；若在租户事务中调用，execution job 会延迟到提交后再 enqueue，且入队失败会把 execution 标记为 `failed`，避免回滚后残留孤儿任务
- Webhook 停用语义：停用的 webhook token 现在直接返回 404；普通 trigger CRUD/list/detail/update/toggle 响应不再暴露 webhook secret，仅创建响应保留一次性明文展示
- DTO 兼容：由于预置 `trigger.dto.ts` 使用了当前 zod 运行时不存在的 `z.string().ip()`，模块现通过 `src/modules/trigger/dto/zod-ip.polyfill.ts` + `src/modules/trigger/trigger-dto.compat.ts` + `src/types/zod-ip-compat.d.ts` 做运行时/类型层兼容，避免直接修改 T1-T3 预置文件

## 数据库 (Drizzle + PostgreSQL)

Schema 在 `src/database/schema/`。23 张表，启用 RLS (`rls-policies.ts`)。`workflow_templates` 表为系统级公共资源（无 RLS、无 tenant_id）。`device_tokens` 表为用户级资源（无 RLS、无 tenant_id，直接通过 user_id 关联）。
关键：`workflowDefinitions` 存储 ReactFlow JSON (JSONB)，含 `metadata` jsonb 列（模板克隆信息等）；`documentChunks` 含 vector 列。
补充：Story 7-5 服务端已完成，`workflow_definitions` 现新增 `input_schema` JSONB；`WorkflowVersionController GET /workflow-definitions/:workflowId/input-schema` 返回 canonical `WorkflowInputSchema`（operator+，未发布 409，空值默认 `{ version:1, collectionMode:'form', fields:[] }`）；`RunWorkflowDto.launchSource` 会被 `ExecutionService` 归并到 `workflow_executions.input_params._meta.launchSource`；模板 seeds 通过 `workflow_templates.definition.inputSchema` 承载示例 schema，并在克隆时复制到 `workflow_definitions.input_schema`。migration `0027_tidy_marauders.sql` 同时补齐了 `workflow_executions` / `execution_steps` 对 authenticated 的 GRANT，以修复 execution RLS 测试路径中的权限缺口。
- **Story 8-6 / 8-6a 已完成自动化收口**: canonical `WorkflowInputSchema` 现同时承载 form baseline 的 `visibility: { fieldId, equals }` 与 8-6a 新增的 `conversationPlan { systemPrompt, maxTurns }` / 字段级 `collectionHint?: string`；`GET/PATCH /workflow-definitions/:id` 继续承担 draft hydrate/persist，`inputSchema.version` 只在逻辑 schema diff 时递增，仍独立于 workflow OCC `version`。`POST /workflow-definitions/:id/run` 接受 `schemaVersion` / `schema_version`，`ExecutionService` 会基于 published schema 做 required/default/visibility/type/unknown-field 校验，并把规范化结果写入 `_meta.launchConfig { workflowId, schemaVersion, collectionMode, resolvedInputs, unresolvedFieldIds, launchSource }`；客户端可以做 staged collection，但 server 仍是 launch normalization 的唯一权威，不信任客户端自报的 unresolved/option semantics。`WorkflowLaunchSchemaVersionMismatchException` 返回 409，`WorkflowLaunchInputValidationException` 返回 422。
迁移命令: `pnpm db:generate` → `pnpm db:migrate`。种子数据: `pnpm db:seed` (5 个预置模板，upsert on slug)。
种子脚本入口: `drizzle/seed/templates.ts`，种子数据: `src/database/seeds/template-seeds.ts`。
模板 `definition` 现与 `workflowDefinitions.definition` 保持同构，`nodes/edges/viewport` 均为必填；公共模板路由在 `AppModule.configure()` 里通过 `TenantMiddleware.exclude({ path: 'templates', method: RequestMethod.ALL }, { path: 'templates/{*splat}', method: RequestMethod.ALL })` 绕过租户中间件。

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
  - 处理链路: `EventBridgeService.emitExecutionStatusChanged()` → `EventEmitter2('execution.status.changed')`，以及 `emitInterventionRequired()` → `EventEmitter2('execution.node.intervention-required')` → `NotificationListener` → `NotificationService.create()` → `NotificationProcessor`
  - 接收人策略: `NotificationListener` 基于 execution + workflow + organization members 联表，向租户内 `owner/admin/creator`（Editor+）批量创建通知，不再只通知执行创建者
  - 载荷约定: `completed` / `failed` / `intervention_required` 通知 body 均包含 `workflowId`、`workflowName`、`executionId`、`timelineUrl`；失败额外含 `errorReason` / `suggestion`，人工介入额外含 `nodeId` / `nodeName` / `interventionReason` / `requestedAt`
- `/knowledge` namespace: document status/kb updates (隐式契约)
- 均使用 `WsJwtGuard` 认证 (blacklist + MFA)

## common/ 目录

| 目录 | 内容 |
|------|------|
| `guards/` | AuthGuard, TenantGuard, RolesGuard, WsJwtGuard |
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
- **Mock**: `vi.hoisted()` + mock factory 函数 (`createMockXxxService`)
- **覆盖率**: 80% 阈值 (V8)，Vitest + SWC
- `test/workflow-version.e2e-spec.ts` 初始化链路较重；为避免全量 E2E 下的冷启动 hook timeout，suite 的 `beforeAll` 明确使用 `30_000ms` timeout，`afterAll` 使用可选关闭保证初始化失败时也能安全清理。

## 环境变量

见 `.env.example`。关键: `APP_DATABASE_URL`, `APP_SUPABASE_*`, `APP_JWT_SECRET`, `APP_REDIS_URL`, `APP_MASTER_ENCRYPTION_KEY`, `APP_MINIO_*`, `APP_QDRANT_URL`, `FIREBASE_SERVICE_ACCOUNT` (可选, FCM 推送通知)

## 复杂度热点

- `node-scheduler.service.ts` (1215L) — DAG 调度核心，条件分支/沙箱/变换/人工介入/介入超时管理，scheduleNode() 捕获 NodeTypeMismatchException 写入结构化错误
- `workflow-version.service.ts` — 版本管理逻辑 + PATCH 更新/OCC 并发控制 + 发布时端口类型兼容性警告 + 列表排序（camelCase + snake_case alias）
- `output-format.service.ts` (529L) — L1-L4 输出格式逐级升级
- `evidence.service.ts` (1582L) — 证据记录 CRUD + 溯源链构建 + chunk content 嵌入 + node_error 证据自动创建
- `execution-response.dto.ts` / `workflow-version.e2e-spec.ts` — Story 6.5 收口补充：执行详情 DTO 已对齐 `errors/typeMismatch` 契约，工作流发布 E2E 已覆盖 `warnings[]` HTTP 路径
- `auth.service.ts` (508L) — 认证全流程

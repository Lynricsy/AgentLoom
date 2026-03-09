# AGENTLOOM SERVER 知识库

NestJS v11 + Fastify v5 后端。多租户 SaaS，六层全局中间件链。

## 入口

`main.ts` → `NestFactory.create(AppModule, FastifyAdapter)` → multipart(50MB) → RedisIoAdapter → prefix `api/v1` → AllExceptionsFilter + ZodValidationPipe → Swagger `/docs` → listen(APP_PORT‖3000)

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
| workflow-def | `modules/workflow-definition/` | 工作流版本 CRUD + 发布/归档/回滚 | — |
| llm | `modules/llm/` | LLM 模型/提供商配置 + catalog | ApiKeyModule |
| mcp | `modules/mcp/` | MCP 服务器 测试/发现/导入 | ApiKeyModule |
| sandbox | `modules/sandbox/` | Docker 沙箱生命周期管理 | BullMQ |
| agent | `modules/agent/` | **六边形架构**: ports/AgentRuntime → InProcess\|Sandbox 适配器 | LlmModule, SandboxModule |
| knowledge | `modules/knowledge/` | RAG: 解析 → 分块 → Qdrant 向量索引 | BullMQ, Qdrant |
| execution | `modules/execution/` | DAG 调度 + 状态机 + BullMQ workers | AgentModule, Socket.IO |
| notification | `modules/notification/` | 用户通知列表/偏好 + BullMQ 分发 + `/notification` WebSocket | BullMQ, EventEmitter |
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
- **超时**: 24h 延迟 BullMQ 任务 (`intervention-timeout:{stepId}`)，到期后 `AgentTaskWorker.handleInterventionTimeout()` 检查 step 是否仍为 `waiting_intervention`；若是则以 `resolved_by_user_id = 'system_timeout'`、`timeout: true` 自动 `reject`
- **API**: `POST /executions/:executionId/steps/:stepId/intervene` (202 Accepted)，Body: `{ action: 'approve'|'modify'|'reject', feedback?, modifiedContent? }`
- **事件载荷**: `InterventionRequiredPayload { stepId, nodeId, nodeName, decision?, partialContent?, requestedAt }`、`InterventionResolvedPayload { stepId, nodeId, action, feedback?, resolvedBy, resolvedAt, timeout? }`
- **结构化内容**: `decision.suggestedContent`、`modifiedContent` 和审计 `instruction` 均允许 `unknown`，worker 会保留结构化内容并在 snapshot/output 恢复时继续透传
- **快照恢复**: `StateReplayService.getExecutionSnapshot()` 现包含 `step.checkpointData`，所以订阅 ACK / 重连快照即可恢复 `waiting_intervention` 面板，无需只依赖 event replay

- DLQ 管理 API: `GET /api/v1/dlq` (分页查询当前租户死信队列)、`POST /api/v1/dlq/:jobId/retry` (重试)、`POST /api/v1/dlq/:jobId/discard` (丢弃)，基于 BullMQ 原生 `getFailed()`/`job.retry()`/`job.remove()`，并校验 `job.data.tenantId` 防止跨租户访问

## BullMQ 队列

| 队列 | 重试 | 用途 |
|------|------|------|
| execution-queue | 1次 | 工作流执行入口 |
| agent-task-queue | 首次执行 + 3次重试 exp (2s base) | 单节点 Agent 任务 |
| notification | 3次 exp (1s base) | 通知分发与 WebSocket 推送 |
| sandbox-lifecycle-queue | 3次 exp | Docker 容器生命周期 |
| document-processing-queue | — | 文档解析 |
| document-indexing-queue | — | Qdrant 向量索引 |

## 数据库 (Drizzle + PostgreSQL)

Schema 在 `src/database/schema/`。20 张表，启用 RLS (`rls-policies.ts`)。
关键：`workflowDefinitions` 存储 ReactFlow JSON (JSONB)，`documentChunks` 含 vector 列。
迁移命令: `pnpm db:generate` → `pnpm db:migrate`。

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
  - 事件: `notification:new`（完整通知记录）、`notification:unread-count`（`{ count }`）
  - 订阅事件: `notification:subscribe` / `notification:unsubscribe`
  - 处理链路: `EventBridgeService.emitExecutionStatusChanged()` → `EventEmitter2('execution.status.changed')` → `NotificationListener` → `NotificationService.create()` → `NotificationProcessor`
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

## 环境变量

见 `.env.example`。关键: `APP_DATABASE_URL`, `APP_SUPABASE_*`, `APP_JWT_SECRET`, `APP_REDIS_URL`, `APP_MASTER_ENCRYPTION_KEY`, `APP_MINIO_*`, `APP_QDRANT_URL`

## 复杂度热点

- `node-scheduler.service.ts` (940L) — DAG 调度核心，条件分支/沙箱/变换/人工介入/介入超时管理
- `workflow-version.service.ts` (555L) — 版本管理逻辑
- `output-format.service.ts` (529L) — L1-L4 输出格式逐级升级
- `mcp.service.ts` (519L) — MCP 协议集成
- `auth.service.ts` (508L) — 认证全流程

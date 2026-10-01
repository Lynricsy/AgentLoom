---
docType: reference
---

# 异步任务队列

服务端的异步任务全部跑在 BullMQ 上，Redis 连接在 `agentloom-server/src/app.module.ts` 的 `BullModule.forRootAsync` 中由 `APP_REDIS_URL` 解析。每个队列由所属模块用 `BullModule.registerQueue` 注册，Worker 类用 `@Processor(<队列常量>)` 绑定。

## 队列清单

<!--@include: ../../_generated/queues.md-->

## 重试与保留策略

下表是每个队列注册时的 `defaultJobOptions`，以及个别 `queue.add(...)` 调用的覆盖值。路径均相对 `agentloom-server/src/modules/`。未写 `backoff` 的队列失败后立即重试；未写 `attempts` 时为 BullMQ 默认值 1（不重试）。`removeOnComplete` / `removeOnFail` 为整数时表示保留的最近任务数。

| 队列 | attempts | backoff | removeOnComplete / removeOnFail | 定义处 | 单次入队的覆盖 |
| --- | --- | --- | --- | --- | --- |
| `workflow-execution` | 1 | — | 1000 / 5000 | `execution/execution.constants.ts`（`EXECUTION_QUEUE_DEFAULT_JOB_OPTIONS`） | `jobId` 为 executionId |
| `agent-task` | 4 | exponential 2000ms | 1000 / 5000 | `execution/execution.constants.ts`（`AGENT_TASK_QUEUE_DEFAULT_JOB_OPTIONS`） | 介入超时任务 attempts 1 + delay（`execution/node-scheduler.service.ts`）；FALLBACK_CHAIN 子 Agent 与回退重排 attempts 1（`execution/node-executors/sub-agent-node.executor.ts`、`execution/agent-task.worker.ts`） |
| `agent-conversation-execution` | 1 | — | 1000 / 5000 | `agent-execution/agent-execution.service.ts`（`AGENT_CONVERSATION_EXECUTION_QUEUE_DEFAULT_JOB_OPTIONS`） | `jobId` 为 conversationId |
| `audit-log-retention` | 1 | — | `{count:10}` / `{count:50}` | `evidence/audit-log-retention.constants.ts` | — |
| `evidence-export` | 3 | — | `{count:20}` / `{count:50}` | `evidence/evidence-export.constants.ts` | `jobId` 为 `evidence-export-<id>`，事务提交后入队（`evidence/evidence-export.service.ts`） |
| `evidence-export-cleanup` | 1 | — | `{count:10}` / `{count:50}` | `evidence/evidence-export.constants.ts` | — |
| `document-processing` | 队列默认 1 | — | 100 / 500 | `knowledge/knowledge.module.ts` | 每次入队都设 attempts `DOCUMENT_PROCESSING_MAX_ATTEMPTS`（3，`knowledge/knowledge.constants.ts`）+ exponential 2000ms（`knowledge/document.service.ts`） |
| `document-indexing` | 1 | — | 100 / 500 | `knowledge/knowledge.module.ts` | — |
| `notification` | 3 | exponential 1000ms | 100 / 500 | `notification/notification.constants.ts` | `jobId` 为 notification id，事务提交后入队 |
| `optimization-analysis` | 1 | — | `{count:10}` / `{count:50}` | `optimization-suggestion/optimization-analysis.constants.ts` | — |
| `plugin-execution` | 3 | exponential 2000ms | 1000 / 5000 | `plugin/plugin.constants.ts`（`pluginExecutionQueueDefaultJobOptions`） | — |
| `earnings-settlement` | 3 | exponential 5000ms | 100 / 500 | `plugin/plugin.constants.ts`（`earningsSettlementQueueDefaultJobOptions`） | — |
| `sandbox-lifecycle` | 3 | exponential 1000ms | 1000 / 5000 | `sandbox/sandbox.module.ts`（内联） | 超时检查、对话空闲结束检查、租约续期均 attempts 1（`sandbox/sandbox-lifecycle.producer.ts`） |
| `routing-learning` | 3 | exponential 2000ms | 100 / 500 | `smart-routing/learning/routing-learning.types.ts` | `jobId` 为 routingDecisionId |
| `trigger-scheduler` | 3 | exponential 2000ms | 100 / 500 | `trigger/trigger.constants.ts` | — |
| `agent-api-maintenance` | 1 | — | 100 / 500 | `agent-api-runtime/agent-api-runtime.constants.ts` | — |

同一队列可能在多个模块中被重复注册（如 `agent-task` 在 `monitoring` 模块中注册用于只读统计、`routing-learning` 在 `smart-routing` 模块中再次注册），这些注册不带 `defaultJobOptions`；生产者所在模块的注册决定默认值。

### `agent-task` 的失败决策

`agent-task` 失败时不直接交给 BullMQ 重试，而由 `decideAgentTaskFailure`（`agentloom-server/src/modules/execution/agent-task-failure-policy.ts`）按以下顺序决定：

1. **retry**：已尝试次数 + 1 小于 `attempts`，交给 BullMQ 按退避重试。
2. **fallback**：非认证失败，且智能路由还有下一个候选模型时，以 attempts 1 重新入队，换用下一个模型。
3. **requeue_recoverable**：失败被判定为运行时可恢复，且累计次数小于 `MAX_RECOVERABLE_RUNTIME_FAILURE_ATTEMPTS`（120）时，延迟 `RECOVERABLE_RUNTIME_FAILURE_REQUEUE_DELAY_MS`（30000ms）重新入队。
4. **fail**：标记失败；任务留在 BullMQ 的 failed 集合，即下文的 DLQ。

## 周期任务

周期任务用 `Queue.upsertJobScheduler` 注册，调度器生成的任务继承队列的 `defaultJobOptions`。

| 队列 | 调度器 id | 周期 | 定义处（相对 `agentloom-server/src/modules/`） |
| --- | --- | --- | --- |
| `audit-log-retention` | `audit-log-retention-daily` | cron `0 3 * * *` UTC | `evidence/audit-log-retention.constants.ts`、`evidence/audit-log-retention.scheduler.ts` |
| `evidence-export-cleanup` | `evidence-export-cleanup-hourly` | cron `0 * * * *` UTC | `evidence/evidence-export.constants.ts`、`evidence/evidence-export.cleanup.scheduler.ts` |
| `optimization-analysis` | `optimization-analysis-weekly` | cron `0 2 * * 1` UTC | `optimization-suggestion/optimization-analysis.scheduler.ts` |
| `earnings-settlement` | `dispatch-plugin-earnings-settlement` | cron `0 3 1 * *` UTC（派发上一自然月的结算） | `plugin/plugin.constants.ts`、`plugin/earnings-settlement.scheduler.ts` |
| `trigger-scheduler` | 每个 cron 触发器一个，id 为 trigger id | 触发器配置的 `expression` 与 `timezone` | `trigger/trigger-scheduler.service.ts` |
| `agent-api-maintenance` | `agent-api-maintenance-sweep` | 每 5 分钟 | `agent-api-runtime/agent-api-runtime.constants.ts`、`agent-api-runtime/agent-api-maintenance.scheduler.ts` |
| `sandbox-lifecycle` | 每个会话一个 `sandbox-workspace-lease-renew-<sessionId>` | 每 60 秒，会话结束时移除 | `sandbox/sandbox-lifecycle.producer.ts` |

## 死信队列（DLQ）

DLQ 不是独立队列，而是 `agent-task` 队列中 BullMQ 的 failed 集合，只覆盖 `agent-task`。管理端点定义在 `agentloom-server/src/modules/execution/execution.controller.ts`，均要求 `owner` 或 `admin`：

| 方法与路径 | 行为 | 成功响应 |
| --- | --- | --- |
| `GET /api/v1/dlq?page=1&limit=20` | 读取 failed 集合，按 `job.data.tenantId` 过滤为当前租户后在内存中分页；每项含 `jobId`、`name`、`data`、`failedReason`、`attemptsMade`、`timestamp`、`finishedOn`、`processedOn` | 200 |
| `POST /api/v1/dlq/:jobId/retry` | 调用 `job.retry()` 重新执行 | 202，`{ data: { jobId, status: 'retrying' } }` |
| `POST /api/v1/dlq/:jobId/discard` | 调用 `job.remove()` 删除 | 200，`{ data: { jobId, status: 'discarded' } }` |

任务不存在或不属于当前租户时返回 404（`DeadLetterJobNotFoundException`，`agentloom-server/src/modules/execution/execution.exceptions.ts`）。实现见 `agentloom-server/src/modules/execution/execution.service.ts`。

其他队列失败的任务同样留在各自的 failed 集合中，保留数量由上表 `removeOnFail` 决定，没有对外的查询或重试端点。

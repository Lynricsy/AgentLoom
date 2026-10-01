/**
 * AppModule 中所有 `BullModule.registerQueue` 注册的队列名。
 *
 * 完全打桩 Redis 的 e2e（`vi.mock('ioredis')` + 覆盖 `BullRegistrar`）用它逐个覆盖
 * `getQueueToken(name)`。`vi.mock` 管不到 bullmq 内部自带的 ioredis：漏掉的队列
 * 是真实 Queue，启动时的调用（如 `AgentApiMaintenanceScheduler.onModuleInit` 的
 * `upsertJobScheduler`）会一直重连 `APP_REDIS_URL`，`beforeAll` 卡到超时。
 * 新增队列时同步加到这里（源头：`grep -rn "registerQueue" src`）。
 */
export const BULLMQ_QUEUE_NAMES = [
  'workflow-execution',
  'agent-task',
  'agent-conversation-execution',
  'agent-api-maintenance',
  'plugin-execution',
  'earnings-settlement',
  'notification',
  'trigger-scheduler',
  'sandbox-lifecycle',
  'optimization-analysis',
  'routing-learning',
  'audit-log-retention',
  'evidence-export',
  'evidence-export-cleanup',
  'document-processing',
  'document-indexing',
] as const;

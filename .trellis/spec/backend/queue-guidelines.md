# Queue Guidelines

> BullMQ patterns, workers, and schedulers in agentloom-server.

---

## Overview

Background jobs use BullMQ with Redis. Each queue has typed job data, centralized constants, a worker (processor), and optionally a scheduler for recurring jobs. Workers must explicitly call `runInTenantTransaction()` since they run outside the HTTP interceptor chain.

---

## Queue Registration

Queues are registered in the module's `imports`:

```typescript
// src/modules/evidence/evidence.module.ts
BullModule.registerQueue({
  name: AUDIT_LOG_RETENTION_QUEUE,
  defaultJobOptions: auditLogRetentionJobOptions,
}),
```

---

## Constants Pattern

Queue names, job names, schedules, and job data types are centralized in `*.constants.ts`:

```typescript
// src/modules/evidence/audit-log-retention.constants.ts
export const AUDIT_LOG_RETENTION_QUEUE = 'audit-log-retention';
export const AUDIT_LOG_RETENTION_JOB_NAME = 'archive-audit-logs';
export const AUDIT_LOG_RETENTION_JOB_ID = 'audit-log-retention-daily';
export const AUDIT_LOG_RETENTION_SCHEDULE = '0 3 * * *';
export const AUDIT_LOG_RETENTION_WINDOW_DAYS = 90;
export const AUDIT_LOG_RETENTION_BATCH_SIZE = 500;

export interface AuditLogRetentionJobData {
  tenantId?: string;
  retentionDays?: number;
  batchSize?: number;
}
```

---

## Job Options Pattern

Default job options defined as `const` objects:

```typescript
export const AGENT_TASK_QUEUE_DEFAULT_JOB_OPTIONS = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
  attempts: 4,
  backoff: { type: 'exponential', delay: 2000 },
} as const;
```

---

## Worker Pattern (Processor)

Workers extend `WorkerHost` and use `@Processor(QUEUE_NAME)`:

```typescript
// src/modules/execution/execution.worker.ts
@Processor(EXECUTION_QUEUE)
export class ExecutionWorker extends WorkerHost {
  private readonly logger = new Logger(ExecutionWorker.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly executionService: ExecutionService,
  ) { super(); }

  async process(job: Job<ExecutionJobData>): Promise<void> {
    const { executionId, tenantId } = job.data;
    await runInTenantTransaction(this.db, tenantId, async () => {
      await this.executionService.initializeSteps(executionId);
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ExecutionJobData>, error: Error): Promise<void> {
    this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
    await this.executionService.markFailed(job.data.executionId, error);
  }
}
```

Key: Workers call `runInTenantTransaction()` explicitly since they run outside the HTTP interceptor chain.

### Reusable Service Calls from Workers

If a worker reuses a service method that internally reads/writes through `tenantDb`,
do not assume that the service is still inside an HTTP request transaction.

Use one of these patterns:

```typescript
// Pattern A: wrap at the worker call site
await runInTenantTransaction(this.db, tenantId, async () => {
  await this.someService.handleTenantScopedWork(id, tenantId);
});

// Pattern B: if the service is shared by HTTP + worker entry points,
// let the service method self-wrap by tenantId.
async handleTenantScopedWork(id: string, tenantId: string): Promise<void> {
  await runInTenantTransaction(this.db, tenantId, async () => {
    // tenantDb-based reads/writes
  });
}
```

Fire-and-forget worker side effects are not exempt. If they depend on `tenantDb`,
they still need an active tenant transaction when they run.

---

## Scheduler Pattern (upsertJobScheduler)

Schedulers use `OnModuleInit` to register recurring jobs:

```typescript
// src/modules/evidence/audit-log-retention.scheduler.ts
@Injectable()
@Dependencies(getQueueToken(AUDIT_LOG_RETENTION_QUEUE))
export class AuditLogRetentionScheduler implements OnModuleInit {
  constructor(private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      AUDIT_LOG_RETENTION_JOB_ID,
      { pattern: AUDIT_LOG_RETENTION_SCHEDULE, tz: 'UTC' },
      {
        name: AUDIT_LOG_RETENTION_JOB_NAME,
        data: {
          retentionDays: AUDIT_LOG_RETENTION_WINDOW_DAYS,
          batchSize: AUDIT_LOG_RETENTION_BATCH_SIZE,
        },
      },
    );
  }
}
```

Note: `@Dependencies(getQueueToken(...))` is used instead of `@InjectQueue()` for scheduler queue injection.

---

## Forbidden Patterns

1. **Missing `runInTenantTransaction()`** in workers — workers are outside the HTTP interceptor chain
2. **Calling tenantDb-based services from workers without a tenant transaction** — shared services do not magically inherit HTTP request context
3. **Hardcoded queue names/schedules** — always centralize in `*.constants.ts`
4. **Untyped job data** — define `JobData` interface in the constants file
5. **`db.transaction()` for tenant-scoped worker ops** — use `runInTenantTransaction(db, tenantId, ...)`
6. **Missing `@OnWorkerEvent('failed')` handler** — always handle failures with logging

---

## Examples

- Worker: `src/modules/execution/execution.worker.ts`
- Scheduler: `src/modules/evidence/audit-log-retention.scheduler.ts`
- Constants: `src/modules/execution/execution.constants.ts`
- Module with queues: `src/modules/evidence/evidence.module.ts`

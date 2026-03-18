import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUDIT_LOG_RETENTION_BATCH_SIZE,
  AUDIT_LOG_RETENTION_JOB_ID,
  AUDIT_LOG_RETENTION_JOB_NAME,
  AUDIT_LOG_RETENTION_QUEUE,
  AUDIT_LOG_RETENTION_SCHEDULE,
  AUDIT_LOG_RETENTION_WINDOW_DAYS,
} from '../audit-log-retention.constants';
import { AuditLogRetentionScheduler } from '../audit-log-retention.scheduler';

describe('AuditLogRetentionScheduler', () => {
  const queue = {
    upsertJobScheduler: vi.fn(),
  };

  let scheduler: AuditLogRetentionScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = new AuditLogRetentionScheduler(queue as never);
  });

  it('should register the singleton retention scheduler on module init', async () => {
    await scheduler.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      AUDIT_LOG_RETENTION_JOB_ID,
      {
        pattern: AUDIT_LOG_RETENTION_SCHEDULE,
        tz: 'UTC',
      },
      {
        name: AUDIT_LOG_RETENTION_JOB_NAME,
        data: {
          retentionDays: AUDIT_LOG_RETENTION_WINDOW_DAYS,
          batchSize: AUDIT_LOG_RETENTION_BATCH_SIZE,
        },
      },
    );
  });

  it('should keep queue token constants stable for module wiring', () => {
    expect(AUDIT_LOG_RETENTION_QUEUE).toBe('audit-log-retention');
  });
});

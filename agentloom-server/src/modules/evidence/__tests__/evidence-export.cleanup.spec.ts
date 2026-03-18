import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { evidenceExportJobs } from '../../../database/schema';
import {
  EVIDENCE_EXPORT_CLEANUP_BATCH_SIZE,
  EVIDENCE_EXPORT_CLEANUP_JOB_ID,
  EVIDENCE_EXPORT_CLEANUP_JOB_NAME,
  EVIDENCE_EXPORT_CLEANUP_QUEUE,
  EVIDENCE_EXPORT_CLEANUP_SCHEDULE,
} from '../evidence-export.constants';
import { EvidenceExportCleanupScheduler } from '../evidence-export.cleanup.scheduler';
import { EvidenceExportCleanupWorker } from '../evidence-export.cleanup.worker';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-4000-8000-000000000002';
const CUTOFF = new Date('2026-03-17T00:00:00.000Z');

function createExportJob(
  overrides: Partial<{
    id: string;
    tenantId: string;
    status: 'completed' | 'failed' | 'expired';
    storageKey: string | null;
    expiresAt: Date;
  }> = {},
) {
  return {
    id: overrides.id ?? '00000000-0000-4000-8000-000000000300',
    tenantId: overrides.tenantId ?? TENANT_ID,
    requestedBy: 'user-1',
    status: overrides.status ?? 'completed',
    filters: {
      workflowId: 'workflow-1',
      executionIds: ['exec-1'],
      includeAuditMetadata: true,
    },
    storageKey:
      'storageKey' in overrides
        ? (overrides.storageKey ?? null)
        : 'evidence-exports/00000000-0000-4000-8000-000000000001/evidence-export-a.zip',
    artifactFormat: 'zip',
    fileName: 'evidence-export-a.zip',
    mimeType: 'application/zip',
    matchedExecutionCount: 1,
    expiresAt: overrides.expiresAt ?? new Date('2026-03-16T23:00:00.000Z'),
    requestedAt: new Date('2026-03-16T10:00:00.000Z'),
    completedAt: new Date('2026-03-16T11:00:00.000Z'),
    failedAt: null,
    lastError: overrides.status === 'failed' ? 'previous failure' : null,
    createdAt: new Date('2026-03-16T10:00:00.000Z'),
    updatedAt: new Date('2026-03-16T11:00:00.000Z'),
  };
}

function createSelectBatch(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });

  return {
    select: vi.fn().mockReturnValue({ from }),
    from,
    where,
    orderBy,
    limit,
  };
}

function createUpdateRecorder() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });

  return {
    update,
    set,
    where,
  };
}

function createMockDb(selectBatch: ReturnType<typeof createSelectBatch>) {
  const updateRecorder = createUpdateRecorder();

  return {
    select: selectBatch.select,
    update: updateRecorder.update,
    _updateRecorder: updateRecorder,
  };
}

function createMockStorageService() {
  return {
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockAuditLogService() {
  return {
    record: vi.fn().mockResolvedValue(undefined),
  };
}

describe('EvidenceExportCleanupScheduler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should register the hourly cleanup scheduler with the cleanup queue defaults', async () => {
    const queue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    };
    const scheduler = new EvidenceExportCleanupScheduler(queue as never);

    await scheduler.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      EVIDENCE_EXPORT_CLEANUP_JOB_ID,
      {
        pattern: EVIDENCE_EXPORT_CLEANUP_SCHEDULE,
        tz: 'UTC',
      },
      {
        name: EVIDENCE_EXPORT_CLEANUP_JOB_NAME,
        data: {
          batchSize: EVIDENCE_EXPORT_CLEANUP_BATCH_SIZE,
        },
      },
    );
  });
});

describe('EvidenceExportCleanupWorker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should delete expired artifacts, mark jobs expired, and audit the cleanup without touching audit rows', async () => {
    const firstJob = createExportJob({
      id: '00000000-0000-4000-8000-000000000301',
      storageKey: 'evidence-exports/tenant/export-301.zip',
    });
    const secondJob = createExportJob({
      id: '00000000-0000-4000-8000-000000000302',
      tenantId: OTHER_TENANT_ID,
      status: 'failed',
      storageKey: null,
    });
    const selectBatch = createSelectBatch([firstJob, secondJob]);
    const db = createMockDb(selectBatch);
    const storageService = createMockStorageService();
    const auditLogService = createMockAuditLogService();
    const worker = new EvidenceExportCleanupWorker(
      db as never,
      storageService as never,
      auditLogService as never,
    );

    const expiredCount = await (worker as any).expireEligibleExportsBatch(
      CUTOFF,
      25,
    );

    expect(expiredCount).toBe(2);
    expect(storageService.delete).toHaveBeenCalledTimes(1);
    expect(storageService.delete).toHaveBeenCalledWith(firstJob.storageKey);
    expect(db.update).toHaveBeenCalledTimes(2);
    expect(db.update).toHaveBeenCalledWith(evidenceExportJobs);
    expect(db._updateRecorder.set).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        status: 'expired',
        storageKey: null,
      }),
    );
    expect(db._updateRecorder.set).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'expired',
        storageKey: null,
      }),
    );
    expect(auditLogService.record).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorType: 'system',
        eventType: 'evidence.export.expired',
        resourceId: firstJob.id,
        metadata: expect.objectContaining({
          cleanup: true,
          hadArtifact: true,
        }),
      }),
    );
    expect(auditLogService.record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tenantId: OTHER_TENANT_ID,
        actorType: 'system',
        eventType: 'evidence.export.expired',
        resourceId: secondJob.id,
        metadata: expect.objectContaining({
          cleanup: true,
          hadArtifact: false,
        }),
      }),
    );
  });

  it('should return 0 and skip delete/update work when there are no eligible exports', async () => {
    const selectBatch = createSelectBatch([]);
    const db = createMockDb(selectBatch);
    const storageService = createMockStorageService();
    const auditLogService = createMockAuditLogService();
    const worker = new EvidenceExportCleanupWorker(
      db as never,
      storageService as never,
      auditLogService as never,
    );

    const expiredCount = await (worker as any).expireEligibleExportsBatch(
      CUTOFF,
      25,
      TENANT_ID,
    );

    expect(expiredCount).toBe(0);
    expect(storageService.delete).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('should leave the export active and emit cleanup failure audit when artifact deletion fails', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const exportJob = createExportJob({
      id: '00000000-0000-4000-8000-000000000303',
      storageKey: 'evidence-exports/tenant/export-303.zip',
    });
    const selectBatch = createSelectBatch([exportJob]);
    const db = createMockDb(selectBatch);
    const storageService = {
      delete: vi.fn().mockRejectedValue(new Error('MinIO unavailable')),
    };
    const auditLogService = createMockAuditLogService();
    const worker = new EvidenceExportCleanupWorker(
      db as never,
      storageService as never,
      auditLogService as never,
    );

    const expiredCount = await (worker as any).expireEligibleExportsBatch(
      CUTOFF,
      25,
    );

    expect(expiredCount).toBe(0);
    expect(db.update).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorType: 'system',
        eventType: 'evidence.export.cleanup.failed',
        resourceId: exportJob.id,
        metadata: expect.objectContaining({
          error: 'MinIO unavailable',
          hadArtifact: true,
        }),
      }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Failed to clean up evidence export ${exportJob.id}`),
    );
  });
});

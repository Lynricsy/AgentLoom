import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  StorageKeyInvalidException,
  StorageObjectNotFoundException,
  StorageUnavailableException,
} from '../../../infrastructure/storage/storage.exceptions';
import {
  EVIDENCE_EXPORT_ARTIFACT_FORMAT,
  EVIDENCE_EXPORT_DOWNLOAD_URL_TTL_SECONDS,
} from '../evidence-export.constants';
import {
  EvidenceExportArtifactNotFoundException,
  EvidenceExportArtifactNotReadyException,
  EvidenceExportArtifactUnavailableException,
  EvidenceExportExpiredException,
  EvidenceExportNotFoundException,
  EvidenceExportWorkloadLimitExceededException,
} from '../evidence-export.exceptions';
import { EvidenceExportService } from '../evidence-export.service';

const mocks = vi.hoisted(() => ({
  getTenantDb: vi.fn(),
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ACTOR_ID = '00000000-0000-4000-8000-000000000002';
const WORKFLOW_ID = '00000000-0000-4000-8000-000000000003';

function createSelectChain<T>(result: T) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockResolvedValue(result);

  return chain;
}

function createInsertReturning(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });

  return { insert, values, returning };
}

function createMockDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
}

function createMockAuditLogService() {
  return {
    record: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockQueue() {
  return {
    add: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockStorageService() {
  return {
    getPresignedUrl: vi.fn(),
  };
}

function createUpdateChain(result?: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });

  return { update, set, where };
}

function createExportJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'export-1',
    tenantId: TENANT_ID,
    requestedBy: ACTOR_ID,
    status: 'completed',
    filters: { workflowId: WORKFLOW_ID },
    storageKey: 'exports/evidence-export-1.zip',
    artifactFormat: EVIDENCE_EXPORT_ARTIFACT_FORMAT,
    fileName: 'evidence-export-1.zip',
    mimeType: 'application/zip',
    matchedExecutionCount: 2,
    expiresAt: new Date('2026-03-20T00:00:00.000Z'),
    requestedAt: new Date('2026-03-17T00:00:00.000Z'),
    completedAt: new Date('2026-03-17T00:05:00.000Z'),
    failedAt: null,
    lastError: null,
    createdAt: new Date('2026-03-17T00:00:00.000Z'),
    updatedAt: new Date('2026-03-17T00:05:00.000Z'),
    ...overrides,
  };
}

describe('EvidenceExportService', () => {
  let tenantDb: ReturnType<typeof createMockDb>;
  let auditLogService: ReturnType<typeof createMockAuditLogService>;
  let exportQueue: ReturnType<typeof createMockQueue>;
  let storageService: ReturnType<typeof createMockStorageService>;
  let service: EvidenceExportService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T00:00:00.000Z'));

    tenantDb = createMockDb();
    auditLogService = createMockAuditLogService();
    exportQueue = createMockQueue();
    storageService = createMockStorageService();

    mocks.getTenantDb.mockReturnValue(tenantDb);

    service = new EvidenceExportService(
      {} as never,
      auditLogService as never,
      exportQueue as never,
      storageService as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a queued export job and enqueue worker when executions are matched', async () => {
    tenantDb.select.mockReturnValueOnce(
      createSelectChain([{ id: 'exec-1' }, { id: 'exec-2' }]),
    );

    const insertReturning = createInsertReturning([
      {
        id: 'export-1',
        tenantId: TENANT_ID,
        requestedBy: ACTOR_ID,
        status: 'queued',
        filters: {
          workflowId: WORKFLOW_ID,
          executionIds: ['exec-1', 'exec-2'],
        },
        artifactFormat: EVIDENCE_EXPORT_ARTIFACT_FORMAT,
        matchedExecutionCount: 2,
      },
    ]);
    tenantDb.insert.mockImplementation(insertReturning.insert);

    await expect(
      service.requestExport({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        filters: { workflowId: WORKFLOW_ID },
      }),
    ).resolves.toMatchObject({
      id: 'export-1',
      status: 'queued',
      matchedExecutionCount: 2,
      artifactFormat: EVIDENCE_EXPORT_ARTIFACT_FORMAT,
    });

    expect(insertReturning.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        requestedBy: ACTOR_ID,
        status: 'queued',
        filters: {
          workflowId: WORKFLOW_ID,
          executionIds: ['exec-1', 'exec-2'],
        },
        matchedExecutionCount: 2,
        artifactFormat: EVIDENCE_EXPORT_ARTIFACT_FORMAT,
      }),
    );
    // 这是 BullMQ 5 jobId 契约的回归断言，修正的是曾导致生产 500 的错误冒号格式。
    expect(exportQueue.add.mock.calls[0]?.[2]?.jobId).not.toContain(':');
    expect(exportQueue.add).toHaveBeenCalledWith(
      expect.stringContaining('evidence-export'),
      expect.objectContaining({
        tenantId: TENANT_ID,
        exportId: 'export-1',
      }),
      expect.objectContaining({
        jobId: 'evidence-export-export-1',
      }),
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        actorType: 'user',
        eventType: 'evidence.export.requested',
        resourceType: 'evidence_export_job',
        resourceId: 'export-1',
      }),
    );
  });

  it('should complete zero-hit exports without enqueueing a worker', async () => {
    tenantDb.select.mockReturnValueOnce(createSelectChain([]));

    const insertReturning = createInsertReturning([
      {
        id: 'export-2',
        tenantId: TENANT_ID,
        requestedBy: ACTOR_ID,
        status: 'completed',
        filters: { workflowId: WORKFLOW_ID, executionIds: [] },
        artifactFormat: EVIDENCE_EXPORT_ARTIFACT_FORMAT,
        matchedExecutionCount: 0,
        storageKey: null,
        completedAt: new Date('2026-03-17T12:00:00.000Z'),
      },
    ]);
    tenantDb.insert.mockImplementation(insertReturning.insert);

    await expect(
      service.requestExport({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        filters: { workflowId: WORKFLOW_ID },
      }),
    ).resolves.toMatchObject({
      id: 'export-2',
      status: 'completed',
      matchedExecutionCount: 0,
    });

    expect(exportQueue.add).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: 'evidence.export.requested',
        resourceId: 'export-2',
      }),
    );
    expect(auditLogService.record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: 'evidence.export.completed',
        resourceId: 'export-2',
        metadata: expect.objectContaining({
          matchedExecutionCount: 0,
          generatedArtifact: false,
        }),
      }),
    );
  });

  it('should reject workloads larger than the configured execution limit and audit the rejection', async () => {
    tenantDb.select.mockReturnValueOnce(
      createSelectChain(
        Array.from({ length: 101 }, (_, index) => ({
          id: `exec-${index + 1}`,
        })),
      ),
    );

    await expect(
      service.requestExport({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        filters: { workflowId: WORKFLOW_ID },
      }),
    ).rejects.toBeInstanceOf(EvidenceExportWorkloadLimitExceededException);

    expect(tenantDb.insert).not.toHaveBeenCalled();
    expect(exportQueue.add).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        actorType: 'user',
        eventType: 'evidence.export.rejected',
        resourceType: 'evidence_export_job',
        resourceId: 'pending',
        metadata: expect.objectContaining({
          matchedExecutionCount: 101,
        }),
      }),
    );
  });

  it('should derive frozen execution snapshots from audit log filters across hot and archive recall', async () => {
    tenantDb.select
      .mockReturnValueOnce(
        createSelectChain([
          {
            executionId: 'exec-3',
            matchedAt: new Date('2026-03-16T09:00:00.000Z'),
            auditId: 'audit-hot-1',
          },
          {
            executionId: 'exec-2',
            matchedAt: new Date('2026-03-16T11:00:00.000Z'),
            auditId: 'audit-hot-2',
          },
        ]),
      )
      .mockReturnValueOnce(
        createSelectChain([
          {
            executionId: 'exec-3',
            matchedAt: new Date('2026-03-16T08:00:00.000Z'),
            auditId: 'audit-archive-1',
          },
          {
            executionId: 'exec-4',
            matchedAt: new Date('2026-03-16T10:30:00.000Z'),
            auditId: 'audit-archive-2',
          },
        ]),
      );

    const insertReturning = createInsertReturning([
      {
        id: 'export-audit-filters',
        tenantId: TENANT_ID,
        requestedBy: ACTOR_ID,
        status: 'queued',
        filters: {
          workflowId: WORKFLOW_ID,
          eventType: 'execution.node.failed',
          resourceType: 'execution_step',
          actorType: 'user',
          from: '2026-03-16T00:00:00.000Z',
          to: '2026-03-17T00:00:00.000Z',
          executionIds: ['exec-3', 'exec-4', 'exec-2'],
        },
        artifactFormat: EVIDENCE_EXPORT_ARTIFACT_FORMAT,
        matchedExecutionCount: 3,
      },
    ]);
    tenantDb.insert.mockImplementation(insertReturning.insert);

    await expect(
      service.requestExport({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        filters: {
          workflowId: WORKFLOW_ID,
          eventType: 'execution.node.failed',
          resourceType: 'execution_step',
          actorType: 'user',
          from: '2026-03-16T00:00:00.000Z',
          to: '2026-03-17T00:00:00.000Z',
        },
      }),
    ).resolves.toMatchObject({
      id: 'export-audit-filters',
      status: 'queued',
      matchedExecutionCount: 3,
    });

    expect(insertReturning.values).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: {
          workflowId: WORKFLOW_ID,
          eventType: 'execution.node.failed',
          resourceType: 'execution_step',
          actorType: 'user',
          from: '2026-03-16T00:00:00.000Z',
          to: '2026-03-17T00:00:00.000Z',
          executionIds: ['exec-3', 'exec-4', 'exec-2'],
        },
        matchedExecutionCount: 3,
      }),
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'evidence.export.requested',
        resourceId: 'export-audit-filters',
        metadata: expect.objectContaining({
          filters: expect.objectContaining({
            executionIds: ['exec-3', 'exec-4', 'exec-2'],
          }),
          matchedExecutionCount: 3,
        }),
      }),
    );
    expect(tenantDb.select).toHaveBeenCalledTimes(2);
  });

  it('should throw a domain not found exception when the export job does not exist', async () => {
    tenantDb.select.mockReturnValueOnce(createSelectChain([]));

    await expect(
      service.getDownloadDetail({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        exportId: 'missing-export',
      }),
    ).rejects.toBeInstanceOf(EvidenceExportNotFoundException);

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        eventType: 'evidence.export.download.not_found',
        resourceId: 'missing-export',
      }),
    );
  });

  it('should issue a short-lived download url for completed exports and audit the action', async () => {
    tenantDb.select.mockReturnValueOnce(createSelectChain([createExportJob()]));
    storageService.getPresignedUrl.mockResolvedValue(
      'https://signed.example/export-1',
    );

    await expect(
      service.getDownloadDetail({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        exportId: 'export-1',
      }),
    ).resolves.toEqual({
      url: 'https://signed.example/export-1',
      fileName: 'evidence-export-1.zip',
      mimeType: 'application/zip',
      expiresAt: '2026-03-17T00:15:00.000Z',
      expiresIn: EVIDENCE_EXPORT_DOWNLOAD_URL_TTL_SECONDS,
    });

    expect(storageService.getPresignedUrl).toHaveBeenCalledWith(
      'exports/evidence-export-1.zip',
      EVIDENCE_EXPORT_DOWNLOAD_URL_TTL_SECONDS,
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'evidence.export.download.issued',
        resourceId: 'export-1',
        metadata: expect.objectContaining({
          expiresIn: EVIDENCE_EXPORT_DOWNLOAD_URL_TTL_SECONDS,
        }),
      }),
    );
  });

  it('should reject download detail for exports that are not completed yet', async () => {
    tenantDb.select.mockReturnValueOnce(
      createSelectChain([createExportJob({ status: 'running' })]),
    );

    await expect(
      service.getDownloadDetail({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        exportId: 'export-1',
      }),
    ).rejects.toBeInstanceOf(EvidenceExportArtifactNotReadyException);

    expect(storageService.getPresignedUrl).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'evidence.export.download.not_ready',
        resourceId: 'export-1',
        metadata: expect.objectContaining({
          status: 'running',
        }),
      }),
    );
  });

  it('should mark expired exports and throw a domain expired exception', async () => {
    tenantDb.select.mockReturnValueOnce(
      createSelectChain([
        createExportJob({ expiresAt: new Date('2026-03-16T23:59:00.000Z') }),
      ]),
    );
    const updateChain = createUpdateChain();
    tenantDb.update.mockImplementation(updateChain.update);

    await expect(
      service.getDownloadDetail({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        exportId: 'export-1',
      }),
    ).rejects.toBeInstanceOf(EvidenceExportExpiredException);

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'expired',
      }),
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'evidence.export.download.expired',
        resourceId: 'export-1',
      }),
    );
  });

  it('should map missing export artifacts to a domain not found exception', async () => {
    tenantDb.select.mockReturnValueOnce(
      createSelectChain([createExportJob({ storageKey: null })]),
    );

    await expect(
      service.getDownloadDetail({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        exportId: 'export-1',
      }),
    ).rejects.toBeInstanceOf(EvidenceExportArtifactNotFoundException);

    expect(storageService.getPresignedUrl).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'evidence.export.download.missing',
        resourceId: 'export-1',
      }),
    );
  });

  it('should map storage object errors to a domain not found exception', async () => {
    tenantDb.select.mockReturnValueOnce(createSelectChain([createExportJob()]));
    storageService.getPresignedUrl.mockRejectedValue(
      new StorageObjectNotFoundException('exports/evidence-export-1.zip'),
    );

    await expect(
      service.getDownloadDetail({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        exportId: 'export-1',
      }),
    ).rejects.toBeInstanceOf(EvidenceExportArtifactNotFoundException);

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'evidence.export.download.missing',
        resourceId: 'export-1',
      }),
    );
  });

  it('should map invalid storage keys to a domain not found exception', async () => {
    tenantDb.select.mockReturnValueOnce(createSelectChain([createExportJob()]));
    storageService.getPresignedUrl.mockRejectedValue(
      new StorageKeyInvalidException(),
    );

    await expect(
      service.getDownloadDetail({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        exportId: 'export-1',
      }),
    ).rejects.toBeInstanceOf(EvidenceExportArtifactNotFoundException);
  });

  it('should map storage outages to a domain unavailable exception', async () => {
    tenantDb.select.mockReturnValueOnce(createSelectChain([createExportJob()]));
    storageService.getPresignedUrl.mockRejectedValue(
      new StorageUnavailableException(
        'getPresignedUrl',
        'exports/evidence-export-1.zip',
        new Error('minio down'),
      ),
    );

    await expect(
      service.getDownloadDetail({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        exportId: 'export-1',
      }),
    ).rejects.toBeInstanceOf(EvidenceExportArtifactUnavailableException);

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'evidence.export.download.unavailable',
        resourceId: 'export-1',
      }),
    );
  });

  it('should refresh download urls with a retention-clipped expiry and audit the reissue', async () => {
    tenantDb.select.mockReturnValueOnce(
      createSelectChain([
        createExportJob({ expiresAt: new Date('2026-03-17T00:10:00.000Z') }),
      ]),
    );
    storageService.getPresignedUrl.mockResolvedValue(
      'https://signed.example/export-1?refresh=1',
    );

    await expect(
      service.refreshDownloadDetail({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        exportId: 'export-1',
      }),
    ).resolves.toEqual({
      url: 'https://signed.example/export-1?refresh=1',
      fileName: 'evidence-export-1.zip',
      mimeType: 'application/zip',
      expiresAt: '2026-03-17T00:10:00.000Z',
      expiresIn: 600,
    });

    expect(storageService.getPresignedUrl).toHaveBeenCalledWith(
      'exports/evidence-export-1.zip',
      600,
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'evidence.export.download.refreshed',
        resourceId: 'export-1',
        metadata: expect.objectContaining({
          expiresIn: 600,
          refresh: true,
        }),
      }),
    );
  });

  it('should preserve refresh metadata when download detail is requested for a missing export job during refresh', async () => {
    tenantDb.select.mockReturnValueOnce(createSelectChain([]));

    await expect(
      service.refreshDownloadDetail({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        exportId: 'missing-export',
      }),
    ).rejects.toBeInstanceOf(EvidenceExportNotFoundException);

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'evidence.export.download.not_found',
        resourceId: 'missing-export',
        metadata: expect.objectContaining({
          refresh: true,
        }),
      }),
    );
  });
  it('persists every direct filter in a frozen audit-recall snapshot', async () => {
    const matchedAt = new Date('2026-03-16T09:00:00.000Z');
    tenantDb.select
      .mockReturnValueOnce(
        createSelectChain([
          {
            executionId: 'exec-2',
            matchedAt,
            auditId: 'audit-b',
          },
        ]),
      )
      .mockReturnValueOnce(
        createSelectChain([
          {
            executionId: 'exec-1',
            matchedAt,
            auditId: 'audit-a',
          },
          {
            executionId: 'exec-2',
            matchedAt,
            auditId: 'audit-c',
          },
        ]),
      );
    const insertReturning = createInsertReturning([
      createExportJob({
        id: 'export-all-filters',
        status: 'queued',
        matchedExecutionCount: 2,
      }),
    ]);
    tenantDb.insert.mockImplementation(insertReturning.insert);

    const filters = {
      workflowId: WORKFLOW_ID,
      executionIds: ['exec-1', 'exec-2'],
      eventType: 'execution.failed',
      resourceType: 'execution',
      resourceId: 'resource-1',
      actorType: 'service' as const,
      actorId: 'service-1',
      from: '2026-03-16T00:00:00.000Z',
      to: '2026-03-17T00:00:00.000Z',
    };

    await service.requestExport({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      filters,
    });

    expect(insertReturning.values).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'queued',
        filters: {
          ...filters,
          executionIds: ['exec-1', 'exec-2'],
        },
        matchedExecutionCount: 2,
      }),
    );
    expect(exportQueue.add).toHaveBeenCalledWith(
      expect.any(String),
      { exportId: 'export-all-filters', tenantId: TENANT_ID },
      expect.any(Object),
    );
  });

  it('fails safely when persistence does not return the created export job', async () => {
    tenantDb.select.mockReturnValueOnce(createSelectChain([{ id: 'exec-1' }]));
    const insertReturning = createInsertReturning([]);
    tenantDb.insert.mockImplementation(insertReturning.insert);

    await expect(
      service.requestExport({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        filters: {},
      }),
    ).rejects.toThrow('Failed to create evidence export job');

    expect(auditLogService.record).not.toHaveBeenCalled();
    expect(exportQueue.add).not.toHaveBeenCalled();
  });

  it('reports completed jobs without retention metadata as unavailable', async () => {
    tenantDb.select.mockReturnValueOnce(
      createSelectChain([createExportJob({ expiresAt: null })]),
    );

    await expect(
      service.getDownloadDetail({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        exportId: 'export-1',
      }),
    ).rejects.toBeInstanceOf(EvidenceExportArtifactUnavailableException);

    expect(storageService.getPresignedUrl).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'evidence.export.download.unavailable',
        metadata: {
          refresh: false,
          reason: 'missing_retention_expiry',
        },
      }),
    );
  });

  it('uses stable archive defaults when optional artifact labels are absent', async () => {
    tenantDb.select.mockReturnValueOnce(
      createSelectChain([
        createExportJob({
          fileName: null,
          mimeType: null,
        }),
      ]),
    );
    storageService.getPresignedUrl.mockResolvedValue('https://signed/default');

    await expect(
      service.getDownloadDetail({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        exportId: 'export-1',
      }),
    ).resolves.toMatchObject({
      url: 'https://signed/default',
      fileName: 'evidence-export.zip',
      mimeType: 'application/zip',
    });
  });

  it('does not disguise unexpected storage failures as domain errors', async () => {
    const storageError = new Error('signature implementation failed');
    tenantDb.select.mockReturnValueOnce(createSelectChain([createExportJob()]));
    storageService.getPresignedUrl.mockRejectedValue(storageError);

    await expect(
      service.getDownloadDetail({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        exportId: 'export-1',
      }),
    ).rejects.toBe(storageError);

    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('returns export jobs through the tenant-scoped lookup contract', async () => {
    const job = createExportJob();
    tenantDb.select.mockReturnValueOnce(createSelectChain([job]));

    await expect(service.findById(TENANT_ID, 'export-1')).resolves.toBe(job);
  });
});

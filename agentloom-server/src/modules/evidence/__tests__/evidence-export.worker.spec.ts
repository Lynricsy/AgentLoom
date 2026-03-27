import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EVIDENCE_EXPORT_ARCHIVE_MIME_TYPE,
  EVIDENCE_EXPORT_ARTIFACT_FORMAT,
  EVIDENCE_EXPORT_BUNDLE_DATA_PATH,
  EVIDENCE_EXPORT_BUNDLE_MANIFEST_PATH,
  EVIDENCE_EXPORT_BUNDLE_REPORT_PATH,
  buildEvidenceExportArchiveFileName,
  buildEvidenceExportStorageKey,
} from '../evidence-export.constants';
import { EvidenceExportWorker } from '../evidence-export.worker';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ACTOR_ID = '00000000-0000-4000-8000-000000000002';

function createSelectWithLimit(result: unknown) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(result);

  return chain;
}

function createOrderedSelect(result: unknown) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockResolvedValue(result);

  return chain;
}

function createUpdateRecorder() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });

  return { update, set, where };
}

function createMockDb() {
  return {
    select: vi.fn(),
    update: vi.fn(),
  };
}

function createMockEvidenceService() {
  return {
    buildChain: vi.fn(),
  };
}

function createMockStorageService() {
  return {
    upload: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockAuditLogService() {
  return {
    record: vi.fn().mockResolvedValue(undefined),
  };
}

function createExportJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'export-1',
    tenantId: TENANT_ID,
    requestedBy: ACTOR_ID,
    status: 'queued',
    filters: {
      workflowId: '00000000-0000-4000-8000-000000000010',
      executionIds: ['exec-1', 'exec-2'],
      includeAuditMetadata: true,
    },
    storageKey: null,
    artifactFormat: EVIDENCE_EXPORT_ARTIFACT_FORMAT,
    fileName: null,
    mimeType: null,
    matchedExecutionCount: 2,
    expiresAt: new Date('2026-03-20T00:00:00.000Z'),
    requestedAt: new Date('2026-03-17T00:00:00.000Z'),
    completedAt: null,
    failedAt: null,
    lastError: null,
    createdAt: new Date('2026-03-17T00:00:00.000Z'),
    updatedAt: new Date('2026-03-17T00:00:00.000Z'),
    ...overrides,
  };
}

function createChainResult(
  totalNodes: number,
  integrityIssues: unknown[] = [],
) {
  return {
    cached: false,
    response: {
      roots: [],
      chainCompleteness: 1,
      totalNodes,
      integrityStatus: {
        chainCompleteness: 1,
        totalNodes,
        nodesWithPhysicalLocation: totalNodes,
        completenessLabel: 'complete',
        integrityIssues,
      },
      cachedAt: null,
    },
  };
}

function createAuditLogEntry(
  id: string,
  executionId: string,
  createdAt: string,
  eventType = 'evidence.export.requested',
) {
  return {
    id,
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    actorType: 'user' as const,
    eventType,
    resourceType: 'evidence_export_job',
    resourceId: 'export-1',
    executionId,
    summary: `event-${id}`,
    before: null,
    after: null,
    metadata: { source: 'worker-test' },
    createdAt: new Date(createdAt),
  };
}

describe('EvidenceExportWorker', () => {
  let db: ReturnType<typeof createMockDb>;
  let evidenceService: ReturnType<typeof createMockEvidenceService>;
  let storageService: ReturnType<typeof createMockStorageService>;
  let auditLogService: ReturnType<typeof createMockAuditLogService>;
  let worker: EvidenceExportWorker;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T00:05:00.000Z'));

    db = createMockDb();
    evidenceService = createMockEvidenceService();
    storageService = createMockStorageService();
    auditLogService = createMockAuditLogService();
    worker = new EvidenceExportWorker(
      db as never,
      evidenceService as never,
      storageService as never,
      auditLogService as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should generate a zip artifact, upload it, and complete the export job using the frozen execution snapshot', async () => {
    vi.useRealTimers();

    const exportJob = createExportJob();
    const updateRecorder = createUpdateRecorder();
    db.update.mockImplementation(updateRecorder.update);
    db.select
      .mockReturnValueOnce(createSelectWithLimit([exportJob]))
      .mockReturnValueOnce(
        createOrderedSelect([
          createAuditLogEntry('hot-1', 'exec-1', '2026-03-17T00:00:30.000Z'),
        ]),
      )
      .mockReturnValueOnce(
        createOrderedSelect([
          createAuditLogEntry(
            'archive-1',
            'exec-1',
            '2026-03-16T23:59:30.000Z',
            'workflow.export.started',
          ),
        ]),
      )
      .mockReturnValueOnce(
        createOrderedSelect([
          createAuditLogEntry('hot-2', 'exec-2', '2026-03-17T00:01:30.000Z'),
        ]),
      )
      .mockReturnValueOnce(createOrderedSelect([]));

    evidenceService.buildChain
      .mockResolvedValueOnce(
        createChainResult(2, [
          {
            issueType: 'source_unavailable',
            evidenceId: 'evidence-1',
            message: 'source missing',
          },
        ]),
      )
      .mockResolvedValueOnce(createChainResult(1));

    await expect(
      worker.process({
        data: {
          tenantId: TENANT_ID,
          exportId: 'export-1',
        },
      } as never),
    ).resolves.toBeUndefined();

    expect(evidenceService.buildChain).toHaveBeenNthCalledWith(
      1,
      TENANT_ID,
      'exec-1',
      undefined,
      { bypassCache: true },
    );
    expect(evidenceService.buildChain).toHaveBeenNthCalledWith(
      2,
      TENANT_ID,
      'exec-2',
      undefined,
      { bypassCache: true },
    );

    expect(updateRecorder.set).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        status: 'running',
        failedAt: null,
        lastError: null,
      }),
    );

    const expectedStorageKey = buildEvidenceExportStorageKey(
      TENANT_ID,
      'export-1',
    );
    const expectedFileName = buildEvidenceExportArchiveFileName('export-1');
    expect(updateRecorder.set).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'completed',
        storageKey: expectedStorageKey,
        fileName: expectedFileName,
        mimeType: EVIDENCE_EXPORT_ARCHIVE_MIME_TYPE,
        lastError: null,
      }),
    );

    expect(storageService.upload).toHaveBeenCalledTimes(1);
    const [storageKey, uploadedBuffer, uploadedSize, contentType] =
      storageService.upload.mock.calls[0];
    expect(storageKey).toBe(expectedStorageKey);
    expect(Buffer.isBuffer(uploadedBuffer)).toBe(true);
    expect(uploadedSize).toBe((uploadedBuffer as Buffer).length);
    expect(contentType).toBe(EVIDENCE_EXPORT_ARCHIVE_MIME_TYPE);

    const zip = await JSZip.loadAsync(uploadedBuffer as Buffer);
    const manifest = JSON.parse(
      await zip.file(EVIDENCE_EXPORT_BUNDLE_MANIFEST_PATH)!.async('string'),
    );
    const exportData = JSON.parse(
      await zip.file(EVIDENCE_EXPORT_BUNDLE_DATA_PATH)!.async('string'),
    );
    const report = await zip
      .file(EVIDENCE_EXPORT_BUNDLE_REPORT_PATH)!
      .async('string');

    expect(Object.keys(zip.files).sort()).toEqual(
      [
        EVIDENCE_EXPORT_BUNDLE_DATA_PATH,
        EVIDENCE_EXPORT_BUNDLE_MANIFEST_PATH,
        EVIDENCE_EXPORT_BUNDLE_REPORT_PATH,
      ].sort(),
    );

    expect(manifest).toMatchObject({
      exportId: 'export-1',
      tenantId: TENANT_ID,
      requestedBy: ACTOR_ID,
      filters: expect.objectContaining({
        executionIds: ['exec-1', 'exec-2'],
        includeAuditMetadata: true,
      }),
      executions: [
        expect.objectContaining({
          executionId: 'exec-1',
          evidenceCount: 2,
        }),
        expect.objectContaining({
          executionId: 'exec-2',
          evidenceCount: 1,
        }),
      ],
      files: expect.arrayContaining([
        expect.objectContaining({
          path: EVIDENCE_EXPORT_BUNDLE_DATA_PATH,
          recordCount: 2,
        }),
        expect.objectContaining({
          path: EVIDENCE_EXPORT_BUNDLE_REPORT_PATH,
        }),
      ]),
    });

    expect(exportData).toMatchObject({
      exportId: 'export-1',
      executions: [
        expect.objectContaining({
          executionId: 'exec-1',
          auditEntries: expect.arrayContaining([
            expect.objectContaining({ id: 'archive-1' }),
            expect.objectContaining({ id: 'hot-1' }),
          ]),
        }),
        expect.objectContaining({
          executionId: 'exec-2',
          auditEntries: expect.arrayContaining([
            expect.objectContaining({ id: 'hot-2' }),
          ]),
        }),
      ],
    });
    expect(report).toContain('# Evidence Export Report');
    expect(report).toContain('exec-1');
    expect(report).toContain('source_unavailable');

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        actorType: 'system',
        eventType: 'evidence.export.completed',
        resourceType: 'evidence_export_job',
        resourceId: 'export-1',
        metadata: expect.objectContaining({
          generatedArtifact: true,
          storageKey: expectedStorageKey,
          matchedExecutionCount: 2,
          fileCount: 3,
        }),
      }),
    );
  });

  it('should skip already completed export jobs that already have a stored artifact', async () => {
    db.select.mockReturnValueOnce(
      createSelectWithLimit([
        createExportJob({
          status: 'completed',
          storageKey: buildEvidenceExportStorageKey(TENANT_ID, 'export-1'),
          fileName: buildEvidenceExportArchiveFileName('export-1'),
          mimeType: EVIDENCE_EXPORT_ARCHIVE_MIME_TYPE,
          completedAt: new Date('2026-03-17T00:04:00.000Z'),
        }),
      ]),
    );

    await expect(
      worker.process({
        data: {
          tenantId: TENANT_ID,
          exportId: 'export-1',
        },
      } as never),
    ).resolves.toBeUndefined();

    expect(db.update).not.toHaveBeenCalled();
    expect(evidenceService.buildChain).not.toHaveBeenCalled();
    expect(storageService.upload).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('should fail the export job when the frozen execution snapshot is missing', async () => {
    const updateRecorder = createUpdateRecorder();
    db.update.mockImplementation(updateRecorder.update);
    db.select.mockReturnValueOnce(
      createSelectWithLimit([
        createExportJob({
          filters: { workflowId: '00000000-0000-4000-8000-000000000010' },
        }),
      ]),
    );

    await expect(
      worker.process({
        data: {
          tenantId: TENANT_ID,
          exportId: 'export-1',
        },
      } as never),
    ).rejects.toThrow('frozen execution snapshot');

    expect(storageService.upload).not.toHaveBeenCalled();
    expect(updateRecorder.set).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'failed',
        lastError: expect.stringContaining('frozen execution snapshot'),
      }),
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        actorType: 'system',
        eventType: 'evidence.export.failed',
        resourceId: 'export-1',
      }),
    );
  });

  it('should mark the job as failed and audit the failure when bundle generation errors', async () => {
    const updateRecorder = createUpdateRecorder();
    db.update.mockImplementation(updateRecorder.update);
    db.select.mockReturnValueOnce(createSelectWithLimit([createExportJob()]));
    evidenceService.buildChain.mockRejectedValue(new Error('chain explosion'));

    await expect(
      worker.process({
        data: {
          tenantId: TENANT_ID,
          exportId: 'export-1',
        },
      } as never),
    ).rejects.toThrow('chain explosion');

    expect(storageService.upload).not.toHaveBeenCalled();
    expect(updateRecorder.set).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'failed',
        lastError: 'chain explosion',
      }),
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        actorType: 'system',
        eventType: 'evidence.export.failed',
        resourceType: 'evidence_export_job',
        resourceId: 'export-1',
      }),
    );
  });
});

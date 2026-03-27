import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auditLogArchives, auditLogs } from '../../../database/schema';
import { AuditLogRetentionWorker } from '../audit-log-retention.worker';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const CUTOFF = new Date('2026-01-01T00:00:00.000Z');

function createSelectedRow(id: string, createdAt: Date) {
  return {
    id,
    tenantId: TENANT_ID,
    actorId: null,
    actorType: 'system' as const,
    eventType: 'workflow.updated',
    resourceType: 'workflow',
    resourceId: 'wf-1',
    executionId: null,
    summary: `row-${id}`,
    before: null,
    after: { status: 'updated' },
    metadata: { source: 'worker-test' },
    createdAt,
  };
}

function createArchivedRows(ids: string[]) {
  return ids.map((id) => ({ id }));
}

function createMockTx(
  selectedRows: unknown[],
  archivedRows = createArchivedRows(
    (selectedRows as Array<{ id: string }>).map((row) => row.id),
  ),
) {
  const orderBy = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue(selectedRows),
  });
  const selectWhere = vi.fn().mockReturnValue({ orderBy });
  const archiveWhere = vi.fn().mockResolvedValue(archivedRows);
  const selectFrom = vi.fn((table: unknown) => {
    if (table === auditLogs) {
      return { where: selectWhere };
    }

    if (table === auditLogArchives) {
      return { where: archiveWhere };
    }

    throw new Error('Unexpected table in mock transaction');
  });

  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  const insert = vi.fn().mockReturnValue({ values });

  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockReturnValue({ where: deleteWhere });

  return {
    select: vi.fn().mockReturnValue({ from: selectFrom }),
    selectFrom,
    selectWhere,
    archiveWhere,
    insert,
    values,
    onConflictDoNothing,
    delete: remove,
    deleteWhere,
  };
}

describe('AuditLogRetentionWorker', () => {
  let worker: AuditLogRetentionWorker;

  beforeEach(() => {
    worker = new AuditLogRetentionWorker({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should copy the selected hot rows into archive before deleting the exact hot id set', async () => {
    const selectedRows = [
      createSelectedRow(
        '00000000-0000-4000-8000-000000000010',
        new Date('2025-12-01T00:00:00.000Z'),
      ),
      createSelectedRow(
        '00000000-0000-4000-8000-000000000011',
        new Date('2025-12-02T00:00:00.000Z'),
      ),
    ];
    const tx = createMockTx(selectedRows);

    const archivedCount = await (worker as any).archiveExpiredHotRows(
      tx,
      TENANT_ID,
      CUTOFF,
      25,
    );

    expect(archivedCount).toBe(2);
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(tx.selectFrom).toHaveBeenCalledWith(auditLogs);
    expect(tx.selectFrom).toHaveBeenCalledWith(auditLogArchives);
    expect(tx.insert).toHaveBeenCalledWith(auditLogArchives);
    expect(tx.values).toHaveBeenCalledWith(selectedRows);
    expect(tx.onConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(tx.delete).toHaveBeenCalledWith(auditLogs);
    expect(tx.deleteWhere).toHaveBeenCalledTimes(1);
    expect(tx.onConflictDoNothing.mock.invocationCallOrder[0]).toBeLessThan(
      tx.deleteWhere.mock.invocationCallOrder[0],
    );
  });

  it('should skip copy and delete when no expired hot rows are selected', async () => {
    const tx = createMockTx([]);

    const archivedCount = await (worker as any).archiveExpiredHotRows(
      tx,
      TENANT_ID,
      CUTOFF,
      25,
    );

    expect(archivedCount).toBe(0);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it('should only delete hot rows that are confirmed in archive', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const selectedRows = [
      createSelectedRow(
        '00000000-0000-4000-8000-000000000020',
        new Date('2025-12-03T00:00:00.000Z'),
      ),
      createSelectedRow(
        '00000000-0000-4000-8000-000000000021',
        new Date('2025-12-04T00:00:00.000Z'),
      ),
    ];
    const tx = createMockTx(
      selectedRows,
      createArchivedRows(['00000000-0000-4000-8000-000000000020']),
    );

    const archivedCount = await (worker as any).archiveExpiredHotRows(
      tx,
      TENANT_ID,
      CUTOFF,
      25,
    );

    expect(archivedCount).toBe(1);
    expect(tx.delete).toHaveBeenCalledWith(auditLogs);
    expect(tx.deleteWhere).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('leaving unmatched hot rows in place'),
    );
  });

  it('should keep hot rows when archive verification returns no matching ids', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const selectedRows = [
      createSelectedRow(
        '00000000-0000-4000-8000-000000000030',
        new Date('2025-12-05T00:00:00.000Z'),
      ),
    ];
    const tx = createMockTx(selectedRows, []);

    const archivedCount = await (worker as any).archiveExpiredHotRows(
      tx,
      TENANT_ID,
      CUTOFF,
      25,
    );

    expect(archivedCount).toBe(0);
    expect(tx.delete).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipped audit log purge because archive verification returned 0 rows',
      ),
    );
  });
});

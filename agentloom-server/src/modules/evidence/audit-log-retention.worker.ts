import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import { Job } from 'bullmq';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { auditLogArchives, auditLogs } from '../../database/schema';
import {
  AUDIT_LOG_RETENTION_BATCH_SIZE,
  AUDIT_LOG_RETENTION_QUEUE,
  AUDIT_LOG_RETENTION_WINDOW_DAYS,
  type AuditLogRetentionJobData,
} from './audit-log-retention.constants';

type AuditLogRetentionTx = Pick<DrizzleDB, 'delete' | 'insert' | 'select'>;

@Injectable()
@Processor(AUDIT_LOG_RETENTION_QUEUE)
export class AuditLogRetentionWorker extends WorkerHost {
  private readonly logger = new Logger(AuditLogRetentionWorker.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {
    super();
  }

  async process(job: Job<AuditLogRetentionJobData>): Promise<void> {
    const retentionDays =
      job.data.retentionDays ?? AUDIT_LOG_RETENTION_WINDOW_DAYS;
    const batchSize = job.data.batchSize ?? AUDIT_LOG_RETENTION_BATCH_SIZE;
    const cutoff = this.buildCutoff(retentionDays);
    const tenantIds = job.data.tenantId
      ? [job.data.tenantId]
      : await this.findTenantIdsWithExpiredRows(cutoff);

    for (const tenantId of tenantIds) {
      let archivedInBatch = 0;

      do {
        archivedInBatch = await this.db.transaction((tx) =>
          this.archiveExpiredHotRows(tx, tenantId, cutoff, batchSize),
        );
      } while (archivedInBatch === batchSize);
    }
  }

  private buildCutoff(retentionDays: number): Date {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
    return cutoff;
  }

  private async findTenantIdsWithExpiredRows(cutoff: Date): Promise<string[]> {
    const rows = await this.db
      .select({ tenantId: auditLogs.tenantId })
      .from(auditLogs)
      .where(lte(auditLogs.createdAt, cutoff))
      .groupBy(auditLogs.tenantId)
      .orderBy(asc(auditLogs.tenantId));

    return rows.map((row) => row.tenantId);
  }

  private async archiveExpiredHotRows(
    tx: AuditLogRetentionTx,
    tenantId: string,
    cutoff: Date,
    limit: number,
  ): Promise<number> {
    const selectedRows = await tx
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.tenantId, tenantId), lte(auditLogs.createdAt, cutoff)),
      )
      .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))
      .limit(limit);

    if (selectedRows.length === 0) {
      return 0;
    }

    await tx
      .insert(auditLogArchives)
      .values(selectedRows)
      .onConflictDoNothing();

    const selectedIds = selectedRows.map((row) => row.id);
    const archivedRows = await tx
      .select({ id: auditLogArchives.id })
      .from(auditLogArchives)
      .where(
        and(
          eq(auditLogArchives.tenantId, tenantId),
          inArray(auditLogArchives.id, selectedIds),
        ),
      );
    const archivedIds = archivedRows.map((row) => row.id);

    if (archivedIds.length === 0) {
      this.logger.warn(
        `Skipped audit log purge because archive verification returned 0 rows for tenant ${tenantId}`,
      );
      return 0;
    }

    await tx
      .delete(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          inArray(auditLogs.id, archivedIds),
        ),
      );

    if (archivedIds.length !== selectedIds.length) {
      this.logger.warn(
        `Archived ${archivedIds.length} of ${selectedIds.length} selected audit logs for tenant ${tenantId}; leaving unmatched hot rows in place`,
      );
    }

    this.logger.log(
      `Archived ${archivedIds.length} audit logs for tenant ${tenantId}`,
    );

    return archivedIds.length;
  }
}

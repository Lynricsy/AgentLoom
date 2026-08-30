import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import { Job } from 'bullmq';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { evidenceExportJobs } from '../../database/schema';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditLogService } from './audit-log.service';
import {
  EVIDENCE_EXPORT_CLEANUP_BATCH_SIZE,
  EVIDENCE_EXPORT_CLEANUP_QUEUE,
  type EvidenceExportCleanupJobData,
} from './evidence-export.constants';

type CleanupCandidate = Pick<
  typeof evidenceExportJobs.$inferSelect,
  'id' | 'tenantId' | 'status' | 'storageKey' | 'expiresAt' | 'updatedAt'
>;

@Injectable()
@Processor(EVIDENCE_EXPORT_CLEANUP_QUEUE)
export class EvidenceExportCleanupWorker extends WorkerHost {
  private readonly logger = new Logger(EvidenceExportCleanupWorker.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly storageService: StorageService,
    private readonly auditLogService: AuditLogService,
  ) {
    super();
  }

  async process(job: Job<EvidenceExportCleanupJobData>): Promise<void> {
    const cutoff = job.data.expiresBefore
      ? new Date(job.data.expiresBefore)
      : new Date();
    const batchSize = job.data.batchSize ?? EVIDENCE_EXPORT_CLEANUP_BATCH_SIZE;

    let expiredInBatch: number;
    do {
      expiredInBatch = await this.expireEligibleExportsBatch(
        cutoff,
        batchSize,
        job.data.tenantId,
      );
    } while (expiredInBatch === batchSize);
  }

  private async expireEligibleExportsBatch(
    cutoff: Date,
    limit: number,
    tenantId?: string,
  ): Promise<number> {
    const conditions = [
      inArray(evidenceExportJobs.status, ['completed', 'failed']),
      lte(evidenceExportJobs.expiresAt, cutoff),
    ];

    if (tenantId) {
      conditions.push(eq(evidenceExportJobs.tenantId, tenantId));
    }

    const candidates = await this.db
      .select()
      .from(evidenceExportJobs)
      .where(and(...conditions))
      .orderBy(asc(evidenceExportJobs.expiresAt), asc(evidenceExportJobs.id))
      .limit(limit);

    if (candidates.length === 0) {
      return 0;
    }

    let expiredCount = 0;
    for (const candidate of candidates) {
      const expired = await this.expireSingleExport(candidate);
      if (expired) {
        expiredCount += 1;
      }
    }

    return expiredCount;
  }

  private async expireSingleExport(
    candidate: CleanupCandidate,
  ): Promise<boolean> {
    const expiredAt = new Date();

    try {
      if (candidate.storageKey) {
        await this.storageService.delete(candidate.storageKey);
      }

      await this.db
        .update(evidenceExportJobs)
        .set({
          status: 'expired',
          storageKey: null,
          updatedAt: expiredAt,
        })
        .where(
          and(
            eq(evidenceExportJobs.tenantId, candidate.tenantId),
            eq(evidenceExportJobs.id, candidate.id),
          ),
        );

      await this.auditLogService.record({
        tenantId: candidate.tenantId,
        actorId: null,
        actorType: 'system',
        eventType: 'evidence.export.expired',
        resourceType: 'evidence_export_job',
        resourceId: candidate.id,
        summary: 'Evidence export artifact expired and was cleaned up.',
        metadata: {
          cleanup: true,
          hadArtifact: Boolean(candidate.storageKey),
          previousStatus: candidate.status,
          retentionExpiredAt:
            candidate.expiresAt?.toISOString() ?? expiredAt.toISOString(),
        },
      });

      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown evidence export cleanup error';

      this.logger.warn(
        `Failed to clean up evidence export ${candidate.id}: ${message}`,
      );

      await this.auditLogService.record({
        tenantId: candidate.tenantId,
        actorId: null,
        actorType: 'system',
        eventType: 'evidence.export.cleanup.failed',
        resourceType: 'evidence_export_job',
        resourceId: candidate.id,
        summary: 'Evidence export cleanup failed.',
        metadata: {
          cleanup: true,
          hadArtifact: Boolean(candidate.storageKey),
          previousStatus: candidate.status,
          error: message,
        },
      });

      return false;
    }
  }
}

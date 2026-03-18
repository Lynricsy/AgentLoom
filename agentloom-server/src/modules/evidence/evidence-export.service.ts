import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { Queue } from 'bullmq';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  StorageKeyInvalidException,
  StorageObjectNotFoundException,
  StorageUnavailableException,
} from '../../infrastructure/storage/storage.exceptions';
import {
  auditLogArchives,
  auditLogs,
  evidenceExportJobs,
  type EvidenceExportFilters,
  type EvidenceExportJob,
  workflowExecutions,
} from '../../database/schema';
import { AuditLogService } from './audit-log.service';
import {
  EVIDENCE_EXPORT_ARTIFACT_FORMAT,
  EVIDENCE_EXPORT_DOWNLOAD_URL_TTL_SECONDS,
  EVIDENCE_EXPORT_JOB_NAME,
  EVIDENCE_EXPORT_MAX_EXECUTIONS,
  EVIDENCE_EXPORT_QUEUE,
  EVIDENCE_EXPORT_RETENTION_HOURS,
  type EvidenceExportQueueJobData,
  evidenceExportDefaultJobOptions,
} from './evidence-export.constants';
import {
  EvidenceExportArtifactNotFoundException,
  EvidenceExportArtifactNotReadyException,
  EvidenceExportArtifactUnavailableException,
  EvidenceExportExpiredException,
  EvidenceExportNotFoundException,
  EvidenceExportWorkloadLimitExceededException,
} from './evidence-export.exceptions';

export interface RequestEvidenceExportInput {
  tenantId: string;
  actorId: string;
  filters: EvidenceExportFilters;
}

export interface EvidenceExportDownloadDetail {
  url: string;
  fileName: string;
  mimeType: string;
  expiresAt: string;
  expiresIn: number;
}

export interface EvidenceExportDownloadRequestInput {
  tenantId: string;
  actorId: string;
  exportId: string;
}

@Injectable()
export class EvidenceExportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly auditLogService: AuditLogService,
    @InjectQueue(EVIDENCE_EXPORT_QUEUE)
    private readonly exportQueue: Queue<EvidenceExportQueueJobData>,
    private readonly storageService: StorageService,
  ) {}

  async requestExport(
    input: RequestEvidenceExportInput,
  ): Promise<EvidenceExportJob> {
    const tenantDb = getTenantDb(this.db);
    const executionIds = await this.resolveExecutionIds(
      input.tenantId,
      input.filters,
    );
    const frozenFilters: EvidenceExportFilters = {
      ...input.filters,
      executionIds: [...executionIds],
    };

    if (executionIds.length > EVIDENCE_EXPORT_MAX_EXECUTIONS) {
      await this.auditLogService.record({
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorType: 'user',
        eventType: 'evidence.export.rejected',
        resourceType: 'evidence_export_job',
        resourceId: 'pending',
        summary:
          'Evidence export rejected because the requested workload exceeded the configured limit.',
        metadata: {
          filters: frozenFilters,
          matchedExecutionCount: executionIds.length,
          maxExecutionCount: EVIDENCE_EXPORT_MAX_EXECUTIONS,
        },
      });

      throw new EvidenceExportWorkloadLimitExceededException(
        EVIDENCE_EXPORT_MAX_EXECUTIONS,
        executionIds.length,
      );
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + EVIDENCE_EXPORT_RETENTION_HOURS * 60 * 60 * 1000,
    );
    const status = executionIds.length === 0 ? 'completed' : 'queued';

    const [job] = await tenantDb
      .insert(evidenceExportJobs)
      .values({
        tenantId: input.tenantId,
        requestedBy: input.actorId,
        status,
        filters: frozenFilters,
        artifactFormat: EVIDENCE_EXPORT_ARTIFACT_FORMAT,
        matchedExecutionCount: executionIds.length,
        expiresAt,
        completedAt: executionIds.length === 0 ? now : null,
        fileName:
          executionIds.length === 0 ? 'evidence-export-no-results.json' : null,
        mimeType: executionIds.length === 0 ? 'application/json' : null,
        updatedAt: now,
      })
      .returning();

    if (!job) {
      throw new Error('Failed to create evidence export job');
    }

    await this.auditLogService.record({
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorType: 'user',
      eventType: 'evidence.export.requested',
      resourceType: 'evidence_export_job',
      resourceId: job.id,
      summary: 'Evidence export requested.',
      metadata: {
        filters: frozenFilters,
        matchedExecutionCount: executionIds.length,
      },
    });

    if (executionIds.length === 0) {
      await this.auditLogService.record({
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorType: 'user',
        eventType: 'evidence.export.completed',
        resourceType: 'evidence_export_job',
        resourceId: job.id,
        summary: 'Evidence export completed without matched executions.',
        metadata: {
          matchedExecutionCount: 0,
          generatedArtifact: false,
        },
      });

      return job;
    }

    await this.exportQueue.add(
      EVIDENCE_EXPORT_JOB_NAME,
      {
        exportId: job.id,
        tenantId: input.tenantId,
      },
      {
        ...evidenceExportDefaultJobOptions,
        jobId: `evidence-export:${job.id}`,
      },
    );

    return job;
  }

  async findById(
    tenantId: string,
    exportId: string,
  ): Promise<EvidenceExportJob> {
    return this.getExportJobOrThrow(tenantId, exportId);
  }

  async getDownloadDetail(
    input: EvidenceExportDownloadRequestInput,
  ): Promise<EvidenceExportDownloadDetail> {
    return this.issueDownloadDetail(input, false);
  }

  async refreshDownloadDetail(
    input: EvidenceExportDownloadRequestInput,
  ): Promise<EvidenceExportDownloadDetail> {
    return this.issueDownloadDetail(input, true);
  }

  private async issueDownloadDetail(
    input: EvidenceExportDownloadRequestInput,
    refresh: boolean,
  ): Promise<EvidenceExportDownloadDetail> {
    const tenantDb = getTenantDb(this.db);
    const now = new Date();
    const job = await this.getDownloadJobOrAudit(input, refresh);

    if (job.status !== 'completed') {
      await this.auditLogService.record({
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorType: 'user',
        eventType: 'evidence.export.download.not_ready',
        resourceType: 'evidence_export_job',
        resourceId: job.id,
        summary:
          'Evidence export download was requested before the export artifact was ready.',
        metadata: {
          status: job.status,
          refresh,
        },
      });

      throw new EvidenceExportArtifactNotReadyException(job.id, job.status);
    }

    const retentionExpiresAt = job.expiresAt;

    if (!retentionExpiresAt) {
      await this.auditLogService.record({
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorType: 'user',
        eventType: 'evidence.export.download.unavailable',
        resourceType: 'evidence_export_job',
        resourceId: job.id,
        summary:
          'Evidence export download failed because the retention metadata was missing.',
        metadata: {
          refresh,
          reason: 'missing_retention_expiry',
        },
      });

      throw new EvidenceExportArtifactUnavailableException(
        job.id,
        'Evidence export retention metadata is missing.',
      );
    }

    if (retentionExpiresAt.getTime() <= now.getTime()) {
      await tenantDb
        .update(evidenceExportJobs)
        .set({
          status: 'expired',
          updatedAt: now,
        })
        .where(
          and(
            eq(evidenceExportJobs.tenantId, input.tenantId),
            eq(evidenceExportJobs.id, job.id),
          ),
        );

      await this.auditLogService.record({
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorType: 'user',
        eventType: 'evidence.export.download.expired',
        resourceType: 'evidence_export_job',
        resourceId: job.id,
        summary:
          'Evidence export download was requested after the retention window expired.',
        metadata: {
          refresh,
          retentionExpiresAt: retentionExpiresAt.toISOString(),
        },
      });

      throw new EvidenceExportExpiredException(job.id);
    }

    if (!job.storageKey) {
      await this.auditLogService.record({
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorType: 'user',
        eventType: 'evidence.export.download.missing',
        resourceType: 'evidence_export_job',
        resourceId: job.id,
        summary:
          'Evidence export artifact was requested but no storage object was recorded.',
        metadata: {
          refresh,
        },
      });

      throw new EvidenceExportArtifactNotFoundException(job.id);
    }

    const expiresIn = this.resolveDownloadExpiresIn(now, retentionExpiresAt);
    const expiresAt = new Date(now.getTime() + expiresIn * 1000);

    try {
      const url = await this.storageService.getPresignedUrl(
        job.storageKey,
        expiresIn,
      );
      const eventType = refresh
        ? 'evidence.export.download.refreshed'
        : 'evidence.export.download.issued';

      await this.auditLogService.record({
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorType: 'user',
        eventType,
        resourceType: 'evidence_export_job',
        resourceId: job.id,
        summary: refresh
          ? 'Evidence export download link was refreshed.'
          : 'Evidence export download link was issued.',
        metadata: {
          refresh,
          expiresIn,
          expiresAt: expiresAt.toISOString(),
        },
      });

      return {
        url,
        fileName: job.fileName ?? 'evidence-export.zip',
        mimeType: job.mimeType ?? 'application/zip',
        expiresAt: expiresAt.toISOString(),
        expiresIn,
      };
    } catch (error) {
      if (
        error instanceof StorageObjectNotFoundException ||
        error instanceof StorageKeyInvalidException
      ) {
        await this.auditLogService.record({
          tenantId: input.tenantId,
          actorId: input.actorId,
          actorType: 'user',
          eventType: 'evidence.export.download.missing',
          resourceType: 'evidence_export_job',
          resourceId: job.id,
          summary:
            'Evidence export download failed because the storage object was missing.',
          metadata: {
            refresh,
            storageKey: job.storageKey,
          },
        });

        throw new EvidenceExportArtifactNotFoundException(job.id);
      }

      if (error instanceof StorageUnavailableException) {
        await this.auditLogService.record({
          tenantId: input.tenantId,
          actorId: input.actorId,
          actorType: 'user',
          eventType: 'evidence.export.download.unavailable',
          resourceType: 'evidence_export_job',
          resourceId: job.id,
          summary:
            'Evidence export download failed because object storage was unavailable.',
          metadata: {
            refresh,
            storageKey: job.storageKey,
          },
        });

        throw new EvidenceExportArtifactUnavailableException(
          job.id,
          error.message,
        );
      }

      throw error;
    }
  }

  private async getDownloadJobOrAudit(
    input: EvidenceExportDownloadRequestInput,
    refresh: boolean,
  ): Promise<EvidenceExportJob> {
    try {
      return await this.getExportJobOrThrow(input.tenantId, input.exportId);
    } catch (error) {
      if (error instanceof EvidenceExportNotFoundException) {
        await this.auditLogService.record({
          tenantId: input.tenantId,
          actorId: input.actorId,
          actorType: 'user',
          eventType: 'evidence.export.download.not_found',
          resourceType: 'evidence_export_job',
          resourceId: input.exportId,
          summary:
            'Evidence export download was requested for a non-existent export job.',
          metadata: {
            refresh,
          },
        });
      }

      throw error;
    }
  }

  private async getExportJobOrThrow(
    tenantId: string,
    exportId: string,
  ): Promise<EvidenceExportJob> {
    const tenantDb = getTenantDb(this.db);
    const [job] = await tenantDb
      .select()
      .from(evidenceExportJobs)
      .where(
        and(
          eq(evidenceExportJobs.tenantId, tenantId),
          eq(evidenceExportJobs.id, exportId),
        ),
      )
      .limit(1);

    if (!job) {
      throw new EvidenceExportNotFoundException(exportId);
    }

    return job;
  }

  private resolveDownloadExpiresIn(
    now: Date,
    retentionExpiresAt: Date,
  ): number {
    const remainingSeconds = Math.floor(
      (retentionExpiresAt.getTime() - now.getTime()) / 1000,
    );

    if (remainingSeconds <= 0) {
      return 0;
    }

    return Math.min(EVIDENCE_EXPORT_DOWNLOAD_URL_TTL_SECONDS, remainingSeconds);
  }

  private async resolveExecutionIds(
    tenantId: string,
    filters: EvidenceExportFilters,
  ): Promise<string[]> {
    if (this.hasAuditRecallFilters(filters)) {
      return this.resolveExecutionIdsFromAuditLogs(tenantId, filters);
    }

    const tenantDb = getTenantDb(this.db);
    const conditions = [eq(workflowExecutions.tenantId, tenantId)];

    if (filters.workflowId) {
      conditions.push(
        eq(workflowExecutions.workflowDefinitionId, filters.workflowId),
      );
    }

    if (filters.executionIds?.length) {
      conditions.push(inArray(workflowExecutions.id, filters.executionIds));
    }

    if (filters.from) {
      conditions.push(
        gte(workflowExecutions.createdAt, new Date(filters.from)),
      );
    }

    if (filters.to) {
      conditions.push(lte(workflowExecutions.createdAt, new Date(filters.to)));
    }

    const rows = await tenantDb
      .select({ id: workflowExecutions.id })
      .from(workflowExecutions)
      .where(and(...conditions))
      .orderBy(asc(workflowExecutions.createdAt), asc(workflowExecutions.id))
      .limit(EVIDENCE_EXPORT_MAX_EXECUTIONS + 1);

    return rows.map((row) => row.id);
  }

  private hasAuditRecallFilters(filters: EvidenceExportFilters): boolean {
    return Boolean(
      filters.eventType ||
      filters.resourceType ||
      filters.resourceId ||
      filters.actorType ||
      filters.actorId ||
      filters.from ||
      filters.to,
    );
  }

  private async resolveExecutionIdsFromAuditLogs(
    tenantId: string,
    filters: EvidenceExportFilters,
  ): Promise<string[]> {
    const tenantDb = getTenantDb(this.db);
    const [hotRows, archiveRows] = await Promise.all([
      tenantDb
        .select({
          executionId: workflowExecutions.id,
          matchedAt: auditLogs.createdAt,
          auditId: auditLogs.id,
        })
        .from(auditLogs)
        .innerJoin(
          workflowExecutions,
          and(
            eq(workflowExecutions.id, auditLogs.executionId),
            eq(workflowExecutions.tenantId, tenantId),
          ),
        )
        .where(
          and(
            eq(auditLogs.tenantId, tenantId),
            ...(filters.workflowId
              ? [
                  eq(
                    workflowExecutions.workflowDefinitionId,
                    filters.workflowId,
                  ),
                ]
              : []),
            ...(filters.executionIds?.length
              ? [inArray(workflowExecutions.id, filters.executionIds)]
              : []),
            ...(filters.eventType
              ? [eq(auditLogs.eventType, filters.eventType)]
              : []),
            ...(filters.resourceType
              ? [eq(auditLogs.resourceType, filters.resourceType)]
              : []),
            ...(filters.resourceId
              ? [eq(auditLogs.resourceId, filters.resourceId)]
              : []),
            ...(filters.actorType
              ? [eq(auditLogs.actorType, filters.actorType)]
              : []),
            ...(filters.actorId
              ? [eq(auditLogs.actorId, filters.actorId)]
              : []),
            ...(filters.from
              ? [gte(auditLogs.createdAt, new Date(filters.from))]
              : []),
            ...(filters.to
              ? [lte(auditLogs.createdAt, new Date(filters.to))]
              : []),
          ),
        )
        .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))
        .limit(EVIDENCE_EXPORT_MAX_EXECUTIONS + 1),
      tenantDb
        .select({
          executionId: workflowExecutions.id,
          matchedAt: auditLogArchives.createdAt,
          auditId: auditLogArchives.id,
        })
        .from(auditLogArchives)
        .innerJoin(
          workflowExecutions,
          and(
            eq(workflowExecutions.id, auditLogArchives.executionId),
            eq(workflowExecutions.tenantId, tenantId),
          ),
        )
        .where(
          and(
            eq(auditLogArchives.tenantId, tenantId),
            ...(filters.workflowId
              ? [
                  eq(
                    workflowExecutions.workflowDefinitionId,
                    filters.workflowId,
                  ),
                ]
              : []),
            ...(filters.executionIds?.length
              ? [inArray(workflowExecutions.id, filters.executionIds)]
              : []),
            ...(filters.eventType
              ? [eq(auditLogArchives.eventType, filters.eventType)]
              : []),
            ...(filters.resourceType
              ? [eq(auditLogArchives.resourceType, filters.resourceType)]
              : []),
            ...(filters.resourceId
              ? [eq(auditLogArchives.resourceId, filters.resourceId)]
              : []),
            ...(filters.actorType
              ? [eq(auditLogArchives.actorType, filters.actorType)]
              : []),
            ...(filters.actorId
              ? [eq(auditLogArchives.actorId, filters.actorId)]
              : []),
            ...(filters.from
              ? [gte(auditLogArchives.createdAt, new Date(filters.from))]
              : []),
            ...(filters.to
              ? [lte(auditLogArchives.createdAt, new Date(filters.to))]
              : []),
          ),
        )
        .orderBy(asc(auditLogArchives.createdAt), asc(auditLogArchives.id))
        .limit(EVIDENCE_EXPORT_MAX_EXECUTIONS + 1),
    ]);

    const mergedRows = [...hotRows, ...archiveRows].sort((left, right) => {
      const timeDelta = left.matchedAt.getTime() - right.matchedAt.getTime();

      if (timeDelta !== 0) {
        return timeDelta;
      }

      return left.auditId.localeCompare(right.auditId);
    });
    const uniqueExecutionIds = new Set<string>();
    const executionIds: string[] = [];

    for (const row of mergedRows) {
      if (uniqueExecutionIds.has(row.executionId)) {
        continue;
      }

      uniqueExecutionIds.add(row.executionId);
      executionIds.push(row.executionId);

      if (executionIds.length > EVIDENCE_EXPORT_MAX_EXECUTIONS) {
        break;
      }
    }

    return executionIds;
  }
}

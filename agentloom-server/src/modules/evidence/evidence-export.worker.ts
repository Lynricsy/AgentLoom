import { createHash } from 'node:crypto';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import JSZip from 'jszip';
import { Job } from 'bullmq';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  auditLogArchives,
  auditLogs,
  evidenceExportJobs,
} from '../../database/schema';
import { StorageService } from '../../infrastructure/storage/storage.service';
import type { EvidenceChainResponse } from './dto/evidence.dto';
import { AuditLogService } from './audit-log.service';
import {
  EVIDENCE_EXPORT_ARCHIVE_MIME_TYPE,
  EVIDENCE_EXPORT_BUNDLE_DATA_PATH,
  EVIDENCE_EXPORT_BUNDLE_MANIFEST_PATH,
  EVIDENCE_EXPORT_BUNDLE_REPORT_PATH,
  EVIDENCE_EXPORT_QUEUE,
  buildEvidenceExportArchiveFileName,
  buildEvidenceExportStorageKey,
  type EvidenceExportQueueJobData,
} from './evidence-export.constants';
import { EvidenceService } from './evidence.service';

interface ExportAuditEntry {
  id: string;
  actorId: string | null;
  actorType: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  executionId: string | null;
  summary: string;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string;
}

interface ExportExecutionPayload {
  executionId: string;
  chain: EvidenceChainResponse;
  auditEntries?: ExportAuditEntry[];
}

interface ExportBundleFile {
  path: string;
  contents: string;
  recordCount?: number;
}

@Injectable()
@Processor(EVIDENCE_EXPORT_QUEUE)
export class EvidenceExportWorker extends WorkerHost {
  private readonly logger = new Logger(EvidenceExportWorker.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly evidenceService: EvidenceService,
    private readonly storageService: StorageService,
    private readonly auditLogService: AuditLogService,
  ) {
    super();
  }

  async process(job: Job<EvidenceExportQueueJobData>): Promise<void> {
    const exportJob = await this.findExportJob(
      job.data.tenantId,
      job.data.exportId,
    );

    if (!exportJob) {
      this.logger.warn(
        `Skipped evidence export worker job because export ${job.data.exportId} no longer exists`,
      );
      return;
    }

    if (exportJob.status === 'completed' && exportJob.storageKey) {
      return;
    }

    const startedAt = new Date();
    await this.db
      .update(evidenceExportJobs)
      .set({
        status: 'running',
        failedAt: null,
        lastError: null,
        updatedAt: startedAt,
      })
      .where(
        and(
          eq(evidenceExportJobs.tenantId, exportJob.tenantId),
          eq(evidenceExportJobs.id, exportJob.id),
        ),
      );

    try {
      const executionIds = exportJob.filters.executionIds ?? [];
      if (executionIds.length === 0) {
        throw new Error(
          `Evidence export ${exportJob.id} is missing a frozen execution snapshot.`,
        );
      }

      const executionPayloads: ExportExecutionPayload[] = [];
      for (const executionId of executionIds) {
        const { response } = await this.evidenceService.buildChain(
          exportJob.tenantId,
          executionId,
          undefined,
          { bypassCache: true },
        );

        const auditEntries = exportJob.filters.includeAuditMetadata
          ? await this.loadExecutionAuditEntries(
              exportJob.tenantId,
              executionId,
            )
          : undefined;

        executionPayloads.push({
          executionId,
          chain: response,
          ...(auditEntries ? { auditEntries } : {}),
        });
      }

      const completedAt = new Date();
      const bundle = await this.buildBundle(
        exportJob,
        executionPayloads,
        completedAt,
      );
      const storageKey = buildEvidenceExportStorageKey(
        exportJob.tenantId,
        exportJob.id,
      );
      const fileName = buildEvidenceExportArchiveFileName(exportJob.id);

      await this.storageService.upload(
        storageKey,
        bundle.buffer,
        bundle.buffer.length,
        EVIDENCE_EXPORT_ARCHIVE_MIME_TYPE,
      );

      await this.db
        .update(evidenceExportJobs)
        .set({
          status: 'completed',
          storageKey,
          fileName,
          mimeType: EVIDENCE_EXPORT_ARCHIVE_MIME_TYPE,
          completedAt,
          failedAt: null,
          lastError: null,
          updatedAt: completedAt,
        })
        .where(
          and(
            eq(evidenceExportJobs.tenantId, exportJob.tenantId),
            eq(evidenceExportJobs.id, exportJob.id),
          ),
        );

      await this.auditLogService.record({
        tenantId: exportJob.tenantId,
        actorId: null,
        actorType: 'system',
        eventType: 'evidence.export.completed',
        resourceType: 'evidence_export_job',
        resourceId: exportJob.id,
        summary: 'Evidence export artifact was generated successfully.',
        metadata: {
          generatedArtifact: true,
          matchedExecutionCount: executionPayloads.length,
          storageKey,
          fileCount: bundle.fileCount,
          includeAuditMetadata: Boolean(exportJob.filters.includeAuditMetadata),
        },
      });
    } catch (error) {
      const failedAt = new Date();
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown evidence export worker error';

      await this.db
        .update(evidenceExportJobs)
        .set({
          status: 'failed',
          failedAt,
          lastError: message,
          updatedAt: failedAt,
        })
        .where(
          and(
            eq(evidenceExportJobs.tenantId, exportJob.tenantId),
            eq(evidenceExportJobs.id, exportJob.id),
          ),
        );

      await this.auditLogService.record({
        tenantId: exportJob.tenantId,
        actorId: null,
        actorType: 'system',
        eventType: 'evidence.export.failed',
        resourceType: 'evidence_export_job',
        resourceId: exportJob.id,
        summary: 'Evidence export artifact generation failed.',
        metadata: {
          error: message,
        },
      });

      throw error;
    }
  }

  private async findExportJob(tenantId: string, exportId: string) {
    const [job] = await this.db
      .select()
      .from(evidenceExportJobs)
      .where(
        and(
          eq(evidenceExportJobs.tenantId, tenantId),
          eq(evidenceExportJobs.id, exportId),
        ),
      )
      .limit(1);

    return job ?? null;
  }

  private async loadExecutionAuditEntries(
    tenantId: string,
    executionId: string,
  ): Promise<ExportAuditEntry[]> {
    const [hotRows, archivedRows] = await Promise.all([
      this.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, tenantId),
            eq(auditLogs.executionId, executionId),
          ),
        )
        .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id)),
      this.db
        .select()
        .from(auditLogArchives)
        .where(
          and(
            eq(auditLogArchives.tenantId, tenantId),
            eq(auditLogArchives.executionId, executionId),
          ),
        )
        .orderBy(asc(auditLogArchives.createdAt), asc(auditLogArchives.id)),
    ]);

    return [...hotRows, ...archivedRows]
      .sort((left, right) => {
        const createdAtDiff =
          left.createdAt.getTime() - right.createdAt.getTime();
        if (createdAtDiff !== 0) {
          return createdAtDiff;
        }

        return left.id.localeCompare(right.id);
      })
      .map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorType: row.actorType,
        eventType: row.eventType,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        executionId: row.executionId,
        summary: row.summary,
        before: row.before,
        after: row.after,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
      }));
  }

  private async buildBundle(
    exportJob: Awaited<
      ReturnType<EvidenceExportWorker['findExportJob']>
    > extends infer T
      ? NonNullable<T>
      : never,
    executionPayloads: ExportExecutionPayload[],
    completedAt: Date,
  ): Promise<{ buffer: Buffer; fileCount: number }> {
    const exportData = {
      exportId: exportJob.id,
      tenantId: exportJob.tenantId,
      requestedBy: exportJob.requestedBy,
      requestedAt: exportJob.requestedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      filters: exportJob.filters,
      executions: executionPayloads,
    };

    const report = this.buildReport(
      exportJob.id,
      executionPayloads,
      completedAt,
    );
    const bundleFiles: ExportBundleFile[] = [
      {
        path: EVIDENCE_EXPORT_BUNDLE_DATA_PATH,
        contents: JSON.stringify(exportData, null, 2),
        recordCount: executionPayloads.length,
      },
      {
        path: EVIDENCE_EXPORT_BUNDLE_REPORT_PATH,
        contents: report,
      },
    ];

    const manifest = {
      exportId: exportJob.id,
      tenantId: exportJob.tenantId,
      requestedBy: exportJob.requestedBy,
      requestedAt: exportJob.requestedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      filters: exportJob.filters,
      executions: executionPayloads.map((payload) => ({
        executionId: payload.executionId,
        evidenceCount: payload.chain.totalNodes,
        integrityIssues: payload.chain.integrityStatus.integrityIssues,
        auditEventCount: payload.auditEntries?.length ?? 0,
      })),
      files: bundleFiles.map((file) => ({
        path: file.path,
        sha256: this.computeSha256(file.contents),
        ...(typeof file.recordCount === 'number'
          ? { recordCount: file.recordCount }
          : {}),
      })),
    };

    const zip = new JSZip();
    zip.file(
      EVIDENCE_EXPORT_BUNDLE_MANIFEST_PATH,
      JSON.stringify(manifest, null, 2),
    );
    for (const file of bundleFiles) {
      zip.file(file.path, file.contents);
    }

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    return {
      buffer,
      fileCount: bundleFiles.length + 1,
    };
  }

  private buildReport(
    exportId: string,
    executionPayloads: ExportExecutionPayload[],
    completedAt: Date,
  ): string {
    const lines = [
      '# Evidence Export Report',
      '',
      `- Export ID: ${exportId}`,
      `- Completed At: ${completedAt.toISOString()}`,
      `- Matched Executions: ${executionPayloads.length}`,
      '',
      '## Execution Summary',
      '',
    ];

    for (const payload of executionPayloads) {
      const issueTypes = payload.chain.integrityStatus.integrityIssues.map(
        (issue) => ('issueType' in issue ? String(issue.issueType) : 'unknown'),
      );

      lines.push(`### ${payload.executionId}`);
      lines.push(`- Evidence Nodes: ${payload.chain.totalNodes}`);
      lines.push(
        `- Integrity Issues: ${issueTypes.length > 0 ? issueTypes.join(', ') : 'none'}`,
      );
      if (payload.auditEntries) {
        lines.push(`- Audit Events: ${payload.auditEntries.length}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private computeSha256(contents: string): string {
    return createHash('sha256').update(contents).digest('hex');
  }
}

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { StorageModule } from '../../infrastructure/storage/storage.module';
import { RbacCacheService } from '../../common/services/rbac-cache.service';
import { LlmModule } from '../llm/llm.module';
import {
  AUDIT_LOG_RETENTION_QUEUE,
  auditLogRetentionJobOptions,
} from './audit-log-retention.constants';
import { AuditLogRetentionScheduler } from './audit-log-retention.scheduler';
import { AuditLogRetentionWorker } from './audit-log-retention.worker';
import { AuditLogController } from './audit-log.controller';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { AuditLogListener } from './audit-log.listener';
import { AuditLogService } from './audit-log.service';
import {
  EVIDENCE_EXPORT_CLEANUP_QUEUE,
  EVIDENCE_EXPORT_QUEUE,
  evidenceExportCleanupJobOptions,
  evidenceExportDefaultJobOptions,
} from './evidence-export.constants';
import { EvidenceExportAccessGuard } from './evidence-export-access.guard';
import { EvidenceExportCleanupScheduler } from './evidence-export.cleanup.scheduler';
import { EvidenceExportCleanupWorker } from './evidence-export.cleanup.worker';
import { EvidenceExportController } from './evidence-export.controller';
import { EvidenceGraphService } from './evidence-graph.service';
import { EvidenceController } from './evidence.controller';
import { EvidenceExportService } from './evidence-export.service';
import { EvidenceExportWorker } from './evidence-export.worker';
import { EvidenceService } from './evidence.service';

@Module({
  imports: [
    LlmModule,
    StorageModule,
    BullModule.registerQueue({
      name: AUDIT_LOG_RETENTION_QUEUE,
      defaultJobOptions: auditLogRetentionJobOptions,
    }),
    BullModule.registerQueue({
      name: EVIDENCE_EXPORT_QUEUE,
      defaultJobOptions: evidenceExportDefaultJobOptions,
    }),
    BullModule.registerQueue({
      name: EVIDENCE_EXPORT_CLEANUP_QUEUE,
      defaultJobOptions: evidenceExportCleanupJobOptions,
    }),
  ],
  controllers: [
    EvidenceController,
    AuditLogController,
    EvidenceExportController,
  ],
  providers: [
    EvidenceService,
    EvidenceExportAccessGuard,
    EvidenceExportService,
    EvidenceExportCleanupScheduler,
    EvidenceExportCleanupWorker,
    EvidenceExportWorker,
    EvidenceGraphService,
    AuditLogService,
    RbacCacheService,
    AuditLogRetentionScheduler,
    AuditLogRetentionWorker,
    AuditLogListener,
    AuditLogInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useExisting: AuditLogInterceptor,
    },
  ],
  exports: [EvidenceService, AuditLogService],
})
export class EvidenceModule {}

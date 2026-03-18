export const AUDIT_LOG_RETENTION_QUEUE = 'audit-log-retention';
export const AUDIT_LOG_RETENTION_JOB_NAME = 'archive-audit-logs';
export const AUDIT_LOG_RETENTION_JOB_ID = 'audit-log-retention-daily';
export const AUDIT_LOG_RETENTION_SCHEDULE = '0 3 * * *';
export const AUDIT_LOG_RETENTION_WINDOW_DAYS = 90;
export const AUDIT_LOG_RETENTION_BATCH_SIZE = 500;

export const auditLogRetentionJobOptions = {
  attempts: 1,
  removeOnComplete: { count: 10 },
  removeOnFail: { count: 50 },
};

export interface AuditLogRetentionJobData {
  tenantId?: string;
  retentionDays?: number;
  batchSize?: number;
}

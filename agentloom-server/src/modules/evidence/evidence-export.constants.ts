export const EVIDENCE_EXPORT_QUEUE = 'evidence-export';
export const EVIDENCE_EXPORT_JOB_NAME = 'run-evidence-export';
export const EVIDENCE_EXPORT_CLEANUP_QUEUE = 'evidence-export-cleanup';
export const EVIDENCE_EXPORT_CLEANUP_JOB_NAME = 'expire-evidence-exports';
export const EVIDENCE_EXPORT_CLEANUP_JOB_ID =
  'evidence-export-cleanup-hourly';
export const EVIDENCE_EXPORT_CLEANUP_SCHEDULE = '0 * * * *';
export const EVIDENCE_EXPORT_ARTIFACT_FORMAT = 'zip';
export const EVIDENCE_EXPORT_ARCHIVE_MIME_TYPE = 'application/zip';
export const EVIDENCE_EXPORT_MAX_EXECUTIONS = 100;
export const EVIDENCE_EXPORT_RETENTION_HOURS = 72;
export const EVIDENCE_EXPORT_DOWNLOAD_URL_TTL_SECONDS = 15 * 60;
export const EVIDENCE_EXPORT_CLEANUP_BATCH_SIZE = 100;
export const EVIDENCE_EXPORT_STORAGE_PREFIX = 'evidence-exports';
export const EVIDENCE_EXPORT_BUNDLE_MANIFEST_PATH = 'manifest.json';
export const EVIDENCE_EXPORT_BUNDLE_DATA_PATH = 'export-data.json';
export const EVIDENCE_EXPORT_BUNDLE_REPORT_PATH = 'report.md';

export const evidenceExportDefaultJobOptions = {
  attempts: 3,
  removeOnComplete: { count: 20 },
  removeOnFail: { count: 50 },
};

export const evidenceExportCleanupJobOptions = {
  attempts: 1,
  removeOnComplete: { count: 10 },
  removeOnFail: { count: 50 },
};

export interface EvidenceExportQueueJobData {
  exportId: string;
  tenantId: string;
}

export interface EvidenceExportCleanupJobData {
  tenantId?: string;
  batchSize?: number;
  expiresBefore?: string;
}

export function buildEvidenceExportArchiveFileName(exportId: string): string {
  return `evidence-export-${exportId}.zip`;
}

export function buildEvidenceExportStorageKey(
  tenantId: string,
  exportId: string,
): string {
  return `${EVIDENCE_EXPORT_STORAGE_PREFIX}/${tenantId}/${buildEvidenceExportArchiveFileName(exportId)}`;
}

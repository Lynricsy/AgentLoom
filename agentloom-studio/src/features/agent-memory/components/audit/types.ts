export type AuditOperationType = 'create' | 'update' | 'delete' | 'rollback';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export type ReviewAction = 'approve' | 'reject';

export interface AuditLogEntry {
  id: string;
  instanceId: string;
  nodeId: string;
  nodeName: string;
  versionId: string;
  operationType: AuditOperationType;
  actor: string;
  actorId: string;
  timestamp: string;
  changeSummary: string;
  previousValue: string | null;
  currentValue: string | null;
  reviewStatus: ReviewStatus;
  metadata: Record<string, unknown>;
}

export interface MemoryVersion {
  id: string;
  nodeId: string;
  nodeName: string;
  versionNumber: number;
  content: string;
  createdAt: string;
  createdBy: string;
  reviewStatus: ReviewStatus;
  changeDescription: string;
}

export interface PendingReview {
  id: string;
  instanceId: string;
  nodeId: string;
  nodeName: string;
  versionId: string;
  versionNumber: number;
  operationType: AuditOperationType;
  actor: string;
  createdAt: string;
  changeSummary: string;
  previousValue: string | null;
  currentValue: string | null;
}

export interface AuditLogFilters {
  page: number;
  pageSize: number;
  operationType?: AuditOperationType;
  startDate?: string;
  endDate?: string;
  nodeName?: string;
}

export interface ReviewRequestBody {
  nodeId: string;
  versionId: string;
  action: ReviewAction;
}

export interface RollbackParams {
  instanceId: string;
  nodeId: string;
  versionId: string;
}

export interface VersionDiffSelection {
  oldVersion: MemoryVersion;
  newVersion: MemoryVersion;
}

export interface MemoryVersionCreatedEvent {
  instanceId: string;
  nodeId: string;
  versionId: string;
  operationType: AuditOperationType;
  actor: string;
}

export interface MemoryVersionRollbackEvent {
  instanceId: string;
  nodeId: string;
  versionId: string;
  rolledBackToVersionId: string;
  actor: string;
}

export interface MemoryReviewSubmittedEvent {
  instanceId: string;
  nodeId: string;
  versionId: string;
  action: ReviewAction;
  reviewer: string;
}

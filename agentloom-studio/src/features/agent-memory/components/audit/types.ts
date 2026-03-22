/**
 * 记忆审计仪表板 — 类型定义
 */

/** 审计日志操作类型 */
export type AuditOperationType = 'create' | 'update' | 'delete' | 'rollback';

/** 审核状态 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

/** 审核操作 */
export type ReviewAction = 'approve' | 'reject';

/** 审计日志条目 */
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

/** 版本信息 */
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

/** 待审核项 */
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

/** 审计日志筛选参数 */
export interface AuditLogFilters {
  page: number;
  pageSize: number;
  operationType?: AuditOperationType;
  startDate?: string;
  endDate?: string;
  nodeName?: string;
}

/** 审核请求体 */
export interface ReviewRequestBody {
  nodeId: string;
  versionId: string;
  action: ReviewAction;
}

/** 回滚请求参数 */
export interface RollbackParams {
  instanceId: string;
  nodeId: string;
  versionId: string;
}

/** 版本对比选择 */
export interface VersionDiffSelection {
  oldVersion: MemoryVersion;
  newVersion: MemoryVersion;
}

/** Socket.IO 实时事件载荷 */
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

// 本文件集中定义 Generated App 的领域契约；不得包含数据库表或持久化实现。
// AppSpec 与 generation_plan 的形状分别在 app-spec-v2.schema.ts 与 generation-plan-v2.types.ts。

export type { GeneratedAppSpecV2 } from './app-spec-v2.schema';

export type GeneratedAppReadinessState =
  'preview' | 'trial' | 'publish_candidate' | 'blocked';

export type GeneratedAppGateStatus =
  'pending' | 'running' | 'passed' | 'failed' | 'warning' | 'skipped';

export interface GeneratedAppGateEvidence {
  id: string;
  label: string;
  kind:
    | 'app_spec'
    | 'plan'
    | 'static_check'
    | 'build'
    | 'test'
    | 'browser'
    | 'verifier'
    | 'manual';
  url: string | null;
  summary: string;
  details?: unknown;
}

export interface GeneratedAppRepairPlan {
  planVersion: 1;
  source: 'automatic-failed-gate-work-order' | 'manual-repair-work-order';
  targetGateId: string;
  targetGateName: string;
  failureCode: string | null;
  failureSummary: string;
  repairInstructions: string | null;
  evidenceIds: string[];
  evidenceSummaries: string[];
  /** v2 生成运行只能通过调整 AppSpec、绑定目标或重新运行来修复；不生成前端、插件或编排代码 */
  allowedChangeScopes: Array<
    | 'app-spec'
    | 'generation-plan'
    | 'static-contracts'
    | 'binding-target'
    | 'test-contracts'
    | 'publish-contract'
  >;
  forbiddenChangeScopes: Array<
    | 'tenant-boundary'
    | 'public-share-token'
    | 'host-absolute-path'
    | 'production-credentials'
    | 'external-network-without-permission'
    | 'unrelated-gate-rewrite'
  >;
  patchTargets: string[];
  requiredTraceability: string[];
  generatedAt: string;
}

export interface GeneratedAppReverificationPlan {
  planVersion: 1;
  targetGateId: string;
  requiredGateIds: string[];
  requiredCommandIds: string[];
  requiredEvidenceIds: string[];
  successCriteria: string[];
  blockedUntilPatchApplied: boolean;
  generatedAt: string;
}

export interface GeneratedAppGateResult {
  gateId: string;
  order: number;
  name: string;
  blocking: boolean;
  status: GeneratedAppGateStatus;
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  updatedAt: string;
}

export interface GeneratedAppGateRunFailure {
  code?: string;
  message: string;
  details?: unknown;
}

export interface GeneratedAppReadiness {
  state: GeneratedAppReadinessState;
  canCreatePublicShare: boolean;
  blockingIssueCount: number;
  warningCount: number;
  summary: string;
  blockers: Array<{
    gateId: string;
    name: string;
    status: GeneratedAppGateStatus;
    summary: string;
  }>;
  warnings: Array<{
    gateId: string;
    name: string;
    status: GeneratedAppGateStatus;
    summary: string;
  }>;
}

export interface GeneratedAppPreview {
  previewUrl: string | null;
  sourceArtifactUrl: string | null;
  testReportUrl: string | null;
}

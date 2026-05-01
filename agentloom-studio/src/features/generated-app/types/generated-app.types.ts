import type { PaginatedResponse } from '@/shared/types/api'

export type GeneratedAppStatus =
  | 'app_spec_ready'
  | 'preview_ready'
  | 'trial_ready'
  | 'publish_candidate'
  | 'published'
  | 'failed'

export type GeneratedAppReadinessState =
  | 'preview'
  | 'trial'
  | 'publish_candidate'
  | 'blocked'

export type GeneratedAppGateStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'warning'
  | 'skipped'

export type GeneratedAppCanonicalGateId =
  | 'gate-0'
  | 'gate-1'
  | 'gate-2'
  | 'gate-3'
  | 'gate-4'
  | 'gate-5'
  | 'gate-6'
  | 'gate-7'

export type GeneratedAppGateRunStatus =
  | 'running'
  | 'passed'
  | 'failed'
  | 'warning'
  | 'skipped'

export type GeneratedAppGenerationRunStatus =
  | 'queued'
  | 'running'
  | 'repairing'
  | 'passed'
  | 'failed'
  | 'cancelled'

export type GeneratedAppGenerationRunTrigger =
  | 'initial'
  | 'manual'
  | 'retry'
  | 'system'

export type GeneratedAppRepairAttemptStatus =
  | 'planned'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'

export type GeneratedAppSubmissionStatus =
  | 'received'
  | 'running'
  | 'completed'
  | 'failed'

export type GeneratedAppWorkflowExecutionStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface GeneratedAppPublicWorkflowExecutionSummary {
  summary?: string
  completedSteps?: number
  failedSteps?: number
  cancelledSteps?: number
  totalSteps?: number
  latestStepCompletedAt?: string | null
}

export interface GeneratedAppPublicWorkflowExecutionHandoff {
  workflowExecution?: boolean
  executionId?: string | null
  executionStatus?: GeneratedAppWorkflowExecutionStatus | null
  workflowDefinitionId?: string | null
  executionBoundary?: string | null
  workflowExecutionNotStartedReason?: string | null
  workflowExecutionNotice?: string | null
  workflowExecutionUpdatedAt?: string | null
  workflowExecutionCompletedAt?: string | null
  workflowExecutionSummary?: GeneratedAppPublicWorkflowExecutionSummary | null
}

export type GeneratedAppGateEvidenceKind =
  | 'app_spec'
  | 'plan'
  | 'static_check'
  | 'build'
  | 'test'
  | 'browser'
  | 'verifier'
  | 'manual'

export interface GeneratedAppAcceptanceScenario {
  id: string
  title: string
  requirementIds: string[]
  given: string[]
  when: string[]
  then: string[]
}

export interface GeneratedAppSpec {
  version: 1
  appName: string
  summary: string
  userGoal: string
  actors: string[]
  coreRequirements: Array<{
    id: string
    text: string
  }>
  pages: Array<{
    id: string
    name: string
    purpose: string
  }>
  dataPolicy: {
    publicSubmissionsPersisted: boolean
    creatorCanDeleteSubmissions: boolean
    endUserLoginRequired: boolean
  }
  nonGoals: string[]
  acceptanceScenarios: GeneratedAppAcceptanceScenario[]
  traceability: Array<{
    requirementId: string
    scenarioIds: string[]
    evidenceIds: string[]
  }>
}

export interface GeneratedAppGateEvidence {
  id: string
  label: string
  kind: GeneratedAppGateEvidenceKind
  url: string | null
  summary: string
}

export interface GeneratedAppGateResult {
  gateId: string
  order: number
  name: string
  blocking: boolean
  status: GeneratedAppGateStatus
  summary: string
  evidence: GeneratedAppGateEvidence[]
  updatedAt: string
}

export interface GeneratedAppReadiness {
  state: GeneratedAppReadinessState
  canCreatePublicShare: boolean
  blockingIssueCount: number
  warningCount: number
  summary: string
  blockers: Array<{
    gateId: string
    name: string
    status: GeneratedAppGateStatus
    summary: string
  }>
  warnings: Array<{
    gateId: string
    name: string
    status: GeneratedAppGateStatus
    summary: string
  }>
}

export interface GeneratedAppPreview {
  previewUrl: string | null
  sourceArtifactUrl: string | null
  testReportUrl: string | null
}

export interface GeneratedApp {
  id: string
  tenantId: string
  prompt: string
  appName: string
  description: string
  status: GeneratedAppStatus
  appSpec: GeneratedAppSpec
  generationPlan: Record<string, unknown> | null
  gateResults: GeneratedAppGateResult[]
  readiness: GeneratedAppReadiness
  preview: GeneratedAppPreview
  agentDefinitionId: string | null
  workflowDefinitionId: string | null
  pluginIds: string[]
  publicShareEnabled: boolean
  publicShareToken: string | null
  publicShareUrl: string | null
  publicShareCreatedAt: string | null
  publicShareDisabledAt: string | null
  publicViewCount: number
  createdAt: string
  updatedAt: string
}

export interface GeneratedAppGenerationRun {
  id: string
  tenantId: string
  appId: string
  runNumber: number
  status: GeneratedAppGenerationRunStatus
  triggerSource: GeneratedAppGenerationRunTrigger
  maxRepairAttempts: number
  maxRuntimeSeconds: number
  summary: string
  failureReason: string | null
  startedAt: string
  completedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface GeneratedAppRepairAttempt {
  id: string
  tenantId: string
  appId: string
  generationRunId: string
  attemptNumber: number
  targetGateId: GeneratedAppCanonicalGateId
  status: GeneratedAppRepairAttemptStatus
  failureSummary: string
  changeSummary: string | null
  verificationSummary: string | null
  startedAt: string
  completedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface GeneratedAppGateRunFailure {
  code?: string
  message: string
  details?: unknown
}

export interface GeneratedAppGateRun {
  id: string
  tenantId: string
  appId: string
  generationRunId: string | null
  repairAttemptId: string | null
  gateId: GeneratedAppCanonicalGateId
  gateOrder: number
  gateName: string
  blocking: boolean
  attemptNumber: number
  status: GeneratedAppGateRunStatus
  summary: string
  evidence: GeneratedAppGateEvidence[]
  failure: GeneratedAppGateRunFailure | null
  repairInstructions: string | null
  startedAt: string
  completedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface GeneratedAppSubmission {
  id: string
  tenantId: string
  appId: string
  appSpecVersion: number
  publicShareToken: string
  anonymousSessionId: string
  status: GeneratedAppSubmissionStatus
  input: Record<string, unknown>
  result:
    | (Record<string, unknown> & GeneratedAppPublicWorkflowExecutionHandoff)
    | null
  report:
    | (Record<string, unknown> & GeneratedAppPublicWorkflowExecutionHandoff)
    | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface GeneratedAppPublicSubmission {
  id: string
  appId: string
  appSpecVersion: number
  status: GeneratedAppSubmissionStatus
  anonymousSessionId: string
  input: Record<string, unknown>
  result:
    | (Record<string, unknown> & GeneratedAppPublicWorkflowExecutionHandoff)
    | null
  report:
    | (Record<string, unknown> & GeneratedAppPublicWorkflowExecutionHandoff)
    | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateGeneratedAppPayload {
  prompt: string
}

export interface ListGeneratedAppsParams {
  page?: number
  pageSize?: number
  status?: GeneratedAppStatus
}

export interface ListGeneratedAppSubmissionsParams {
  page?: number
  pageSize?: number
  status?: GeneratedAppSubmissionStatus
}

export interface ListGeneratedAppGenerationRunsParams {
  page?: number
  pageSize?: number
  status?: GeneratedAppGenerationRunStatus
}

export interface ListGeneratedAppRepairAttemptsParams {
  page?: number
  pageSize?: number
  status?: GeneratedAppRepairAttemptStatus
  targetGateId?: GeneratedAppCanonicalGateId
}

export interface ListGeneratedAppGateRunsParams {
  page?: number
  pageSize?: number
  gateId?: GeneratedAppCanonicalGateId
  status?: GeneratedAppGateRunStatus
  generationRunId?: string
  repairAttemptId?: string
}

export interface CreateGeneratedAppPublicSubmissionPayload {
  anonymousSessionId?: string
  input?: Record<string, unknown>
  clientContext?: Record<string, unknown>
}

export interface StartGeneratedAppGenerationRunPayload {
  triggerSource?: GeneratedAppGenerationRunTrigger
  maxRepairAttempts?: number
  maxRuntimeSeconds?: number
}

export interface StartGeneratedAppGenerationRunResponse {
  generationRun: GeneratedAppGenerationRun
  gateRuns: GeneratedAppGateRun[]
  app: GeneratedApp
}

export interface RecordGeneratedAppGateResultsPayload {
  gateResults: GeneratedAppGateResult[]
  generationPlan?: Record<string, unknown> | null
  preview?: GeneratedAppPreview
}

export type GeneratedAppListResponse = PaginatedResponse<GeneratedApp>
export type GeneratedAppGenerationRunListResponse =
  PaginatedResponse<GeneratedAppGenerationRun>
export type GeneratedAppRepairAttemptListResponse =
  PaginatedResponse<GeneratedAppRepairAttempt>
export type GeneratedAppGateRunListResponse =
  PaginatedResponse<GeneratedAppGateRun>
export type GeneratedAppSubmissionListResponse =
  PaginatedResponse<GeneratedAppSubmission>

export interface DeleteGeneratedAppSubmissionsResponse {
  deletedCount: number
}

export interface GeneratedAppPublicRuntimeSpec {
  version: 1
  appName: string
  summary: string
  userGoal: string
  actors: string[]
  pages: Array<{
    id: string
    name: string
    purpose: string
  }>
}

export type GeneratedAppRuntimeFormFieldType =
  | 'text'
  | 'textarea'
  | 'single_select'
  | 'multi_select'
  | 'number'
  | 'range'

export interface GeneratedAppRuntimeFormOption {
  value: string
  label: string
}

export interface GeneratedAppRuntimeFormField {
  id: string
  label: string
  type: GeneratedAppRuntimeFormFieldType
  required: boolean
  placeholder: string
  helpText: string
  options: GeneratedAppRuntimeFormOption[]
  min?: number
  max?: number
  step?: number
}

export interface GeneratedAppRuntimeFormSection {
  id: string
  title: string
  description: string
  fieldIds: string[]
}

export interface GeneratedAppRuntimeResultView {
  title: string
  description: string
  emptyState: string
  successTitle: string
  nextStepHint: string
}

export interface GeneratedAppRuntimeForm {
  formId: string
  title: string
  description: string
  submitLabel: string
  sections: GeneratedAppRuntimeFormSection[]
  fields: GeneratedAppRuntimeFormField[]
  resultView: GeneratedAppRuntimeResultView
}

export interface GeneratedAppPublicRuntime {
  token: string
  appId: string
  title: string
  description: string
  dataUseNotice: string
  appSpec: GeneratedAppPublicRuntimeSpec
  runtimeSurface: {
    kind: 'generated-app'
    previewUrl: string | null
  }
  runtimeForm: GeneratedAppRuntimeForm
  createdAt: string
}

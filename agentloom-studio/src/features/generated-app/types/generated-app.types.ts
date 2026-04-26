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

export type GeneratedAppSubmissionStatus =
  | 'received'
  | 'running'
  | 'completed'
  | 'failed'

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

export interface GeneratedAppSubmission {
  id: string
  tenantId: string
  appId: string
  appSpecVersion: number
  publicShareToken: string
  anonymousSessionId: string
  status: GeneratedAppSubmissionStatus
  input: Record<string, unknown>
  result: Record<string, unknown> | null
  report: Record<string, unknown> | null
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
  result: Record<string, unknown> | null
  report: Record<string, unknown> | null
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

export interface CreateGeneratedAppPublicSubmissionPayload {
  anonymousSessionId?: string
  input?: Record<string, unknown>
  clientContext?: Record<string, unknown>
}

export interface RecordGeneratedAppGateResultsPayload {
  gateResults: GeneratedAppGateResult[]
  generationPlan?: Record<string, unknown> | null
  preview?: GeneratedAppPreview
}

export type GeneratedAppListResponse = PaginatedResponse<GeneratedApp>
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
  createdAt: string
}

import type {
  CreateGeneratedAppGateRunDtoEvidenceInnerKindEnum,
  RecordGeneratedAppGateResultsDto,
} from '@agentloom/api-client'
import type { PaginatedResponse } from '@/shared/types/api'

export type GeneratedAppStatus =
  | 'app_spec_generating'
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

/** 提交来源：终端用户经公开链接提交，或 Gate 5 浏览器验收经验收令牌提交 */
export type GeneratedAppSubmissionOrigin = 'public' | 'gate-acceptance'

export type GeneratedAppRuntimeBindingReadinessState =
  /** 还没有 v2 AppSpec，或 Agent 绑定的包装工作流尚未创建 */
  | 'runtime_not_bound'
  | 'workflow_not_found'
  | 'workflow_not_published'
  /** 绑定的工作流已重新发布：应用仍执行固定版本，重新生成才会采用新版本 */
  | 'workflow_version_drift'
  | 'workflow_published'

/** 创建时指定的绑定目标；null 表示由模型在租户候选中选择 */
export type GeneratedAppBindingTarget =
  | { kind: 'workflow'; workflowDefinitionId: string }
  | { kind: 'agent'; agentDefinitionId: string }

export type GeneratedAppGateEvidenceKind =
  CreateGeneratedAppGateRunDtoEvidenceInnerKindEnum

export type GeneratedAppFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'single_select'
  | 'multi_select'

export interface GeneratedAppFieldOption {
  value: string
  label: string
}

interface GeneratedAppFieldBase {
  /** 提交 JSON 的键，也是公开页控件的 data-field-id */
  id: string
  label: string
  required: boolean
  helpText: string
  placeholder: string
}

export type GeneratedAppField =
  | (GeneratedAppFieldBase & {
      type: 'text' | 'textarea'
      maxLength: number
    })
  | (GeneratedAppFieldBase & {
      type: 'number'
      min?: number
      max?: number
    })
  | (GeneratedAppFieldBase & {
      type: 'single_select' | 'multi_select'
      options: GeneratedAppFieldOption[]
    })

export type GeneratedAppResultFormat = 'text' | 'markdown' | 'citations' | 'json'

export interface GeneratedAppResultSection {
  id: string
  label: string
  format: GeneratedAppResultFormat
}

export interface GeneratedAppResultView {
  title: string
  emptyState: string
  sections: GeneratedAppResultSection[]
}

export interface GeneratedAppInputForm {
  title: string
  description: string
  submitLabel: string
  fields: GeneratedAppField[]
}

export type GeneratedAppBrowserStep =
  | { action: 'fill'; fieldId: string; value: string }
  | { action: 'select'; fieldId: string; values: string[] }
  | { action: 'submit' }
  | {
      action: 'expectResult'
      sectionId: string
      assertion: 'nonEmpty' | 'contains'
      text?: string
    }

export interface GeneratedAppAcceptanceScenario {
  id: string
  title: string
  scope: 'requirement' | 'platform'
  requirementIds: string[]
  given: string[]
  when: string[]
  then: string[]
  browserSteps: GeneratedAppBrowserStep[]
}

export type GeneratedAppBinding =
  | {
      kind: 'workflow'
      workflowDefinitionId: string
      workflowVersionId: string
      inputMapping: Array<{ fieldId: string; workflowInputFieldId: string }>
      outputMapping: Array<{ sectionId: string; nodeId: string; path?: string }>
    }
  | {
      kind: 'agent'
      agentDefinitionId: string
      agentVersionId: string
      replySectionId: string
    }

/** AppSpec v2：由模型按需求生成，绑定固定到生成时解析的已发布版本 */
export interface GeneratedAppSpec {
  version: 2
  appName: string
  summary: string
  userGoal: string
  actors: string[]
  coreRequirements: Array<{
    id: string
    text: string
    source: 'prompt' | 'platform'
  }>
  pages: Array<{
    id: string
    name: string
    purpose: string
  }>
  inputForm: GeneratedAppInputForm
  resultView: GeneratedAppResultView
  binding: GeneratedAppBinding
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
    fieldIds: string[]
    sectionIds: string[]
  }>
  generation: {
    modelConfigId: string
    generatedAt: string
    attempt: number
    promptSha256: string
  }
}

export interface GeneratedAppGateEvidence {
  id: string
  label: string
  kind: GeneratedAppGateEvidenceKind
  url: string | null
  summary: string
  /**
   * server `CreateGeneratedAppGateRunDto.evidence[].details` 的自由载荷。
   * 原手写类型漏掉了这个字段；生成产物里它是无约束类型，这里用 `unknown` 承接。
   */
  details?: unknown
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

export interface GeneratedAppRepairPlan {
  planVersion: 1
  source: 'automatic-failed-gate-work-order' | 'manual-repair-work-order'
  targetGateId: GeneratedAppCanonicalGateId
  targetGateName: string
  failureCode: string | null
  failureSummary: string
  repairInstructions: string | null
  evidenceIds: string[]
  evidenceSummaries: string[]
  allowedChangeScopes: string[]
  forbiddenChangeScopes: string[]
  patchTargets: string[]
  requiredTraceability: string[]
  generatedAt: string
}

export interface GeneratedAppReverificationPlan {
  planVersion: 1
  targetGateId: GeneratedAppCanonicalGateId
  requiredGateIds: GeneratedAppCanonicalGateId[]
  requiredCommandIds: string[]
  requiredEvidenceIds: string[]
  successCriteria: string[]
  blockedUntilPatchApplied: boolean
  generatedAt: string
}

export interface GeneratedApp {
  id: string
  tenantId: string
  prompt: string
  appName: string
  description: string
  status: GeneratedAppStatus
  /** 生成中或 Gate 0 失败时为 null */
  appSpec: GeneratedAppSpec | null
  generationModelConfigId: string | null
  bindingTarget: GeneratedAppBindingTarget | null
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

export interface GeneratedAppRuntimeBindingReadiness {
  state: GeneratedAppRuntimeBindingReadinessState
  workflowDefinitionId: string | null
  workflowStatus: string | null
  publishedVersionId: string | null
  /** 公开提交实际执行的固定版本 */
  pinnedVersionId: string | null
  canStartWorkflowExecution: boolean
  summary: string
  notice: string
  updatedAt: string
}

export type GeneratedAppArtifactKind =
  | 'workspace_source_file'
  | 'workspace_test_file'
  | 'source_manifest'
  | 'source_artifact_manifest'
  | 'build_output'
  | 'build_manifest'
  | 'unit_test_report'
  | 'typecheck_report'
  | 'component_golden_report'
  | 'coverage_summary'

export interface GeneratedAppArtifactSummary {
  artifactId: string
  label: string
  kind: GeneratedAppArtifactKind
  path: string
  materialized: boolean
  sizeBytes: number | null
  contentType: string
  readable: boolean
  updatedAt: string | null
}

export interface GeneratedAppArtifactManifest {
  workspace: {
    workspaceId: string
    rootLabel: string
    relativePath: string
    scaffold: string
    executionLevel: string | null
    materialized: boolean
  } | null
  artifacts: GeneratedAppArtifactSummary[]
  updatedAt: string
}

export interface GeneratedAppArtifactContent {
  artifact: GeneratedAppArtifactSummary
  content: string
  truncated: boolean
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
  repairPlan: GeneratedAppRepairPlan | null
  reverificationPlan: GeneratedAppReverificationPlan | null
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

/** 公开提交的结果分区：值已在服务端公开脱敏，执行失败或缺失输出时为 null */
export type GeneratedAppRuntimeResultSectionValue =
  | { format: 'text' | 'markdown'; value: string | null }
  | {
      format: 'citations'
      value: GeneratedAppRuntimeCitation[] | null
    }
  | { format: 'json'; value: unknown }

export interface GeneratedAppRuntimeCitation {
  title?: string
  quote?: string
  source?: string
}

export type GeneratedAppRuntimeResultSection = {
  sectionId: string
  label: string
} & GeneratedAppRuntimeResultSectionValue

export interface GeneratedAppRuntimeResult {
  status: 'running' | 'completed' | 'failed'
  sections: GeneratedAppRuntimeResultSection[]
  /** 公开可见的失败原因 */
  publicError: string | null
}

/** submission.report：执行引用，只对创建者可见 */
export interface GeneratedAppRuntimeExecutionReport {
  kind: 'generated-app-runtime-execution'
  workflowDefinitionId: string | null
  workflowVersionId: string | null
  executionId: string | null
  /** 未启动执行的原因：运行时绑定状态，或执行服务拒绝时的错误类型 */
  notStartedReason: string | null
}

export interface GeneratedAppSubmission {
  id: string
  tenantId: string
  appId: string
  appSpecVersion: number
  publicShareToken: string | null
  origin: GeneratedAppSubmissionOrigin
  /** gate-acceptance 提交所属的生成运行；public 提交为 null */
  generationRunId: string | null
  anonymousSessionId: string
  status: GeneratedAppSubmissionStatus
  input: Record<string, unknown>
  /** v2 为 GeneratedAppRuntimeResult；v1 历史提交保留原形状 */
  result: Record<string, unknown> | null
  /** v2 为 GeneratedAppRuntimeExecutionReport；v1 历史提交保留原形状 */
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
  /** 执行结束后按结果视图填充分区；执行中为 status=running、sections 为空 */
  result: GeneratedAppRuntimeResult | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateGeneratedAppPayload {
  prompt: string
  /** 生成 AppSpec 用的本租户 chat 模型；省略时用租户默认 chat 模型 */
  modelConfigId?: string
  /** 省略时由模型在本租户已发布的工作流与 Agent 中选择 */
  bindingTarget?: GeneratedAppBindingTarget
}

/** 创建响应：应用本体 + 服务端自动排队的 initial 生成运行 id */
export interface CreatedGeneratedApp extends GeneratedApp {
  generationRunId: string
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
  /** 服务端默认 public */
  origin?: GeneratedAppSubmissionOrigin
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
  /** true 时 Gate 0 丢弃已存 AppSpec 并重新生成；triggerSource 为 retry 时同样重新生成 */
  regenerateAppSpec?: boolean
}

/** HTTP 202：运行只是排队（status=queued），gateRuns 恒为空；结果靠轮询运行详情与 Gate 列表 */
export interface StartGeneratedAppGenerationRunResponse {
  generationRun: GeneratedAppGenerationRun
  gateRuns: GeneratedAppGateRun[]
  app: GeneratedApp
}

/**
 * PATCH /generated-apps/:id/gates 请求体（生成模型）。
 * 提交侧比响应实体宽松：server 对 `order` / `blocking` / `evidence` / `updatedAt`
 * 都允许省略并自行补默认值，响应里这些字段一定有值。
 * `generationPlan` 收窄为 `Record<string, unknown>`（生成产物是无约束索引签名）。
 */
export type RecordGeneratedAppGateResultsPayload = Omit<
  RecordGeneratedAppGateResultsDto,
  'generationPlan'
> & {
  generationPlan?: Record<string, unknown> | null
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

export type GeneratedAppPublicRuntimeSpec = Pick<
  GeneratedAppSpec,
  'version' | 'appName' | 'summary' | 'userGoal' | 'actors' | 'pages'
>

/** 公开页表单与结果视图，全部来自 AppSpec v2 */
export interface GeneratedAppRuntimeForm {
  formId: string
  title: string
  description: string
  submitLabel: string
  fields: GeneratedAppField[]
  resultView: GeneratedAppResultView
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

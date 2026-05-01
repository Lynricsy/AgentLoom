import { apiClient } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type {
  CreateGeneratedAppPublicSubmissionPayload,
  CreateGeneratedAppPayload,
  DeleteGeneratedAppSubmissionsResponse,
  GeneratedApp,
  GeneratedAppArtifactContent,
  GeneratedAppArtifactManifest,
  GeneratedAppGateRunListResponse,
  GeneratedAppGenerationRunListResponse,
  GeneratedAppListResponse,
  GeneratedAppPublicSubmission,
  GeneratedAppPublicRuntime,
  GeneratedAppRuntimeForm,
  GeneratedAppRuntimeBindingReadiness,
  GeneratedAppRepairAttemptListResponse,
  GeneratedAppSubmission,
  GeneratedAppSubmissionListResponse,
  ListGeneratedAppGateRunsParams,
  ListGeneratedAppGenerationRunsParams,
  ListGeneratedAppRepairAttemptsParams,
  ListGeneratedAppSubmissionsParams,
  ListGeneratedAppsParams,
  RecordGeneratedAppGateResultsPayload,
  StartGeneratedAppGenerationRunPayload,
  StartGeneratedAppGenerationRunResponse,
} from '../types'

const GENERATED_APPS_PATH = 'generated-apps'
const PUBLIC_SUBMISSION_REDACTED_VALUE = '[已移除内部内容]'
const PUBLIC_SUBMISSION_UNSAFE_VALUE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]+|(?:sk|pk)-[A-Za-z0-9_-]{12,}|[a-f0-9]{64}|(?:secret|token|credential|password|api[-_]?key)[-_:][A-Za-z0-9._~+/=-]{4,})\b|(?:^|\s)\/(?:Users|home|root|tmp|var|etc|workspace)\b|[A-Za-z]:[\\/][^\s"']*|\b(?:publicShareToken|public_share_token|definitionSnapshot|definition_snapshot|nodeData|node_data|checkpointData|checkpoint_data|toolCalls|tool_calls|sourceArtifactUrl|source_artifact_url|testReportUrl|test_report_url|inputParams|input_params|gateResults|gate_results)\b/i
const PUBLIC_SUBMISSION_FORBIDDEN_RESULT_REPORT_KEYS = new Set([
  '_meta',
  'api_key',
  'api_keys',
  'apikey',
  'apikeys',
  'authorization',
  'bearer',
  'checkpoint_data',
  'checkpointdata',
  'cookie',
  'cookies',
  'credential',
  'credentials',
  'creator_only',
  'creatoronly',
  'definition_snapshot',
  'definitionsnapshot',
  'execution_snapshot',
  'executionsnapshot',
  'execution_steps',
  'executionsteps',
  'gate_results',
  'gateresults',
  'host_path',
  'hostpath',
  'host_paths',
  'hostpaths',
  'input_params',
  'inputparams',
  'node_data',
  'nodedata',
  'password',
  'private_key',
  'privatekey',
  'plugin_ids',
  'pluginids',
  'public_share_token',
  'publicsharetoken',
  'readiness',
  'secret',
  'secrets',
  'source_artifact_url',
  'sourceartifacturl',
  'stack',
  'stack_trace',
  'stacktrace',
  'steps',
  'tenant_id',
  'tenantid',
  'test_report_url',
  'testreporturl',
  'token',
  'tokens',
  'tool_calls',
  'toolcalls',
])

type GeneratedAppSearchParamValue = number | string | null | undefined

function buildSearchParams(
  params: Record<string, GeneratedAppSearchParamValue>,
) {
  const searchParams: Record<string, string> = {}

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams[key] = String(value)
    }
  })

  return searchParams
}

function buildGeneratedAppSearchParams(params: ListGeneratedAppsParams) {
  return buildSearchParams({
    page: params.page,
    pageSize: params.pageSize,
    status: params.status,
  })
}

function buildGeneratedAppSubmissionSearchParams(
  params: ListGeneratedAppSubmissionsParams,
) {
  return buildSearchParams({
    page: params.page,
    pageSize: params.pageSize,
    status: params.status,
  })
}

function buildGeneratedAppGenerationRunSearchParams(
  params: ListGeneratedAppGenerationRunsParams,
) {
  return buildSearchParams({
    page: params.page,
    pageSize: params.pageSize,
    status: params.status,
  })
}

function buildGeneratedAppRepairAttemptSearchParams(
  params: ListGeneratedAppRepairAttemptsParams,
) {
  return buildSearchParams({
    page: params.page,
    pageSize: params.pageSize,
    status: params.status,
    targetGateId: params.targetGateId,
  })
}

function buildGeneratedAppGateRunSearchParams(
  params: ListGeneratedAppGateRunsParams,
) {
  return buildSearchParams({
    page: params.page,
    pageSize: params.pageSize,
    gateId: params.gateId,
    status: params.status,
    generationRunId: params.generationRunId,
    repairAttemptId: params.repairAttemptId,
  })
}

function toPublicRuntime(
  value: GeneratedAppPublicRuntime,
): GeneratedAppPublicRuntime {
  return {
    token: value.token,
    appId: value.appId,
    title: value.title,
    description: value.description,
    dataUseNotice: value.dataUseNotice,
    appSpec: {
      version: value.appSpec.version,
      appName: value.appSpec.appName,
      summary: value.appSpec.summary,
      userGoal: value.appSpec.userGoal,
      actors: value.appSpec.actors,
      pages: value.appSpec.pages.map((page) => ({
        id: page.id,
        name: page.name,
        purpose: page.purpose,
      })),
    },
    runtimeSurface: {
      kind: value.runtimeSurface.kind,
      previewUrl: value.runtimeSurface.previewUrl,
    },
    runtimeForm: toPublicRuntimeForm(value.runtimeForm),
    createdAt: value.createdAt,
  }
}

function toPublicRuntimeForm(
  value: GeneratedAppRuntimeForm,
): GeneratedAppRuntimeForm {
  return {
    formId: value.formId,
    title: value.title,
    description: value.description,
    submitLabel: value.submitLabel,
    sections: value.sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      fieldIds: section.fieldIds,
    })),
    fields: value.fields.map((field) => ({
      id: field.id,
      label: field.label,
      type: field.type,
      required: field.required,
      placeholder: field.placeholder,
      helpText: field.helpText,
      options: field.options.map((option) => ({
        value: option.value,
        label: option.label,
      })),
      min: field.min,
      max: field.max,
      step: field.step,
    })),
    resultView: {
      title: value.resultView.title,
      description: value.resultView.description,
      emptyState: value.resultView.emptyState,
      successTitle: value.resultView.successTitle,
      nextStepHint: value.resultView.nextStepHint,
    },
  }
}

function toPublicSubmission(
  value: GeneratedAppPublicSubmission,
): GeneratedAppPublicSubmission {
  return {
    id: value.id,
    appId: value.appId,
    appSpecVersion: value.appSpecVersion,
    status: value.status,
    anonymousSessionId: value.anonymousSessionId,
    input: value.input,
    result: sanitizePublicSubmissionPayload(value.result),
    report: sanitizePublicSubmissionPayload(value.report),
    errorMessage: value.errorMessage,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

function sanitizePublicSubmissionPayload(
  value: GeneratedAppPublicSubmission['result'],
): GeneratedAppPublicSubmission['result'] {
  if (!value) {
    return value
  }

  return sanitizePublicSubmissionValue(
    value,
  ) as GeneratedAppPublicSubmission['result']
}

function sanitizePublicSubmissionValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return PUBLIC_SUBMISSION_UNSAFE_VALUE_PATTERN.test(value)
      ? PUBLIC_SUBMISSION_REDACTED_VALUE
      : value
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizePublicSubmissionValue(item))
      .filter((item) => item !== undefined)
  }

  if (!isPlainRecord(value)) {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isForbiddenPublicSubmissionPayloadKey(key))
      .map(([key, nestedValue]) => [
        key,
        sanitizePublicSubmissionValue(nestedValue),
      ])
      .filter(([, nestedValue]) => nestedValue !== undefined),
  )
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePublicSubmissionPayloadKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, '')
}

function isForbiddenPublicSubmissionPayloadKey(key: string): boolean {
  const normalizedKey = normalizePublicSubmissionPayloadKey(key)

  return (
    PUBLIC_SUBMISSION_FORBIDDEN_RESULT_REPORT_KEYS.has(normalizedKey) ||
    normalizedKey.includes('apikey') ||
    normalizedKey.includes('authorization') ||
    normalizedKey.includes('bearer') ||
    normalizedKey.includes('credential') ||
    normalizedKey.includes('password') ||
    normalizedKey.includes('privatekey') ||
    normalizedKey.includes('secret') ||
    normalizedKey.includes('stacktrace') ||
    normalizedKey.endsWith('token') ||
    normalizedKey.endsWith('_token') ||
    normalizedKey.endsWith('tokens') ||
    normalizedKey.endsWith('_tokens')
  )
}

export async function createGeneratedApp(
  payload: CreateGeneratedAppPayload,
): Promise<GeneratedApp> {
  const response = await apiClient
    .post(GENERATED_APPS_PATH, { json: { prompt: payload.prompt } })
    .json<ApiResponse<GeneratedApp>>()

  return response.data
}

export async function listGeneratedApps(
  params: ListGeneratedAppsParams = {},
): Promise<GeneratedAppListResponse> {
  return apiClient
    .get(GENERATED_APPS_PATH, {
      searchParams: buildGeneratedAppSearchParams(params),
    })
    .json<GeneratedAppListResponse>()
}

export async function getGeneratedApp(appId: string): Promise<GeneratedApp> {
  const response = await apiClient
    .get(`${GENERATED_APPS_PATH}/${appId}`)
    .json<ApiResponse<GeneratedApp>>()

  return response.data
}

export async function getGeneratedAppRuntimeBindingReadiness(
  appId: string,
): Promise<GeneratedAppRuntimeBindingReadiness> {
  const response = await apiClient
    .get(`${GENERATED_APPS_PATH}/${appId}/runtime-binding-readiness`)
    .json<ApiResponse<GeneratedAppRuntimeBindingReadiness>>()

  return response.data
}

export async function getGeneratedAppArtifactManifest(
  appId: string,
): Promise<GeneratedAppArtifactManifest> {
  const response = await apiClient
    .get(`${GENERATED_APPS_PATH}/${appId}/artifacts`)
    .json<ApiResponse<GeneratedAppArtifactManifest>>()

  return response.data
}

export async function getGeneratedAppArtifactContent(
  appId: string,
  artifactId: string,
): Promise<GeneratedAppArtifactContent> {
  const response = await apiClient
    .get(
      `${GENERATED_APPS_PATH}/${appId}/artifacts/${encodeURIComponent(
        artifactId,
      )}`,
    )
    .json<ApiResponse<GeneratedAppArtifactContent>>()

  return response.data
}

export async function startGeneratedAppGenerationRun(
  appId: string,
  payload: StartGeneratedAppGenerationRunPayload = {},
): Promise<StartGeneratedAppGenerationRunResponse> {
  const response = await apiClient
    .post(`${GENERATED_APPS_PATH}/${appId}/generation-runs/start`, {
      json: payload,
    })
    .json<ApiResponse<StartGeneratedAppGenerationRunResponse>>()

  return response.data
}

export async function listGeneratedAppGenerationRuns(
  appId: string,
  params: ListGeneratedAppGenerationRunsParams = {},
): Promise<GeneratedAppGenerationRunListResponse> {
  return apiClient
    .get(`${GENERATED_APPS_PATH}/${appId}/generation-runs`, {
      searchParams: buildGeneratedAppGenerationRunSearchParams(params),
    })
    .json<GeneratedAppGenerationRunListResponse>()
}

export async function listGeneratedAppRepairAttempts(
  appId: string,
  generationRunId: string,
  params: ListGeneratedAppRepairAttemptsParams = {},
): Promise<GeneratedAppRepairAttemptListResponse> {
  return apiClient
    .get(
      `${GENERATED_APPS_PATH}/${appId}/generation-runs/${generationRunId}/repair-attempts`,
      {
        searchParams: buildGeneratedAppRepairAttemptSearchParams(params),
      },
    )
    .json<GeneratedAppRepairAttemptListResponse>()
}

export async function listGeneratedAppGateRuns(
  appId: string,
  params: ListGeneratedAppGateRunsParams = {},
): Promise<GeneratedAppGateRunListResponse> {
  return apiClient
    .get(`${GENERATED_APPS_PATH}/${appId}/gate-runs`, {
      searchParams: buildGeneratedAppGateRunSearchParams(params),
    })
    .json<GeneratedAppGateRunListResponse>()
}

export async function listGeneratedAppSubmissions(
  appId: string,
  params: ListGeneratedAppSubmissionsParams = {},
): Promise<GeneratedAppSubmissionListResponse> {
  return apiClient
    .get(`${GENERATED_APPS_PATH}/${appId}/submissions`, {
      searchParams: buildGeneratedAppSubmissionSearchParams(params),
    })
    .json<GeneratedAppSubmissionListResponse>()
}

export async function getGeneratedAppSubmission(
  appId: string,
  submissionId: string,
): Promise<GeneratedAppSubmission> {
  const response = await apiClient
    .get(`${GENERATED_APPS_PATH}/${appId}/submissions/${submissionId}`)
    .json<ApiResponse<GeneratedAppSubmission>>()

  return response.data
}

export async function deleteGeneratedAppSubmission(
  appId: string,
  submissionId: string,
): Promise<DeleteGeneratedAppSubmissionsResponse> {
  const response = await apiClient
    .delete(`${GENERATED_APPS_PATH}/${appId}/submissions/${submissionId}`)
    .json<ApiResponse<DeleteGeneratedAppSubmissionsResponse>>()

  return response.data
}

export async function deleteGeneratedAppSubmissions(
  appId: string,
  ids: string[],
): Promise<DeleteGeneratedAppSubmissionsResponse> {
  const response = await apiClient
    .post(`${GENERATED_APPS_PATH}/${appId}/submissions/delete`, {
      json: { ids },
    })
    .json<ApiResponse<DeleteGeneratedAppSubmissionsResponse>>()

  return response.data
}

export async function getGeneratedAppPublicRuntime(
  token: string,
): Promise<GeneratedAppPublicRuntime> {
  const response = await apiClient
    .get(`${GENERATED_APPS_PATH}/public/${encodeURIComponent(token)}`)
    .json<ApiResponse<GeneratedAppPublicRuntime>>()

  return toPublicRuntime(response.data)
}

export async function createGeneratedAppPublicSubmission(
  token: string,
  payload: CreateGeneratedAppPublicSubmissionPayload = {},
): Promise<GeneratedAppPublicSubmission> {
  const response = await apiClient
    .post(
      `${GENERATED_APPS_PATH}/public/${encodeURIComponent(token)}/submissions`,
      { json: payload },
    )
    .json<ApiResponse<GeneratedAppPublicSubmission>>()

  return toPublicSubmission(response.data)
}

export async function getGeneratedAppPublicSubmission(
  token: string,
  submissionId: string,
): Promise<GeneratedAppPublicSubmission> {
  const response = await apiClient
    .get(
      `${GENERATED_APPS_PATH}/public/${encodeURIComponent(
        token,
      )}/submissions/${submissionId}`,
    )
    .json<ApiResponse<GeneratedAppPublicSubmission>>()

  return toPublicSubmission(response.data)
}

export async function recordGeneratedAppGateResults(
  appId: string,
  payload: RecordGeneratedAppGateResultsPayload,
): Promise<GeneratedApp> {
  const response = await apiClient
    .patch(`${GENERATED_APPS_PATH}/${appId}/gates`, { json: payload })
    .json<ApiResponse<GeneratedApp>>()

  return response.data
}

export async function enableGeneratedAppPublicShare(
  appId: string,
): Promise<GeneratedApp> {
  const response = await apiClient
    .post(`${GENERATED_APPS_PATH}/${appId}/public-share`)
    .json<ApiResponse<GeneratedApp>>()

  return response.data
}

export async function regenerateGeneratedAppPublicShare(
  appId: string,
): Promise<GeneratedApp> {
  const response = await apiClient
    .post(`${GENERATED_APPS_PATH}/${appId}/public-share/regenerate`)
    .json<ApiResponse<GeneratedApp>>()

  return response.data
}

export async function disableGeneratedAppPublicShare(
  appId: string,
): Promise<GeneratedApp> {
  const response = await apiClient
    .delete(`${GENERATED_APPS_PATH}/${appId}/public-share`)
    .json<ApiResponse<GeneratedApp>>()

  return response.data
}

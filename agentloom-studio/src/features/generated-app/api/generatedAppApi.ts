import { apiClient } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type {
  CreateGeneratedAppPublicSubmissionPayload,
  CreateGeneratedAppPayload,
  CreatedGeneratedApp,
  DeleteGeneratedAppSubmissionsResponse,
  GeneratedApp,
  GeneratedAppArtifactContent,
  GeneratedAppArtifactManifest,
  GeneratedAppGateRunListResponse,
  GeneratedAppGenerationRun,
  GeneratedAppGenerationRunListResponse,
  GeneratedAppListResponse,
  GeneratedAppField,
  GeneratedAppPublicSubmission,
  GeneratedAppPublicRuntime,
  GeneratedAppRuntimeForm,
  GeneratedAppRuntimeBindingReadiness,
  GeneratedAppRuntimeResult,
  GeneratedAppRuntimeResultSection,
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
const GENERATED_APP_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
const GENERATED_APP_API_PREFIX = '/api/v1'

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
    origin: params.origin,
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

function resolvePublicPreviewUrl(previewUrl: string | null): string | null {
  if (!previewUrl) {
    return null
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(previewUrl)) {
    return previewUrl
  }

  if (!previewUrl.startsWith(`${GENERATED_APP_API_PREFIX}/`)) {
    return previewUrl
  }

  const apiBaseUrl = GENERATED_APP_API_BASE_URL.trim()

  if (!/^https?:\/\//i.test(apiBaseUrl)) {
    return previewUrl
  }

  const normalizedApiBase = apiBaseUrl.replace(/\/+$/, '')

  if (!normalizedApiBase.endsWith(GENERATED_APP_API_PREFIX)) {
    return new URL(previewUrl, `${normalizedApiBase}/`).toString()
  }

  const previewPathWithoutPrefix = previewUrl.slice(
    GENERATED_APP_API_PREFIX.length,
  )

  return `${normalizedApiBase}${previewPathWithoutPrefix}`
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
      previewUrl: resolvePublicPreviewUrl(value.runtimeSurface.previewUrl),
    },
    runtimeForm: toPublicRuntimeForm(value.runtimeForm),
    createdAt: value.createdAt,
  }
}

/** 只保留公开页渲染需要的表单键，服务端多给的字段不进入组件 */
function toPublicRuntimeForm(
  value: GeneratedAppRuntimeForm,
): GeneratedAppRuntimeForm {
  return {
    formId: value.formId,
    title: value.title,
    description: value.description,
    submitLabel: value.submitLabel,
    fields: value.fields.map(toPublicRuntimeField),
    resultView: {
      title: value.resultView.title,
      emptyState: value.resultView.emptyState,
      sections: value.resultView.sections.map((section) => ({
        id: section.id,
        label: section.label,
        format: section.format,
      })),
    },
  }
}

function toPublicRuntimeField(field: GeneratedAppField): GeneratedAppField {
  const base = {
    id: field.id,
    label: field.label,
    required: field.required,
    helpText: field.helpText,
    placeholder: field.placeholder,
  }

  switch (field.type) {
    case 'text':
    case 'textarea':
      return { ...base, type: field.type, maxLength: field.maxLength }
    case 'number':
      return { ...base, type: field.type, min: field.min, max: field.max }
    case 'single_select':
    case 'multi_select':
      return {
        ...base,
        type: field.type,
        options: field.options.map((option) => ({
          value: option.value,
          label: option.label,
        })),
      }
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
    result: value.result ? toPublicRuntimeResult(value.result) : null,
    errorMessage: value.errorMessage,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

/** 分区值已由服务端公开脱敏；这里只按结构挑出公开页渲染的键 */
function toPublicRuntimeResult(
  value: GeneratedAppRuntimeResult,
): GeneratedAppRuntimeResult {
  return {
    status: value.status,
    sections: value.sections.map(
      (section) =>
        ({
          sectionId: section.sectionId,
          label: section.label,
          format: section.format,
          value: section.value,
        }) as GeneratedAppRuntimeResultSection,
    ),
    publicError: value.publicError,
  }
}

/** 创建即排队 initial 生成运行（HTTP 201），响应带 generationRunId，不需要再调用 start */
export async function createGeneratedApp(
  payload: CreateGeneratedAppPayload,
): Promise<CreatedGeneratedApp> {
  const response = await apiClient
    .post(GENERATED_APPS_PATH, {
      json: {
        prompt: payload.prompt,
        modelConfigId: payload.modelConfigId,
        bindingTarget: payload.bindingTarget,
      },
    })
    .json<ApiResponse<CreatedGeneratedApp>>()

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

export async function getGeneratedAppGenerationRun(
  appId: string,
  generationRunId: string,
): Promise<GeneratedAppGenerationRun> {
  const response = await apiClient
    .get(`${GENERATED_APPS_PATH}/${appId}/generation-runs/${generationRunId}`)
    .json<ApiResponse<GeneratedAppGenerationRun>>()

  return response.data
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

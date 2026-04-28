import { apiClient } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type {
  CreateGeneratedAppPublicSubmissionPayload,
  CreateGeneratedAppPayload,
  DeleteGeneratedAppSubmissionsResponse,
  GeneratedApp,
  GeneratedAppGateRunListResponse,
  GeneratedAppGenerationRunListResponse,
  GeneratedAppListResponse,
  GeneratedAppPublicSubmission,
  GeneratedAppPublicRuntime,
  GeneratedAppRuntimeForm,
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
    result: value.result,
    report: value.report,
    errorMessage: value.errorMessage,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
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

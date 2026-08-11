import { apiClient } from '@/shared/api/client'

export type ExecutionRecordType = 'step_telemetry' | 'execution_summary'

export interface ExecutionToolCallRecord {
  toolName: string
  input: unknown
  output: unknown
  durationMs: number
  status: 'success' | 'error'
}

export interface ExecutionErrorRecord {
  errorType: 'tool_error' | 'llm_error' | 'validation_error' | 'timeout'
  errorMessage: string
  timestamp: string
  nodeId: string
  stepId: string
}

export interface ExecutionSelfRepairRecord {
  originalOutput: unknown
  validationError: string
  repairAttempts: Array<{
    attemptNumber: number
    result: unknown
    success: boolean
  }>
}

export interface StepTelemetryData {
  toolCalls: ExecutionToolCallRecord[]
  errors: ExecutionErrorRecord[]
  selfRepairs: ExecutionSelfRepairRecord[]
  ioSnapshots: {
    stepInput: unknown
    stepOutput: unknown
  }
  llmInteractions: {
    modelId: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    latencyMs: number
  }
}

export interface ExecutionSummaryData {
  totalSteps: number
  completedSteps: number
  failedSteps: number
  totalToolCalls: number
  totalErrors: number
  totalSelfRepairs: number
  totalTokens: number
  totalLatencyMs: number
  avgStepLatencyMs: number
  executionDurationMs: number
}

export interface ExecutionRecord {
  id: string
  executionId: string
  stepId: string | null
  nodeId: string | null
  recordType: ExecutionRecordType
  telemetryData: StepTelemetryData | null
  summaryData: ExecutionSummaryData | null
  createdAt: string
}

export interface ExecutionRecordsResult {
  data: ExecutionRecord[]
  meta: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

export interface ExecutionRecordsQuery {
  /** 必填，服务端按 uuid 校验 */
  executionId: string
  stepId?: string
  recordType?: ExecutionRecordType
  limit?: number
  offset?: number
}

export const EXECUTION_RECORD_PAGE_SIZE = 20

/** GET /execution-records?executionId=... */
export async function fetchExecutionRecords(
  query: ExecutionRecordsQuery,
): Promise<ExecutionRecordsResult> {
  const searchParams: Record<string, string | number> = {
    executionId: query.executionId,
    limit: query.limit ?? EXECUTION_RECORD_PAGE_SIZE,
    offset: query.offset ?? 0,
  }

  if (query.stepId) {
    searchParams.stepId = query.stepId
  }

  if (query.recordType) {
    searchParams.recordType = query.recordType
  }

  return apiClient
    .get('execution-records', { searchParams })
    .json<ExecutionRecordsResult>()
}

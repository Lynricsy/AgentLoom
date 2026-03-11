import type { ExecutionResponse } from '../api/executionApi'
import type {
  ExecutionDetail,
  ExecutionStep,
  ExecutionStepAttempt,
  ExecutionStepErrorDetail,
  ExecutionStepStatus,
} from '../types'

interface RawExecutionStep {
  id: string
  executionId: string
  nodeId: string
  input?: Record<string, unknown> | null
  nodeType?: string | null
  nodeData?: Record<string, unknown> | null
  result?: Record<string, unknown> | null
  checkpointData?: Record<string, unknown> | null
  errorMessage?: string | ExecutionStepErrorDetail | null
  startedAt?: string | null
  completedAt?: string | null
  stepOrder?: number
  status:
    | 'pending'
    | 'queued'
    | 'running'
    | 'waiting_intervention'
    | 'waiting_for_intervention'
    | 'completed'
    | 'failed'
    | 'skipped'
    | 'cancelled'
}

type RawExecutionDetail = Omit<ExecutionResponse, 'definitionSnapshot'> & {
  definitionSnapshot?: {
    nodes?: unknown[]
    edges?: unknown[]
  } | null
  workflowVersion?: {
    id?: string
    graph?: {
      nodes?: unknown[]
      edges?: unknown[]
    }
  } | null
  steps?: RawExecutionStep[]
}

interface GraphNodeData {
  label?: string
  nodeType?: string
}

interface GraphNode {
  id?: string
  data?: GraphNodeData
  type?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toRecordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function toErrorMessage(value: RawExecutionStep['errorMessage']): string | null {
  if (typeof value === 'string') {
    return value
  }

  const detail = toErrorDetail(value)

  if (detail) {
    return detail.detail ?? detail.title ?? detail.message ?? null
  }

  return null
}

function toErrorDetail(
  value: RawExecutionStep['errorMessage'],
): ExecutionStepErrorDetail | null {
  if (!isRecord(value)) {
    return null
  }

  const attempts = toRetryHistory(value.attempts)

  return {
    message: typeof value.message === 'string' ? value.message : null,
    title: typeof value.title === 'string' ? value.title : null,
    detail: typeof value.detail === 'string' ? value.detail : null,
    type: typeof value.type === 'string' ? value.type : null,
    nodeId: typeof value.nodeId === 'string' ? value.nodeId : null,
    stack: typeof value.stack === 'string' ? value.stack : undefined,
    errors: Array.isArray(value.errors)
      ? value.errors.flatMap((entry) => {
          if (!isRecord(entry)) {
            return []
          }

          const field = typeof entry.field === 'string' ? entry.field : null
          const message = typeof entry.message === 'string' ? entry.message : null

          if (!field || !message) {
            return []
          }

          return [{ field, message }]
        })
      : undefined,
    typeMismatch: isRecord(value.typeMismatch)
      ? {
          ...(typeof value.typeMismatch.sourcePortId === 'string'
            ? { sourcePortId: value.typeMismatch.sourcePortId }
            : {}),
          ...(typeof value.typeMismatch.targetPortId === 'string'
            ? { targetPortId: value.typeMismatch.targetPortId }
            : {}),
          ...(typeof value.typeMismatch.edgeId === 'string'
            ? { edgeId: value.typeMismatch.edgeId }
            : {}),
          sourceType:
            typeof value.typeMismatch.sourceType === 'string'
              ? value.typeMismatch.sourceType
              : 'unknown',
          targetType:
            typeof value.typeMismatch.targetType === 'string'
              ? value.typeMismatch.targetType
              : 'unknown',
          sourceNodeId:
            typeof value.typeMismatch.sourceNodeId === 'string'
              ? value.typeMismatch.sourceNodeId
              : 'unknown',
          targetNodeId:
            typeof value.typeMismatch.targetNodeId === 'string'
              ? value.typeMismatch.targetNodeId
              : 'unknown',
        }
      : undefined,
    attempts: attempts.length > 0 ? attempts : undefined,
  }
}

function toStepStatus(status: RawExecutionStep['status']): ExecutionStepStatus {
  return status === 'waiting_intervention' ? 'waiting_for_intervention' : status
}

function toRetryHistory(value: unknown): ExecutionStepAttempt[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return []
    }

    const attempt = typeof entry.attempt === 'number' ? entry.attempt : null
    const error =
      typeof entry.error === 'string'
        ? entry.error
        : typeof entry.message === 'string'
          ? entry.message
          : null
    const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : null

    if (attempt == null || error == null || timestamp == null) {
      return []
    }

    return [{ attempt, error, timestamp }]
  })
}

function readNodeMeta(rawStep: RawExecutionStep, graphNodes: GraphNode[]): {
  nodeName: string
  nodeType: string
} {
  const graphNode = graphNodes.find((node) => node.id === rawStep.nodeId)
  const graphData = isRecord(graphNode?.data) ? graphNode.data : undefined
  const rawNodeData = rawStep.nodeData

  const nodeName =
    (typeof graphData?.label === 'string' && graphData.label) ||
    (typeof rawNodeData?.label === 'string' && rawNodeData.label) ||
    rawStep.nodeId

  const nodeType =
    (typeof graphData?.nodeType === 'string' && graphData.nodeType) ||
    (typeof rawNodeData?.nodeType === 'string' && rawNodeData.nodeType) ||
    rawStep.nodeType ||
    graphNode?.type ||
    'unknown'

  return { nodeName, nodeType }
}

function normalizeStep(rawStep: RawExecutionStep, graphNodes: GraphNode[]): ExecutionStep {
  const { nodeName, nodeType } = readNodeMeta(rawStep, graphNodes)
  const errorDetail = toErrorDetail(rawStep.errorMessage)
  const checkpointRetries = toRetryHistory(rawStep.checkpointData?.attempts)
  const retryHistory =
    checkpointRetries.length > 0 ? checkpointRetries : toRetryHistory(errorDetail?.attempts)

  return {
    id: rawStep.id,
    executionId: rawStep.executionId,
    nodeId: rawStep.nodeId,
    nodeName,
    nodeType,
    status: toStepStatus(rawStep.status),
    input: toRecordOrNull(rawStep.input),
    nodeData: toRecordOrNull(rawStep.nodeData),
    output: toRecordOrNull(rawStep.result),
    errorMessage: toErrorMessage(rawStep.errorMessage),
    errorDetail,
    startedAt: rawStep.startedAt ?? null,
    completedAt: rawStep.completedAt ?? null,
    retryCount: retryHistory.length,
    retryHistory,
    checkpointData: rawStep.checkpointData ?? null,
    stepOrder: rawStep.stepOrder,
  }
}

export function normalizeExecutionDetail(
  execution: ExecutionResponse,
): ExecutionDetail {
  const rawExecution = execution as RawExecutionDetail
  const fallbackGraph = {
    nodes: rawExecution.definitionSnapshot?.nodes ?? [],
    edges: rawExecution.definitionSnapshot?.edges ?? [],
  }
  const workflowGraph = rawExecution.workflowVersion?.graph ?? fallbackGraph
  const graphNodes = Array.isArray(workflowGraph.nodes)
    ? workflowGraph.nodes.filter(isRecord) as GraphNode[]
    : []

  return {
    ...execution,
    steps: (rawExecution.steps ?? []).map((step) => normalizeStep(step, graphNodes)),
    workflowVersion: {
      id: rawExecution.workflowVersion?.id ?? execution.workflowVersionId ?? 'unknown-workflow-version',
      graph: {
        nodes: Array.isArray(workflowGraph.nodes) ? workflowGraph.nodes : [],
        edges: Array.isArray(workflowGraph.edges) ? workflowGraph.edges : [],
      },
    },
  }
}

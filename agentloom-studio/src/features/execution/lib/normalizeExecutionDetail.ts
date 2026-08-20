import type {
  ExecutionResponse,
  ExecutionStepResponse,
} from '../api/executionApi'
import type {
  ExecutionDetail,
  ExecutionStep,
  ExecutionStepAttempt,
  ExecutionStepErrorDetail,
  ExecutionStepStatus,
} from '../types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toRecordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function toErrorMessage(
  value: ExecutionStepResponse['errorMessage'],
): string | null {
  const detail = toErrorDetail(value)

  if (detail) {
    return detail.detail ?? detail.title ?? detail.message ?? null
  }

  return null
}

function toErrorDetail(
  value: ExecutionStepResponse['errorMessage'],
): ExecutionStepErrorDetail | null {
  if (!isRecord(value)) {
    return null
  }

  const attempts = toRetryHistory(value.attempts)

  return {
    ...(typeof value.message === 'string' ? { message: value.message } : {}),
    ...(typeof value.title === 'string' ? { title: value.title } : {}),
    ...(typeof value.detail === 'string' ? { detail: value.detail } : {}),
    ...(typeof value.type === 'string' ? { type: value.type } : {}),
    ...(typeof value.nodeId === 'string' ? { nodeId: value.nodeId } : {}),
    ...(typeof value.stack === 'string' ? { stack: value.stack } : {}),
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

function toStepStatus(
  status: ExecutionStepResponse['status'],
): ExecutionStepStatus {
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

function readNodeMeta(
  rawStep: ExecutionStepResponse,
  graphNodes: Record<string, unknown>[],
): {
  nodeName: string
  nodeType: string
} {
  const graphNode = graphNodes.find((node) => node.id === rawStep.nodeId)
  const graphData = isRecord(graphNode?.data) ? graphNode.data : undefined
  const rawNodeData = isRecord(rawStep.nodeData) ? rawStep.nodeData : undefined

  const nodeName =
    (typeof graphData?.label === 'string' && graphData.label) ||
    (typeof rawNodeData?.label === 'string' && rawNodeData.label) ||
    rawStep.nodeId

  const graphNodeType =
    typeof graphNode?.type === 'string' ? graphNode.type : undefined
  const nodeType =
    (typeof graphData?.nodeType === 'string' && graphData.nodeType) ||
    (typeof rawNodeData?.nodeType === 'string' && rawNodeData.nodeType) ||
    rawStep.nodeType ||
    graphNodeType ||
    'unknown'

  return { nodeName, nodeType }
}

function normalizeStep(
  rawStep: ExecutionStepResponse,
  graphNodes: Record<string, unknown>[],
): ExecutionStep {
  const { nodeName, nodeType } = readNodeMeta(rawStep, graphNodes)
  const errorDetail = toErrorDetail(rawStep.errorMessage)
  const checkpointData = toRecordOrNull(rawStep.checkpointData)
  const checkpointRetries = toRetryHistory(checkpointData?.attempts)
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
    checkpointData,
    stepOrder: rawStep.stepOrder,
  }
}

export function normalizeExecutionDetail(
  execution: ExecutionResponse,
): ExecutionDetail {
  const definitionSnapshot = isRecord(execution.definitionSnapshot)
    ? execution.definitionSnapshot
    : {}
  const graphNodes = Array.isArray(definitionSnapshot.nodes)
    ? definitionSnapshot.nodes.filter(isRecord)
    : []
  const graphEdges = Array.isArray(definitionSnapshot.edges)
    ? definitionSnapshot.edges
    : []

  return {
    ...execution,
    steps: (execution.steps ?? []).map((step) =>
      normalizeStep(step, graphNodes),
    ),
    workflowVersion: {
      id: execution.workflowVersionId,
      graph: {
        nodes: Array.isArray(definitionSnapshot.nodes)
          ? definitionSnapshot.nodes
          : [],
        edges: graphEdges,
      },
    },
  }
}

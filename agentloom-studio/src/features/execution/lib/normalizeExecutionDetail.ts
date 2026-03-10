import type { ExecutionResponse } from '../api/executionApi'
import type { ExecutionDetail, ExecutionStep, ExecutionStepAttempt, ExecutionStepStatus } from '../types'

interface RawExecutionStep {
  id: string
  executionId: string
  nodeId: string
  input?: Record<string, unknown> | null
  nodeType?: string | null
  nodeData?: Record<string, unknown> | null
  result?: Record<string, unknown> | null
  checkpointData?: Record<string, unknown> | null
  errorMessage?: string | { message?: string | null } | null
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

  if (isRecord(value) && typeof value.message === 'string') {
    return value.message
  }

  return null
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
    const error = typeof entry.error === 'string' ? entry.error : null
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
  const retryHistory = toRetryHistory(rawStep.checkpointData?.attempts)

  return {
    id: rawStep.id,
    executionId: rawStep.executionId,
    nodeId: rawStep.nodeId,
    nodeName,
    nodeType,
    status: toStepStatus(rawStep.status),
    input: toRecordOrNull(rawStep.input),
    output: toRecordOrNull(rawStep.result),
    errorMessage: toErrorMessage(rawStep.errorMessage),
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

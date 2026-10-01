import { REUSABLE_BLOCK_INNER_NODE_ID_SEPARATOR } from '@agentloom/contracts'
import type { NodeExecutionState } from '../stores/executionStore'
import type { StepStatus } from '../types'

/**
 * 可复用块在 server 执行前被展平：块内节点的步骤 nodeId 为
 * `<blockNodeId>::<innerNodeId>`（嵌套块逐层加前缀），画布上只有块节点本身。
 * 这里按前缀把内部步骤状态聚合成块节点的状态。
 */

export function reusableBlockInnerPrefix(blockNodeId: string): string {
  return `${blockNodeId}${REUSABLE_BLOCK_INNER_NODE_ID_SEPARATOR}`
}

export function selectReusableBlockInnerStates(
  nodes: Record<string, NodeExecutionState>,
  blockNodeId: string,
): NodeExecutionState[] {
  const prefix = reusableBlockInnerPrefix(blockNodeId)
  return Object.values(nodes).filter((node) => node.nodeId.startsWith(prefix))
}

/** 任一内部步骤处于这些状态时，块即呈现该状态（按顺序取第一个命中）。 */
const DOMINANT_STATUSES: StepStatus[] = [
  'failed',
  'waiting_intervention',
  'running',
  'queued',
  'cancelled',
]

function aggregateStatus(states: NodeExecutionState[]): StepStatus {
  const statuses = new Set(states.map((state) => state.status))
  const dominant = DOMINANT_STATUSES.find((status) => statuses.has(status))
  if (dominant) return dominant

  const finished = statuses.has('completed') || statuses.has('skipped')
  if (statuses.has('pending')) {
    // 部分内部步骤已结束、其余尚未调度：块整体仍在运行
    return finished ? 'running' : 'pending'
  }
  return statuses.has('completed') ? 'completed' : 'skipped'
}

export function aggregateReusableBlockState(
  blockNodeId: string,
  innerStates: NodeExecutionState[],
): NodeExecutionState | null {
  const [first] = innerStates
  if (!first) {
    return null
  }

  const status = aggregateStatus(innerStates)
  const representative =
    innerStates.find((state) => state.status === status) ?? first
  const startedAt = innerStates
    .map((state) => state.startedAt)
    .filter((value): value is string => typeof value === 'string')
    .sort()[0]
  const isTerminal =
    status === 'completed' ||
    status === 'failed' ||
    status === 'skipped' ||
    status === 'cancelled'
  const completedAt = isTerminal
    ? innerStates
        .map((state) => state.completedAt)
        .filter((value): value is string => typeof value === 'string')
        .sort()
        .at(-1)
    : undefined

  return {
    stepId: representative.stepId,
    nodeId: blockNodeId,
    status,
    output: '',
    ...(representative.errorMessage
      ? { errorMessage: representative.errorMessage }
      : {}),
    errorDetail: status === 'failed' ? (representative.errorDetail ?? null) : null,
    isStreaming: innerStates.some((state) => state.isStreaming),
    startedAt: startedAt ?? null,
    completedAt: completedAt ?? null,
    ...(representative.intervention
      ? { intervention: representative.intervention }
      : {}),
    toolCalls: {},
    agentEvents: [],
    subAgentStreams: {},
  }
}

/** 步骤 nodeId → 画布上的节点 ID（块内步骤归属最外层块节点）。 */
export function toCanvasNodeId(stepNodeId: string): string {
  const index = stepNodeId.indexOf(REUSABLE_BLOCK_INNER_NODE_ID_SEPARATOR)
  return index === -1 ? stepNodeId : stepNodeId.slice(0, index)
}

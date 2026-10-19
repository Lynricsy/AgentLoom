import { castDraft } from 'immer'
import { useMemo } from 'react'
import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { useShallow } from 'zustand/react/shallow'
import type {
  SubAgentEventEnvelope,
  SubAgentRunStatus,
  SubAgentStream,
} from '@/features/agent-conversation'
import {
  resolveIntervention,
  resolveToolPermission,
  type InterventionResolveRequest,
} from '../api/executionApi'

import type {
  AgentEvent,
  ExecutionEvent,
  ExecutionStateSnapshot,
  ExecutionStatus,
  ExecutionStatusChangedPayload,
  InterventionRequiredPayload,
  InterventionResolvedPayload,
  OutputChunkPayload,
  StepRetryingPayload,
  StepStatus,
  StepStatusChangedPayload,
  StructuredErrorDetail,
  TeamMessagePayload,
  TeamStatusPayload,
  ToolCallEventData,
  ToolCallStatusPayload,
  ToolPermissionRequiredPayload,
  ToolPermissionResolvedPayload,
} from '../types'
import {
  mergeSubAgentStreamMaps,
  normalizePersistedSubAgentStreams,
} from '../lib/subAgentStreams'
import {
  aggregateReusableBlockState,
  selectReusableBlockInnerStates,
} from '../lib/reusableBlockState'

export interface InterventionState {
  nodeName?: string
  requestedAt?: string
  decision?: {
    suggestedContent?: unknown
    confidence?: number
    rationale?: string
  }
  partialContent?: string
  submitting?: boolean
}

export interface NodeExecutionState {
  stepId: string
  nodeId: string
  status: StepStatus
  output: string
  result?: Record<string, unknown> | null
  checkpointData?: Record<string, unknown> | null
  errorMessage?: string
  errorDetail?: StructuredErrorDetail | null
  isStreaming: boolean
  retryAttempt?: number
  retryMaxAttempts?: number
  startedAt?: string | null
  completedAt?: string | null
  intervention?: InterventionState
  toolCalls: Record<string, ToolCallEventData>
  agentEvents: AgentEvent[]
  subAgentStreams: Record<string, SubAgentStream>
}

/** 团队运行的实时视图：状态事件整份覆盖，消息事件按 messageId 增量合并。 */
export interface TeamRunLiveState {
  teamRunId: string
  stepId: string
  /** 尚未收到状态事件（只收到消息）时为 null */
  status: TeamStatusPayload['status'] | null
  members: TeamStatusPayload['members']
  budget: TeamStatusPayload['budget'] | null
  failureReason?: TeamStatusPayload['failureReason']
  /** 按到达顺序保留，同一 messageId 原位更新，最多 {@link MAX_TEAM_MESSAGES} 条 */
  messages: TeamMessagePayload[]
}

/** REST 快照 hydrate 入参；messages 缺省视为空。 */
export type TeamRunHydrateSnapshot = Omit<
  TeamRunLiveState,
  'teamRunId' | 'messages'
> & { messages?: TeamMessagePayload[] }

export interface ExecutionStoreState {
  executionId: string | null
  status: ExecutionStatus | null
  completedSteps: number
  totalSteps: number
  /** 执行完成时间：只来自实时终态事件；REST 详情已有时以 REST 为准合并 */
  executionCompletedAt: string | null
  /** nodeId → 节点运行状态 */
  nodes: Record<string, NodeExecutionState>
  /** 保留最新 50 条用于调试 */
  recentEvents: ExecutionEvent[]
  /** teamRunId → 团队运行实时状态 */
  teamRuns: Record<string, TeamRunLiveState>
}

export interface ExecutionStoreActions {
  actions: {
    updateExecutionStatus: (
      event: ExecutionEvent<ExecutionStatusChangedPayload>,
    ) => void
    updateNodeStatus: (
      event: ExecutionEvent<StepStatusChangedPayload>,
    ) => void
    appendNodeOutput: (event: ExecutionEvent<OutputChunkPayload>) => void
    updateNodeRetry: (event: ExecutionEvent<StepRetryingPayload>) => void
    setNodeIntervention: (
      event: ExecutionEvent<InterventionRequiredPayload>,
    ) => void
    clearNodeIntervention: (
      event: ExecutionEvent<InterventionResolvedPayload>,
    ) => void
    submitIntervention: (
      executionId: string,
      stepId: string,
      payload: InterventionResolveRequest,
    ) => Promise<void>
    updateToolCall: (
      event: ExecutionEvent<ToolCallStatusPayload>,
    ) => void
    setToolPermissionRequired: (
      event: ExecutionEvent<ToolPermissionRequiredPayload>,
    ) => void
    resolveToolPermissionEvent: (
      event: ExecutionEvent<ToolPermissionResolvedPayload>,
    ) => void
    updateTeamStatus: (event: ExecutionEvent<TeamStatusPayload>) => void
    upsertTeamMessage: (event: ExecutionEvent<TeamMessagePayload>) => void
    /** REST 快照只在该 teamRunId 尚无 socket 数据时写入，之后由 socket 驱动 */
    hydrateTeamRun: (
      teamRunId: string,
      snapshot: TeamRunHydrateSnapshot,
    ) => void
    addAgentEvent: (
      nodeId: string,
      agentEvent: AgentEvent,
      subagent?: SubAgentEventEnvelope,
    ) => void
    clearToolCalls: (nodeId: string) => void
    submitToolPermission: (
      executionId: string,
      stepId: string,
      toolCallId: string,
      action: 'approve' | 'deny',
      rememberScope?: 'none' | 'conversation_category',
    ) => Promise<void>
    applySnapshot: (snapshot: ExecutionStateSnapshot) => void
    initFromSnapshot: (snapshot: ExecutionStateSnapshot) => void
    initExecution: (executionId: string) => void
    reset: () => void
  }
}

const MAX_RECENT_EVENTS = 50
export const MAX_TEAM_MESSAGES = 500

function createInitialState(): ExecutionStoreState {
  return {
    executionId: null,
    status: null,
    completedSteps: 0,
    totalSteps: 0,
    executionCompletedAt: null,
    nodes: {},
    recentEvents: [],
    teamRuns: {},
  }
}

function pushEvent(state: ExecutionStoreState, event: ExecutionEvent): void {
  state.recentEvents.push(event)
  if (state.recentEvents.length > MAX_RECENT_EVENTS) {
    state.recentEvents = state.recentEvents.slice(-MAX_RECENT_EVENTS)
  }
}

function ensureTeamRun(
  state: ExecutionStoreState,
  teamRunId: string,
  stepId: string,
): TeamRunLiveState {
  const existing = state.teamRuns[teamRunId]
  if (existing) {
    return existing
  }
  const created: TeamRunLiveState = {
    teamRunId,
    stepId,
    status: null,
    members: [],
    budget: null,
    messages: [],
  }
  state.teamRuns[teamRunId] = created
  return state.teamRuns[teamRunId]
}

function mergeTeamMessage(
  messages: TeamMessagePayload[],
  message: TeamMessagePayload,
): void {
  const index = messages.findIndex(
    (current) => current.messageId === message.messageId,
  )
  if (index >= 0) {
    messages[index] = message
    return
  }
  messages.push(message)
  if (messages.length > MAX_TEAM_MESSAGES) {
    messages.splice(0, messages.length - MAX_TEAM_MESSAGES)
  }
}

function ensureNode(
  state: ExecutionStoreState,
  nodeId: string,
  stepId: string,
): NodeExecutionState {
  if (!state.nodes[nodeId]) {
    state.nodes[nodeId] = {
      stepId,
      nodeId,
      status: 'pending',
      output: '',
      errorDetail: null,
      isStreaming: false,
      toolCalls: {},
      agentEvents: [],
      subAgentStreams: {},
    }
  }
  return state.nodes[nodeId]
}

function ensureSubAgentStream(
  streams: Record<string, SubAgentStream>,
  envelope: SubAgentEventEnvelope,
): SubAgentStream {
  const existing = streams[envelope.handle]
  if (existing) {
    return existing
  }

  const stream: SubAgentStream = {
    handle: envelope.handle,
    alias: envelope.alias,
    depth: envelope.depth,
    parentToolCallId: envelope.parentToolCallId,
    status: 'running',
    events: [],
    startedAt: Date.now(),
  }
  streams[envelope.handle] = stream
  return stream
}

function pushSubAgentEvent(
  streams: Record<string, SubAgentStream>,
  envelope: SubAgentEventEnvelope,
  eventType: SubAgentStream['events'][number]['type'],
  payload: unknown,
): void {
  const stream = ensureSubAgentStream(streams, envelope)
  stream.events.push({
    id: crypto.randomUUID(),
    type: eventType,
    payload,
    timestamp: Date.now(),
  })

  if (eventType === 'done' && stream.status === 'running') {
    stream.status = 'completed'
    stream.completedAt = Date.now()
  }
}

function setSubAgentStatus(
  streams: Record<string, SubAgentStream>,
  envelope: SubAgentEventEnvelope,
  status: SubAgentRunStatus,
  error?: string,
): void {
  const stream = ensureSubAgentStream(streams, envelope)
  stream.status = status
  stream.completedAt ??= Date.now()
  if (error) {
    stream.error = error
  }
}

function routeSubAgentAgentEvent(
  streams: Record<string, SubAgentStream>,
  envelope: SubAgentEventEnvelope,
  agentEvent: AgentEvent,
): void {
  switch (agentEvent.type) {
    case 'message_chunk':
      pushSubAgentEvent(streams, envelope, 'message_chunk', {
        chunk: agentEvent.content,
      })
      return
    case 'plan':
      pushSubAgentEvent(streams, envelope, 'thinking', {
        content: agentEvent.content || agentEvent.title,
      })
      return
    case 'decision': {
      const content = [agentEvent.rationale, agentEvent.suggestedContent]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join('\n\n')
      if (content.length > 0) {
        pushSubAgentEvent(streams, envelope, 'thinking', { content })
      }
      return
    }
    case 'tool_call':
      pushSubAgentEvent(
        streams,
        envelope,
        agentEvent.call.status === 'completed' || agentEvent.call.status === 'failed'
          ? 'tool_result'
          : 'tool_call',
        {
          toolCallId: agentEvent.call.id,
          tool: agentEvent.call.tool,
          args: agentEvent.call.args,
          status: agentEvent.call.status,
          ...(agentEvent.call.result !== undefined
            ? { result: agentEvent.call.result }
            : {}),
          ...(agentEvent.call.error !== undefined
            ? { error: agentEvent.call.error }
            : {}),
        },
      )
      return
    case 'done':
      pushSubAgentEvent(streams, envelope, 'done', {
        stopReason: agentEvent.stopReason,
      })
      setSubAgentStatus(
        streams,
        envelope,
        agentEvent.stopReason === 'cancelled' ? 'cancelled' : 'completed',
      )
      return
    default:
      return
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function formatDisplayValue(value: unknown): string {
  if (value == null) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value, null, 2)
}

function restoreOutput(result: Record<string, unknown> | null | undefined): string {
  if (!result || typeof result !== 'object') {
    return ''
  }

  if ('content' in result) {
    return formatDisplayValue(result.content)
  }

  if ('json' in result) {
    return formatDisplayValue(result.json)
  }

  if (typeof result.output === 'string') {
    return result.output
  }

  return JSON.stringify(result)
}

function cloneStructuredErrorDetail(
  detail: StructuredErrorDetail | null | undefined,
) {
  if (!detail) {
    return null
  }

  return {
    ...detail,
    errors: detail.errors?.map((error) => ({ ...error })),
    typeMismatch: detail.typeMismatch ? { ...detail.typeMismatch } : undefined,
    attempts: detail.attempts?.map((attempt) => ({ ...attempt })),
  }
}

function restoreIntervention(
  nodeId: string,
  checkpointData: Record<string, unknown> | null | undefined,
): InterventionState | undefined {
  if (!checkpointData) {
    return undefined
  }

  const decision = isRecord(checkpointData.decision)
    ? {
        ...('suggestedContent' in checkpointData.decision
          ? { suggestedContent: checkpointData.decision.suggestedContent }
          : {}),
        ...(typeof checkpointData.decision.confidence === 'number'
          ? { confidence: checkpointData.decision.confidence }
          : {}),
        ...(typeof checkpointData.decision.rationale === 'string'
          ? { rationale: checkpointData.decision.rationale }
          : {}),
      }
    : undefined

  const requestedAt =
    typeof checkpointData.interventionRequestedAt === 'string'
      ? checkpointData.interventionRequestedAt
      : isRecord(checkpointData.intervention) &&
          typeof checkpointData.intervention.requested_at === 'string'
        ? checkpointData.intervention.requested_at
        : undefined
  const partialContent =
    typeof checkpointData.partialContent === 'string'
      ? checkpointData.partialContent
      : undefined
  const nodeName =
    typeof checkpointData.interventionNodeName === 'string'
      ? checkpointData.interventionNodeName
      : nodeId

  if (
    !requestedAt &&
    !partialContent &&
    (!decision || Object.keys(decision).length === 0)
  ) {
    return undefined
  }

  return {
    nodeName,
    requestedAt,
    ...(decision && Object.keys(decision).length > 0 ? { decision } : {}),
    ...(partialContent ? { partialContent } : {}),
  }
}

export const useExecutionStore = create<
  ExecutionStoreState & ExecutionStoreActions
>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        ...createInitialState(),

        actions: {
          updateExecutionStatus: (
            event: ExecutionEvent<ExecutionStatusChangedPayload>,
          ) => {
            set((state) => {
              state.status = event.data.status
              if (event.data.completedSteps != null) {
                state.completedSteps = event.data.completedSteps
              }
              if (event.data.totalSteps != null) {
                state.totalSteps = event.data.totalSteps
              }
              if (event.data.completedAt !== undefined) {
                state.executionCompletedAt = event.data.completedAt
              }
              pushEvent(state, event)
            })
          },

          updateNodeStatus: (
            event: ExecutionEvent<StepStatusChangedPayload>,
          ) => {
            set((state) => {
              const node = ensureNode(
                state,
                event.data.nodeId,
                event.data.stepId,
              )
              node.status = event.data.to
              if (event.data.startedAt !== undefined) {
                node.startedAt = event.data.startedAt
              }
              if (event.data.completedAt !== undefined) {
                node.completedAt = event.data.completedAt
              }
              node.errorDetail = castDraft(
                cloneStructuredErrorDetail(event.data.errorDetail),
              )

              if (event.data.errorDetail) {
                node.errorMessage =
                  event.data.errorDetail.detail ??
                  event.data.errorDetail.message ??
                  event.data.errorDetail.title ??
                  node.errorMessage
              }

              if (event.data.result !== undefined) {
                node.result =
                  event.data.result == null
                    ? event.data.result
                    : castDraft(event.data.result)
                node.output = restoreOutput(event.data.result)
              }

              if (event.data.checkpointData !== undefined) {
                node.checkpointData =
                  event.data.checkpointData == null
                    ? event.data.checkpointData
                    : castDraft(event.data.checkpointData)
                node.subAgentStreams = mergeSubAgentStreamMaps({
                  persisted: normalizePersistedSubAgentStreams(
                    event.data.checkpointData?.subAgentStreams,
                  ),
                  live: node.subAgentStreams,
                })
              }

              // 流式状态：running 时开启，终态时关闭
              if (event.data.to === 'running') {
                node.isStreaming = true
              } else if (
                event.data.to === 'completed' ||
                event.data.to === 'failed' ||
                event.data.to === 'skipped' ||
                event.data.to === 'cancelled'
              ) {
                node.isStreaming = false
              }

              pushEvent(state, event)
            })
          },

          appendNodeOutput: (event: ExecutionEvent<OutputChunkPayload>) => {
            set((state) => {
              // output chunk 只有 stepId，需要在 nodes 中查找对应 nodeId
              const existingNode = Object.values(state.nodes).find(
                (n) => n.stepId === event.data.stepId,
              )
              if (existingNode) {
                existingNode.output += event.data.chunk
                existingNode.isStreaming = true
                existingNode.result = {
                  ...(existingNode.result ?? {}),
                  content: existingNode.output,
                }
              }
              pushEvent(state, event)
            })
          },

          updateNodeRetry: (event: ExecutionEvent<StepRetryingPayload>) => {
            set((state) => {
              const existingNode = Object.values(state.nodes).find(
                (n) => n.stepId === event.data.stepId,
              )
              if (existingNode) {
                existingNode.retryAttempt = event.data.attempt
                existingNode.retryMaxAttempts = event.data.maxAttempts
                if (event.data.errorMessage) {
                  existingNode.errorMessage = event.data.errorMessage
                }
              }
              pushEvent(state, event)
            })
          },

          setNodeIntervention: (
            event: ExecutionEvent<InterventionRequiredPayload>,
          ) => {
            set((state) => {
              const node = ensureNode(
                state,
                event.data.nodeId,
                event.data.stepId,
              )
              node.intervention = {
                nodeName: event.data.nodeName,
                requestedAt: event.data.requestedAt,
                decision: event.data.decision,
                partialContent: event.data.partialContent,
                submitting: false,
              }
              pushEvent(state, event)
            })
          },

          clearNodeIntervention: (
            event: ExecutionEvent<InterventionResolvedPayload>,
          ) => {
            set((state) => {
              const node = ensureNode(
                state,
                event.data.nodeId,
                event.data.stepId,
              )
              node.intervention = undefined
              pushEvent(state, event)
            })
          },

          submitIntervention: async (
            executionId: string,
            stepId: string,
            payload: InterventionResolveRequest,
          ) => {
            const nodeId = Object.values(get().nodes).find(
              (node) => node.stepId === stepId,
            )?.nodeId

            if (nodeId) {
              set((state) => {
                const node = state.nodes[nodeId]
                if (node?.intervention) {
                  node.intervention.submitting = true
                }
              })
            }

            try {
              await resolveIntervention(executionId, stepId, payload)
            } finally {
              if (nodeId) {
                set((state) => {
                  const node = state.nodes[nodeId]
                  if (node?.intervention) {
                    node.intervention.submitting = false
                  }
                })
              }
            }
          },

          updateToolCall: (
            event: ExecutionEvent<ToolCallStatusPayload>,
          ) => {
            set((state) => {
              const node = ensureNode(
                state,
                event.data.nodeId,
                event.data.stepId,
              )
              const existing = node.toolCalls[event.data.toolCallId]
              node.toolCalls[event.data.toolCallId] = {
                id: event.data.toolCallId,
                tool: event.data.tool,
                status: event.data.status,
                args: event.data.args ?? existing?.args,
                result: event.data.result ?? existing?.result,
                error: event.data.error ?? existing?.error,
                permissionRequest:
                  event.data.permissionRequest ?? existing?.permissionRequest,
              }
              pushEvent(state, event)
            })
          },

          setToolPermissionRequired: (
            event: ExecutionEvent<ToolPermissionRequiredPayload>,
          ) => {
            set((state) => {
              const node = ensureNode(
                state,
                event.data.nodeId,
                event.data.stepId,
              )
              node.toolCalls[event.data.toolCallId] = {
                id: event.data.toolCallId,
                tool: event.data.tool,
                status: 'awaiting_permission',
                args: event.data.args,
                permissionRequest: event.data.permissionRequest,
              }
              pushEvent(state, event)
            })
          },

          resolveToolPermissionEvent: (
            event: ExecutionEvent<ToolPermissionResolvedPayload>,
          ) => {
            set((state) => {
              const node = ensureNode(
                state,
                event.data.nodeId,
                event.data.stepId,
              )
              const tc = node.toolCalls[event.data.toolCallId]
              if (tc) {
                tc.status =
                  event.data.action === 'approve' ? 'in_progress' : 'denied'
              }
              pushEvent(state, event)
            })
          },

          updateTeamStatus: (event: ExecutionEvent<TeamStatusPayload>) => {
            set((state) => {
              const run = ensureTeamRun(
                state,
                event.data.teamRunId,
                event.data.stepId,
              )
              run.status = event.data.status
              run.members = event.data.members
              run.budget = event.data.budget
              run.failureReason = event.data.failureReason
              pushEvent(state, event)
            })
          },

          upsertTeamMessage: (event: ExecutionEvent<TeamMessagePayload>) => {
            set((state) => {
              const run = ensureTeamRun(
                state,
                event.data.teamRunId,
                event.data.stepId,
              )
              mergeTeamMessage(run.messages, event.data)
              pushEvent(state, event)
            })
          },

          hydrateTeamRun: (
            teamRunId: string,
            snapshot: TeamRunHydrateSnapshot,
          ) => {
            set((state) => {
              if (state.teamRuns[teamRunId]) {
                return
              }
              const run: TeamRunLiveState = {
                teamRunId,
                stepId: snapshot.stepId,
                status: snapshot.status,
                members: snapshot.members,
                budget: snapshot.budget,
                failureReason: snapshot.failureReason,
                messages: [],
              }
              for (const message of snapshot.messages ?? []) {
                mergeTeamMessage(run.messages, message)
              }
              state.teamRuns[teamRunId] = run
            })
          },

          addAgentEvent: (
            nodeId: string,
            agentEvent: AgentEvent,
            subagent?: SubAgentEventEnvelope,
          ) => {
            set((state) => {
              const node = state.nodes[nodeId]
              if (node) {
                if (subagent) {
                  routeSubAgentAgentEvent(
                    node.subAgentStreams,
                    subagent,
                    agentEvent,
                  )
                  return
                }

                node.agentEvents.push(agentEvent)
              }
            })
          },

          clearToolCalls: (nodeId: string) => {
            set((state) => {
              const node = state.nodes[nodeId]
              if (node) {
                node.toolCalls = {}
              }
            })
          },

          submitToolPermission: async (
            executionId: string,
            stepId: string,
            toolCallId: string,
            action: 'approve' | 'deny',
            rememberScope: 'none' | 'conversation_category' = 'none',
          ) => {
            await resolveToolPermission(executionId, stepId, toolCallId, {
              action,
              ...(rememberScope !== 'none' ? { rememberScope } : {}),
            })
          },

          applySnapshot: (snapshot: ExecutionStateSnapshot) => {
            set((state) => {
              state.executionId = snapshot.executionId
              state.status = snapshot.status
              state.completedSteps = snapshot.completedSteps
              state.totalSteps = snapshot.totalSteps

              state.nodes = {}
              for (const step of snapshot.steps) {
                const toolCalls: Record<string, ToolCallEventData> = {}
                if (
                  step.checkpointData &&
                  Array.isArray(step.checkpointData.toolCalls)
                ) {
                  for (const tc of step.checkpointData.toolCalls as ToolCallEventData[]) {
                    if (tc?.id) {
                      toolCalls[tc.id] = tc
                    }
                  }
                }

                state.nodes[step.nodeId] = {
                  stepId: step.stepId,
                  nodeId: step.nodeId,
                  status: step.status,
                  output: restoreOutput(step.result),
                  ...(step.result !== undefined ? { result: step.result } : {}),
                  ...(step.checkpointData !== undefined
                    ? { checkpointData: step.checkpointData }
                    : {}),
                  isStreaming: false,
                  errorMessage:
                    step.errorMessage ??
                    step.errorDetail?.detail ??
                    step.errorDetail?.message ??
                    step.errorDetail?.title,
                  errorDetail: castDraft(
                    cloneStructuredErrorDetail(step.errorDetail),
                  ),
                  startedAt: step.startedAt,
                  completedAt: step.completedAt,
                  intervention:
                    step.status === 'waiting_intervention'
                      ? restoreIntervention(step.nodeId, step.checkpointData)
                      : undefined,
                  toolCalls,
                  agentEvents: [],
                  subAgentStreams: normalizePersistedSubAgentStreams(
                    step.checkpointData?.subAgentStreams,
                  ),
                }
              }
            })
          },
          initFromSnapshot: (snapshot: ExecutionStateSnapshot) => {
            if (get().recentEvents.length > 0) {
              return
            }
            get().actions.applySnapshot(snapshot)
          },


          initExecution: (executionId: string) => {
            set((state) => {
              Object.assign(state, createInitialState())
              state.executionId = executionId
            })
          },

          reset: () => {
            set((state) => {
              Object.assign(state, createInitialState())
            })
          },
        },
      })),
    ),
    { name: 'ExecutionStore' },
  ),
)

export const useExecutionId = () =>
  useExecutionStore((s) => s.executionId)

export const useExecutionStatus = () =>
  useExecutionStore((s) => s.status)

export const useExecutionProgress = () =>
  useExecutionStore(
    useShallow((s) => ({
      completedSteps: s.completedSteps,
      totalSteps: s.totalSteps,
    })),
  )

const NO_INNER_STATES: NodeExecutionState[] = []

/**
 * 节点运行状态。可复用块在 server 端被展平，块节点自身没有步骤：
 * 没有直接条目时，按 `<nodeId>::` 前缀聚合块内步骤的状态。
 */
export const useNodeExecutionState = (nodeId: string) => {
  const direct = useExecutionStore((s) => s.nodes[nodeId] ?? null)
  const innerStates = useExecutionStore(
    useShallow((s) =>
      s.nodes[nodeId] ? NO_INNER_STATES : selectReusableBlockInnerStates(s.nodes, nodeId),
    ),
  )
  return useMemo(
    () => direct ?? aggregateReusableBlockState(nodeId, innerStates),
    [direct, innerStates, nodeId],
  )
}

export const useNodeIntervention = (nodeId: string) =>
  useNodeExecutionState(nodeId)?.intervention ?? null

export const useAllNodeStates = () =>
  useExecutionStore(useShallow((s) => s.nodes))

export const useRecentEvents = () =>
  useExecutionStore((s) => s.recentEvents)

export const useExecutionActions = () =>
  useExecutionStore((s) => s.actions)

export const useIsExecutionActive = () =>
  useExecutionStore(
    (s) => s.status === 'running' || s.status === 'paused',
  )

export const useToolCalls = (nodeId: string) =>
  useExecutionStore((s) => s.nodes[nodeId]?.toolCalls ?? null)

export const useActiveToolCalls = (nodeId: string) =>
  useExecutionStore(
    useShallow((s) => {
      const toolCalls = s.nodes[nodeId]?.toolCalls
      if (!toolCalls) return []
      return Object.values(toolCalls).filter(
        (tc) =>
          tc.status === 'pending' ||
          tc.status === 'in_progress' ||
          tc.status === 'awaiting_permission',
      )
    }),
  )

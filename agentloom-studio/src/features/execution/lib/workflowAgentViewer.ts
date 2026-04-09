import type {
  ConversationMessage,
  FileChange,
  MessageSegment,
  SandboxStatus,
  SubAgentStream,
  TerminalEntry,
  ToolCall,
  ToolCallStatus,
} from '@/features/agent-conversation'
import type { ToolCallData } from '@/shared/components/tool-renderers/types'
import type { ExecutionStep, AgentEvent } from '../types'
import type { NodeExecutionState } from '../stores/executionStore'
import {
  mergeSubAgentStreamMaps,
  normalizePersistedSubAgentStreams,
} from './subAgentStreams'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function normalizeToolCallStatus(value: unknown): ToolCallStatus {
  switch (value) {
    case 'pending':
    case 'awaiting_permission':
    case 'denied':
    case 'in_progress':
    case 'completed':
    case 'failed':
      return value
    default:
      return 'pending'
  }
}

function normalizeToolCall(value: unknown): ToolCall | null {
  if (!isRecord(value)) {
    return null
  }

  const id = readString(value.id)
  const tool = readString(value.tool)
  if (!id || !tool) {
    return null
  }

  const permissionRequest = isRecord(value.permissionRequest)
    ? {
        ...(readString(value.permissionRequest.description)
          ? { description: readString(value.permissionRequest.description) }
          : {}),
        ...(Array.isArray(value.permissionRequest.resourcePaths)
          ? {
              resourcePaths: value.permissionRequest.resourcePaths.filter(
                (item): item is string =>
                  typeof item === 'string' && item.length > 0,
              ),
            }
          : {}),
        ...(readString(value.permissionRequest.domain)
          ? { domain: readString(value.permissionRequest.domain) }
          : {}),
        ...(readString(value.permissionRequest.category)
          ? { category: readString(value.permissionRequest.category) }
          : {}),
        ...(value.permissionRequest.riskLevel === 'low' ||
        value.permissionRequest.riskLevel === 'medium' ||
        value.permissionRequest.riskLevel === 'high'
          ? {
              riskLevel: value.permissionRequest.riskLevel as
                | 'low'
                | 'medium'
                | 'high',
            }
          : {}),
        ...(readString(value.permissionRequest.sourceLabel)
          ? { sourceLabel: readString(value.permissionRequest.sourceLabel) }
          : {}),
        ...(readString(value.permissionRequest.targetType)
          ? { targetType: readString(value.permissionRequest.targetType) }
          : {}),
        ...(readString(value.permissionRequest.targetLabel)
          ? { targetLabel: readString(value.permissionRequest.targetLabel) }
          : {}),
        ...(readString(value.permissionRequest.approveEffect)
          ? { approveEffect: readString(value.permissionRequest.approveEffect) }
          : {}),
        ...(readString(value.permissionRequest.denyEffect)
          ? { denyEffect: readString(value.permissionRequest.denyEffect) }
          : {}),
        ...(isRecord(value.permissionRequest.diffPreview)
          ? { diffPreview: value.permissionRequest.diffPreview }
          : {}),
        ...(typeof value.permissionRequest.rememberable === 'boolean'
          ? { rememberable: value.permissionRequest.rememberable }
          : {}),
      }
    : undefined

  const transitions = Array.isArray(value.transitions)
    ? value.transitions.flatMap((item) => {
        if (!isRecord(item)) {
          return []
        }

        const to = normalizeToolCallStatus(item.to)
        const timestamp = readString(item.timestamp)
        const source:
          | 'runtime'
          | 'worker'
          | 'user'
          | undefined =
          item.source === 'runtime' ||
          item.source === 'worker' ||
          item.source === 'user'
            ? item.source
            : undefined

        if (!timestamp || !source) {
          return []
        }

        return [
          {
            ...(item.from ? { from: normalizeToolCallStatus(item.from) } : {}),
            to,
            timestamp,
            source,
          },
        ]
      })
    : undefined

  return {
    id,
    tool,
    args: value.args,
    result: value.result,
    error: readString(value.error),
    status: normalizeToolCallStatus(value.status),
    ...(transitions && transitions.length > 0 ? { transitions } : {}),
    ...(permissionRequest &&
    (permissionRequest.description || permissionRequest.resourcePaths?.length)
      ? { permissionRequest }
      : {}),
    startedAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function normalizeStoredSegments(
  checkpointData: Record<string, unknown> | null | undefined,
  toolCalls: ToolCall[],
): MessageSegment[] {
  const storedSegments = Array.isArray(checkpointData?.segments)
    ? checkpointData.segments
    : []

  const normalized: MessageSegment[] = []

  for (const segment of storedSegments) {
    if (!isRecord(segment)) {
      continue
    }

    switch (segment.type) {
      case 'text':
      case 'thinking': {
        const content = readString(segment.content)
        if (!content) {
          continue
        }

        normalized.push({ type: segment.type, content } satisfies MessageSegment)
        break
      }
      case 'tool_call': {
        const toolCallId = readString(segment.toolCallId)
        if (!toolCallId || !toolCalls.some((toolCall) => toolCall.id === toolCallId)) {
          continue
        }

        normalized.push({ type: 'tool_call', toolCallId } satisfies MessageSegment)
        break
      }
      default:
        break
    }
  }

  if (normalized.length > 0) {
    return normalized
  }

  const fallback: MessageSegment[] = []
  const content =
    readString(checkpointData?.partialContent) ??
    readString(checkpointData?.content)
  if (content) {
    fallback.push({ type: 'text', content })
  }

  for (const toolCall of toolCalls) {
    fallback.push({ type: 'tool_call', toolCallId: toolCall.id })
  }

  return fallback
}

function appendTextSegment(segments: MessageSegment[], content: string): MessageSegment[] {
  if (content.length === 0) {
    return segments
  }

  const last = segments.at(-1)
  if (last?.type === 'text') {
    return [
      ...segments.slice(0, -1),
      { type: 'text', content: last.content + content },
    ]
  }

  return [...segments, { type: 'text', content }]
}

function appendThinkingSegment(
  segments: MessageSegment[],
  content: string,
): MessageSegment[] {
  if (content.length === 0) {
    return segments
  }

  const last = segments.at(-1)
  if (last?.type === 'thinking') {
    return [
      ...segments.slice(0, -1),
      { type: 'thinking', content: last.content + content },
    ]
  }

  return [...segments, { type: 'thinking', content }]
}

function ensureToolSegment(
  segments: MessageSegment[],
  toolCallId: string,
): MessageSegment[] {
  if (
    toolCallId.length === 0 ||
    segments.some(
      (segment) =>
        segment.type === 'tool_call' && segment.toolCallId === toolCallId,
    )
  ) {
    return segments
  }

  return [...segments, { type: 'tool_call', toolCallId }]
}

function collectThinkingContent(segments: MessageSegment[]): string | undefined {
  const thinking = segments
    .flatMap((segment) =>
      segment.type === 'thinking' ? [segment.content] : [],
    )
    .join('')

  return thinking.length > 0 ? thinking : undefined
}

function extractLiveThinkingText(events: AgentEvent[]): string {
  return events
    .flatMap((event) => {
      switch (event.type) {
        case 'plan':
          return event.content ? [event.content] : []
        case 'decision':
          return event.rationale ? [event.rationale] : []
        default:
          return []
      }
    })
    .join('')
}

function extractDisplayedOutput(
  step: ExecutionStep,
  nodeState: NodeExecutionState | null,
): string {
  if (nodeState?.output.length) {
    return nodeState.output
  }

  if (typeof step.output?.content === 'string') {
    return step.output.content
  }

  if (typeof step.checkpointData?.partialContent === 'string') {
    return step.checkpointData.partialContent
  }

  return ''
}

function mergeToolCalls(
  step: ExecutionStep,
  nodeState: NodeExecutionState | null,
): ToolCall[] {
  const orderedIds: string[] = []
  const toolCallMap = new Map<string, ToolCall>()

  const persisted = Array.isArray(step.checkpointData?.toolCalls)
    ? step.checkpointData.toolCalls
    : []

  for (const entry of persisted) {
    const normalized = normalizeToolCall(entry)
    if (!normalized) {
      continue
    }

    orderedIds.push(normalized.id)
    toolCallMap.set(normalized.id, normalized)
  }

  for (const liveToolCall of Object.values(nodeState?.toolCalls ?? {})) {
    const normalized: ToolCall = {
      id: liveToolCall.id,
      tool: liveToolCall.tool,
      args: liveToolCall.args,
      result: liveToolCall.result,
      error: liveToolCall.error,
      status: liveToolCall.status,
      transitions: liveToolCall.transitions,
      permissionRequest: liveToolCall.permissionRequest,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    }

    if (!orderedIds.includes(normalized.id)) {
      orderedIds.push(normalized.id)
    }

    toolCallMap.set(normalized.id, {
      ...(toolCallMap.get(normalized.id) ?? normalized),
      ...normalized,
    })
  }

  return orderedIds
    .map((id) => toolCallMap.get(id))
    .filter((toolCall): toolCall is ToolCall => Boolean(toolCall))
}

function buildSegments(
  step: ExecutionStep,
  nodeState: NodeExecutionState | null,
  toolCalls: ToolCall[],
): MessageSegment[] {
  let segments = normalizeStoredSegments(step.checkpointData, toolCalls)
  const persistedText = segments
    .flatMap((segment) => (segment.type === 'text' ? [segment.content] : []))
    .join('')
  const liveOutput = extractDisplayedOutput(step, nodeState)

  if (liveOutput.length > 0) {
    const suffix = liveOutput.startsWith(persistedText)
      ? liveOutput.slice(persistedText.length)
      : persistedText.length === 0
        ? liveOutput
        : ''

    if (suffix.length > 0) {
      segments = appendTextSegment(segments, suffix)
    }
  }

  const persistedThinking = segments
    .flatMap((segment) => (segment.type === 'thinking' ? [segment.content] : []))
    .join('')
  const liveThinking = extractLiveThinkingText(nodeState?.agentEvents ?? [])
  if (liveThinking.length > 0) {
    const thinkingSuffix = liveThinking.startsWith(persistedThinking)
      ? liveThinking.slice(persistedThinking.length)
      : persistedThinking.length === 0
        ? liveThinking
        : ''

    if (thinkingSuffix.length > 0) {
      segments = appendThinkingSegment(segments, thinkingSuffix)
    }
  }

  for (const toolCall of toolCalls) {
    segments = ensureToolSegment(segments, toolCall.id)
  }

  return segments
}

function toTerminalEntries(events: AgentEvent[]): TerminalEntry[] {
  return events.flatMap((event, index) => {
    if (event.type !== 'pty.output') {
      return []
    }

    return [
      {
        id: `terminal-${event.sessionId}-${index}`,
        output: event.data,
        timestamp: Date.now(),
        sessionId: event.sessionId,
      },
    ]
  })
}

function toFileChanges(events: AgentEvent[]): FileChange[] {
  return events.flatMap((event) => {
    if (event.type !== 'file_change') {
      return []
    }

    return [
      {
        path: event.path,
        changeType: event.changeType,
        ...(event.diff ? { diff: event.diff } : {}),
        ...(event.content ? { content: event.content } : {}),
      },
    ]
  })
}

function toSandboxStatus(
  step: ExecutionStep,
  nodeState: NodeExecutionState | null,
): SandboxStatus {
  const status = nodeState?.status ?? step.status
  if (status === 'failed' || status === 'cancelled') {
    return 'error'
  }

  if (
    status === 'running' ||
    status === 'queued' ||
    status === 'waiting_for_intervention'
  ) {
    return 'running'
  }

  return 'idle'
}

export interface WorkflowAgentViewerState {
  messages: ConversationMessage[]
  subAgentStreams: Record<string, SubAgentStream>
  terminalEntries: TerminalEntry[]
  fileChanges: FileChange[]
  activeToolCall?: ToolCallData
  sandboxStatus: SandboxStatus
}

export function buildWorkflowAgentViewerState(
  step: ExecutionStep,
  nodeState: NodeExecutionState | null,
): WorkflowAgentViewerState {
  const toolCalls = mergeToolCalls(step, nodeState)
  const segments = buildSegments(step, nodeState, toolCalls)
  const content = extractDisplayedOutput(step, nodeState)
  const subAgentStreams = mergeSubAgentStreamMaps({
    persisted: normalizePersistedSubAgentStreams(step.checkpointData?.subAgentStreams),
    live: nodeState?.subAgentStreams ?? {},
  })
  const message: ConversationMessage | null =
    segments.length > 0 || toolCalls.length > 0 || content.length > 0
      ? {
          id: `${step.id}-assistant`,
          role: 'assistant',
          content,
          thinking: collectThinkingContent(segments),
          toolCalls,
          segments,
          isStreaming: Boolean(nodeState?.isStreaming),
          createdAt: step.startedAt ? Date.parse(step.startedAt) : Date.now(),
        }
      : null

  const activeToolCall = [...toolCalls]
    .reverse()
    .find(
      (toolCall) =>
        toolCall.status === 'pending' ||
        toolCall.status === 'in_progress' ||
        toolCall.status === 'awaiting_permission',
    )

  return {
    messages: message ? [message] : [],
    subAgentStreams,
    terminalEntries: toTerminalEntries(nodeState?.agentEvents ?? []),
    fileChanges: toFileChanges(nodeState?.agentEvents ?? []),
    ...(activeToolCall
      ? {
          activeToolCall: {
            id: activeToolCall.id,
            tool: activeToolCall.tool,
            args: activeToolCall.args,
            result: activeToolCall.result,
            error: activeToolCall.error,
            status: activeToolCall.status,
            permissionDescription: activeToolCall.permissionRequest?.description,
            permissionResourcePaths:
              activeToolCall.permissionRequest?.resourcePaths,
          },
        }
      : {}),
    sandboxStatus: toSandboxStatus(step, nodeState),
  }
}

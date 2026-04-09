import type {
  SubAgentEvent,
  SubAgentRunStatus,
  SubAgentStream,
} from '@/features/agent-conversation'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }

  return Date.now()
}

export function normalizeSubAgentStatus(
  value: unknown,
): SubAgentRunStatus | undefined {
  switch (value) {
    case 'pending':
    case 'running':
    case 'completed':
    case 'failed':
    case 'timeout':
    case 'cancelled':
      return value
    default:
      return undefined
  }
}

export function isTerminalSubAgentStatus(status: SubAgentRunStatus): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'timeout' ||
    status === 'cancelled'
  )
}

function normalizePersistedSubAgentEvent(
  value: unknown,
): SubAgentEvent | null {
  if (!isRecord(value)) {
    return null
  }

  const type = value.type
  if (
    type !== 'message_chunk' &&
    type !== 'thinking' &&
    type !== 'tool_call' &&
    type !== 'tool_result' &&
    type !== 'done' &&
    type !== 'status_changed'
  ) {
    return null
  }

  return {
    id: readString(value.id) ?? crypto.randomUUID(),
    type,
    payload: isRecord(value.payload) ? value.payload : {},
    timestamp: readTimestamp(value.timestamp),
  }
}

function inferPersistedSubAgentStatus(
  events: SubAgentStream['events'],
  fallbackError?: string,
): SubAgentRunStatus {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'status_changed') {
      continue
    }

    const status = normalizeSubAgentStatus(
      isRecord(event.payload) ? event.payload.status : undefined,
    )
    if (status) {
      return status
    }
  }

  if (events.some((event) => event.type === 'done')) {
    return 'completed'
  }

  return fallbackError ? 'failed' : 'running'
}

export function normalizePersistedSubAgentStream(
  value: unknown,
  fallbackHandle?: string,
): SubAgentStream | null {
  if (!isRecord(value)) {
    return null
  }

  const handle = readString(value.handle) ?? fallbackHandle
  const alias = readString(value.alias)
  const parentToolCallId = readString(value.parentToolCallId)
  const depth =
    typeof value.depth === 'number' && Number.isFinite(value.depth)
      ? value.depth
      : undefined

  if (!handle || !alias || !parentToolCallId || depth === undefined) {
    return null
  }

  const events = Array.isArray(value.events)
    ? value.events.flatMap((event) => {
        const normalized = normalizePersistedSubAgentEvent(event)
        return normalized ? [normalized] : []
      })
    : []
  const error = readString(value.error)
  const status =
    normalizeSubAgentStatus(value.status) ??
    inferPersistedSubAgentStatus(events, error)

  return {
    handle: handle as SubAgentStream['handle'],
    alias,
    depth,
    parentToolCallId,
    status,
    events,
    startedAt: readTimestamp(value.startedAt),
    ...(value.completedAt !== undefined
      ? { completedAt: readTimestamp(value.completedAt) }
      : {}),
    ...(error ? { error } : {}),
  }
}

export function normalizePersistedSubAgentStreams(
  value: unknown,
): Record<string, SubAgentStream> {
  if (!isRecord(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([handle, stream]) => {
      const normalized = normalizePersistedSubAgentStream(stream, handle)
      return normalized ? [[handle, normalized] as const] : []
    }),
  )
}

export function mergeSubAgentStreamMaps(params: {
  persisted: Record<string, SubAgentStream>
  live: Record<string, SubAgentStream>
}): Record<string, SubAgentStream> {
  const merged: Record<string, SubAgentStream> = { ...params.persisted }

  for (const [handle, liveStream] of Object.entries(params.live)) {
    const persistedStream = merged[handle]
    if (!persistedStream) {
      merged[handle] = liveStream
      continue
    }

    if (
      isTerminalSubAgentStatus(persistedStream.status) &&
      !isTerminalSubAgentStatus(liveStream.status)
    ) {
      continue
    }

    merged[handle] =
      persistedStream.events.length > liveStream.events.length
        ? persistedStream
        : liveStream
  }

  return merged
}

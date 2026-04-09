import { randomUUID } from 'node:crypto';

import type { AgentEvent } from '../../agent/types/agent-event.types';
import type { ToolCallEvent } from '../../agent/types/tool-call-event.types';
import {
  PersistedSubAgentEventRecord,
  PersistedSubAgentStreamRecord,
  SubAgentEventEnvelope,
  SubAgentRunStatus,
} from './subagent-execution.types';

export function createPersistedSubAgentStream(
  envelope: SubAgentEventEnvelope,
  startedAt = Date.now(),
): PersistedSubAgentStreamRecord {
  return {
    handle: envelope.handle,
    alias: envelope.alias,
    depth: envelope.depth,
    parentToolCallId: envelope.parentToolCallId,
    status: SubAgentRunStatus.RUNNING,
    events: [],
    startedAt,
  };
}

export function clonePersistedSubAgentStream(
  stream: PersistedSubAgentStreamRecord,
): PersistedSubAgentStreamRecord {
  return {
    ...stream,
    events: stream.events.map((event) => ({
      ...event,
      payload: { ...event.payload },
    })),
  };
}

export function pushPersistedSubAgentEvent(
  stream: PersistedSubAgentStreamRecord,
  event: PersistedSubAgentEventRecord,
): void {
  stream.events.push(event);
}

export function completePersistedSubAgentStream(
  stream: PersistedSubAgentStreamRecord,
  status: SubAgentRunStatus,
  error?: string,
  timestamp = Date.now(),
): void {
  stream.status = status;
  if (error) {
    stream.error = error;
  }
  stream.completedAt ??= timestamp;

  stream.events.push({
    id: randomUUID(),
    type: 'status_changed',
    payload: {
      status,
      ...(error ? { error } : {}),
    },
    timestamp,
  });
}

export function normalizeSubAgentEventForPersistence(
  event: AgentEvent,
  timestamp = Date.now(),
): PersistedSubAgentEventRecord | null {
  switch (event.type) {
    case 'message_chunk':
      return {
        id: randomUUID(),
        type: 'message_chunk',
        payload: { chunk: event.content },
        timestamp,
      };
    case 'plan':
      return {
        id: randomUUID(),
        type: 'thinking',
        payload: {
          content:
            typeof event.content === 'string' && event.content.length > 0
              ? event.content
              : event.title,
        },
        timestamp,
      };
    case 'decision': {
      const content = extractThinkingContent(event);
      if (!content) {
        return null;
      }

      return {
        id: randomUUID(),
        type: 'thinking',
        payload: { content },
        timestamp,
      };
    }
    case 'tool_call':
      return {
        id: randomUUID(),
        type:
          event.call.status === 'completed' || event.call.status === 'failed'
            ? 'tool_result'
            : 'tool_call',
        payload: buildPersistedToolPayload(event.call),
        timestamp,
      };
    case 'done':
      return {
        id: randomUUID(),
        type: 'done',
        payload: { stopReason: event.stopReason },
        timestamp,
      };
    default:
      return null;
  }
}

function buildPersistedToolPayload(
  call: ToolCallEvent,
): Record<string, unknown> {
  return {
    toolCallId: call.id,
    tool: call.tool,
    args: call.args,
    status: call.status,
    ...(call.result !== undefined ? { result: call.result } : {}),
    ...(call.error !== undefined ? { error: call.error } : {}),
    ...(call.transitions ? { transitions: [...call.transitions] } : {}),
    ...(call.permissionRequest
      ? { permissionRequest: call.permissionRequest }
      : {}),
  };
}

function extractThinkingContent(
  event: Extract<AgentEvent, { type: 'decision' }>,
): string | undefined {
  const parts = [event.rationale, event.suggestedContent].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

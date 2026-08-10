import type {
  DecisionEvent,
  StopReason,
} from '../agent/types/agent-event.types';
import type { ToolCallEvent } from '../agent/types/tool-call-event.types';
import type { ConversationMessageSegmentRecord } from '../agent-conversation/message-segments';
import { resolveConversationMessageContentType } from '../agent-conversation/conversation-attachment';
import type { ContentBlock } from '../agent/types/content-block.types';
import {
  buildConversationPromptBlocks,
  type HistoryConversationPromptMessage,
  type PendingConversationPromptMessage,
} from './conversation-prompt-blocks';
import type { PersistedSubAgentStreamRecord } from './subagent';
import { readStringValue } from './conversation-execution-metadata';

export type ConversationTurnResult = {
  assistantText: string;
  decision?: DecisionEvent;
  stopReason: StopReason;
  toolCalls: ToolCallEvent[];
  toolResults: Array<Record<string, unknown>>;
  segments: ConversationMessageSegmentRecord[];
  subAgentStreams: Record<string, PersistedSubAgentStreamRecord>;
};
export function buildPromptBlocks(
  pendingMessages: PendingConversationPromptMessage[],
  hasPriorTurns: boolean,
  historyMessages: HistoryConversationPromptMessage[] = [],
  latestPromptOverride?: string,
  conversationMetadata: Record<string, unknown> = {},
): ContentBlock[] {
  return buildConversationPromptBlocks({
    pendingMessages: pendingMessages.map((message) => ({
      ...message,
      contentType: resolveConversationMessageContentType(
        message.contentType,
        message.metadata,
      ),
    })),
    hasPriorTurns,
    historyMessages,
    latestPromptOverride,
    conversationMetadata,
  });
}


export function buildConversationTurnResult(
  assistantText: string,
  decision: DecisionEvent | undefined,
  stopReason: StopReason,
  toolCalls: Map<string, ToolCallEvent>,
  segments: ConversationMessageSegmentRecord[],
  subAgentStreams: Record<string, PersistedSubAgentStreamRecord>,
): ConversationTurnResult {
  const toolCallList = [...toolCalls.values()];
  const toolResults = toolCallList
    .filter((call) => call.result !== undefined || call.error !== undefined)
    .map((call) => ({
      toolCallId: call.id,
      tool: call.tool,
      status: call.status,
      ...(call.result !== undefined ? { result: call.result } : {}),
      ...(call.error !== undefined ? { error: call.error } : {}),
    }));

  return {
    assistantText,
    decision,
    stopReason,
    toolCalls: toolCallList,
    toolResults,
    segments,
    subAgentStreams,
  };
}

export function turnResultHasPersistableOutput(
  turnResult: ConversationTurnResult,
): boolean {
  return (
    turnResult.assistantText.length > 0 ||
    turnResult.toolCalls.length > 0 ||
    turnResult.toolResults.length > 0 ||
    turnResult.segments.length > 0 ||
    (turnResult.subAgentStreams &&
      Object.keys(turnResult.subAgentStreams).length > 0) ||
    Boolean(turnResult.decision)
  );
}

export function mergeToolCallEvent(
  previous: ToolCallEvent | undefined,
  next: ToolCallEvent,
): ToolCallEvent {
  return {
    ...next,
    tool:
      hasConcreteToolName(next.tool) || !previous ? next.tool : previous.tool,
    args:
      hasConcreteToolArgs(next.args) || !previous ? next.args : previous.args,
    ...(next.transitions
      ? { transitions: next.transitions }
      : previous?.transitions
        ? { transitions: previous.transitions }
        : {}),
    ...(next.result !== undefined
      ? { result: next.result }
      : previous?.result !== undefined
        ? { result: previous.result }
        : {}),
    ...(next.error !== undefined
      ? { error: next.error }
      : previous?.error !== undefined
        ? { error: previous.error }
        : {}),
    ...(next.permissionRequest
      ? { permissionRequest: next.permissionRequest }
      : previous?.permissionRequest
        ? { permissionRequest: previous.permissionRequest }
        : {}),
  };
}

function hasConcreteToolName(tool: string | undefined): boolean {
  return typeof tool === 'string' && tool.length > 0 && tool !== 'unknown_tool';
}

function hasConcreteToolArgs(
  args: Record<string, unknown> | undefined,
): boolean {
  return !!args && Object.keys(args).length > 0;
}

export function extractThinkingEventContent(event: {
  type?: unknown;
  content?: unknown;
  rationale?: unknown;
  suggestedContent?: unknown;
}): string | undefined {
  switch (event.type) {
    case 'thinking':
    case 'plan':
      return readStringValue(event.content);
    case 'decision': {
      const rationale = readStringValue(event.rationale);
      const suggestedContent = readStringValue(event.suggestedContent);
      const parts = [rationale, suggestedContent].filter(Boolean);
      return parts.length > 0 ? parts.join('\n\n') : undefined;
    }
    default:
      return undefined;
  }
}

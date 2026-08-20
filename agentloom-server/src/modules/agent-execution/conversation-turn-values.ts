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
export {
  extractAgentThinkingContent as extractThinkingEventContent,
  mergeAgentToolCallEvent as mergeToolCallEvent,
} from '../agent/shared/agent-turn-event-accumulator';

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
  toolCalls: Iterable<ToolCallEvent> | Map<string, ToolCallEvent>,
  segments: ConversationMessageSegmentRecord[],
  subAgentStreams: Record<string, PersistedSubAgentStreamRecord>,
): ConversationTurnResult {
  const toolCallList =
    toolCalls instanceof Map ? [...toolCalls.values()] : [...toolCalls];
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


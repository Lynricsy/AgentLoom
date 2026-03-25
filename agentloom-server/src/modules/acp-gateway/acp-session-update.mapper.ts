import type { ReplayableAgentEvent } from '../agent/types/conversation-history.types';
import type {
  DecisionEvent,
  MessageChunkEvent,
  PlanEvent,
  ToolCallAgentEvent,
} from '../agent/types/agent-event.types';
import type { ConversationReplayEntry } from '../agent/types/conversation-history.types';
import type {
  AcpSessionUpdate,
} from './acp-types';

export function mapAgentEventToAcpSessionUpdate(
  event: ReplayableAgentEvent,
  options?: { replayed?: boolean },
): AcpSessionUpdate {
  switch (event.type) {
    case 'plan':
      return applyReplayFlag(
        {
          type: 'plan',
          title: event.title,
          content: event.content,
        },
        options,
      );
    case 'message_chunk':
      return applyReplayFlag(
        {
          type: 'agent_message_chunk',
          content: event.content,
        },
        options,
      );
    case 'tool_call':
      return applyReplayFlag(
        {
          type: 'tool_call',
          call: event.call,
        },
        options,
      );
    case 'decision':
      return applyReplayFlag(
        {
          type: 'decision',
          suggestedContent: event.suggestedContent,
          ...(event.autonomyMode === undefined
            ? {}
            : { autonomyMode: event.autonomyMode }),
          ...(event.selectedAction === undefined
            ? {}
            : { selectedAction: event.selectedAction }),
          ...(event.alternatives === undefined
            ? {}
            : { alternatives: event.alternatives }),
          ...(event.confidence === undefined
            ? {}
            : { confidence: event.confidence }),
          ...(event.rationale === undefined ? {} : { rationale: event.rationale }),
        },
        options,
      );
    default:
      return applyReplayFlag(
        {
          type: 'agent_message_chunk',
          content: '',
        },
        options,
      );
  }
}

export function mapConversationReplayEntryToAcpSessionUpdate(
  entry: ConversationReplayEntry,
): AcpSessionUpdate {
  if (entry.kind === 'user_message') {
    return {
      type: 'user_message',
      content: entry.content,
      replayed: true,
    };
  }

  return mapAgentEventToAcpSessionUpdate(entry.event, {
    replayed: true,
  });
}

function applyReplayFlag<T extends AcpSessionUpdate>(
  update: T,
  options?: { replayed?: boolean },
): T {
  if (options?.replayed !== true) {
    return update;
  }

  return {
    ...update,
    replayed: true,
  };
}

void (0 as unknown as
  | DecisionEvent
  | MessageChunkEvent
  | PlanEvent
  | ToolCallAgentEvent);

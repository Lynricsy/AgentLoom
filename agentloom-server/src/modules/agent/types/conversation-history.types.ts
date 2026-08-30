import type { AgentEvent } from './agent-event.types';
import type { ContentBlock } from './content-block.types';

export type ReplayableAgentEvent = Exclude<AgentEvent, { type: 'done' }>;

export interface ConversationUserMessageReplayEntry {
  readonly kind: 'user_message';
  readonly content: ContentBlock[];
}

export interface ConversationAgentEventReplayEntry {
  readonly kind: 'agent_event';
  readonly event: ReplayableAgentEvent;
}

export type ConversationReplayEntry =
  ConversationUserMessageReplayEntry | ConversationAgentEventReplayEntry;

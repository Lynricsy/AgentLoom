import type { ToolCallEvent } from './tool-call-event.types';

export type StopReason = 'end_turn' | 'max_tokens' | 'tool_use' | 'cancelled';

export interface PlanEvent {
  readonly type: 'plan';
  readonly title: string;
  readonly content: string;
}

export interface MessageChunkEvent {
  readonly type: 'message_chunk';
  readonly content: string;
}

export interface ToolCallAgentEvent {
  readonly type: 'tool_call';
  readonly call: ToolCallEvent;
}

export interface DoneEvent {
  readonly type: 'done';
  readonly stopReason: StopReason;
}

export type AgentEvent =
  | PlanEvent
  | MessageChunkEvent
  | ToolCallAgentEvent
  | DoneEvent;

export function isPlanEvent(event: AgentEvent): event is PlanEvent {
  return event.type === 'plan';
}

export function isMessageChunkEvent(
  event: AgentEvent,
): event is MessageChunkEvent {
  return event.type === 'message_chunk';
}

export function isToolCallEvent(
  event: AgentEvent,
): event is ToolCallAgentEvent {
  return event.type === 'tool_call';
}

export function isDoneEvent(event: AgentEvent): event is DoneEvent {
  return event.type === 'done';
}

import type { ToolCallEvent } from './tool-call-event.types';
import type { SubAgentEventEnvelope } from '../../agent-execution/subagent';

export type StopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'tool_use'
  | 'cancelled'
  | 'intervention_required';

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

export interface DecisionEvent {
  readonly type: 'decision';
  readonly suggestedContent: string;
  readonly autonomyMode?: string;
  readonly selectedAction?: string;
  readonly alternatives?: readonly string[];
  readonly confidence?: number;
  readonly rationale?: string;
}

export interface DoneEvent {
  readonly type: 'done';
  readonly stopReason: StopReason;
}

export interface FileChangeEvent {
  readonly type: 'file_change';
  readonly path: string;
  readonly changeType: 'created' | 'modified' | 'deleted';
  readonly diff?: string;
  readonly content?: string;
}

/** PTY 会话元信息，与沙箱容器 PTYSessionInfo 对齐 */
export interface PtySessionInfo {
  readonly id: string;
  readonly pid: number;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly status: 'running' | 'killing' | 'killed' | 'exited';
  readonly exitCode?: number;
  readonly exitSignal?: number | string;
  readonly createdAt: string;
  readonly lastActivityAt: string;
  readonly title?: string;
  readonly notifyOnExit: boolean;
  readonly cols: number;
  readonly rows: number;
  readonly lineCount: number;
}

/** PTY 会话创建事件 */
export interface PtySpawnedEvent {
  readonly type: 'pty.spawned';
  readonly sessionId: string;
  readonly info: PtySessionInfo;
}

/** PTY 输出事件 */
export interface PtyOutputEvent {
  readonly type: 'pty.output';
  readonly sessionId: string;
  readonly data: string;
}

/** PTY 会话退出事件 */
export interface PtyExitEvent {
  readonly type: 'pty.exit';
  readonly sessionId: string;
  readonly exitCode?: number;
  readonly exitSignal?: number | string;
}

/** PTY 会话被杀死事件 */
export interface PtyKilledEvent {
  readonly type: 'pty.killed';
  readonly sessionId: string;
}

export type PtyEvent =
  | PtySpawnedEvent
  | PtyOutputEvent
  | PtyExitEvent
  | PtyKilledEvent;

export type AgentEvent =
  | PlanEvent
  | MessageChunkEvent
  | ToolCallAgentEvent
  | DecisionEvent
  | DoneEvent
  | FileChangeEvent
  | PtySpawnedEvent
  | PtyOutputEvent
  | PtyExitEvent
  | PtyKilledEvent;

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

export function isDecisionEvent(event: AgentEvent): event is DecisionEvent {
  return event.type === 'decision';
}

export function isDoneEvent(event: AgentEvent): event is DoneEvent {
  return event.type === 'done';
}

export function isFileChangeEvent(event: AgentEvent): event is FileChangeEvent {
  return event.type === 'file_change';
}

export function isPtyEvent(event: AgentEvent): event is PtyEvent {
  return event.type.startsWith('pty.');
}

export interface ConversationAgentEvent {
  event: AgentEvent;
  subagent?: SubAgentEventEnvelope;
}

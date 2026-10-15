/**
 * Agent 单轮事件的纯内存聚合器：统一正文、思考、工具调用、决策与结束原因的累积，
 * 不负责事件广播、持久化或运行时续轮。
 */
import type {
  AgentEvent,
  AgentUsage,
  DecisionEvent,
  StopReason,
} from '../types/agent-event.types';
import type { ToolCallEvent } from '../types/tool-call-event.types';
import {
  appendTextConversationMessageSegment,
  appendThinkingConversationMessageSegment,
  ensureToolCallConversationMessageSegment,
  type ConversationMessageSegmentRecord,
} from '../../agent-conversation/message-segments';

export type AgentTurnEventAccumulatorOptions<TDecision> = {
  assistantText?: string;
  chunkIndex?: number;
  outputChunkIndexOffset?: number;
  decision?: TDecision;
  stopReason?: StopReason;
  toolCalls?: Iterable<ToolCallEvent>;
  segments?: ConversationMessageSegmentRecord[];
  mapDecision: (event: DecisionEvent) => TDecision;
};

export type AccumulatedAgentTurnEvent =
  | { kind: 'message_chunk'; chunk: string; index: number }
  | { kind: 'tool_call'; toolCall: ToolCallEvent }
  | { kind: 'decision' }
  | { kind: 'done'; stopReason: StopReason }
  | { kind: 'other' };

export class AgentTurnEventAccumulator<TDecision = DecisionEvent> {
  private assistantTextValue: string;
  private chunkIndexValue: number;
  private decisionValue: TDecision | undefined;
  private stopReasonValue: StopReason | undefined;
  private readonly toolCallsValue = new Map<string, ToolCallEvent>();
  private segmentsValue: ConversationMessageSegmentRecord[];
  private readonly outputChunkIndexOffset: number;
  private readonly mapDecision: (event: DecisionEvent) => TDecision;
  private usageValue: AgentUsage | undefined;
  private modelIdValue: string | undefined;

  constructor(options: AgentTurnEventAccumulatorOptions<TDecision>) {
    this.assistantTextValue = options.assistantText ?? '';
    this.chunkIndexValue = options.chunkIndex ?? 0;
    this.outputChunkIndexOffset = options.outputChunkIndexOffset ?? 0;
    this.decisionValue = options.decision;
    this.stopReasonValue = options.stopReason;
    this.segmentsValue = [...(options.segments ?? [])];
    this.mapDecision = options.mapDecision;
    for (const toolCall of options.toolCalls ?? []) {
      this.toolCallsValue.set(toolCall.id, toolCall);
    }
  }

  consume(
    event: AgentEvent,
    options: { aggregateToolCall?: boolean } = {},
  ): AccumulatedAgentTurnEvent {
    if (event.type === 'message_chunk') {
      this.assistantTextValue += event.content;
      this.segmentsValue = appendTextConversationMessageSegment(
        this.segmentsValue,
        event.content,
      );
      const index = this.chunkIndexValue + this.outputChunkIndexOffset;
      this.chunkIndexValue += 1;
      return { kind: 'message_chunk', chunk: event.content, index };
    }

    const thinkingContent = extractAgentThinkingContent(event);
    if (thinkingContent) {
      this.segmentsValue = appendThinkingConversationMessageSegment(
        this.segmentsValue,
        thinkingContent,
      );
    }

    if (event.type === 'tool_call') {
      if (options.aggregateToolCall !== false) {
        const merged = mergeAgentToolCallEvent(
          this.toolCallsValue.get(event.call.id),
          event.call,
        );
        this.toolCallsValue.set(merged.id, merged);
      }
      this.segmentsValue = ensureToolCallConversationMessageSegment(
        this.segmentsValue,
        event.call.id,
      );
      return { kind: 'tool_call', toolCall: event.call };
    }

    if (event.type === 'decision') {
      this.decisionValue = this.mapDecision(event);
      return { kind: 'decision' };
    }

    if (event.type === 'usage') {
      // 一轮内可能有多条 assistant 消息（工具续轮），逐字段求和
      this.usageValue = addAgentUsage(this.usageValue, event.usage);
      this.modelIdValue = event.modelId ?? this.modelIdValue;
      return { kind: 'other' };
    }

    if (event.type === 'done') {
      this.stopReasonValue = event.stopReason;
      return { kind: 'done', stopReason: event.stopReason };
    }

    return { kind: 'other' };
  }
  beginRound(): void {
    this.stopReasonValue = undefined;
  }

  replaceToolCalls(toolCalls: Iterable<ToolCallEvent>): void {
    this.toolCallsValue.clear();
    for (const toolCall of toolCalls) {
      this.toolCallsValue.set(toolCall.id, toolCall);
    }
  }

  replaceSegments(segments: ConversationMessageSegmentRecord[]): void {
    this.segmentsValue = [...segments];
  }

  get assistantText(): string {
    return this.assistantTextValue;
  }

  get chunkIndex(): number {
    return this.chunkIndexValue;
  }

  get decision(): TDecision | undefined {
    return this.decisionValue;
  }

  get stopReason(): StopReason | undefined {
    return this.stopReasonValue;
  }

  get toolCalls(): ToolCallEvent[] {
    return [...this.toolCallsValue.values()];
  }

  get segments(): ConversationMessageSegmentRecord[] {
    return this.segmentsValue;
  }

  get usage(): AgentUsage | undefined {
    return this.usageValue;
  }

  get modelId(): string | undefined {
    return this.modelIdValue;
  }
}

/** 两份 token 用量逐字段求和；缓存字段两侧都缺失时保持缺失 */
export function addAgentUsage(
  previous: AgentUsage | undefined,
  next: AgentUsage,
): AgentUsage {
  if (!previous) {
    return { ...next };
  }
  const cacheReadTokens =
    previous.cacheReadTokens === undefined && next.cacheReadTokens === undefined
      ? undefined
      : (previous.cacheReadTokens ?? 0) + (next.cacheReadTokens ?? 0);
  const cacheWriteTokens =
    previous.cacheWriteTokens === undefined &&
    next.cacheWriteTokens === undefined
      ? undefined
      : (previous.cacheWriteTokens ?? 0) + (next.cacheWriteTokens ?? 0);
  return {
    inputTokens: previous.inputTokens + next.inputTokens,
    outputTokens: previous.outputTokens + next.outputTokens,
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
    totalTokens: previous.totalTokens + next.totalTokens,
  };
}

export function mergeAgentToolCallEvent(
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

export function extractAgentThinkingContent(event: {
  type?: unknown;
  content?: unknown;
  rationale?: unknown;
  suggestedContent?: unknown;
}): string | undefined {
  switch (event.type) {
    case 'thinking':
    case 'plan':
      return readString(event.content);
    case 'decision': {
      const rationale = readString(event.rationale);
      const suggestedContent = readString(event.suggestedContent);
      const parts = [rationale, suggestedContent].filter(Boolean);
      return parts.length > 0 ? parts.join('\n\n') : undefined;
    }
    default:
      return undefined;
  }
}

function hasConcreteToolName(tool: string | undefined): boolean {
  return typeof tool === 'string' && tool.length > 0 && tool !== 'unknown_tool';
}

function hasConcreteToolArgs(
  args: Record<string, unknown> | undefined,
): boolean {
  return !!args && Object.keys(args).length > 0;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

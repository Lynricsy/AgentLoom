/**
 * dsh 会话事件 / 助手流帧 → guest SandboxAgentEvent 的纯映射。
 * 不依赖运行中的 Context，便于单测。
 */
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import type { SessionEvent, TurnEndReason } from '@deepseek-ai/dsh-session';
import { isRecord } from '../type-guards.js';
import type { HarnessTraceAgentEvent, SandboxAgentEvent } from '../types.js';

/** 远程工具等需要用结构化结果替换 tool/result 文本时提供的覆盖值 */
export interface ToolResultOverride {
  result: unknown;
}

export interface SessionEventMappingContext {
  /** tool/call 记录的 callId → 工具名，用于补全 tool_execution_end */
  toolNameOf(callId: string): string | undefined;
  /** 取走（并清除）某个 callId 的结构化结果覆盖 */
  takeResultOverride(callId: string): ToolResultOverride | undefined;
}

/**
 * 映射一条 dsh 会话事件。harness_trace 总是排在第一位：turn/end 产出的
 * agent_end 会让 SSE 流结束，排在其后的事件不会再被推送。
 */
export function mapSessionEvent(
  event: SessionEvent,
  context: SessionEventMappingContext,
): SandboxAgentEvent[] {
  const mapped: SandboxAgentEvent[] = [buildHarnessTrace(event)];

  switch (event.type) {
    case 'turn/start':
      mapped.push({ type: 'agent_start' }, { type: 'turn_start' });
      break;
    case 'turn/end': {
      const reason = event.data.reason;
      if (reason.kind === 'error') {
        mapped.push({
          type: 'message_end',
          message: {
            role: 'assistant',
            stopReason: 'error',
            errorMessage: reason.error.message,
          },
        });
      }
      mapped.push(
        { type: 'turn_end' },
        { type: 'agent_end', stopReason: toStopReason(reason) },
      );
      break;
    }
    case 'tool/call':
      mapped.push({
        type: 'tool_execution_start',
        toolName: event.data.name,
        toolCallId: String(event.data.callId),
        args: parseToolArguments(event.data.arguments),
      });
      break;
    case 'tool/result': {
      const message = event.data.message;
      const callId = String(message.toolCallId);
      const override = context.takeResultOverride(callId);
      mapped.push({
        type: 'tool_execution_end',
        toolCallId: callId,
        toolName: context.toolNameOf(callId),
        result: override
          ? override.result
          : message.content
              .flatMap((block) => (block.type === 'text' ? [block.text] : []))
              .join('\n'),
        isError: message.isError === true,
      });
      break;
    }
    default:
      break;
  }

  return mapped;
}

/** 映射一帧助手流；只关心可见文本，推理增量与工具参数增量不外送 */
export function mapAssistantFrame(
  frame: AssistantStreamFrame,
): SandboxAgentEvent | null {
  switch (frame.type) {
    case 'start':
      return { type: 'message_start' };
    case 'chunk':
      return frame.chunk.type === 'text-delta' && frame.chunk.text.length > 0
        ? {
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: frame.chunk.text },
          }
        : null;
    case 'end':
      // 失败的尝试可能被重试，模型错误统一由 turn/end{kind:'error'} 上报。
      return {
        type: 'message_end',
        message: {
          role: 'assistant',
          stopReason:
            frame.outcome.kind === 'committed' &&
            frame.outcome.eventType === 'assistant/message'
              ? 'stop'
              : 'incomplete',
        },
      };
  }
}

export function buildHarnessTrace(event: SessionEvent): HarnessTraceAgentEvent {
  const data: unknown = event.data;
  const position = isRecord(data) ? data : {};
  return {
    type: 'harness_trace',
    kind: event.type,
    ...(typeof position.turn === 'number' ? { turn: position.turn } : {}),
    ...(typeof position.step === 'number' ? { step: position.step } : {}),
    data: summarizeEventData(event),
    timestamp: new Date(event.time).toISOString(),
  };
}

function summarizeEventData(event: SessionEvent): Record<string, unknown> {
  switch (event.type) {
    case 'tool/call':
      return { callId: String(event.data.callId), name: event.data.name };
    case 'tool/result':
      return {
        callId: String(event.data.message.toolCallId),
        isError: event.data.message.isError === true,
      };
    case 'turn/end': {
      const reason = event.data.reason;
      return reason.kind === 'error'
        ? { reason: reason.kind, error: reason.error.message, code: reason.error.code }
        : { reason: reason.kind };
    }
    case 'assistant/message':
      return event.data.usage ? { usage: event.data.usage } : {};
    default:
      return {};
  }
}

function toStopReason(reason: TurnEndReason): string {
  switch (reason.kind) {
    case 'completed':
      return 'end_turn';
    case 'aborted':
      return 'cancelled';
    case 'max-tokens':
      return 'max_tokens';
    default:
      return reason.kind;
  }
}

function parseToolArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

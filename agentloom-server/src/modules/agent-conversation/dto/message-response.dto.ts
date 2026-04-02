import type { AgentMessage } from '../../../database/schema/agent-conversations.schema';
import type {
  ToolCallStatus,
  ToolCallTransitionRecord,
  ToolPermissionRequest,
} from '../../agent/types/tool-call-event.types';

export interface MessageToolCallDto {
  id: string;
  tool: string;
  args?: unknown;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
  transitions?: ToolCallTransitionRecord[];
  permissionRequest?: ToolPermissionRequest;
}

export interface MessageToolResultDto {
  toolCallId?: string;
  tool?: string;
  status?: ToolCallStatus;
  result?: unknown;
  error?: string;
}

export interface MessageResponseDto {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  toolCalls: MessageToolCallDto[] | null;
  toolResults: MessageToolResultDto[] | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export function serializeMessage(row: AgentMessage): MessageResponseDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    toolCalls: serializeToolCalls(row.toolCalls),
    toolResults: serializeToolResults(row.toolResults),
    metadata: row.metadata ?? {},
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeToolCalls(
  value: AgentMessage['toolCalls'],
): MessageToolCallDto[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const serialized = value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const id = readString(entry.id) ?? readString(entry.toolCallId);
    if (!id) {
      return [];
    }

    const tool =
      readString(entry.tool) ?? readString(entry.name) ?? 'unknown_tool';

    return [
      {
        id,
        tool,
        ...(entry.args !== undefined ? { args: entry.args } : {}),
        status: readToolCallStatus(entry.status, entry.error, entry.result),
        ...(entry.result !== undefined ? { result: entry.result } : {}),
        ...(readString(entry.error) ? { error: readString(entry.error)! } : {}),
        ...(serializeTransitions(entry.transitions)
          ? { transitions: serializeTransitions(entry.transitions)! }
          : {}),
        ...(serializePermissionRequest(entry.permissionRequest)
          ? {
              permissionRequest: serializePermissionRequest(
                entry.permissionRequest,
              )!,
            }
          : {}),
      } satisfies MessageToolCallDto,
    ];
  });

  return serialized.length > 0 ? serialized : null;
}

function serializeToolResults(
  value: AgentMessage['toolResults'],
): MessageToolResultDto[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const serialized = value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    return [
      {
        ...(readString(entry.toolCallId)
          ? { toolCallId: readString(entry.toolCallId)! }
          : {}),
        ...(readString(entry.tool) ? { tool: readString(entry.tool)! } : {}),
        ...(readKnownToolCallStatus(entry.status)
          ? { status: readKnownToolCallStatus(entry.status)! }
          : {}),
        ...(entry.result !== undefined ? { result: entry.result } : {}),
        ...(readString(entry.error) ? { error: readString(entry.error)! } : {}),
      } satisfies MessageToolResultDto,
    ];
  });

  return serialized.length > 0 ? serialized : null;
}

function serializeTransitions(
  value: unknown,
): ToolCallTransitionRecord[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const transitions = value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const to = readKnownToolCallStatus(entry.to);
    const timestamp = readString(entry.timestamp);
    const source =
      entry.source === 'runtime' ||
      entry.source === 'worker' ||
      entry.source === 'user'
        ? entry.source
        : undefined;

    if (!to || !timestamp || !source) {
      return [];
    }

    const from = readKnownToolCallStatus(entry.from);
    return [
      {
        ...(from ? { from } : {}),
        to,
        timestamp,
        source,
      } satisfies ToolCallTransitionRecord,
    ];
  });

  return transitions.length > 0 ? transitions : undefined;
}

function serializePermissionRequest(
  value: unknown,
): ToolPermissionRequest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const description = readString(value.description);
  if (!description) {
    return undefined;
  }

  const resourcePaths = Array.isArray(value.resourcePaths)
    ? value.resourcePaths.filter(
        (item): item is string => typeof item === 'string' && item.length > 0,
      )
    : [];

  const domain = readString(value.domain);
  const category = readString(value.category);
  const riskLevel =
    value.riskLevel === 'low' ||
    value.riskLevel === 'medium' ||
    value.riskLevel === 'high'
      ? value.riskLevel
      : undefined;
  const sourceLabel = readString(value.sourceLabel);
  const targetType = readString(value.targetType);
  const targetLabel = readString(value.targetLabel);
  const approveEffect = readString(value.approveEffect);
  const denyEffect = readString(value.denyEffect);
  const diffPreview = isRecord(value.diffPreview) ? value.diffPreview : undefined;
  const rememberable =
    typeof value.rememberable === 'boolean' ? value.rememberable : undefined;

  return {
    description,
    ...(resourcePaths.length > 0 ? { resourcePaths } : {}),
    ...(domain ? { domain } : {}),
    ...(category ? { category } : {}),
    ...(riskLevel ? { riskLevel } : {}),
    ...(sourceLabel ? { sourceLabel } : {}),
    ...(targetType ? { targetType } : {}),
    ...(targetLabel ? { targetLabel } : {}),
    ...(approveEffect ? { approveEffect } : {}),
    ...(denyEffect ? { denyEffect } : {}),
    ...(diffPreview ? { diffPreview } : {}),
    ...(rememberable !== undefined ? { rememberable } : {}),
  };
}

function readToolCallStatus(
  value: unknown,
  error: unknown,
  result: unknown,
): ToolCallStatus {
  return (
    readKnownToolCallStatus(value) ??
    (error !== undefined
      ? 'failed'
      : result !== undefined
        ? 'completed'
        : 'pending')
  );
}

function readKnownToolCallStatus(value: unknown): ToolCallStatus | undefined {
  switch (value) {
    case 'pending':
    case 'awaiting_permission':
    case 'denied':
    case 'in_progress':
    case 'completed':
    case 'failed':
      return value;
    default:
      return undefined;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

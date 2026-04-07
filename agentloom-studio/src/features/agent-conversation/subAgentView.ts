import type {
  ConversationMessage,
  SubAgentHandle,
  SubAgentRunStatus,
  SubAgentStream,
  ToolCall,
} from "./types";
import {
  extractSubAgentAlias,
  parseJsonLikeValue,
} from "@/shared/lib/subAgentToolUtils";

export interface ResolvedSubAgentView {
  alias: string;
  messages: ConversationMessage[];
  source: "live" | "history";
}

interface HistoricalSubAgentSnapshot {
  handle: SubAgentHandle;
  alias?: string;
  status?: SubAgentRunStatus;
  content?: string;
  error?: string;
  createdAt: number;
}

interface HistoricalCompletionNotice {
  alias: string;
  status: SubAgentRunStatus;
  error?: string;
  summary?: string;
  createdAt: number;
}

const HISTORICAL_RUNNING_HINT =
  "该子代理仍在运行中，刷新前的实时输出未持久化。";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeSubAgentStatus(
  value: unknown,
): SubAgentRunStatus | undefined {
  switch (value) {
    case "pending":
    case "running":
    case "completed":
    case "failed":
    case "timeout":
    case "cancelled":
      return value;
    default:
      return undefined;
  }
}

function buildTextMessage(
  id: string,
  content: string,
  createdAt: number,
): ConversationMessage {
  return {
    id,
    role: "assistant",
    content,
    contentType: "text",
    toolCalls: [],
    segments: [{ type: "text", content }],
    isStreaming: false,
    createdAt,
  };
}

function buildCompletionNoticeMessage(
  handle: SubAgentHandle,
  alias: string,
  status: SubAgentRunStatus,
  error: string | undefined,
  createdAt: number,
): ConversationMessage {
  return {
    id: `subagent-notice-${handle}-${createdAt}`,
    role: "system",
    content: "",
    contentType: "text",
    toolCalls: [],
    segments: [],
    isStreaming: false,
    createdAt,
    metadata: {
      type: "subagent_completion_notice",
      handle,
      alias,
      status,
      ...(error ? { error } : {}),
    },
  };
}

function extractCompletionSummary(content: string): string | undefined {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const matched = trimmed.match(/^\[Sub-Agent:[^\]]+\]\s*Completed:\s*(.+)$/);
  return matched?.[1]?.trim() || trimmed;
}

function extractResultContent(value: unknown): string | undefined {
  const parsed = parseJsonLikeValue(value);
  if (typeof parsed === "string" && parsed.trim().length > 0) {
    return parsed;
  }

  if (!isRecord(parsed)) {
    return undefined;
  }

  return readString(parsed.content);
}

function normalizeHistoricalSnapshot(
  value: unknown,
  createdAt: number,
  fallbackAlias?: string,
): HistoricalSubAgentSnapshot | null {
  const parsed = parseJsonLikeValue(value);
  if (!isRecord(parsed)) {
    return null;
  }

  const handle = readString(parsed.handle);
  if (!handle) {
    return null;
  }

  return {
    handle: handle as SubAgentHandle,
    ...((readString(parsed.alias) ?? fallbackAlias)
      ? { alias: readString(parsed.alias) ?? fallbackAlias }
      : {}),
    ...(normalizeSubAgentStatus(parsed.status)
      ? { status: normalizeSubAgentStatus(parsed.status) }
      : {}),
    ...(extractResultContent(parsed.result)
      ? { content: extractResultContent(parsed.result) }
      : {}),
    ...(readString(parsed.error) ? { error: readString(parsed.error) } : {}),
    createdAt,
  };
}

function extractHistoricalSnapshotFromToolCall(
  toolCall: ToolCall,
  handle: string,
): HistoricalSubAgentSnapshot | null {
  const fallbackAlias = extractSubAgentAlias(toolCall);

  switch (toolCall.tool) {
    case "spawn_subagent":
    case "get_subagent_status": {
      const snapshot = normalizeHistoricalSnapshot(
        toolCall.result,
        toolCall.updatedAt,
        fallbackAlias,
      );
      return snapshot?.handle === handle ? snapshot : null;
    }
    case "wait_for_subagents": {
      const parsedResult = parseJsonLikeValue(toolCall.result);
      const items = Array.isArray(parsedResult) ? parsedResult : [parsedResult];
      for (const item of items) {
        const snapshot = normalizeHistoricalSnapshot(
          item,
          toolCall.updatedAt,
          fallbackAlias,
        );
        if (snapshot?.handle === handle) {
          return snapshot;
        }
      }
      return null;
    }
    default:
      return null;
  }
}

function findLatestHistoricalSnapshot(
  handle: string,
  messages: ConversationMessage[],
): HistoricalSubAgentSnapshot | null {
  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex -= 1
  ) {
    const message = messages[messageIndex];
    if (!message) {
      continue;
    }

    for (
      let toolIndex = message.toolCalls.length - 1;
      toolIndex >= 0;
      toolIndex -= 1
    ) {
      const toolCall = message.toolCalls[toolIndex];
      if (!toolCall) {
        continue;
      }

      const snapshot = extractHistoricalSnapshotFromToolCall(toolCall, handle);
      if (snapshot) {
        return snapshot;
      }
    }
  }

  return null;
}

function findLatestCompletionNotice(
  handle: string,
  messages: ConversationMessage[],
): HistoricalCompletionNotice | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      !message?.metadata ||
      message.metadata.type !== "subagent_completion_notice"
    ) {
      continue;
    }

    const metadataHandle =
      readString(message.metadata.handle) ??
      readString(message.metadata.subagentHandle);
    if (metadataHandle !== handle) {
      continue;
    }

    const alias =
      readString(message.metadata.alias) ??
      readString(message.metadata.subagentAlias) ??
      handle;
    const status =
      normalizeSubAgentStatus(message.metadata.status) ??
      normalizeSubAgentStatus(message.metadata.subagentStatus) ??
      "completed";
    const error =
      readString(message.metadata.error) ??
      readString(message.metadata.subagentError);
    const summary =
      extractCompletionSummary(message.content) ?? error ?? undefined;

    return {
      alias,
      status,
      ...(error ? { error } : {}),
      ...(summary ? { summary } : {}),
      createdAt: message.createdAt,
    };
  }

  return null;
}

function buildHistoricalSummaryText(
  snapshot: HistoricalSubAgentSnapshot | null,
  notice: HistoricalCompletionNotice | null,
): string | undefined {
  if (snapshot?.content?.trim()) {
    return snapshot.content;
  }

  if (notice?.summary?.trim()) {
    return notice.summary;
  }

  const error = snapshot?.error ?? notice?.error;
  if (error?.trim()) {
    return `子代理执行失败：${error}`;
  }

  switch (snapshot?.status ?? notice?.status) {
    case "pending":
    case "running":
      return HISTORICAL_RUNNING_HINT;
    case "timeout":
      return "该子代理已超时，历史中没有保留完整输出。";
    case "cancelled":
      return "该子代理已取消，历史中没有更多可展示的输出。";
    default:
      return undefined;
  }
}

function buildHistoricalSubAgentView(
  handle: string,
  messages: ConversationMessage[],
): ResolvedSubAgentView | null {
  const snapshot = findLatestHistoricalSnapshot(handle, messages);
  const notice = findLatestCompletionNotice(handle, messages);

  if (!snapshot && !notice) {
    return null;
  }

  const alias = snapshot?.alias ?? notice?.alias ?? handle;
  const status = snapshot?.status ?? notice?.status ?? "completed";
  const error = snapshot?.error ?? notice?.error;
  const createdAt = snapshot?.createdAt ?? notice?.createdAt ?? Date.now();
  const historicalMessages: ConversationMessage[] = [
    buildCompletionNoticeMessage(
      handle as SubAgentHandle,
      alias,
      status,
      error,
      createdAt,
    ),
  ];

  const summaryText = buildHistoricalSummaryText(snapshot, notice);
  if (summaryText) {
    historicalMessages.push(
      buildTextMessage(
        `subagent-summary-${handle}-${createdAt}`,
        summaryText,
        createdAt,
      ),
    );
  }

  return {
    alias,
    messages: historicalMessages,
    source: "history",
  };
}

export function buildSubAgentMessages(
  stream: SubAgentStream,
): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  let assistantIdx = -1;

  function ensureAssistant(): ConversationMessage {
    if (assistantIdx >= 0) {
      return messages[assistantIdx]!;
    }

    const message: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      contentType: "text",
      toolCalls: [],
      segments: [],
      isStreaming: true,
      createdAt: Date.now(),
    };
    messages.push(message);
    assistantIdx = messages.length - 1;
    return message;
  }

  for (const event of stream.events) {
    switch (event.type) {
      case "message_chunk": {
        const message = ensureAssistant();
        const payload = event.payload as { chunk?: string };
        const chunk = payload.chunk ?? "";
        message.content += chunk;
        const lastSegment = message.segments[message.segments.length - 1];
        if (lastSegment && lastSegment.type === "text") {
          lastSegment.content += chunk;
        } else {
          message.segments.push({ type: "text", content: chunk });
        }
        break;
      }
      case "thinking": {
        const message = ensureAssistant();
        const payload = event.payload as { content?: string };
        const content = payload.content ?? "";
        message.thinking = (message.thinking ?? "") + content;
        const lastSegment = message.segments[message.segments.length - 1];
        if (lastSegment && lastSegment.type === "thinking") {
          lastSegment.content += content;
        } else {
          message.segments.push({ type: "thinking", content });
        }
        break;
      }
      case "tool_call": {
        const message = ensureAssistant();
        const payload = event.payload as {
          toolCallId?: string;
          tool?: string;
          toolName?: string;
          name?: string;
          args?: unknown;
          status?: string;
        };
        const toolCallId = payload.toolCallId ?? event.id;
        if (!message.toolCalls.some((toolCall) => toolCall.id === toolCallId)) {
          message.toolCalls.push({
            id: toolCallId,
            tool: payload.tool ?? payload.toolName ?? payload.name ?? "unknown",
            args: payload.args,
            status: (payload.status as ToolCall["status"]) ?? "pending",
            startedAt: event.timestamp,
            updatedAt: event.timestamp,
          });
          message.segments.push({ type: "tool_call", toolCallId });
        }
        break;
      }
      case "tool_result": {
        const message = ensureAssistant();
        const payload = event.payload as {
          toolCallId?: string;
          tool?: string;
          toolName?: string;
          name?: string;
          args?: unknown;
          result?: unknown;
          error?: string;
          status?: string;
        };
        const toolCallId = payload.toolCallId ?? event.id;
        const existing = message.toolCalls.find(
          (toolCall) => toolCall.id === toolCallId,
        );
        if (existing) {
          if (payload.result !== undefined) {
            existing.result = payload.result;
          }
          if (payload.error) {
            existing.error = payload.error;
          }
          existing.status =
            (payload.status as ToolCall["status"]) ?? "completed";
          existing.updatedAt = event.timestamp;
        } else {
          message.toolCalls.push({
            id: toolCallId,
            tool: payload.tool ?? payload.toolName ?? payload.name ?? "unknown",
            args: payload.args,
            result: payload.result,
            error: payload.error,
            status: (payload.status as ToolCall["status"]) ?? "completed",
            startedAt: event.timestamp,
            updatedAt: event.timestamp,
          });
          message.segments.push({ type: "tool_call", toolCallId });
        }
        break;
      }
      case "done": {
        if (assistantIdx >= 0) {
          messages[assistantIdx]!.isStreaming = false;
          assistantIdx = -1;
        }
        break;
      }
      default:
        break;
    }
  }

  return messages;
}

export function resolveSubAgentView(
  handle: string,
  liveStream: SubAgentStream | null | undefined,
  messages: ConversationMessage[],
): ResolvedSubAgentView | null {
  if (liveStream) {
    return {
      alias: liveStream.alias,
      messages: buildSubAgentMessages(liveStream),
      source: "live",
    };
  }

  return buildHistoricalSubAgentView(handle, messages);
}

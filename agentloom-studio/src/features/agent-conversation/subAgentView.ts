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

function isTerminalSubAgentStatus(status: SubAgentRunStatus): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "timeout" ||
    status === "cancelled"
  );
}

function readTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return Date.now();
}

function normalizePersistedSubAgentEvent(
  value: unknown,
): SubAgentStream["events"][number] | null {
  const parsed = parseJsonLikeValue(value);
  if (!isRecord(parsed)) {
    return null;
  }

  const type = parsed.type;
  if (
    type !== "message_chunk" &&
    type !== "thinking" &&
    type !== "tool_call" &&
    type !== "tool_result" &&
    type !== "done" &&
    type !== "status_changed"
  ) {
    return null;
  }

  return {
    id: readString(parsed.id) ?? crypto.randomUUID(),
    type,
    payload: isRecord(parsed.payload) ? parsed.payload : {},
    timestamp: readTimestamp(parsed.timestamp),
  };
}

function inferPersistedSubAgentStatus(
  events: SubAgentStream["events"],
  fallbackError?: string,
): SubAgentRunStatus {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== "status_changed") {
      continue;
    }

    const status = normalizeSubAgentStatus(
      isRecord(event.payload) ? event.payload.status : undefined,
    );
    if (status) {
      return status;
    }
  }

  if (events.some((event) => event.type === "done")) {
    return "completed";
  }

  return fallbackError ? "failed" : "running";
}

function normalizePersistedSubAgentStream(
  value: unknown,
  fallbackHandle?: string,
): SubAgentStream | null {
  const parsed = parseJsonLikeValue(value);
  if (!isRecord(parsed)) {
    return null;
  }

  const handle = readString(parsed.handle) ?? fallbackHandle;
  const alias = readString(parsed.alias);
  const parentToolCallId = readString(parsed.parentToolCallId);
  const depth =
    typeof parsed.depth === "number" && Number.isFinite(parsed.depth)
      ? parsed.depth
      : undefined;

  if (!handle || !alias || !parentToolCallId || depth === undefined) {
    return null;
  }

  const events = Array.isArray(parsed.events)
    ? parsed.events.flatMap((event) => {
        const normalized = normalizePersistedSubAgentEvent(event);
        return normalized ? [normalized] : [];
      })
    : [];
  const error = readString(parsed.error);
  const status =
    normalizeSubAgentStatus(parsed.status) ??
    inferPersistedSubAgentStatus(events, error);

  return {
    handle: handle as SubAgentHandle,
    alias,
    depth,
    parentToolCallId,
    status,
    events,
    startedAt: readTimestamp(parsed.startedAt),
    ...(parsed.completedAt !== undefined
      ? { completedAt: readTimestamp(parsed.completedAt) }
      : {}),
    ...(error ? { error } : {}),
  };
}

function findLatestPersistedSubAgentStream(
  handle: string,
  messages: ConversationMessage[],
): SubAgentStream | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const rawStreams = message?.metadata?.subAgentStreams;
    if (!isRecord(rawStreams)) {
      continue;
    }

    const rawStream = rawStreams[handle as keyof typeof rawStreams];
    const normalized = normalizePersistedSubAgentStream(rawStream, handle);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function shouldPreferPersistedStream(
  liveStream: SubAgentStream,
  persistedStream: SubAgentStream | null,
): boolean {
  if (!persistedStream) {
    return false;
  }

  if (
    isTerminalSubAgentStatus(persistedStream.status) &&
    !isTerminalSubAgentStatus(liveStream.status)
  ) {
    return true;
  }

  return persistedStream.events.length > liveStream.events.length;
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
  const persistedStream = findLatestPersistedSubAgentStream(handle, messages);
  if (persistedStream) {
    const persistedMessages = buildSubAgentMessages(persistedStream);
    if (persistedMessages.length > 0) {
      return {
        alias: persistedStream.alias,
        messages: persistedMessages,
        source: "history",
      };
    }
  }

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

  function ensureToolCallSegment(
    message: ConversationMessage,
    toolCallId: string,
  ): void {
    if (
      !message.segments.some(
        (segment) =>
          segment.type === "tool_call" && segment.toolCallId === toolCallId,
      )
    ) {
      message.segments.push({ type: "tool_call", toolCallId });
    }
  }

  function upsertToolCall(
    message: ConversationMessage,
    payload: Record<string, unknown>,
    timestamp: number,
    fallbackStatus: ToolCall["status"],
  ): void {
    const toolCallId = readString(payload.toolCallId) ?? crypto.randomUUID();
    const existing = message.toolCalls.find(
      (toolCall) => toolCall.id === toolCallId,
    );
    const nextTool =
      readString(payload.tool) ??
      readString(payload.toolName) ??
      readString(payload.name) ??
      existing?.tool ??
      "unknown_tool";
    const normalizedTool =
      nextTool === "unknown_tool" && existing ? existing.tool : nextTool;
    const nextStatus =
      (readString(payload.status) as ToolCall["status"] | undefined) ??
      fallbackStatus;

    if (existing) {
      existing.tool = normalizedTool;
      if (payload.args !== undefined) {
        existing.args = payload.args;
      }
      if (payload.result !== undefined) {
        existing.result = payload.result;
      }
      if (payload.error !== undefined) {
        existing.error =
          typeof payload.error === "string" ? payload.error : undefined;
      }
      existing.status = nextStatus;
      existing.updatedAt = timestamp;
      ensureToolCallSegment(message, toolCallId);
      return;
    }

    message.toolCalls.push({
      id: toolCallId,
      tool: normalizedTool,
      ...(payload.args !== undefined ? { args: payload.args } : {}),
      ...(payload.result !== undefined ? { result: payload.result } : {}),
      ...(typeof payload.error === "string" ? { error: payload.error } : {}),
      status: nextStatus,
      startedAt: timestamp,
      updatedAt: timestamp,
    });
    ensureToolCallSegment(message, toolCallId);
  }

  for (const event of stream.events) {
    switch (event.type) {
      case "message_chunk": {
        const payload = isRecord(event.payload) ? event.payload : {};
        const chunk = readString(payload.chunk) ?? "";
        if (chunk.length === 0) {
          break;
        }

        const message = ensureAssistant();
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
        const payload = isRecord(event.payload) ? event.payload : {};
        const content = readString(payload.content) ?? "";
        if (content.length === 0) {
          break;
        }

        const message = ensureAssistant();
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
        const payload = isRecord(event.payload) ? event.payload : {};
        upsertToolCall(message, payload, event.timestamp, "pending");
        break;
      }
      case "tool_result": {
        const message = ensureAssistant();
        const payload = isRecord(event.payload) ? event.payload : {};
        upsertToolCall(message, payload, event.timestamp, "completed");
        break;
      }
      case "done": {
        if (assistantIdx >= 0) {
          messages[assistantIdx]!.isStreaming = false;
          assistantIdx = -1;
        }
        break;
      }
      case "status_changed": {
        const payload = isRecord(event.payload) ? event.payload : {};
        const status = normalizeSubAgentStatus(payload.status);
        if (status && assistantIdx >= 0 && isTerminalSubAgentStatus(status)) {
          messages[assistantIdx]!.isStreaming = false;
          assistantIdx = -1;
        }
        break;
      }
      default:
        break;
    }
  }

  if (assistantIdx >= 0 && isTerminalSubAgentStatus(stream.status)) {
    messages[assistantIdx]!.isStreaming = false;
  }

  return messages;
}

export function resolveSubAgentView(
  handle: string,
  liveStream: SubAgentStream | null | undefined,
  messages: ConversationMessage[],
): ResolvedSubAgentView | null {
  const persistedStream = findLatestPersistedSubAgentStream(handle, messages);

  if (liveStream && !shouldPreferPersistedStream(liveStream, persistedStream)) {
    return {
      alias: liveStream.alias,
      messages: buildSubAgentMessages(liveStream),
      source: "live",
    };
  }

  return buildHistoricalSubAgentView(handle, messages);
}

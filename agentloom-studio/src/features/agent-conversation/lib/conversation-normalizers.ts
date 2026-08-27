import type {
  ConversationDetailResponseSwaggerDtoDataMessagesDataInner,
} from "@agentloom/api-client";
import type {
  AgentDonePayload,
  ConversationAttachment,
  ConversationMessage,
  ConversationMessageContentType,
  ConversationMessageMetadata,
  FileChangePayload,
  MessageChunkPayload,
  MessageSegment,
  OutgoingConversationMessage,
  PreparationPhase,
  StatusChangedPayload,
  SubAgentEvent,
  SubAgentEventEnvelope,
  SubAgentStream,
  TerminalOutputPayload,
  ThinkingPayload,
  ToolCall,
  ToolCallPermissionRequest,
  ToolCallStatus,
  ToolCallTransition,
  ToolResultPayload,
} from "../types";

export function ensureSubAgentStream(
  streams: Record<string, SubAgentStream>,
  envelope: SubAgentEventEnvelope,
): SubAgentStream {
  const existing = streams[envelope.handle];
  if (existing) return existing;

  const stream: SubAgentStream = {
    handle: envelope.handle,
    alias: envelope.alias,
    depth: envelope.depth,
    parentToolCallId: envelope.parentToolCallId,
    status: "running",
    events: [],
    startedAt: Date.now(),
  };
  streams[envelope.handle] = stream;
  return stream;
}

export function pushSubAgentEvent(
  streams: Record<string, SubAgentStream>,
  envelope: SubAgentEventEnvelope,
  eventType: SubAgentEvent["type"],
  payload: unknown,
): void {
  const stream = ensureSubAgentStream(streams, envelope);
  stream.events.push({
    id: crypto.randomUUID(),
    type: eventType,
    payload,
    timestamp: Date.now(),
  });

  if (eventType === "done" && stream.status === "running") {
    stream.status = "completed";
    stream.completedAt = Date.now();
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function readTimestamp(value: unknown): number {
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

export function normalizeMessageRole(
  value: unknown,
): ConversationMessage["role"] {
  switch (value) {
    case "user":
    case "system":
      return value;
    default:
      return "assistant";
  }
}

export function normalizeToolCallStatus(value: unknown): ToolCallStatus {
  switch (value) {
    case "pending":
    case "awaiting_permission":
    case "denied":
    case "in_progress":
    case "completed":
    case "failed":
      return value;
    default:
      return "pending";
  }
}

export function normalizeToolCallTransitions(
  value: unknown,
): ToolCallTransition[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const transitions = value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const to = normalizeOptionalToolCallStatus(item.to);
    const timestamp = readString(item.timestamp);
    const source =
      item.source === "runtime" ||
      item.source === "worker" ||
      item.source === "user"
        ? item.source
        : undefined;

    if (!to || !timestamp || !source) {
      return [];
    }

    return [
      {
        ...(normalizeOptionalToolCallStatus(item.from)
          ? { from: normalizeOptionalToolCallStatus(item.from) }
          : {}),
        to,
        timestamp,
        source,
      } satisfies ToolCallTransition,
    ];
  });

  return transitions.length > 0 ? transitions : undefined;
}

export function normalizeOptionalToolCallStatus(
  value: unknown,
): ToolCallStatus | undefined {
  switch (value) {
    case "pending":
    case "awaiting_permission":
    case "denied":
    case "in_progress":
    case "completed":
    case "failed":
      return value;
    default:
      return undefined;
  }
}

export function normalizePermissionRequest(
  value: unknown,
): ToolCallPermissionRequest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const description = readString(value.description);
  const resourcePaths = Array.isArray(value.resourcePaths)
    ? value.resourcePaths.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
    : [];
  const domain = readString(value.domain);
  const category = readString(value.category);
  const riskLevel =
    value.riskLevel === "low" ||
    value.riskLevel === "medium" ||
    value.riskLevel === "high"
      ? value.riskLevel
      : undefined;
  const sourceLabel = readString(value.sourceLabel);
  const targetType = readString(value.targetType);
  const targetLabel = readString(value.targetLabel);
  const approveEffect = readString(value.approveEffect);
  const denyEffect = readString(value.denyEffect);
  const diffPreview = isRecord(value.diffPreview)
    ? (value.diffPreview as Record<string, unknown>)
    : undefined;
  const rememberable =
    typeof value.rememberable === "boolean" ? value.rememberable : undefined;

  if (
    !description &&
    resourcePaths.length === 0 &&
    !domain &&
    !category &&
    !riskLevel &&
    !sourceLabel &&
    !targetType &&
    !targetLabel &&
    !approveEffect &&
    !denyEffect &&
    !diffPreview &&
    rememberable === undefined
  ) {
    return undefined;
  }

  return {
    ...(description ? { description } : {}),
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

export function unwrapConversationPayload(raw: unknown) {
  const root = isRecord(raw) ? raw : {};
  const data = isRecord(root.data) ? root.data : {};
  const event = isRecord(root.event) ? root.event : {};
  const subagent = normalizeSubAgentEnvelope(
    root.subagent ?? data.subagent ?? event.subagent,
  );

  return { root, data, event, subagent };
}

export function normalizeSubAgentEnvelope(
  value: unknown,
): SubAgentEventEnvelope | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const handle = readString(value.handle);
  const alias = readString(value.alias);
  const parentToolCallId = readString(value.parentToolCallId);
  const depth =
    typeof value.depth === "number" && Number.isFinite(value.depth)
      ? value.depth
      : undefined;

  if (!handle || !alias || !parentToolCallId || depth === undefined) {
    return undefined;
  }

  return {
    handle: handle as SubAgentEventEnvelope["handle"],
    alias,
    depth,
    parentToolCallId,
  };
}

export function normalizeMessageMetadata(
  value: unknown,
): ConversationMessageMetadata | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const attachments = normalizeConversationAttachments(value);
  const attachment = attachments.length === 1 ? attachments[0] : undefined;
  const contentType =
    normalizeConversationMessageContentType(value.contentType) ??
    (attachments.length === 1 ? attachment?.kind : undefined);

  return {
    ...value,
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(attachment ? { attachment } : {}),
    ...(contentType ? { contentType } : {}),
  } as ConversationMessageMetadata;
}

export function normalizeConversationMessageContentType(
  value: unknown,
): ConversationMessageContentType | undefined {
  switch (value) {
    case "text":
    case "image":
    case "file":
      return value;
    default:
      return undefined;
  }
}

export function normalizeConversationAttachment(
  value: unknown,
): ConversationAttachment | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const kind = normalizeConversationMessageContentType(value.kind);
  const fileName = readString(value.fileName);
  const mimeType = readString(value.mimeType);
  const sizeBytes =
    typeof value.sizeBytes === "number" && Number.isFinite(value.sizeBytes)
      ? value.sizeBytes
      : undefined;

  if (!kind || kind === "text" || !fileName || !mimeType || sizeBytes == null) {
    return undefined;
  }

  return {
    kind,
    fileName,
    mimeType,
    sizeBytes,
    ...(readString(value.dataBase64)
      ? { dataBase64: readString(value.dataBase64) }
      : {}),
    ...(readString(value.textContent)
      ? { textContent: readString(value.textContent) }
      : {}),
    ...(readString(value.sandboxPath)
      ? { sandboxPath: readString(value.sandboxPath) }
      : {}),
  };
}

export function normalizeConversationAttachments(
  value: Record<string, unknown>,
): ConversationAttachment[] {
  if (Array.isArray(value.attachments)) {
    const attachments = value.attachments.flatMap((attachment) => {
      const normalized = normalizeConversationAttachment(attachment);
      return normalized ? [normalized] : [];
    });
    if (attachments.length > 0) {
      return attachments;
    }
  }

  const attachment = normalizeConversationAttachment(value.attachment);
  return attachment ? [attachment] : [];
}

export function normalizeOutgoingConversationMessage(
  message: string | OutgoingConversationMessage,
): OutgoingConversationMessage {
  if (typeof message === "string") {
    return { content: message, contentType: "text" };
  }

  const metadata = normalizeMessageMetadata(message.metadata);
  const contentType =
    message.contentType ??
    metadata?.contentType ??
    (metadata?.attachments?.length === 1
      ? metadata.attachments[0]?.kind
      : undefined) ??
    metadata?.attachment?.kind ??
    "text";

  return {
    content: message.content,
    contentType,
    ...(metadata ? { metadata } : {}),
  };
}

export function buildOptimisticUserMessage(
  messageId: string,
  message: OutgoingConversationMessage,
): ConversationMessage {
  const metadata = normalizeMessageMetadata(message.metadata);
  const contentType =
    message.contentType ??
    metadata?.contentType ??
    (metadata?.attachments?.length === 1
      ? metadata.attachments[0]?.kind
      : undefined) ??
    metadata?.attachment?.kind ??
    "text";

  return {
    id: messageId,
    role: "user",
    content: message.content,
    contentType,
    toolCalls: [],
    segments:
      message.content.trim().length > 0
        ? [{ type: "text", content: message.content }]
        : [],
    isStreaming: false,
    createdAt: Date.now(),
    ...(metadata ? { metadata } : {}),
  };
}

export function normalizeConversationHistoryMessage(
  raw: ConversationDetailResponseSwaggerDtoDataMessagesDataInner,
): ConversationMessage {
  // 保留运行时防御：历史接口异常时单条消息可能不是对象
  const record: Partial<ConversationDetailResponseSwaggerDtoDataMessagesDataInner> =
    isRecord(raw) ? raw : {}
  const metadata = normalizeMessageMetadata(record.metadata);
  const contentType =
    normalizeConversationMessageContentType(record.contentType) ??
    metadata?.contentType ??
    "text";
  const content = readString(record.content) ?? "";
  const toolCalls = normalizeHistoryToolCalls(record.toolCalls);
  const segments = normalizeHistorySegments(metadata, content, toolCalls);
  const thinking =
    extractThinkingContent(record.metadata) ??
    collectThinkingSegments(segments);

  return {
    id: readString(record.id) ?? crypto.randomUUID(),
    role: normalizeMessageRole(record.role),
    content,
    ...(contentType ? { contentType } : {}),
    thinking,
    toolCalls,
    segments,
    isStreaming: false,
    createdAt: readTimestamp(record.createdAt),
    ...(metadata ? { metadata } : {}),
  };
}

/**
 * 归一化 `conversation.state.snapshot` 的消息列表。
 *
 * 重连时 EventBridge 的内存缓冲可能已被清理（终态 30s 回收、进程重启），
 * 服务端无法逐事件补发，改为下发一份持久 snapshot。
 *
 * 直接复用历史消息的归一化路径：snapshot 行就是 `agent_messages` 行，字段一一对应
 * （只有主键名从 `id` 变成 `messageId`）。**不要**在这里另写一套——segments、
 * 附件、thinking、工具卡都藏在 metadata/toolCalls 里，漏掉任何一项，
 * 按 messageId 整条覆盖时就会把界面上对应的部分抹掉。
 *
 * 之后由调用方用 mergeSnapshotWithLiveMessages 与本地 live 消息合并。
 */
export function normalizeConversationSnapshotMessages(
  raw: unknown,
): ConversationMessage[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.messages)) {
    return null;
  }

  return raw.messages.filter(isRecord).map((message) =>
    normalizeConversationHistoryMessage({
      ...message,
      id: readString(message.messageId),
    } as ConversationDetailResponseSwaggerDtoDataMessagesDataInner),
  );
}

/**
 * 用持久 snapshot 覆盖本地已落定的消息，并保留本地仍在流式的尾部。
 *
 * 不能复用 mergeHistoryWithLiveTail：那个函数假设 canonical 是本地列表的**前缀**，
 * 而 snapshot 的触发场景恰恰是本地列表缺了中间几轮（断线期间的正文根本没到过客户端），
 * 按下标比对必然判定为「非前缀」而整体丢弃 live 尾部。
 *
 * 去重分两层：
 * 1. **同 ID** —— snapshot 里已有的一律以 snapshot 为准。
 * 2. **等价** —— 本地 optimistic 用户消息用的是随机 UUID，落库后 ID 会变，只能靠
 *    内容等价认亲。这一层有两道闸：只在「没有被同 ID 认领的 canonical」里配对，
 *    且**一对一消费**；另外要求 canonical 不早于本地消息（落库必然发生在本地
 *    构造 optimistic 之后）。否则历史里那句旧的「继续」会把用户刚发的同文消息
 *    匹配掉，导致它凭空消失。
 */
export function mergeSnapshotWithLiveMessages(
  currentMessages: ConversationMessage[],
  snapshotMessages: ConversationMessage[],
): ConversationMessage[] {
  const snapshotIds = new Set(snapshotMessages.map((message) => message.id));
  const currentIds = new Set(currentMessages.map((message) => message.id));

  const unclaimed = snapshotMessages.filter(
    (canonical) => !currentIds.has(canonical.id),
  );
  const consumed = new Set<number>();

  const liveTail = currentMessages.filter((message) => {
    if (snapshotIds.has(message.id)) {
      return false;
    }

    const match = unclaimed.findIndex(
      (canonical, index) =>
        !consumed.has(index) &&
        canonical.createdAt >= message.createdAt &&
        areMessagesEquivalent(message, canonical),
    );

    if (match === -1) {
      return true;
    }

    consumed.add(match);
    return false;
  });

  return [...snapshotMessages, ...liveTail];
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 从实时事件信封中读取 wire 游标（gateway 的 buildEventPayload 统一注入 eventId）。
 * 读不到就返回 null，由调用方保持原游标不动——宁可重放一次，也不能跳过缺口。
 */
export function readEventCursor(payload: unknown): number | null {
  return isRecord(payload) ? readFiniteNumber(payload.eventId) : null;
}

/**
 * 读取 `lastEventId` 字段：snapshot 事件与 `conversation:subscribe` 的 ack 都用它。
 *
 * 与 readEventCursor 分开，因为两处的应用语义不同：
 * - snapshot 是 epoch 起点，可能比本地游标**小**（计数器归零或新一轮从 1 重启），
 *   调用方要直接赋值；
 * - ack 是增量补发完成时的服务端进度，调用方取 max 前进。
 */
export function readLastEventIdField(payload: unknown): number | null {
  return isRecord(payload) ? readFiniteNumber(payload.lastEventId) : null;
}

export function projectComparableMessage(message: ConversationMessage) {
  return {
    role: message.role,
    content: message.content,
    contentType: message.contentType ?? null,
    thinking: message.thinking ?? null,
    attachments:
      message.metadata?.attachments ??
      (message.metadata?.attachment ? [message.metadata.attachment] : null),
    toolCalls: message.toolCalls.map((toolCall) => ({
      id: toolCall.id,
      tool: toolCall.tool,
      status: toolCall.status,
      args: toolCall.args ?? null,
      result: toolCall.result ?? null,
      error: toolCall.error ?? null,
    })),
    segments: message.segments.map((segment) =>
      segment.type === "tool_call"
        ? { type: "tool_call", toolCallId: segment.toolCallId }
        : { type: segment.type, content: segment.content },
    ),
  };
}

export function areMessagesEquivalent(
  current: ConversationMessage,
  canonical: ConversationMessage,
): boolean {
  return (
    JSON.stringify(projectComparableMessage(current)) ===
    JSON.stringify(projectComparableMessage(canonical))
  );
}

export function mergeHistoryWithLiveTail(
  currentMessages: ConversationMessage[],
  canonicalMessages: ConversationMessage[],
): ConversationMessage[] {
  if (currentMessages.length < canonicalMessages.length) {
    return canonicalMessages;
  }

  const isCanonicalPrefix = canonicalMessages.every((message, index) => {
    const current = currentMessages[index];
    return current ? areMessagesEquivalent(current, message) : false;
  });

  if (!isCanonicalPrefix) {
    return canonicalMessages;
  }

  return [
    ...canonicalMessages,
    ...currentMessages.slice(canonicalMessages.length),
  ];
}

export function normalizeHistorySegments(
  metadata: ConversationMessageMetadata | undefined,
  content: string,
  toolCalls: ToolCall[],
): MessageSegment[] {
  const storedSegments: MessageSegment[] = [];

  if (Array.isArray(metadata?.segments)) {
    for (const segment of metadata.segments) {
      if (!isRecord(segment)) {
        continue;
      }

      switch (segment.type) {
        case "text":
        case "thinking": {
          const segmentContent = readString(segment.content);
          if (!segmentContent) {
            continue;
          }

          storedSegments.push({
            type: segment.type,
            content: segmentContent,
          } satisfies MessageSegment);
          break;
        }
        case "tool_call": {
          const toolCallId =
            readString(segment.toolCallId) ?? readString(segment.tool_call_id);
          if (
            !toolCallId ||
            !toolCalls.some((toolCall) => toolCall.id === toolCallId)
          ) {
            continue;
          }

          storedSegments.push({
            type: "tool_call",
            toolCallId,
          } satisfies MessageSegment);
          break;
        }
        default:
          break;
      }
    }
  }

  if (storedSegments.length > 0) {
    return storedSegments;
  }

  const fallbackSegments: MessageSegment[] = [];
  const thinking = extractThinkingContent(metadata);
  if (thinking) {
    fallbackSegments.push({ type: "thinking", content: thinking });
  }
  if (content) {
    fallbackSegments.push({ type: "text", content });
  }
  for (const toolCall of toolCalls) {
    fallbackSegments.push({ type: "tool_call", toolCallId: toolCall.id });
  }
  return fallbackSegments;
}

export function normalizeHistoryToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const toolCallId = readString(item.id) ?? readString(item.toolCallId);
    if (!toolCallId) {
      return [];
    }

    return [
      {
        id: toolCallId,
        tool:
          readString(item.tool) ??
          readString(item.toolName) ??
          readString(item.name) ??
          "unknown_tool",
        ...(item.args !== undefined ? { args: item.args } : {}),
        ...(item.result !== undefined
          ? { result: unwrapMcpResult(item.result) }
          : {}),
        ...(readString(item.error) ? { error: readString(item.error)! } : {}),
        status: normalizeToolCallStatus(item.status),
        ...(normalizeToolCallTransitions(item.transitions)
          ? { transitions: normalizeToolCallTransitions(item.transitions) }
          : {}),
        ...(normalizePermissionRequest(item.permissionRequest)
          ? {
              permissionRequest: normalizePermissionRequest(
                item.permissionRequest,
              ),
            }
          : {}),
        startedAt: readTimestamp(item.startedAt),
        updatedAt: readTimestamp(item.updatedAt),
      } satisfies ToolCall,
    ];
  });
}

export function extractThinkingContent(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.decision)) {
    return undefined;
  }

  const rationale = readString(value.decision.rationale);
  const suggestedContent = readString(value.decision.suggestedContent);
  const parts = [rationale, suggestedContent].filter(Boolean);

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export function collectThinkingSegments(
  segments: MessageSegment[],
): string | undefined {
  const parts = segments.flatMap((segment) =>
    segment.type === "thinking" && segment.content.trim().length > 0
      ? [segment.content]
      : [],
  );
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export function normalizeMessageChunkPayload(
  raw: unknown,
): MessageChunkPayload | null {
  const { root, data, event, subagent } = unwrapConversationPayload(raw);
  const chunk =
    readString(root.chunk) ??
    readString(data.chunk) ??
    readString(event.content) ??
    readString(data.content);

  if (!chunk) {
    return null;
  }

  return {
    conversationId:
      readString(root.conversationId) ??
      readString(root.executionId) ??
      readString(data.conversationId) ??
      "unknown-conversation",
    messageId:
      readString(root.messageId) ??
      readString(data.messageId) ??
      readString(root.stepId) ??
      readString(data.stepId) ??
      readString(root.executionId) ??
      "assistant-stream",
    chunk,
    ...(subagent ? { subagent } : {}),
  };
}

export function normalizeThinkingPayload(raw: unknown): ThinkingPayload | null {
  const { root, data, event, subagent } = unwrapConversationPayload(raw);
  const content =
    readString(root.content) ??
    readString(data.content) ??
    readString(event.content) ??
    readString(event.rationale) ??
    readString(event.suggestedContent);

  if (!content) {
    return null;
  }

  return {
    conversationId:
      readString(root.conversationId) ??
      readString(root.executionId) ??
      readString(data.conversationId) ??
      "unknown-conversation",
    messageId:
      readString(root.messageId) ??
      readString(data.messageId) ??
      readString(root.stepId) ??
      readString(data.stepId) ??
      readString(root.executionId) ??
      "assistant-stream",
    content,
    ...(subagent ? { subagent } : {}),
  };
}

export function normalizeToolPayload(raw: unknown): ToolResultPayload | null {
  const { root, data, event, subagent } = unwrapConversationPayload(raw);
  const call = isRecord(event.call) ? event.call : {};
  const toolCallId =
    readString(root.toolCallId) ??
    readString(data.toolCallId) ??
    readString(call.id) ??
    readString(root.id);

  if (!toolCallId) {
    return null;
  }

  return {
    conversationId:
      readString(root.conversationId) ??
      readString(root.executionId) ??
      readString(data.conversationId) ??
      "unknown-conversation",
    messageId:
      readString(root.messageId) ??
      readString(data.messageId) ??
      readString(root.stepId) ??
      readString(data.stepId) ??
      readString(root.executionId) ??
      "assistant-stream",
    toolCallId,
    tool:
      readString(root.tool) ??
      readString(root.toolName) ??
      readString(root.name) ??
      readString(data.tool) ??
      readString(data.toolName) ??
      readString(data.name) ??
      readString(event.toolName) ??
      readString(call.tool) ??
      "unknown_tool",
    ...(root.args !== undefined
      ? { args: root.args }
      : data.args !== undefined
        ? { args: data.args }
        : call.args !== undefined
          ? { args: call.args }
          : {}),
    status: normalizeToolCallStatus(root.status ?? data.status ?? call.status),
    ...(root.result !== undefined
      ? { result: root.result }
      : data.result !== undefined
        ? { result: data.result }
        : call.result !== undefined
          ? { result: call.result }
          : {}),
    ...((readString(root.error) ??
    readString(data.error) ??
    readString(call.error))
      ? {
          error:
            readString(root.error) ??
            readString(data.error) ??
            readString(call.error),
        }
      : {}),
    ...(normalizeToolCallTransitions(
      root.transitions ?? data.transitions ?? call.transitions,
    )
      ? {
          transitions: normalizeToolCallTransitions(
            root.transitions ?? data.transitions ?? call.transitions,
          ),
        }
      : {}),
    ...(normalizePermissionRequest(
      root.permissionRequest ??
        data.permissionRequest ??
        call.permissionRequest,
    )
      ? {
          permissionRequest: normalizePermissionRequest(
            root.permissionRequest ??
              data.permissionRequest ??
              call.permissionRequest,
          ),
        }
      : {}),
    ...(subagent ? { subagent } : {}),
  };
}

export function normalizeAgentDonePayload(raw: unknown): AgentDonePayload {
  const { root, data, subagent } = unwrapConversationPayload(raw);

  return {
    conversationId:
      readString(root.conversationId) ??
      readString(root.executionId) ??
      readString(data.conversationId) ??
      "unknown-conversation",
    ...((readString(root.messageId) ??
    readString(data.messageId) ??
    readString(root.stepId) ??
    readString(data.stepId))
      ? {
          messageId:
            readString(root.messageId) ??
            readString(data.messageId) ??
            readString(root.stepId) ??
            readString(data.stepId),
        }
      : {}),
    ...(subagent ? { subagent } : {}),
  };
}

export function normalizeTerminalOutputPayload(
  raw: unknown,
): TerminalOutputPayload | null {
  const { root, data, event } = unwrapConversationPayload(raw);
  const output =
    readString(root.output) ??
    readString(data.output) ??
    readString(event.data) ??
    (typeof root.data === "string" ? root.data : undefined);

  if (!output) {
    return null;
  }

  return {
    conversationId:
      readString(root.conversationId) ??
      readString(root.executionId) ??
      readString(data.conversationId) ??
      "unknown-conversation",
    output,
    ...((readString(root.command) ?? readString(data.command))
      ? { command: readString(root.command) ?? readString(data.command) }
      : {}),
    ...((readString(root.sessionId) ??
    readString(data.sessionId) ??
    readString(event.sessionId))
      ? {
          sessionId:
            readString(root.sessionId) ??
            readString(data.sessionId) ??
            readString(event.sessionId),
        }
      : {}),
  };
}

export function normalizeFileChangePayload(
  raw: unknown,
): FileChangePayload | null {
  const { root, data } = unwrapConversationPayload(raw);
  const path = readString(root.path) ?? readString(data.path);
  if (!path) {
    return null;
  }

  return {
    conversationId:
      readString(root.conversationId) ??
      readString(root.executionId) ??
      readString(data.conversationId) ??
      "unknown-conversation",
    path,
    changeType: normalizeFileChangeType(root.changeType ?? data.changeType),
    ...((readString(root.diff) ?? readString(data.diff))
      ? { diff: readString(root.diff) ?? readString(data.diff) }
      : {}),
    ...((readString(root.content) ?? readString(data.content))
      ? { content: readString(root.content) ?? readString(data.content) }
      : {}),
  };
}

export function normalizeFileChangeType(
  value: unknown,
): FileChangePayload["changeType"] {
  switch (value) {
    case "created":
    case "modified":
    case "deleted":
      return value;
    default:
      return "modified";
  }
}

export function normalizeStatusChangedPayload(
  raw: unknown,
): StatusChangedPayload | null {
  const { root, data } = unwrapConversationPayload(raw);
  const status = readString(root.status) ?? readString(data.status);
  if (!status) {
    return null;
  }

  const phase = readString(root.phase) ?? readString(data.phase);
  const failedPhase =
    readString(root.failedPhase) ?? readString(data.failedPhase);
  const errorMessage =
    readString(root.error) ??
    readString(data.error) ??
    readString(root.errorMessage) ??
    readString(data.errorMessage);
  const sandboxReused = root.sandboxReused ?? data.sandboxReused;

  return {
    conversationId:
      readString(root.conversationId) ??
      readString(root.executionId) ??
      readString(data.conversationId) ??
      "unknown-conversation",
    status: status as StatusChangedPayload["status"],
    ...(phase ? { phase: phase as StatusChangedPayload["phase"] } : {}),
    ...(failedPhase
      ? { failedPhase: failedPhase as StatusChangedPayload["failedPhase"] }
      : {}),
    ...(errorMessage ? { error: errorMessage, errorMessage } : {}),
    ...(typeof sandboxReused === "boolean" ? { sandboxReused } : {}),
  };
}

export function normalizeConversationExecutionSnapshot(metadata: unknown): {
  runningState?: "idle" | "running" | "failed" | "cancelled";
  errorMessage?: string;
  failedPhase?: PreparationPhase;
  loadedPublishedVersionId?: string;
} {
  if (!isRecord(metadata)) {
    return {};
  }

  const execution = isRecord(metadata.execution) ? metadata.execution : {};
  const runningState = readString(execution.runningState);
  const errorMessage =
    readString(execution.errorMessage) ??
    readString(execution.rawErrorMessage) ??
    readString(execution.lastErrorMessage);
  const failedPhase = readString(execution.failedPhase);
  const loadedPublishedVersionId = readString(execution.loadedPublishedVersionId);

  return {
    ...(runningState === "idle" ||
    runningState === "running" ||
    runningState === "failed" ||
    runningState === "cancelled"
      ? { runningState }
      : {}),
    ...(errorMessage ? { errorMessage } : {}),
    ...(failedPhase ? { failedPhase: failedPhase as PreparationPhase } : {}),
    ...(loadedPublishedVersionId ? { loadedPublishedVersionId } : {}),
  };
}

export function ensureAssistantMessage(
  messages: ConversationMessage[],
  messageId: string,
): ConversationMessage {
  const existing = messages.find((item) => item.id === messageId);
  if (existing) {
    return existing;
  }

  const message: ConversationMessage = {
    id: messageId,
    role: "assistant",
    content: "",
    contentType: "text",
    toolCalls: [],
    segments: [],
    isStreaming: true,
    createdAt: Date.now(),
  };
  messages.push(message);
  return message;
}

export function upsertToolCall(
  message: ConversationMessage,
  payload: ToolResultPayload,
): void {
  const existing = message.toolCalls.find(
    (toolCall) => toolCall.id === payload.toolCallId,
  );
  const now = Date.now();
  const nextTool =
    isConcreteToolName(payload.tool) || !existing
      ? payload.tool
      : existing.tool;

  if (existing) {
    existing.tool = nextTool;
    if (payload.args !== undefined) existing.args = payload.args;
    if (payload.result !== undefined)
      existing.result = unwrapMcpResult(payload.result);
    if (payload.error !== undefined) existing.error = payload.error;
    existing.status = payload.status;
    if (payload.transitions) existing.transitions = payload.transitions;
    if (payload.permissionRequest)
      existing.permissionRequest = payload.permissionRequest;
    existing.updatedAt = now;
    return;
  }

  message.toolCalls.push({
    id: payload.toolCallId,
    tool: nextTool,
    ...(payload.args !== undefined ? { args: payload.args } : {}),
    ...(payload.result !== undefined
      ? { result: unwrapMcpResult(payload.result) }
      : {}),
    ...(payload.error !== undefined ? { error: payload.error } : {}),
    status: payload.status,
    ...(payload.transitions ? { transitions: payload.transitions } : {}),
    ...(payload.permissionRequest
      ? { permissionRequest: payload.permissionRequest }
      : {}),
    startedAt: now,
    updatedAt: now,
  });
}

export function isConcreteToolName(tool: string): boolean {
  return tool.length > 0 && tool !== "unknown_tool";
}

export function parseJsonLikeValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * 解包 MCP 工具结果信封。
 * MCP 协议返回 `{ content: [{ type: "text", text: "..." }, ...] }`，
 * 前端渲染器需要的是里面的纯文本内容。
 */
export function unwrapMcpResult(value: unknown): unknown {
  const parsed = parseJsonLikeValue(value);

  if (!isRecord(parsed)) return parsed;

  const content = parsed.content;
  if (!Array.isArray(content) || content.length === 0) return parsed;

  // 校验是否为 MCP 格式（至少一个条目有 type + text 字段）
  const isMcpFormat = content.some(
    (item) => isRecord(item) && typeof item.type === "string" && "text" in item,
  );
  if (!isMcpFormat) return parsed;

  const textParts: string[] = [];
  for (const item of content) {
    if (
      isRecord(item) &&
      item.type === "text" &&
      typeof item.text === "string"
    ) {
      textParts.push(item.text);
    }
  }

  if (textParts.length === 0) {
    return parsed;
  }

  return parseJsonLikeValue(textParts.join(""));
}

export function finishStreamingAssistantMessage(
  messages: ConversationMessage[],
  messageId?: string,
): void {
  if (messageId) {
    const message = messages.find((item) => item.id === messageId);
    if (message) {
      message.isStreaming = false;
      return;
    }
  }

  const latestStreamingAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.isStreaming);

  if (latestStreamingAssistant) {
    latestStreamingAssistant.isStreaming = false;
  }
}

import type {
  ContentBlock,
  ResourceContentBlock,
  ResourceLinkContentBlock,
  TextContentBlock,
} from '../agent/types/content-block.types';
import {
  readConversationAttachmentMetadata,
  resolveConversationMessageContentType,
} from '../agent-conversation/conversation-attachment';

export interface PendingConversationPromptMessage {
  id: string;
  content: string;
  contentType: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface HistoryConversationPromptMessage
  extends PendingConversationPromptMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  toolCalls: Record<string, unknown>[] | null;
}

export function buildConversationPromptBlocks(params: {
  pendingMessages: PendingConversationPromptMessage[];
  hasPriorTurns: boolean;
  historyMessages?: HistoryConversationPromptMessage[];
  latestPromptOverride?: string;
  conversationMetadata?: Record<string, unknown>;
}): ContentBlock[] {
  const {
    pendingMessages,
    hasPriorTurns,
    historyMessages = [],
    latestPromptOverride,
    conversationMetadata = {},
  } = params;

  const latestPrompt =
    latestPromptOverride ?? formatLatestPendingMessages(pendingMessages);

  if (historyMessages.length > 0) {
    const historyPreface = isRestartedInheritedHistoryConversation(
      conversationMetadata,
    )
      ? '以下历史消息来自旧会话的继承副本，只能作为上下文参考。不要继续执行历史里未完成的编号任务、旧计划或旧命令；你现在只能响应并执行下方“用户最新消息”。如果历史与最新消息冲突，必须以最新用户消息为准。'
      : '以下是该 conversation 已有的历史，请保持上下文连续：';

    return [
      {
        type: 'text',
        text:
          `${historyPreface}\n` +
          `${formatConversationHistory(historyMessages)}\n\n` +
          '请继续回应用户最新消息：',
      } satisfies TextContentBlock,
      ...buildLatestPendingBlocks(pendingMessages, latestPrompt),
    ];
  }

  if (pendingMessages.length === 1 && isPlainTextPendingMessage(pendingMessages[0])) {
    return [
      {
        type: 'text',
        text: latestPrompt,
      } satisfies TextContentBlock,
    ];
  }

  const prefix = hasPriorTurns
    ? '在你上一轮回复后，用户又发送了以下新消息，请结合上下文继续回应：'
    : '用户连续发送了以下消息，请综合后统一回应：';

  return [
    {
      type: 'text',
      text: prefix,
    } satisfies TextContentBlock,
    ...buildLatestPendingBlocks(pendingMessages, latestPrompt),
  ];
}

export function formatLatestPendingMessages(
  pendingMessages: PendingConversationPromptMessage[],
): string {
  return pendingMessages.length === 1
    ? describePendingMessageText(pendingMessages[0])
    : pendingMessages
        .map(
          (message, index) =>
            `${index + 1}. ${describePendingMessageText(message)}`,
        )
        .join('\n');
}

function buildLatestPendingBlocks(
  pendingMessages: PendingConversationPromptMessage[],
  latestPrompt: string,
): ContentBlock[] {
  if (pendingMessages.length === 1) {
    return buildPendingMessageBlocks(pendingMessages[0]!, latestPrompt);
  }

  const attachmentBlocks = pendingMessages.flatMap((message, index) =>
    readConversationAttachmentMetadata(message.metadata)
      ? buildPendingMessageBlocks(message, '', index + 1)
      : [],
  );

  const blocks: ContentBlock[] = [];
  const normalizedPrompt = latestPrompt.trim();
  if (normalizedPrompt.length > 0) {
    blocks.push({
      type: 'text',
      text: normalizedPrompt,
    } satisfies TextContentBlock);
  }

  if (blocks.length > 0 || attachmentBlocks.length > 0) {
    return [...blocks, ...attachmentBlocks];
  }

  return pendingMessages.flatMap((message, index) =>
    buildPendingMessageBlocks(
      message,
      describePendingMessageText(message),
      index + 1,
    ),
  );
}

function buildPendingMessageBlocks(
  message: PendingConversationPromptMessage,
  textOverride: string,
  index?: number,
): ContentBlock[] {
  const attachment = readConversationAttachmentMetadata(message.metadata);
  const prefix = index ? `用户消息 ${index}：` : '';
  const blocks: ContentBlock[] = [];

  const primaryText = textOverride.trim();
  if (primaryText.length > 0) {
    blocks.push({
      type: 'text',
      text: `${prefix}${primaryText}`,
    } satisfies TextContentBlock);
  } else if (attachment) {
    blocks.push({
      type: 'text',
      text: `${prefix}${describeAttachment(attachment)}`,
    } satisfies TextContentBlock);
  }

  if (!attachment) {
    return blocks;
  }

  if (attachment.sandboxPath) {
    blocks.push({
      type: 'text',
      text: `该附件已写入工作区：${attachment.sandboxPath}。如需查看原文件，请直接读取该路径。`,
    } satisfies TextContentBlock);
  }

  blocks.push(...buildAttachmentBlocks(attachment));
  return blocks;
}

function buildAttachmentBlocks(
  attachment: NonNullable<
    ReturnType<typeof readConversationAttachmentMetadata>
  >,
): ContentBlock[] {
  const uri = buildAttachmentUri(attachment);

  if (attachment.kind === 'image' && attachment.dataBase64) {
    return [
      {
        type: 'image',
        data: attachment.dataBase64,
        mimeType: attachment.mimeType,
      },
    ];
  }

  if (attachment.textContent) {
    return [
      {
        type: 'resource',
        uri,
        text: attachment.textContent,
        mimeType: attachment.mimeType,
      } satisfies ResourceContentBlock,
    ];
  }

  if (attachment.dataBase64) {
    return [
      {
        type: 'resource',
        uri,
        blob: attachment.dataBase64,
        mimeType: attachment.mimeType,
      } satisfies ResourceContentBlock,
    ];
  }

  return [
    {
      type: 'resource_link',
      uri,
      title: attachment.fileName,
      mimeType: attachment.mimeType,
    } satisfies ResourceLinkContentBlock,
  ];
}

function buildAttachmentUri(
  attachment: NonNullable<
    ReturnType<typeof readConversationAttachmentMetadata>
  >,
): string {
  if (attachment.sandboxPath) {
    return `file://${attachment.sandboxPath}`;
  }

  return `attachment://${encodeURIComponent(attachment.fileName)}`;
}

function isPlainTextPendingMessage(
  message: PendingConversationPromptMessage | undefined,
): boolean {
  if (!message) {
    return false;
  }

  return (
    resolveConversationMessageContentType(
      message.contentType,
      message.metadata,
    ) === 'text' && !readConversationAttachmentMetadata(message.metadata)
  );
}

function describePendingMessageText(
  message: PendingConversationPromptMessage | undefined,
): string {
  if (!message) {
    return '';
  }

  const trimmed = message.content.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }

  const attachment = readConversationAttachmentMetadata(message.metadata);
  return attachment ? describeAttachment(attachment) : '';
}

function formatConversationHistory(
  historyMessages: HistoryConversationPromptMessage[],
): string {
  return historyMessages
    .map((message, index) => {
      const toolSummary = describeConversationHistoryToolCalls(message.toolCalls);

      return [
        `${index + 1}. ${describeConversationRole(message.role)}: ${describeConversationHistoryMessage(message)}`,
        ...(toolSummary ? [`   工具调用: ${toolSummary}`] : []),
      ].join('\n');
    })
    .join('\n\n');
}

function describeConversationRole(
  role: HistoryConversationPromptMessage['role'],
): string {
  switch (role) {
    case 'assistant':
      return '助手';
    case 'system':
      return '系统';
    case 'tool':
      return '工具';
    default:
      return '用户';
  }
}

function describeConversationHistoryMessage(
  message: HistoryConversationPromptMessage,
): string {
  const attachment = readConversationAttachmentMetadata(message.metadata);
  const trimmed = message.content.trim();

  if (trimmed.length > 0 && attachment) {
    return `${trimmed}（${describeAttachment(attachment)}）`;
  }

  if (trimmed.length > 0) {
    return trimmed;
  }

  if (attachment) {
    return describeAttachment(attachment);
  }

  if (message.metadata['emptyTurn'] === true) {
    return '（该轮未返回可展示文本）';
  }

  if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
    return '（该轮主要执行了工具调用）';
  }

  return '（空消息）';
}

function describeConversationHistoryToolCalls(
  toolCalls: HistoryConversationPromptMessage['toolCalls'],
): string | null {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return null;
  }

  const items = toolCalls.flatMap((toolCall) => {
    if (!isRecord(toolCall)) {
      return [];
    }

    const tool = readString(toolCall.tool) ?? readString(toolCall.name) ?? 'unknown_tool';
    const status = readString(toolCall.status);
    return [status ? `${tool} (${status})` : tool];
  });

  return items.length > 0 ? items.join(', ') : null;
}

function describeAttachment(
  attachment: NonNullable<
    ReturnType<typeof readConversationAttachmentMetadata>
  >,
): string {
  const label = attachment.kind === 'image' ? '图片' : '文件';
  return `已上传${label} ${attachment.fileName}`;
}

function isRestartedInheritedHistoryConversation(
  metadata: Record<string, unknown>,
): boolean {
  const restart = isRecord(metadata.restart) ? metadata.restart : null;
  return (
    restart?.inheritedHistory === true ||
    (metadata.inheritedMessageHistory === true &&
      typeof metadata.restartFromConversationId === 'string' &&
      metadata.restartFromConversationId.length > 0)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

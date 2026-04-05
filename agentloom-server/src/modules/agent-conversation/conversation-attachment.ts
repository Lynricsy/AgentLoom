import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const MAX_CONVERSATION_ATTACHMENT_BYTES = 1_500_000;
export const MAX_CONVERSATION_TEXT_ATTACHMENT_BYTES = 200_000;

export type ConversationMessageContentType = 'text' | 'image' | 'file';
export type ConversationAttachmentKind = Exclude<
  ConversationMessageContentType,
  'text'
>;

export interface ConversationAttachmentMetadata {
  kind: ConversationAttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64?: string;
  textContent?: string;
  sandboxPath?: string;
}

const conversationAttachmentSchema = z
  .object({
    kind: z.enum(['image', 'file']),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(255),
    sizeBytes: z
      .number()
      .int()
      .nonnegative()
      .max(MAX_CONVERSATION_ATTACHMENT_BYTES),
    dataBase64: z.string().min(1).optional(),
    textContent: z.string().min(1).optional(),
    sandboxPath: z.string().trim().min(1).max(512).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'image' && !value.dataBase64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '图片附件必须提供 dataBase64',
        path: ['dataBase64'],
      });
    }

    if (value.kind === 'file' && !value.dataBase64 && !value.textContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '文件附件必须提供 textContent 或 dataBase64',
        path: ['textContent'],
      });
    }

    if (
      value.textContent &&
      Buffer.byteLength(value.textContent, 'utf8') >
        MAX_CONVERSATION_TEXT_ATTACHMENT_BYTES
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `文本附件内容不能超过 ${MAX_CONVERSATION_TEXT_ATTACHMENT_BYTES} 字节`,
        path: ['textContent'],
      });
    }

    if (
      value.dataBase64 &&
      estimateBase64SizeBytes(value.dataBase64) >
        MAX_CONVERSATION_ATTACHMENT_BYTES
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `附件二进制内容不能超过 ${MAX_CONVERSATION_ATTACHMENT_BYTES} 字节`,
        path: ['dataBase64'],
      });
    }
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function estimateBase64SizeBytes(value: string): number {
  const normalized = value.replace(/\s+/g, '');
  const padding = normalized.endsWith('==')
    ? 2
    : normalized.endsWith('=')
      ? 1
      : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

function parseAttachment(
  value: unknown,
  {
    allowSandboxPath,
    lenient,
  }: {
    allowSandboxPath: boolean;
    lenient: boolean;
  },
): ConversationAttachmentMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const candidate: Record<string, unknown> = {
    ...value,
    ...(allowSandboxPath ? {} : { sandboxPath: undefined }),
  };
  const parsed = conversationAttachmentSchema.safeParse(candidate);

  if (parsed.success) {
    return parsed.data;
  }

  if (lenient) {
    return null;
  }

  throw new BadRequestException(parsed.error.issues[0]?.message ?? '附件格式无效');
}

export function readConversationAttachmentMetadata(
  metadata: Record<string, unknown> | undefined,
): ConversationAttachmentMetadata | null {
  return parseAttachment(metadata?.attachment, {
    allowSandboxPath: true,
    lenient: true,
  });
}

export function normalizeIncomingConversationMetadata(
  contentType: ConversationMessageContentType,
  metadata: Record<string, unknown> = {},
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...metadata };

  if (contentType === 'text') {
    delete next.contentType;
    delete next.attachment;
    return next;
  }

  const attachment = parseAttachment(next.attachment, {
    allowSandboxPath: false,
    lenient: false,
  });

  if (!attachment) {
    throw new BadRequestException('非文本消息必须提供 attachment 元数据');
  }

  if (attachment.kind !== contentType) {
    throw new BadRequestException('attachment.kind 必须与 contentType 保持一致');
  }

  next.contentType = contentType;
  next.attachment = attachment;
  return next;
}

export function resolveConversationMessageContentType(
  contentType: unknown,
  metadata?: Record<string, unknown>,
): ConversationMessageContentType {
  if (contentType === 'image' || contentType === 'file' || contentType === 'text') {
    return contentType;
  }

  const metadataType = metadata?.contentType;
  if (
    metadataType === 'image' ||
    metadataType === 'file' ||
    metadataType === 'text'
  ) {
    return metadataType;
  }

  const attachment = readConversationAttachmentMetadata(metadata);
  if (attachment) {
    return attachment.kind;
  }

  return 'text';
}

export function withConversationAttachmentSandboxPath(
  metadata: Record<string, unknown> | undefined,
  sandboxPath: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(metadata ?? {}) };
  const attachment = readConversationAttachmentMetadata(next);

  if (!attachment) {
    return next;
  }

  next.contentType = attachment.kind;
  next.attachment = {
    ...attachment,
    sandboxPath,
  };
  return next;
}

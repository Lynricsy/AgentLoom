import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const MAX_CONVERSATION_ATTACHMENT_BYTES = 1_500_000;
export const MAX_CONVERSATION_TEXT_ATTACHMENT_BYTES = 200_000;
export const MAX_CONVERSATION_ATTACHMENT_TOTAL_BYTES = 10_000_000;
const CONVERSATION_TRANSPORT_OVERHEAD_BYTES = 2 * 1024 * 1024;
export const MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES =
  Math.ceil((MAX_CONVERSATION_ATTACHMENT_TOTAL_BYTES * 4) / 3) +
  CONVERSATION_TRANSPORT_OVERHEAD_BYTES;

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

  throw new BadRequestException(
    parsed.error.issues[0]?.message ?? '附件格式无效',
  );
}

function parseAttachments(
  value: unknown,
  options: {
    allowSandboxPath: boolean;
    lenient: boolean;
  },
): ConversationAttachmentMetadata[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const attachments: ConversationAttachmentMetadata[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const attachment = parseAttachment(value[index], options);
    if (attachment) {
      attachments.push(attachment);
      continue;
    }

    if (!options.lenient) {
      throw new BadRequestException(`第 ${index + 1} 个附件格式无效`);
    }
  }

  return attachments;
}

function resolveIncomingAttachments(
  metadata: Record<string, unknown> | undefined,
  options: {
    allowSandboxPath: boolean;
    lenient: boolean;
  },
): ConversationAttachmentMetadata[] {
  const attachments = parseAttachments(metadata?.attachments, options);
  if (attachments.length > 0) {
    return attachments;
  }

  const attachment = parseAttachment(metadata?.attachment, options);
  return attachment ? [attachment] : [];
}

function validateAttachmentTotalBytes(
  attachments: ConversationAttachmentMetadata[],
): void {
  const totalBytes = attachments.reduce(
    (sum, attachment) =>
      sum +
      (attachment.textContent
        ? Buffer.byteLength(attachment.textContent, 'utf8')
        : attachment.dataBase64
          ? estimateBase64SizeBytes(attachment.dataBase64)
          : attachment.sizeBytes),
    0,
  );

  if (totalBytes > MAX_CONVERSATION_ATTACHMENT_TOTAL_BYTES) {
    throw new BadRequestException(
      `单条消息附件总大小不能超过 ${MAX_CONVERSATION_ATTACHMENT_TOTAL_BYTES} 字节`,
    );
  }
}

function inferStoredConversationMessageContentType(
  contentType: ConversationMessageContentType,
  attachments: ConversationAttachmentMetadata[],
): ConversationMessageContentType {
  if (attachments.length === 0) {
    return 'text';
  }

  if (
    contentType !== 'text' &&
    attachments.every((attachment) => attachment.kind === contentType)
  ) {
    return contentType;
  }

  return 'text';
}

export function readConversationAttachmentMetadata(
  metadata: Record<string, unknown> | undefined,
): ConversationAttachmentMetadata | null {
  return (
    resolveIncomingAttachments(metadata, {
      allowSandboxPath: true,
      lenient: true,
    })[0] ?? null
  );
}

export function readConversationAttachmentMetadataList(
  metadata: Record<string, unknown> | undefined,
): ConversationAttachmentMetadata[] {
  return resolveIncomingAttachments(metadata, {
    allowSandboxPath: true,
    lenient: true,
  });
}

export function normalizeIncomingConversationMetadata(
  contentType: ConversationMessageContentType,
  metadata: Record<string, unknown> = {},
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...metadata };
  const attachments = resolveIncomingAttachments(next, {
    allowSandboxPath: false,
    lenient: false,
  });

  if (attachments.length === 0) {
    if (contentType === 'text') {
      delete next.contentType;
      delete next.attachment;
      delete next.attachments;
      return next;
    }

    throw new BadRequestException('非文本消息必须提供 attachment 元数据');
  }

  validateAttachmentTotalBytes(attachments);

  if (
    contentType !== 'text' &&
    attachments.some((attachment) => attachment.kind !== contentType)
  ) {
    throw new BadRequestException(
      '非文本消息的所有附件 kind 必须与 contentType 保持一致',
    );
  }

  const storedContentType = inferStoredConversationMessageContentType(
    contentType,
    attachments,
  );

  next.contentType = storedContentType;
  next.attachments = attachments;
  if (attachments.length === 1) {
    next.attachment = attachments[0]!;
  } else {
    delete next.attachment;
  }
  return next;
}

export function resolveConversationMessageContentType(
  contentType: unknown,
  metadata?: Record<string, unknown>,
): ConversationMessageContentType {
  if (
    contentType === 'image' ||
    contentType === 'file' ||
    contentType === 'text'
  ) {
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

  const attachments = readConversationAttachmentMetadataList(metadata);
  if (attachments.length === 1) {
    return attachments[0]!.kind;
  }

  return 'text';
}

export function withConversationAttachmentSandboxPath(
  metadata: Record<string, unknown> | undefined,
  sandboxPath: string,
): Record<string, unknown> {
  return withConversationAttachmentSandboxPaths(metadata, [sandboxPath]);
}

export function withConversationAttachmentSandboxPaths(
  metadata: Record<string, unknown> | undefined,
  sandboxPaths: Array<string | null | undefined>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(metadata ?? {}) };
  const attachments = readConversationAttachmentMetadataList(next);

  if (attachments.length === 0) {
    return next;
  }

  const updatedAttachments = attachments.map((attachment, index) => {
    const resolvedSandboxPath = sandboxPaths[index];
    return resolvedSandboxPath
      ? {
          ...attachment,
          sandboxPath: resolvedSandboxPath,
        }
      : attachment;
  });

  next.attachments = updatedAttachments;
  if (updatedAttachments.length === 1) {
    next.attachment = updatedAttachments[0]!;
  } else {
    delete next.attachment;
  }

  return next;
}

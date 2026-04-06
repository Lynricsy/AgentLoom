import type {
  ConversationAttachment,
  ConversationMessageContentType,
  ConversationMessageMetadata,
} from "./types";

export const MAX_CONVERSATION_ATTACHMENT_BYTES = 1_500_000;
export const MAX_CONVERSATION_ATTACHMENT_TOTAL_BYTES = 10_000_000;
export const MAX_CONVERSATION_TEXT_ATTACHMENT_BYTES = 200_000;

export const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "jsonl",
  "yaml",
  "yml",
  "xml",
  "csv",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "rs",
  "go",
  "java",
  "kt",
  "swift",
  "sql",
  "html",
  "css",
  "scss",
  "sh",
  "bash",
  "zsh",
  "env",
  "toml",
  "ini",
  "log",
]);

export function getConversationAttachments(
  metadata: ConversationMessageMetadata | undefined,
): ConversationAttachment[] {
  if (Array.isArray(metadata?.attachments) && metadata.attachments.length > 0) {
    return metadata.attachments;
  }

  return metadata?.attachment ? [metadata.attachment] : [];
}

export function describeConversationAttachmentContent(
  kind: "image" | "file",
  fileName: string,
): string {
  return `已上传${kind === "image" ? "图片" : "文件"} ${fileName}`;
}

export function describeConversationAttachmentsSummary(
  attachments: ConversationAttachment[],
): string {
  if (attachments.length === 0) {
    return "";
  }

  if (attachments.length === 1) {
    const attachment = attachments[0];
    if (!attachment) {
      return "";
    }
    return describeConversationAttachmentContent(
      attachment.kind,
      attachment.fileName,
    );
  }

  return `已上传 ${attachments.length} 个附件`;
}

export function isConversationAttachmentAutoSummary(
  content: string,
  attachments: ConversationAttachment[],
): boolean {
  if (attachments.length === 0) {
    return false;
  }

  return content.trim() === describeConversationAttachmentsSummary(attachments);
}

export function inferConversationAttachmentContentType(
  attachments: ConversationAttachment[],
): ConversationMessageContentType {
  if (attachments.length === 0) {
    return "text";
  }

  const [firstAttachment] = attachments;
  if (
    firstAttachment &&
    attachments.every((attachment) => attachment.kind === firstAttachment.kind)
  ) {
    return firstAttachment.kind;
  }

  return "text";
}

export function getConversationAttachmentTotalBytes(
  attachments: ConversationAttachment[],
): number {
  return attachments.reduce(
    (sum, attachment) => sum + attachment.sizeBytes,
    0,
  );
}

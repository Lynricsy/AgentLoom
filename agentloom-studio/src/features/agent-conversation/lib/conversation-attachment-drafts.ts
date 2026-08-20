import {
  inferConversationAttachmentContentType,
  MAX_CONVERSATION_ATTACHMENT_BYTES,
  MAX_CONVERSATION_TEXT_ATTACHMENT_BYTES,
  TEXT_ATTACHMENT_EXTENSIONS,
} from "../attachmentUtils";
import type {
  ConversationAttachment,
  OutgoingConversationMessage,
} from "../types";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("文件读取结果无效"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("文件读取失败"));
    };
    reader.readAsDataURL(file);
  });
}

function extractBase64Payload(dataUrl: string): string {
  const separatorIndex = dataUrl.indexOf(",");
  return separatorIndex >= 0 ? dataUrl.slice(separatorIndex + 1) : dataUrl;
}

/** 能安全按纯文本内联的附件：MIME 命中文本族，或扩展名在白名单里 */
function isLikelyTextAttachment(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith("text/")) {
    return true;
  }

  if (
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    mimeType === "application/javascript" ||
    mimeType === "application/typescript" ||
    mimeType === "application/x-sh" ||
    mimeType.endsWith("+json") ||
    mimeType.endsWith("+xml")
  ) {
    return true;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension ? TEXT_ATTACHMENT_EXTENSIONS.has(extension) : false;
}

export async function buildImageConversationAttachment(
  file: File,
): Promise<ConversationAttachment> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择有效的图片文件");
  }

  if (file.size > MAX_CONVERSATION_ATTACHMENT_BYTES) {
    throw new Error("图片大小不能超过 1.5 MB");
  }

  const dataUrl = await readFileAsDataUrl(file);

  return {
    kind: "image",
    fileName: file.name,
    mimeType: file.type || "image/png",
    sizeBytes: file.size,
    dataBase64: extractBase64Payload(dataUrl),
  };
}

export async function buildFileConversationAttachment(
  file: File,
): Promise<ConversationAttachment> {
  if (file.size > MAX_CONVERSATION_ATTACHMENT_BYTES) {
    throw new Error("文件大小不能超过 1.5 MB");
  }

  const mimeType = file.type || "application/octet-stream";

  if (isLikelyTextAttachment(file)) {
    const textContent = await file.text();
    const textBytes = new TextEncoder().encode(textContent).byteLength;

    if (textBytes <= MAX_CONVERSATION_TEXT_ATTACHMENT_BYTES) {
      return {
        kind: "file",
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
        textContent,
      };
    }
  }

  const dataUrl = await readFileAsDataUrl(file);
  return {
    kind: "file",
    fileName: file.name,
    mimeType,
    sizeBytes: file.size,
    dataBase64: extractBase64Payload(dataUrl),
  };
}

export function buildAttachmentConversationMessage(
  content: string,
  attachments: ConversationAttachment[],
): OutgoingConversationMessage {
  const contentType = inferConversationAttachmentContentType(attachments);

  return {
    content,
    contentType,
    metadata: {
      contentType,
      attachments,
      ...(attachments.length === 1 ? { attachment: attachments[0] } : {}),
    },
  };
}

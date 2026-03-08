export const DOCUMENT_STATUS_VALUES = [
  'uploaded',
  'processing',
  'ready',
  'failed',
] as const;

export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export const TEXT_BASED_EXTENSIONS = ['.txt', '.md'] as const;

export const EXTENSION_MIME_MAP: Record<string, SupportedMimeType> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

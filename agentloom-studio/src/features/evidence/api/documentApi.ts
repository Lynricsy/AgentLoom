import { apiClient } from '@/shared/api/client';
import type { ApiResponse } from '@/shared/types/api';

export interface DocumentContentResult {
  url: string;
  fileName: string;
  mimeType: string;
  expiresIn: number;
}

export function fetchDocumentContent(
  knowledgeBaseId: string,
  documentId: string,
): Promise<ApiResponse<DocumentContentResult>> {
  return apiClient
    .get(
      `knowledge-bases/${knowledgeBaseId}/documents/${documentId}/content`,
    )
    .json<ApiResponse<DocumentContentResult>>();
}

import { apiClient, toSnakeBody } from '@/shared/api/client';
import type { ApiResponse, PaginatedResponse } from '@/shared/types/api';
import type {
  CreateKnowledgeBaseInput,
  DocumentListParams,
  KnowledgeBase,
  KnowledgeBaseListParams,
  KnowledgeBaseDocument,
  KnowledgeTestSearchResponse,
  UpdateKnowledgeBaseSettingsInput,
} from '../types';

const BASE_PATH = 'knowledge-bases';

export async function fetchKnowledgeBases(
  params?: KnowledgeBaseListParams,
): Promise<PaginatedResponse<KnowledgeBase>> {
  const searchParams: Record<string, string> = {};
  if (params?.page) searchParams.page = String(params.page);
  if (params?.pageSize) searchParams.page_size = String(params.pageSize);
  if (params?.sourceKind) searchParams.source_kind = params.sourceKind;

  return apiClient
    .get(BASE_PATH, { searchParams })
    .json<PaginatedResponse<KnowledgeBase>>();
}

export async function fetchAllKnowledgeBases(
  params?: Pick<KnowledgeBaseListParams, 'sourceKind'> & { pageSize?: number },
): Promise<KnowledgeBase[]> {
  const pageSize = params?.pageSize ?? 100;
  const knowledgeBases: KnowledgeBase[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await fetchKnowledgeBases({
      page,
      pageSize,
      sourceKind: params?.sourceKind,
    });
    knowledgeBases.push(...response.data);
    totalPages = response.meta.totalPages;
    page += 1;
  } while (page <= totalPages);

  return knowledgeBases;
}

export async function fetchKnowledgeBase(id: string): Promise<KnowledgeBase> {
  const response = await apiClient
    .get(`${BASE_PATH}/${id}`)
    .json<ApiResponse<KnowledgeBase>>();
  return response.data;
}

export async function createKnowledgeBase(
  input: CreateKnowledgeBaseInput,
): Promise<KnowledgeBase> {
  const response = await apiClient
    .post(BASE_PATH, { json: toSnakeBody(input) })
    .json<ApiResponse<KnowledgeBase>>();
  return response.data;
}

export async function updateKnowledgeBaseSettings(
  id: string,
  input: UpdateKnowledgeBaseSettingsInput,
): Promise<KnowledgeBase> {
  const response = await apiClient
    .patch(`${BASE_PATH}/${id}/settings`, { json: toSnakeBody(input) })
    .json<ApiResponse<KnowledgeBase>>();
  return response.data;
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  await apiClient.delete(`${BASE_PATH}/${id}`);
}

export async function testKnowledgeBaseSearch(
  id: string,
  input: {
    query: string;
    topK?: number;
  },
): Promise<KnowledgeTestSearchResponse> {
  const response = await apiClient
    .post(`${BASE_PATH}/${id}/test-search`, {
      json: toSnakeBody(input),
    })
    .json<ApiResponse<KnowledgeTestSearchResponse>>();
  return response.data;
}

export async function rebuildKnowledgeBase(
  id: string,
): Promise<{
  knowledgeBaseId: string;
  documentCount: number;
}> {
  const response = await apiClient
    .post(`${BASE_PATH}/${id}/rebuild`, {
      json: { force: true },
    })
    .json<
      ApiResponse<{
        knowledgeBaseId: string;
        documentCount: number;
      }>
    >();
  return response.data;
}

export async function fetchDocuments(
  knowledgeBaseId: string,
  params?: DocumentListParams,
): Promise<PaginatedResponse<KnowledgeBaseDocument>> {
  const searchParams: Record<string, string> = {};
  if (params?.page) searchParams.page = String(params.page);
  if (params?.pageSize) searchParams.page_size = String(params.pageSize);
  if (params?.status) searchParams.status = params.status;

  return apiClient
    .get(`${BASE_PATH}/${knowledgeBaseId}/documents`, { searchParams })
    .json<PaginatedResponse<KnowledgeBaseDocument>>();
}

export async function uploadDocument(
  knowledgeBaseId: string,
  file: File,
): Promise<KnowledgeBaseDocument> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient
    .post(`${BASE_PATH}/${knowledgeBaseId}/documents`, { body: formData })
    .json<ApiResponse<KnowledgeBaseDocument>>();
  return response.data;
}

export async function deleteDocument(
  knowledgeBaseId: string,
  documentId: string,
): Promise<void> {
  await apiClient.delete(
    `${BASE_PATH}/${knowledgeBaseId}/documents/${documentId}`,
  );
}

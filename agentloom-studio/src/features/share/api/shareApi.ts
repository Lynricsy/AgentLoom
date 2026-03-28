import { apiClient, toSnakeBody } from '@/shared/api/client';
import type { ApiResponse } from '@/shared/types/api';
import type {
  CreateSharePayload,
  PublicShareData,
  ShareListResponse,
  ShareRecord,
} from '../types';

export async function createShare(
  payload: CreateSharePayload,
): Promise<ShareRecord> {
  const response = await apiClient
    .post('workflow-shares', { json: toSnakeBody(payload) })
    .json<ApiResponse<ShareRecord>>();

  return response.data;
}

export async function listShares(
  workflowDefinitionId: string,
  page = 1,
  pageSize = 20,
): Promise<ShareListResponse> {
  return apiClient
    .get('workflow-shares', {
      searchParams: {
        workflow_definition_id: workflowDefinitionId,
        page,
        page_size: pageSize,
      },
    })
    .json<ShareListResponse>();
}

export async function revokeShare(shareId: string): Promise<void> {
  await apiClient.delete(`workflow-shares/${shareId}`);
}

export async function getPublicShare(
  token: string,
): Promise<PublicShareData> {
  return apiClient.get(`s/${token}`).json<PublicShareData>();
}

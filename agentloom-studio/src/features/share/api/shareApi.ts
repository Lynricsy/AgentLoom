import { apiClient, toSnakeBody } from '@/shared/api/client';
import type {
  CreateSharePayload,
  PublicShareData,
  ShareListResponse,
  ShareRecord,
} from '../types';

export async function createShare(
  payload: CreateSharePayload,
): Promise<ShareRecord> {
  return apiClient
    .post('workflow-shares', { json: toSnakeBody(payload) })
    .json<ShareRecord>();
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

export async function copyShare(
  token: string,
): Promise<{ workflowDefinitionId: string; name: string; message: string }> {
  return apiClient
    .post(`workflow-shares/${token}/copy`)
    .json<{ workflowDefinitionId: string; name: string; message: string }>();
}

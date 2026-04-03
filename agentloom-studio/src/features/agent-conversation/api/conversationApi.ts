import { apiClient, toSnakeBody } from '@/shared/api/client';
import type { PaginatedResponse } from '@/shared/types/api';
import type { SandboxStats } from '@/features/sandbox/types';

export interface ConversationListItem {
  id: string;
  agentDefinitionId: string;
  title: string | null;
  status: 'active' | 'paused' | 'ended' | 'failed';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListConversationsParams {
  page?: number;
  limit?: number;
  status?: string;
}

export async function listConversations(
  agentId: string,
  params: ListConversationsParams = {},
): Promise<PaginatedResponse<ConversationListItem>> {
  const searchParams: Record<string, string> = {};
  if (params.page) searchParams.page = String(params.page);
  if (params.limit) searchParams.limit = String(params.limit);
  if (params.status) searchParams.status = params.status;

  return apiClient
    .get(`agent-definitions/${agentId}/conversations`, { searchParams })
    .json<PaginatedResponse<ConversationListItem>>();
}

export async function generateConversationTitle(
  conversationId: string,
): Promise<{ data: { title: string | null } }> {
  return apiClient
    .post(`agent-conversations/${conversationId}/generate-title`)
    .json<{ data: { title: string | null } }>();
}

export async function updateConversation(
  conversationId: string,
  payload: { title?: string; metadata?: Record<string, unknown> },
): Promise<{ data: ConversationListItem }> {
  return apiClient
    .patch(`agent-conversations/${conversationId}`, {
      json: toSnakeBody(payload),
    })
    .json<{ data: ConversationListItem }>();
}

export async function deleteConversation(
  conversationId: string,
): Promise<void> {
  await apiClient.delete(`agent-conversations/${conversationId}`);
}

export async function fetchConversationSandboxStats(
  conversationId: string,
): Promise<SandboxStats> {
  return apiClient
    .get(`agent-conversations/${conversationId}/sandbox/stats`)
    .json<{ data: SandboxStats }>()
    .then((response) => response.data)
}

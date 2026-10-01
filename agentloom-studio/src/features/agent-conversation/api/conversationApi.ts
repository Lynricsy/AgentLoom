import type {
  ConversationListResponseSwaggerDto,
  ConversationListResponseSwaggerDtoDataInner,
  ConversationListResponseSwaggerDtoDataInnerSourceEnum,
  StartConversationDto,
  UpdateConversationDto,
} from "@agentloom/api-client";
import { apiClient, toSnakeBody } from "@/shared/api/client";
import type { SandboxProcess, SandboxStats } from "@/features/sandbox";

export type ConversationListItem =
  ConversationListResponseSwaggerDtoDataInner;

/** 对话来源：Studio 内发起或第三方经 Agent API Key 发起 */
export type ConversationSource =
  ConversationListResponseSwaggerDtoDataInnerSourceEnum;

export interface ListConversationsParams {
  page?: number;
  limit?: number;
  status?: string;
  source?: ConversationSource;
}

/**
 * POST /agent-definitions/:id/conversations/start 请求体（生成模型）。
 * `metadata` 收窄为 `Record<string, unknown>`：生成产物在这里是无约束索引签名。
 */
export type StartConversationPayload = Omit<StartConversationDto, "metadata"> & {
  metadata?: Record<string, unknown>;
};

/** PATCH /agent-conversations/:id 请求体（生成模型） */
export type UpdateConversationPayload = Omit<UpdateConversationDto, "metadata"> & {
  metadata?: Record<string, unknown>;
};

export async function listConversations(
  agentId: string,
  params: ListConversationsParams = {},
): Promise<ConversationListResponseSwaggerDto> {
  const searchParams: Record<string, string> = {};
  if (params.page) searchParams.page = String(params.page);
  if (params.limit) searchParams.limit = String(params.limit);
  if (params.status) searchParams.status = params.status;
  if (params.source) searchParams.source = params.source;

  return apiClient
    .get(`agent-definitions/${agentId}/conversations`, { searchParams })
    .json<ConversationListResponseSwaggerDto>();
}

export async function startConversation(
  agentId: string,
  payload: StartConversationPayload,
): Promise<ConversationListItem> {
  const response = await apiClient
    .post(`agent-definitions/${agentId}/conversations/start`, {
      json: payload,
    })
    .json<{ data: ConversationListResponseSwaggerDtoDataInner }>();

  return response.data;
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
  payload: UpdateConversationPayload,
): Promise<{ data: ConversationListResponseSwaggerDtoDataInner }> {
  return apiClient
    .patch(`agent-conversations/${conversationId}`, {
      json: toSnakeBody(payload),
    })
    .json<{ data: ConversationListResponseSwaggerDtoDataInner }>();
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
    .then((response) => response.data);
}

export async function fetchConversationSandboxProcesses(
  conversationId: string,
): Promise<SandboxProcess[]> {
  return apiClient
    .get(`agent-conversations/${conversationId}/sandbox/processes`)
    .json<{ data: SandboxProcess[] }>()
    .then((response) => response.data);
}

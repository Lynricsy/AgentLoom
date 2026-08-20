import { apiClient, toSnakeBody } from "../../../shared/api/client";
import type { ApiResponse, PaginatedResponse } from "../../../shared/types/api";
import type {
  AgentDefinition,
  AgentDefinitionSummary,
  AgentRuntimeMode,
  AgentVersion,
} from "../types";

export interface CreateAgentPayload {
  name: string;
  description?: string;
  icon?: string | null;
  runtimeMode: AgentRuntimeMode;
}

export interface UpdateAgentPayload {
  version: number;
  name?: string;
  description?: string | null;
  icon?: string | null;
  systemPrompt?: string | null;
}

export interface CreateAgentVersionPayload {
  label?: string;
  releaseNotes?: string;
}

export interface PublishAgentPayload {
  label?: string;
  releaseNotes?: string;
  versionId?: string;
}

export interface ListAgentsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  sourceKind?: "manual" | "share_imported";
}

/** 列表接口只返回 summary 形状；详情字段（画布 / 沙箱）需单独取详情。 */
export type AgentListResponse = PaginatedResponse<AgentDefinitionSummary>;
export type AgentVersionListResponse = PaginatedResponse<AgentVersion>;

export async function listAgents(params: ListAgentsParams = {}) {
  const searchParams: Record<string, string> = {};
  if (params.page) searchParams.page = String(params.page);
  if (params.pageSize) searchParams.pageSize = String(params.pageSize);
  if (params.status) searchParams.status = params.status;
  if (params.search) searchParams.search = params.search;
  if (params.sourceKind) searchParams.sourceKind = params.sourceKind;

  return apiClient
    .get("agent-definitions", { searchParams })
    .json<AgentListResponse>();
}

export async function getAgent(agentId: string) {
  const response = await apiClient
    .get(`agent-definitions/${agentId}`)
    .json<ApiResponse<AgentDefinition>>();

  return response.data;
}

export async function createAgent(payload: CreateAgentPayload) {
  const response = await apiClient
    .post("agent-definitions", {
      json: toSnakeBody(payload),
    })
    .json<ApiResponse<AgentDefinition>>();

  return response.data;
}

export async function updateAgent(
  agentId: string,
  payload: UpdateAgentPayload,
) {
  const response = await apiClient
    .patch(`agent-definitions/${agentId}`, {
      json: toSnakeBody(payload),
    })
    .json<ApiResponse<AgentDefinition>>();

  return response.data;
}

export async function deleteAgent(agentId: string) {
  await apiClient.delete(`agent-definitions/${agentId}`);
}

export async function listAgentVersions(
  agentId: string,
  params: { page?: number; pageSize?: number } = {},
) {
  const searchParams: Record<string, string> = {};
  if (params.page) searchParams.page = String(params.page);
  if (params.pageSize) searchParams.pageSize = String(params.pageSize);

  return apiClient
    .get(`agent-definitions/${agentId}/versions`, { searchParams })
    .json<AgentVersionListResponse>();
}

export async function createAgentVersion(
  agentId: string,
  payload: CreateAgentVersionPayload,
) {
  const response = await apiClient
    .post(`agent-definitions/${agentId}/versions`, {
      json: toSnakeBody(payload),
    })
    .json<ApiResponse<AgentVersion>>();

  return response.data;
}

export async function publishAgent(
  agentId: string,
  payload: PublishAgentPayload,
) {
  const response = await apiClient
    .post(`agent-definitions/${agentId}/publish`, {
      json: toSnakeBody(payload),
    })
    .json<ApiResponse<AgentDefinition>>();

  return response.data;
}

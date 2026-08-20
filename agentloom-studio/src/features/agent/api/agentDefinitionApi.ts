import type {
  AgentDefinitionDetailResponseSwaggerDto,
  AgentDefinitionListResponseSwaggerDto,
} from "@agentloom/api-client";
import { apiClient, toSnakeBody } from "../../../shared/api/client";
import type { ApiResponse, PaginatedResponse } from "../../../shared/types/api";
import type { CanvasEdge, CanvasNode } from "../../canvas";
import type {
  AgentDefinition,
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

export interface SaveAgentCanvasPayload {
  canvasNodes: CanvasNode[];
  canvasEdges: CanvasEdge[];
  canvasViewport: AgentDefinition["viewport"];
  inputSchema: AgentDefinition["inputSchema"];
  memoryInstanceIds: AgentDefinition["memoryInstanceIds"];
  globalSandboxConfig?: AgentDefinition["sandboxConfig"];
  sandboxLifecycle?: AgentDefinition["sandboxLifecycle"];
  workspaceSnapshotId?: string | null;
}

export interface ListAgentsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  sourceKind?: "manual" | "share_imported";
}

/** Agent 列表响应直接复用 OpenAPI 生成类型。 */
export type AgentListResponse = AgentDefinitionListResponseSwaggerDto;
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
    .json<AgentDefinitionListResponseSwaggerDto>();
}

export async function getAgent(agentId: string) {
  const response = await apiClient
    .get(`agent-definitions/${agentId}`)
    .json<AgentDefinitionDetailResponseSwaggerDto>();

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
/**
 * 保存 Agent 画布。
 *
 * 该端点的 server DTO（`save-agent-canvas.dto.ts`）声明的是 camelCase 字段
 * （`canvasNodes` / `canvasEdges` / `canvasViewport` …），**不接受 snake_case**。
 * 因此这里不能套 `toSnakeBody()`，必须原样发送 camelCase。
 */
export async function saveAgentCanvas(
  agentId: string,
  payload: SaveAgentCanvasPayload,
) {
  const response = await apiClient
    .put(`agent-definitions/${agentId}/canvas`, {
      json: payload,
    })
    .json<ApiResponse<Pick<AgentDefinition, "version">>>();

  return response.data;
}

export async function compileAgentConfig(agentId: string): Promise<void> {
  await apiClient.post(`agent-definitions/${agentId}/compile`, { json: {} });
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

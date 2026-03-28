import { apiClient } from "@/shared/api/client";
import type { PaginatedResponse } from "@/shared/types/api";
import type {
  DiscoverMcpToolsPayload,
  DiscoverMcpToolsResult,
  ImportMcpToolsPayload,
  ImportMcpToolsResult,
  McpServerConfigDetail,
  McpServerConfigQueryParams,
  McpServerConfigSummary,
  McpToolDefinition,
  ReimportMcpToolsPayload,
  TestMcpConnectionPayload,
  TestMcpConnectionResult,
  UpdateMcpServerConfigPayload,
} from "../types";

interface ApiEnvelope<T> {
  data: T;
}

export async function fetchMcpTools(source = "mcp") {
  const response = await apiClient
    .get("mcp/tools", {
      searchParams: { source },
    })
    .json<ApiEnvelope<McpToolDefinition[]>>();

  return response.data;
}

export async function testMcpConnection(payload: TestMcpConnectionPayload) {
  const response = await apiClient
    .post("mcp/test", {
      json: payload,
    })
    .json<ApiEnvelope<TestMcpConnectionResult>>();

  return response.data;
}

export async function testSavedMcpConnection(mcpServerConfigId: string) {
  const response = await apiClient
    .post(`mcp/configs/${mcpServerConfigId}/test`)
    .json<ApiEnvelope<TestMcpConnectionResult>>();

  return response.data;
}

export async function discoverMcpTools(payload: DiscoverMcpToolsPayload) {
  const response = await apiClient
    .post("mcp/discover", {
      json: payload,
    })
    .json<ApiEnvelope<DiscoverMcpToolsResult>>();

  return response.data;
}

export async function importMcpTools(payload: ImportMcpToolsPayload) {
  const response = await apiClient
    .post("mcp/import", {
      json: payload,
    })
    .json<ApiEnvelope<ImportMcpToolsResult>>();

  return response.data;
}

export async function rediscoverMcpTools(mcpServerConfigId: string) {
  const response = await apiClient
    .post(`mcp/configs/${mcpServerConfigId}/rediscover`)
    .json<ApiEnvelope<DiscoverMcpToolsResult>>();

  return response.data;
}

export async function reimportMcpTools(payload: ReimportMcpToolsPayload) {
  const response = await apiClient
    .post(`mcp/configs/${payload.mcpServerConfigId}/reimport`, {
      json: {
        toolNames: payload.toolNames,
        conflictStrategy: payload.conflictStrategy,
      },
    })
    .json<ApiEnvelope<ImportMcpToolsResult>>();

  return response.data;
}

export async function deactivateMcpTool(toolDefinitionId: string) {
  const response = await apiClient
    .post(`mcp/tools/${toolDefinitionId}/deactivate`)
    .json<ApiEnvelope<McpToolDefinition>>();

  return response.data;
}

export async function fetchMcpServerConfigs(
  params?: McpServerConfigQueryParams,
) {
  const searchParams: Record<string, string | number> = {};

  if (params?.page) searchParams.page = params.page;
  if (params?.pageSize) searchParams.pageSize = params.pageSize;
  if (params?.search) searchParams.search = params.search;
  if (params?.status) searchParams.status = params.status;
  if (params?.transportType) searchParams.transportType = params.transportType;

  const response = await apiClient
    .get("mcp/configs", { searchParams })
    .json<PaginatedResponse<McpServerConfigSummary>>();

  return response;
}

export async function fetchMcpServerConfig(id: string) {
  const response = await apiClient
    .get(`mcp/configs/${id}`)
    .json<ApiEnvelope<McpServerConfigDetail>>();

  return response.data;
}

export async function updateMcpServerConfig(
  id: string,
  data: UpdateMcpServerConfigPayload,
) {
  const response = await apiClient
    .patch(`mcp/configs/${id}`, { json: data })
    .json<ApiEnvelope<McpServerConfigSummary>>();

  return response.data;
}

export async function deleteMcpServerConfig(id: string) {
  await apiClient.delete(`mcp/configs/${id}`);
}

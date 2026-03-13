import { apiClient, toSnakeBody } from "@/shared/api/client";
import type {
  DiscoverMcpToolsPayload,
  DiscoverMcpToolsResult,
  ImportMcpToolsPayload,
  ImportMcpToolsResult,
  McpToolDefinition,
  ReimportMcpToolsPayload,
  TestMcpConnectionPayload,
  TestMcpConnectionResult,
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
      json: toSnakeBody(payload),
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
      json: toSnakeBody(payload),
    })
    .json<ApiEnvelope<DiscoverMcpToolsResult>>();

  return response.data;
}

export async function importMcpTools(payload: ImportMcpToolsPayload) {
  const response = await apiClient
    .post("mcp/import", {
      json: toSnakeBody(payload),
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
      json: toSnakeBody({
        toolNames: payload.toolNames,
        conflictStrategy: payload.conflictStrategy,
      }),
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

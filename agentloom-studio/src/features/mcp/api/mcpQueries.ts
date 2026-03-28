import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchMcpTools, fetchMcpServerConfigs, fetchMcpServerConfig } from "./mcpApi";
import { mcpKeys } from "./mcpKeys";
import type { McpServerConfigQueryParams } from "../types";

export { fetchMcpTools, mcpKeys };

export function useMcpTools(source = "mcp") {
  return useQuery({
    queryKey: mcpKeys.list(source),
    queryFn: () => fetchMcpTools(source),
    staleTime: 30_000,
  });
}

export function useMcpServerConfigs(params?: McpServerConfigQueryParams) {
  return useQuery({
    queryKey: mcpKeys.configList(params),
    queryFn: () => fetchMcpServerConfigs(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useMcpServerConfig(
  id: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: mcpKeys.configDetail(id),
    queryFn: () => fetchMcpServerConfig(id),
    enabled: options?.enabled ?? Boolean(id),
    staleTime: 30_000,
  });
}

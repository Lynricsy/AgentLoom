import type { McpServerConfigQueryParams } from "../types";

export const mcpKeys = {
  all: ["mcp-tools"] as const,
  lists: () => [...mcpKeys.all, "list"] as const,
  list: (source = "mcp") => [...mcpKeys.lists(), source] as const,
  configs: () => [...mcpKeys.all, "configs"] as const,
  configList: (params?: McpServerConfigQueryParams) =>
    [...mcpKeys.configs(), "list", params] as const,
  configDetail: (id: string) =>
    [...mcpKeys.configs(), "detail", id] as const,
};

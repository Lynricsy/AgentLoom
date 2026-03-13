export const mcpKeys = {
  all: ["mcp-tools"] as const,
  lists: () => [...mcpKeys.all, "list"] as const,
  list: (source = "mcp") => [...mcpKeys.lists(), source] as const,
};

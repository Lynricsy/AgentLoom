export const mcpToolKeys = {
  all: ['mcp-tools'] as const,
  lists: () => [...mcpToolKeys.all, 'list'] as const,
  list: (source?: string) => [...mcpToolKeys.lists(), source] as const,
}

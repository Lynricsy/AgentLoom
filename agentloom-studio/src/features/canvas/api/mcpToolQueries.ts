import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type { McpToolDefinition } from '../types/mcpToolMapping'
import { mcpToolKeys } from './mcpToolKeys'

async function fetchMcpTools(source?: string): Promise<McpToolDefinition[]> {
  const searchParams: Record<string, string> = {}
  if (source) searchParams.source = source
  const res = await apiClient.get('mcp/tools', { searchParams }).json<ApiResponse<McpToolDefinition[]>>()
  return res.data
}

export function useMcpTools(source: string = 'mcp') {
  return useQuery({
    queryKey: mcpToolKeys.list(source),
    queryFn: () => fetchMcpTools(source),
    staleTime: 30_000,
  })
}

import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpToolDefinition } from '../types/mcpToolMapping'
import { mcpToolKeys } from './mcpToolKeys'
import { useMcpTools } from './mcpToolQueries'

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: getMock,
  },
}))

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const mockTool: McpToolDefinition = {
  id: 'tool-1',
  name: 'search-tool',
  title: 'Search Tool',
  description: 'Searches for things',
  inputSchema: { type: 'object' },
  outputSchema: null,
  portMappingMetadata: {
    inputs: [],
    outputs: [],
  },
  source: 'mcp',
  mcpServerConfigId: 'server-1',
  isActive: true,
  annotations: null,
}

describe('useMcpTools', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('defaults source to mcp and returns tool data', async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: [mockTool] }),
    })

    const queryClient = createQueryClient()

    const { result } = renderHook(() => useMcpTools(), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(getMock).toHaveBeenCalledWith('mcp/tools', {
      searchParams: { source: 'mcp' },
    })
    expect(result.current.data).toEqual([mockTool])
  })

  it('uses a 30 second staleTime for imported tools queries', async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: [mockTool] }),
    })

    const queryClient = createQueryClient()

    renderHook(() => useMcpTools('custom'), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => {
      const query = queryClient.getQueryCache().find({
        queryKey: mcpToolKeys.list('custom'),
      })
      const staleTime = Reflect.get(query?.options ?? {}, 'staleTime')

      expect(staleTime).toBe(30_000)
    })
  })
})

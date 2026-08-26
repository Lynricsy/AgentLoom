import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resolveKnowledgeSocketUrl,
  useKnowledgeBaseSocket,
} from './useKnowledgeBaseSocket'

const { ioMock, useAuthTokenMock } = vi.hoisted(() => ({
  ioMock: vi.fn(),
  useAuthTokenMock: vi.fn<() => string | undefined>(),
}))

vi.mock('socket.io-client', () => ({
  io: ioMock,
}))

vi.mock('@/features/auth/hooks/useAuthToken', () => ({
  useAuthToken: useAuthTokenMock,
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

function createMockSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {}
  const socket = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler
      return socket
    }),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }

  return { socket, handlers }
}

describe('useKnowledgeBaseSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthTokenMock.mockReturnValue('jwt-token-123')
  })

  it('resolves absolute API base URLs to the knowledge namespace root', () => {
    expect(
      resolveKnowledgeSocketUrl(
        'https://api.example.com/api/v1',
        'https://studio.example.com',
      ),
    ).toBe('https://api.example.com/knowledge')
  })

  it('resolves relative API base URLs against the current origin', () => {
    expect(
      resolveKnowledgeSocketUrl('/api/v1', 'https://studio.example.com'),
    ).toBe('https://studio.example.com/knowledge')
  })

  it('joins the socket room, stores document events, and invalidates queries', async () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)

    const queryClient = createQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result, unmount } = renderHook(
      () => useKnowledgeBaseSocket('tenant-1', 'kb-1'),
      {
        wrapper: createWrapper(queryClient),
      },
    )

    expect(ioMock).toHaveBeenCalledWith(resolveKnowledgeSocketUrl('/api/v1'), {
      auth: { token: 'jwt-token-123' },
    })

    act(() => {
      handlers.connect?.()
    })

    expect(socket.emit).toHaveBeenCalledWith('join', {
      tenantId: 'tenant-1',
      knowledgeBaseId: 'kb-1',
    })

    act(() => {
      handlers['document:status-changed']?.({
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
        status: 'processing',
        progress: {
          percentage: 35,
          stage: 'parsing',
          currentStep: 2,
          totalSteps: 5,
        },
      })
      handlers['knowledge-base:updated']?.({ knowledgeBaseId: 'kb-1' })
    })

    await waitFor(() =>
      expect(result.current.documentEvents['doc-1']).toEqual(
        expect.objectContaining({
          status: 'processing',
          progress: expect.objectContaining({ stage: 'parsing' }),
        }),
      ),
    )

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['knowledge-bases', 'detail', 'kb-1', 'documents'],
      }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['knowledge-bases', 'detail', 'kb-1'],
      }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['knowledge-bases', 'list'],
      }),
    )

    unmount()

    expect(socket.emit).toHaveBeenCalledWith('leave', {
      tenantId: 'tenant-1',
      knowledgeBaseId: 'kb-1',
    })
    expect(socket.disconnect).toHaveBeenCalled()
  })

  it('does not connect when tenant or knowledge base is missing', () => {
    const queryClient = createQueryClient()

    renderHook(() => useKnowledgeBaseSocket(undefined, undefined), {
      wrapper: createWrapper(queryClient),
    })

    expect(ioMock).not.toHaveBeenCalled()
  })

  it('does not connect without an auth token', () => {
    useAuthTokenMock.mockReturnValue(undefined)
    const queryClient = createQueryClient()

    renderHook(() => useKnowledgeBaseSocket('tenant-1', 'kb-1'), {
      wrapper: createWrapper(queryClient),
    })

    expect(ioMock).not.toHaveBeenCalled()
  })
})

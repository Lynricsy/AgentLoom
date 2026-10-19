import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notificationKeys } from '../api/notificationKeys'
import { buildNotificationToast, useNotificationSocket } from './useNotificationSocket'

const { ioMock, notifyMock } = vi.hoisted(() => ({
  ioMock: vi.fn(),
  notifyMock: vi.fn(),
}))

vi.mock('socket.io-client', () => ({ io: ioMock }))
vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}))

function createSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {}
  const socket = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler
      return socket
    }),
    emit: vi.fn(),
    removeAllListeners: vi.fn(),
    disconnect: vi.fn(),
  }
  return { socket, handlers }
}

describe('useNotificationSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invalidates Query caches on socket deltas without writing Zustand entities', async () => {
    const { socket, handlers } = createSocket()
    ioMock.mockReturnValue(socket)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(notificationKeys.list({ page: 1 }), { data: [] })
    queryClient.setQueryData(notificationKeys.unreadCount(), { data: { count: 0 } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => useNotificationSocket({ authToken: 'token' }), { wrapper })

    act(() => {
      handlers['notification.new']?.({
        id: 'notification-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        type: 'system',
        title: 'New notification',
        body: null,
        isRead: false,
        createdAt: '2026-08-20T00:00:00.000Z',
      })
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: notificationKeys.lists(),
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: notificationKeys.unreadCount(),
      })
    })
  })

  it('执行类通知的 toast 带工作流名并按工作流合并', () => {
    const { socket, handlers } = createSocket()
    ioMock.mockReturnValue(socket)
    const queryClient = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    renderHook(() => useNotificationSocket({ authToken: 'token' }), { wrapper })

    act(() => {
      handlers['notification.new']?.({
        id: 'notification-2',
        tenantId: 'tenant-1',
        userId: 'user-1',
        type: 'execution_completed',
        title: '执行已完成',
        body: { workflowId: 'wf-1', workflowName: '订单同步', executionId: 'exec-1' },
        isRead: false,
        createdAt: '2026-08-20T00:00:00.000Z',
      })
    })

    expect(notifyMock).toHaveBeenCalledWith({
      title: '执行已完成',
      description: '工作流「订单同步」',
      variant: 'success',
      groupKey: 'execution_completed:wf-1',
    })
  })

  it('非工作流通知保持「新通知」文案且不合并', () => {
    expect(
      buildNotificationToast({
        id: 'n-3',
        tenantId: 'tenant-1',
        userId: 'user-1',
        type: 'system',
        title: '配额已更新',
        body: null,
        isRead: false,
        createdAt: '2026-08-20T00:00:00.000Z',
      }),
    ).toEqual({ title: '新通知', description: '配额已更新', variant: 'info' })
  })
})

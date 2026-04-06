import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  useConversationSandboxProcesses,
  useConversationSandboxStats,
} from './conversationQueries'

const {
  fetchConversationSandboxProcessesMock,
  fetchConversationSandboxStatsMock,
} = vi.hoisted(() => ({
  fetchConversationSandboxProcessesMock: vi.fn(),
  fetchConversationSandboxStatsMock: vi.fn(),
}))

vi.mock('./conversationApi', () => ({
  fetchConversationSandboxProcesses: fetchConversationSandboxProcessesMock,
  fetchConversationSandboxStats: fetchConversationSandboxStatsMock,
  listConversations: vi.fn(),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('useConversationSandboxStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('运行中的沙箱会拉取会话资源统计', async () => {
    fetchConversationSandboxStatsMock.mockResolvedValue({
      cpuPercent: 12.5,
      memoryUsageMb: 64,
      memoryLimitMb: 256,
    })

    const { result } = renderHook(
      () => useConversationSandboxStats('conv-1', 'running'),
      {
        wrapper: createWrapper(),
      },
    )

    await waitFor(() =>
      expect(result.current.data).toMatchObject({
        cpuPercent: 12.5,
      }),
    )

    expect(fetchConversationSandboxStatsMock).toHaveBeenCalledWith('conv-1')
  })

  it('非 running 状态不会主动请求资源统计', async () => {
    renderHook(() => useConversationSandboxStats('conv-1', 'idle'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(fetchConversationSandboxStatsMock).not.toHaveBeenCalled()
    })
  })
})

describe('useConversationSandboxProcesses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('运行中的沙箱会拉取会话进程列表', async () => {
    fetchConversationSandboxProcessesMock.mockResolvedValue([
      {
        pid: 1,
        cpuPercent: 18.4,
        memoryPercent: 6.2,
        state: 'Ss',
        elapsed: '12:34',
        executable: 'node',
        command: 'node dist/server.js',
      },
    ])

    const { result } = renderHook(
      () => useConversationSandboxProcesses('conv-1', 'running'),
      {
        wrapper: createWrapper(),
      },
    )

    await waitFor(() =>
      expect(result.current.data).toEqual([
        expect.objectContaining({
          pid: 1,
          executable: 'node',
        }),
      ]),
    )

    expect(fetchConversationSandboxProcessesMock).toHaveBeenCalledWith('conv-1')
  })

  it('非 running 状态不会主动请求进程列表', async () => {
    renderHook(() => useConversationSandboxProcesses('conv-1', 'idle'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(fetchConversationSandboxProcessesMock).not.toHaveBeenCalled()
    })
  })
})

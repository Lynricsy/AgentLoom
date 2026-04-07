import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createSandbox,
  fetchPersistentSandboxes,
  fetchSandboxes,
  startSandbox,
  stopSandbox,
} from './sandboxApi'

const mocks = vi.hoisted(() => {
  const jsonMock = vi.fn()
  const getMock = vi.fn(() => ({ json: jsonMock }))
  const postMock = vi.fn(() => ({ json: jsonMock }))

  return {
    getMock,
    postMock,
    jsonMock,
  }
})

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: mocks.getMock,
    post: mocks.postMock,
  },
}))

describe('fetchPersistentSandboxes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应使用后端允许的 pageSize 拉取持久沙箱列表', async () => {
    const sandbox = {
      id: 'sandbox-1',
      status: 'ready',
      config: {
        name: 'Persistent Sandbox',
        cpu: 1,
        memory: 512,
        disk: 2,
        timeout: 2,
        lifecycleMode: 'persistent',
      },
      executionId: null,
      agentConversationId: null,
      sandboxNodeId: null,
      containerId: 'ctr-1',
      workspacePath: null,
      startedAt: null,
      stoppedAt: null,
      createdAt: '2026-03-30T00:00:00.000Z',
    }

    mocks.jsonMock.mockResolvedValue({
      data: [sandbox],
      meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    })

    await expect(fetchPersistentSandboxes()).resolves.toEqual([sandbox])

    expect(mocks.getMock).toHaveBeenCalledWith('sandboxes', {
      searchParams: { lifecycleMode: 'persistent', pageSize: 100 },
    })
  })
})

describe('fetchSandboxes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应透传 bindingType 参数，支持资源/对话/执行过滤', async () => {
    mocks.jsonMock.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })

    await fetchSandboxes({
      page: 1,
      pageSize: 20,
      bindingType: 'resource',
      status: 'ready',
    })

    expect(mocks.getMock).toHaveBeenCalledWith('sandboxes', {
      searchParams: {
        page: 1,
        pageSize: 20,
        status: 'ready',
        bindingType: 'resource',
      },
    })
  })
})

describe('createSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应透传对话空闲自动结束分钟数', async () => {
    const sandbox = {
      id: 'sandbox-1',
      status: 'creating',
      config: {
        name: 'Persistent Sandbox',
        cpu: 1,
        memory: 512,
        disk: 2,
        timeout: 24,
        conversationIdleAutoEndMinutes: 15,
        lifecycleMode: 'persistent',
      },
      executionId: null,
      agentConversationId: null,
      sandboxNodeId: null,
      containerId: null,
      workspacePath: null,
      startedAt: null,
      stoppedAt: null,
      createdAt: '2026-04-04T00:00:00.000Z',
    }

    mocks.jsonMock.mockResolvedValue({ data: sandbox })

    await expect(
      createSandbox({
        name: 'Persistent Sandbox',
        cpu: 1,
        memory: 512,
        disk: 2,
        conversationIdleAutoEndMinutes: 15,
      }),
    ).resolves.toEqual(sandbox)

    expect(mocks.postMock).toHaveBeenCalledWith('sandboxes', {
      json: {
        name: 'Persistent Sandbox',
        cpu: 1,
        memory: 512,
        disk: 2,
        conversationIdleAutoEndMinutes: 15,
      },
    })
  })
})

describe('startSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应返回后端回传的最新 session，用于立即更新资源页缓存', async () => {
    const session = {
      id: 'sandbox-1',
      status: 'creating',
      config: {
        name: 'Persistent Sandbox',
        cpu: 1,
        memory: 512,
        disk: 2,
        timeout: 24,
        lifecycleMode: 'persistent',
      },
      executionId: null,
      agentConversationId: null,
      sandboxNodeId: null,
      containerId: null,
      workspacePath: '/workspace',
      startedAt: null,
      stoppedAt: null,
      createdAt: '2026-04-07T00:00:00.000Z',
    }

    mocks.jsonMock.mockResolvedValue({ data: session })

    await expect(startSandbox('sandbox-1')).resolves.toEqual(session)
    expect(mocks.postMock).toHaveBeenCalledWith('sandboxes/sandbox-1/start')
  })
})

describe('stopSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应返回后端回传的最新 session，用于立即更新资源页缓存', async () => {
    const session = {
      id: 'sandbox-1',
      status: 'stopping',
      config: {
        name: 'Persistent Sandbox',
        cpu: 1,
        memory: 512,
        disk: 2,
        timeout: 24,
        lifecycleMode: 'persistent',
      },
      executionId: null,
      agentConversationId: null,
      sandboxNodeId: null,
      containerId: 'ctr-1',
      workspacePath: '/workspace',
      startedAt: '2026-04-07T00:00:00.000Z',
      stoppedAt: null,
      createdAt: '2026-04-06T00:00:00.000Z',
    }

    mocks.jsonMock.mockResolvedValue({ data: session })

    await expect(stopSandbox('sandbox-1')).resolves.toEqual(session)
    expect(mocks.postMock).toHaveBeenCalledWith('sandboxes/sandbox-1/stop')
  })
})

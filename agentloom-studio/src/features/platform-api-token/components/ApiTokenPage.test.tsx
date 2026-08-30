import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HTTPError, type NormalizedOptions } from 'ky'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiTokenPage } from './ApiTokenPage'
import type { PlatformApiToken } from '../types'

const mocks = vi.hoisted(() => ({
  usePlatformApiTokens: vi.fn(),
  useCreatePlatformApiToken: vi.fn(),
  useRevokePlatformApiToken: vi.fn(),
  revokeMutateAsync: vi.fn(),
  createMutateAsync: vi.fn(),
  refetch: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('../api/platformApiTokenQueries', () => ({
  usePlatformApiTokens: mocks.usePlatformApiTokens,
  useCreatePlatformApiToken: mocks.useCreatePlatformApiToken,
  useRevokePlatformApiToken: mocks.useRevokePlatformApiToken,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

const activeToken: PlatformApiToken = {
  id: 'tok-1',
  name: '生产环境部署',
  tokenPrefix: 'al_9f31c02a',
  scopes: 'workflow:read',
  lastUsedAt: '2026-08-10T02:30:00.000Z',
  expiresAt: null,
  isRevoked: false,
  createdAt: '2026-08-01T09:00:00.000Z',
}

const revokedToken: PlatformApiToken = {
  id: 'tok-2',
  name: '实习生调试',
  tokenPrefix: 'al_2b7de410',
  scopes: null,
  lastUsedAt: null,
  expiresAt: null,
  isRevoked: true,
  createdAt: '2026-07-20T09:00:00.000Z',
}

function listState(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      data: [activeToken, revokedToken],
      meta: { page: 1, pageSize: 20, total: 2 },
    },
    isPending: false,
    error: null,
    refetch: mocks.refetch,
    ...overrides,
  }
}

function createConflictError() {
  const response = new Response(JSON.stringify({ title: 'Token 已被撤销' }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  })
  const request = new Request('http://localhost/api/v1/platform-api-tokens/tok-1', {
    method: 'DELETE',
  })
  const options: NormalizedOptions = {
    method: 'DELETE',
    // ky 2 的 NormalizedOptions.retry 是完全归一化后的对象，所有字段必填。
    retry: {
      limit: 0,
      methods: [],
      statusCodes: [],
      afterStatusCodes: [],
      maxRetryAfter: Number.POSITIVE_INFINITY,
      backoffLimit: Number.POSITIVE_INFINITY,
      delay: () => 0,
      jitter: false,
      retryOnTimeout: false,
    },
    prefix: '',
    headers: new Headers(),
    onDownloadProgress: undefined,
    onUploadProgress: undefined,
    context: {},
  }

  return new HTTPError(response, request, options)
}

describe('ApiTokenPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.usePlatformApiTokens.mockReturnValue(listState())
    mocks.useCreatePlatformApiToken.mockReturnValue({
      mutateAsync: mocks.createMutateAsync,
      isPending: false,
    })
    mocks.useRevokePlatformApiToken.mockReturnValue({
      mutateAsync: mocks.revokeMutateAsync,
      isPending: false,
    })
    mocks.revokeMutateAsync.mockResolvedValue(undefined)
  })

  it('渲染 Token 列表的名称、前缀与使用情况', async () => {
    render(<ApiTokenPage />)

    expect(await screen.findByText('生产环境部署')).toBeInTheDocument()
    expect(screen.getByText('al_9f31c02a…')).toBeInTheDocument()
    expect(screen.getByText('workflow:read')).toBeInTheDocument()
    expect(screen.getByText('继承账号全部权限')).toBeInTheDocument()
    expect(screen.getByText('从未使用')).toBeInTheDocument()
    expect(screen.getByText('已撤销')).toBeInTheDocument()
  })

  it('加载中渲染骨架且不闪现空态', () => {
    mocks.usePlatformApiTokens.mockReturnValue(
      listState({ data: undefined, isPending: true }),
    )

    const { container } = render(<ApiTokenPage />)

    expect(container.querySelectorAll('.shimmer').length).toBeGreaterThan(0)
    expect(screen.queryByText('还没有 API Token')).not.toBeInTheDocument()
  })

  it('无数据时引导创建第一个 Token', () => {
    mocks.usePlatformApiTokens.mockReturnValue(
      listState({ data: { data: [], meta: { page: 1, pageSize: 20, total: 0 } } }),
    )

    render(<ApiTokenPage />)

    expect(screen.getByText('还没有 API Token')).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: /创建 Token/ }).length,
    ).toBeGreaterThan(1)
  })

  it('加载失败时展示错误态并 toast', () => {
    mocks.usePlatformApiTokens.mockReturnValue(
      listState({ data: undefined, error: new Error('网络不可达') }),
    )

    render(<ApiTokenPage />)

    expect(screen.getByText('加载 API Token 失败')).toBeInTheDocument()
    expect(screen.getByText('网络不可达')).toBeInTheDocument()
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'error', title: '加载失败' }),
    )
  })

  it('撤销需要二次确认后才发起请求', async () => {
    const user = userEvent.setup()
    render(<ApiTokenPage />)

    await user.click(screen.getByRole('button', { name: '撤销 生产环境部署' }))

    expect(await screen.findByText('撤销 API Token？')).toBeInTheDocument()
    expect(mocks.revokeMutateAsync).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '确认撤销' }))

    await waitFor(() => {
      expect(mocks.revokeMutateAsync).toHaveBeenCalledWith('tok-1')
    })
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success', title: 'Token 已撤销' }),
    )
  })

  it('取消确认不会撤销 Token', async () => {
    const user = userEvent.setup()
    render(<ApiTokenPage />)

    await user.click(screen.getByRole('button', { name: '撤销 生产环境部署' }))
    await screen.findByText('撤销 API Token？')
    await user.click(screen.getByRole('button', { name: '取消' }))

    await waitFor(() => {
      expect(screen.queryByText('撤销 API Token？')).not.toBeInTheDocument()
    })
    expect(mocks.revokeMutateAsync).not.toHaveBeenCalled()
  })

  it('已撤销的 Token 不能再次撤销', () => {
    render(<ApiTokenPage />)

    expect(screen.getByRole('button', { name: '撤销 实习生调试' })).toBeDisabled()
  })

  it('409 表示 Token 已撤销，以告警 toast 呈现', async () => {
    mocks.revokeMutateAsync.mockRejectedValue(createConflictError())

    const user = userEvent.setup()
    render(<ApiTokenPage />)

    await user.click(screen.getByRole('button', { name: '撤销 生产环境部署' }))
    await screen.findByText('撤销 API Token？')
    await user.click(screen.getByRole('button', { name: '确认撤销' }))

    await waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'warning', title: 'Token 已被撤销' }),
      )
    })
  })
})

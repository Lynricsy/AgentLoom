import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { HTTPError, type NormalizedOptions } from 'ky'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DeveloperKeysPage } from './DeveloperKeysPage'
import type { DeveloperKey } from '../types'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useDeveloperKeys: vi.fn(),
  useRegisterDeveloperKey: vi.fn(),
  useRevokeDeveloperKey: vi.fn(),
  registerMutate: vi.fn(),
  registerReset: vi.fn(),
  revokeMutate: vi.fn(),
  refetch: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('../api/developer-key.queries', () => ({
  useDeveloperKeys: mocks.useDeveloperKeys,
  useRegisterDeveloperKey: mocks.useRegisterDeveloperKey,
  useRevokeDeveloperKey: mocks.useRevokeDeveloperKey,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

const FINGERPRINT =
  'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const SHORT_FINGERPRINT = 'a1b2c3d4e5f6…6d7e8f90'

const VALID_PEM = [
  '-----BEGIN PUBLIC KEY-----',
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtestkeymaterialtestkey',
  '-----END PUBLIC KEY-----',
].join('\n')

const activeKey: DeveloperKey = {
  id: 'key-1',
  label: 'CI 签名密钥',
  publicKey: VALID_PEM,
  keyFingerprint: FINGERPRINT,
  status: 'active',
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
  revokedAt: null,
}

const revokedKey: DeveloperKey = {
  id: 'key-2',
  label: null,
  publicKey: VALID_PEM,
  keyFingerprint: 'ff'.repeat(32),
  status: 'revoked',
  createdAt: '2026-07-01T09:00:00.000Z',
  updatedAt: '2026-08-02T09:00:00.000Z',
  revokedAt: '2026-08-02T09:00:00.000Z',
}

function listState(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      data: [activeKey, revokedKey],
      meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
    },
    isLoading: false,
    error: null,
    refetch: mocks.refetch,
    ...overrides,
  }
}

function createBadRequestError(detail: string) {
  const response = new Response(JSON.stringify({ detail }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
  const request = new Request(
    'http://localhost/api/v1/plugins/developer-keys/key-1',
    { method: 'DELETE' },
  )
  const options: NormalizedOptions = {
    method: 'DELETE',
    retry: { limit: 0 },
    prefixUrl: '',
    onDownloadProgress: undefined,
    onUploadProgress: undefined,
    context: {},
  }

  return new HTTPError(response, request, options)
}

async function openRegisterDialog(user: UserEvent) {
  const [trigger] = screen.getAllByRole('button', { name: /注册公钥/ })
  if (!trigger) {
    throw new Error('未找到「注册公钥」入口')
  }

  await user.click(trigger)

  return screen.findByRole('dialog')
}

describe('DeveloperKeysPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useDeveloperKeys.mockReturnValue(listState())
    mocks.useRegisterDeveloperKey.mockReturnValue({
      mutate: mocks.registerMutate,
      reset: mocks.registerReset,
      isPending: false,
    })
    mocks.useRevokeDeveloperKey.mockReturnValue({
      mutate: mocks.revokeMutate,
      isPending: false,
    })
  })

  it('渲染密钥的标签、指纹与状态', () => {
    render(<DeveloperKeysPage />)

    expect(screen.getByText('CI 签名密钥')).toBeInTheDocument()
    expect(screen.getByText('未命名密钥')).toBeInTheDocument()
    // 指纹列带完整值的 title，小屏另有一份短指纹跟在标签下
    expect(screen.getByTitle(FINGERPRINT)).toHaveTextContent(SHORT_FINGERPRINT)
    expect(screen.getAllByText(SHORT_FINGERPRINT)).toHaveLength(2)
    expect(screen.getByText('有效')).toBeInTheDocument()
    expect(screen.getByText('已撤销')).toBeInTheDocument()
  })

  it('加载中渲染骨架且不闪现空态', () => {
    mocks.useDeveloperKeys.mockReturnValue(
      listState({ data: undefined, isLoading: true }),
    )

    const { container } = render(<DeveloperKeysPage />)

    expect(container.querySelectorAll('.shimmer').length).toBeGreaterThan(0)
    expect(
      screen.queryByText('还没有注册开发者公钥'),
    ).not.toBeInTheDocument()
  })

  it('空列表引导注册第一个公钥', () => {
    mocks.useDeveloperKeys.mockReturnValue(
      listState({
        data: { data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      }),
    )

    render(<DeveloperKeysPage />)

    expect(screen.getByText('还没有注册开发者公钥')).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: /注册公钥/ }).length,
    ).toBeGreaterThan(1)
  })

  it('加载失败时展示错误卡片、重试入口与 toast', async () => {
    const user = userEvent.setup()
    mocks.useDeveloperKeys.mockReturnValue(
      listState({ data: undefined, error: new Error('网络不可达') }),
    )

    render(<DeveloperKeysPage />)

    expect(screen.getByText('开发者密钥加载失败')).toBeInTheDocument()
    expect(screen.getByText('网络不可达')).toBeInTheDocument()
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'error', title: '加载失败' }),
    )

    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(mocks.refetch).toHaveBeenCalled()
  })

  it('PEM 格式非法时拦在前端，不发起注册请求', async () => {
    const user = userEvent.setup()
    render(<DeveloperKeysPage />)

    const dialog = await openRegisterDialog(user)
    await user.type(within(dialog).getByLabelText('公钥（PEM）'), 'not-a-pem')
    await user.click(within(dialog).getByRole('button', { name: '注册公钥' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '-----BEGIN PUBLIC KEY----- 开头',
    )
    expect(mocks.registerMutate).not.toHaveBeenCalled()
  })

  it('粘贴私钥时给出针对性提示', async () => {
    const user = userEvent.setup()
    render(<DeveloperKeysPage />)

    const dialog = await openRegisterDialog(user)
    fireEvent.change(within(dialog).getByLabelText('公钥（PEM）'), {
      target: { value: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----' },
    })
    await user.click(within(dialog).getByRole('button', { name: '注册公钥' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '这看起来是私钥',
    )
    expect(mocks.registerMutate).not.toHaveBeenCalled()
  })

  it('注册成功后展示完整指纹', async () => {
    mocks.registerMutate.mockImplementation(
      (
        _payload: unknown,
        options?: { onSuccess?: (key: DeveloperKey) => void },
      ) => {
        options?.onSuccess?.(activeKey)
      },
    )

    const user = userEvent.setup()
    render(<DeveloperKeysPage />)

    const dialog = await openRegisterDialog(user)
    fireEvent.change(within(dialog).getByLabelText('公钥（PEM）'), {
      target: { value: VALID_PEM },
    })
    fireEvent.change(within(dialog).getByLabelText('标签（可选）'), {
      target: { value: 'CI 签名密钥' },
    })
    await user.click(within(dialog).getByRole('button', { name: '注册公钥' }))

    expect(mocks.registerMutate).toHaveBeenCalledWith(
      { publicKey: VALID_PEM, label: 'CI 签名密钥' },
      expect.anything(),
    )
    expect(
      await screen.findByTestId('developer-key-fingerprint'),
    ).toHaveTextContent(FINGERPRINT)
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success', title: '公钥已注册' }),
    )
  })

  it('注册失败以 toast 呈现服务端提示', async () => {
    mocks.registerMutate.mockImplementation(
      (
        _payload: unknown,
        options?: { onError?: (error: unknown) => void | Promise<void> },
      ) => {
        void options?.onError?.(createBadRequestError('公钥格式无效。'))
      },
    )

    const user = userEvent.setup()
    render(<DeveloperKeysPage />)

    const dialog = await openRegisterDialog(user)
    fireEvent.change(within(dialog).getByLabelText('公钥（PEM）'), {
      target: { value: VALID_PEM },
    })
    await user.click(within(dialog).getByRole('button', { name: '注册公钥' }))

    await waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'error',
          title: '注册失败',
          description: '公钥格式无效。',
        }),
      )
    })
    expect(
      screen.queryByTestId('developer-key-fingerprint'),
    ).not.toBeInTheDocument()
  })

  it('撤销需要二次确认后才发起请求', async () => {
    mocks.revokeMutate.mockImplementation(
      (_id: string, options?: { onSuccess?: () => void }) => {
        options?.onSuccess?.()
      },
    )

    const user = userEvent.setup()
    render(<DeveloperKeysPage />)

    await user.click(screen.getByRole('button', { name: '撤销 CI 签名密钥' }))

    expect(await screen.findByText('撤销开发者密钥？')).toBeInTheDocument()
    expect(mocks.revokeMutate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '确认撤销' }))

    await waitFor(() => {
      expect(mocks.revokeMutate).toHaveBeenCalledWith(
        'key-1',
        expect.anything(),
      )
    })
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success', title: '密钥已撤销' }),
    )
  })

  it('取消确认不会撤销密钥', async () => {
    const user = userEvent.setup()
    render(<DeveloperKeysPage />)

    await user.click(screen.getByRole('button', { name: '撤销 CI 签名密钥' }))
    await screen.findByText('撤销开发者密钥？')
    await user.click(screen.getByRole('button', { name: '取消' }))

    await waitFor(() => {
      expect(screen.queryByText('撤销开发者密钥？')).not.toBeInTheDocument()
    })
    expect(mocks.revokeMutate).not.toHaveBeenCalled()
  })

  it('已撤销的密钥不再提供撤销入口', () => {
    render(<DeveloperKeysPage />)

    expect(
      screen.queryByRole('button', { name: '撤销 未命名密钥' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/撤销于/)).toBeInTheDocument()
  })

  it('重复撤销的 400 以 toast 呈现服务端提示', async () => {
    mocks.revokeMutate.mockImplementation(
      (
        _id: string,
        options?: { onError?: (error: unknown) => void | Promise<void> },
      ) => {
        void options?.onError?.(createBadRequestError('密钥已撤销。'))
      },
    )

    const user = userEvent.setup()
    render(<DeveloperKeysPage />)

    await user.click(screen.getByRole('button', { name: '撤销 CI 签名密钥' }))
    await screen.findByText('撤销开发者密钥？')
    await user.click(screen.getByRole('button', { name: '确认撤销' }))

    await waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'error',
          title: '撤销失败',
          description: '密钥已撤销。',
        }),
      )
    })
  })
})

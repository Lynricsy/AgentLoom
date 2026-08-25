import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginManagementPage } from './PluginManagementPage'
import type { PluginListItem } from '../types'

const mocks = vi.hoisted(() => ({
  usePlugins: vi.fn(),
  useUpdatePluginStatus: vi.fn(),
  useDeletePlugin: vi.fn(),
  usePluginById: vi.fn(),
  useRegisterPlugin: vi.fn(),
  notify: vi.fn(),
  refetch: vi.fn(),
  authToken: 'token-owner',
  role: 'owner' as string | null,
}))

vi.mock('../api/pluginQueries', () => ({
  usePlugins: mocks.usePlugins,
  usePluginById: mocks.usePluginById,
  useActivePlugins: vi.fn(),
}))

vi.mock('../api/pluginMutations', () => ({
  useUpdatePluginStatus: mocks.useUpdatePluginStatus,
  useDeletePlugin: mocks.useDeletePlugin,
  useRegisterPlugin: mocks.useRegisterPlugin,
}))

vi.mock('@/features/auth', () => ({
  useAuthToken: () => mocks.authToken,
}))

vi.mock('@/features/intervention-policy', () => ({
  getInterventionPolicyRoleFromToken: () => mocks.role,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children?: React.ReactNode
    [key: string]: unknown
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        to,
      )}
      {...rest}
    >
      {children}
    </a>
  ),
}))

function makePlugin(overrides: Partial<PluginListItem> = {}): PluginListItem {
  return {
    id: 'plugin-1',
    pluginId: 'com.example.translate',
    name: '翻译插件',
    version: '1.2.0',
    author: 'AgentLoom Labs',
    description: '批量翻译文本',
    license: 'MIT',
    status: 'active',
    nodeDefinitions: [],
    metadata: null,
    occVersion: 3,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-02-01T08:30:00Z',
    ...overrides,
  }
}

function setup(
  options: {
    plugins?: PluginListItem[]
    isLoading?: boolean
    isError?: boolean
    total?: number
  } = {},
) {
  const {
    plugins = [makePlugin()],
    isLoading = false,
    isError = false,
    total = plugins.length,
  } = options

  const statusMutate = vi.fn()
  const deleteMutate = vi.fn()

  mocks.usePlugins.mockReturnValue({
    data: isLoading || isError ? undefined : { data: plugins, meta: { page: 1, pageSize: 20, total, totalPages: 1 } },
    isLoading,
    isError,
    refetch: mocks.refetch,
  })
  mocks.usePluginById.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  mocks.useUpdatePluginStatus.mockReturnValue({ mutate: statusMutate, isPending: false })
  mocks.useDeletePlugin.mockReturnValue({ mutate: deleteMutate, isPending: false })
  mocks.useRegisterPlugin.mockReturnValue({ mutate: vi.fn(), isPending: false })

  return { statusMutate, deleteMutate }
}

/** PluginPublishDialog 走真实 mutation hook，需要 QueryClient 在场 */
function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PluginManagementPage />
    </QueryClientProvider>,
  )
}

describe('PluginManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.role = 'owner'
    mocks.authToken = 'token-owner'
  })

  it('渲染插件列表的名称、版本、状态与来源', () => {
    setup({
      plugins: [
        makePlugin(),
        makePlugin({
          id: 'plugin-2',
          name: '市场插件',
          version: '0.9.1',
          status: 'disabled',
          metadata: { clonedFromMarketplace: { listingId: 'listing-1' } },
        }),
      ],
    })
    renderPage()

    expect(screen.getByText('翻译插件')).toBeInTheDocument()
    // 版本渲染两处：小屏并进副标题的那份 + 独立版本列，两者按断点互斥可见
    expect(screen.getAllByText('v1.2.0')).toHaveLength(2)
    expect(screen.getByText('已启用')).toBeInTheDocument()
    expect(screen.getByText('已停用')).toBeInTheDocument()
    expect(screen.getByText('本地上传')).toBeInTheDocument()
    expect(screen.getByText('市场安装')).toBeInTheDocument()
  })

  it('加载中渲染骨架行而不是空态', () => {
    setup({ plugins: [], isLoading: true })
    renderPage()

    expect(screen.queryByText('还没有注册任何插件')).not.toBeInTheDocument()
    expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(0)
  })

  it('空列表渲染引导式空态', () => {
    setup({ plugins: [] })
    renderPage()

    expect(screen.getByText('还没有注册任何插件')).toBeInTheDocument()
  })

  it('加载失败渲染错误态并可重新加载，同时提示 toast', async () => {
    setup({ plugins: [], isError: true })
    renderPage()

    expect(screen.getByText('插件列表加载失败')).toBeInTheDocument()
    await waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      )
    })

    await userEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect(mocks.refetch).toHaveBeenCalled()
  })

  it('停用已启用的插件时回传当前 occVersion', async () => {
    const { statusMutate } = setup()
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '停用 翻译插件' }))

    expect(statusMutate).toHaveBeenCalledWith(
      { id: 'plugin-1', status: 'disabled', occVersion: 3 },
      expect.anything(),
    )
  })

  it('启用已停用的插件', async () => {
    const { statusMutate } = setup({ plugins: [makePlugin({ status: 'disabled' })] })
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '启用 翻译插件' }))

    expect(statusMutate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
      expect.anything(),
    )
  })

  it('删除需要二次确认后才发起请求', async () => {
    const { deleteMutate } = setup()
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '删除 翻译插件' }))
    expect(deleteMutate).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: '删除' }))

    expect(deleteMutate).toHaveBeenCalledWith('plugin-1', expect.anything())
  })

  it('viewer 角色看不到注册入口与状态、删除操作', () => {
    mocks.role = 'viewer'
    setup()
    renderPage()

    expect(screen.queryByRole('button', { name: '注册插件' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '停用 翻译插件' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除 翻译插件' })).not.toBeInTheDocument()
  })

  it('creator 可以注册插件但不能改状态或删除', () => {
    mocks.role = 'creator'
    setup()
    renderPage()

    expect(screen.getByRole('button', { name: '注册插件' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '停用 翻译插件' })).not.toBeInTheDocument()
  })

  it('active 插件对 creator 暴露「发布到市场」入口', () => {
    mocks.role = 'creator'
    setup()
    renderPage()

    expect(
      screen.getByRole('button', { name: '发布 翻译插件 到市场' }),
    ).toBeInTheDocument()
  })

  it('非 active 插件不暴露「发布到市场」入口', () => {
    setup({ plugins: [makePlugin({ status: 'disabled' })] })
    renderPage()

    expect(
      screen.queryByRole('button', { name: '发布 翻译插件 到市场' }),
    ).not.toBeInTheDocument()
  })

  it('viewer 角色看不到「发布到市场」入口', () => {
    mocks.role = 'viewer'
    setup()
    renderPage()

    expect(
      screen.queryByRole('button', { name: '发布 翻译插件 到市场' }),
    ).not.toBeInTheDocument()
  })

  it('点击「发布到市场」打开插件发布对话框', async () => {
    setup()
    renderPage()

    await userEvent.click(
      screen.getByRole('button', { name: '发布 翻译插件 到市场' }),
    )

    const dialog = await screen.findByTestId('plugin-publish-dialog')
    expect(within(dialog).getByText('发布到市场')).toBeInTheDocument()
    expect(
      within(dialog).getByTestId('plugin-listing-title-input'),
    ).toBeInTheDocument()
  })
})

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimePluginManagementPage } from './RuntimePluginManagementPage'
import type { RuntimePluginRecord } from '../types'

const mocks = vi.hoisted(() => ({
  useRuntimePlugins: vi.fn(),
  useRuntimePlugin: vi.fn(),
  useUpdateRuntimePluginStatus: vi.fn(),
  useDeleteRuntimePlugin: vi.fn(),
  useRegisterRuntimePlugin: vi.fn(),
  notify: vi.fn(),
  refetch: vi.fn(),
  role: 'owner' as string | null,
}))

vi.mock('../api/runtimePluginQueries', () => ({
  useRuntimePlugins: mocks.useRuntimePlugins,
  useRuntimePlugin: mocks.useRuntimePlugin,
  useActiveRuntimePlugins: vi.fn(),
}))

vi.mock('../api/runtimePluginMutations', () => ({
  useUpdateRuntimePluginStatus: mocks.useUpdateRuntimePluginStatus,
  useDeleteRuntimePlugin: mocks.useDeleteRuntimePlugin,
  useRegisterRuntimePlugin: mocks.useRegisterRuntimePlugin,
}))

vi.mock('@/features/auth', () => ({
  useAuthToken: () => 'token',
}))

vi.mock('@/features/intervention-policy', () => ({
  getInterventionPolicyRoleFromToken: () => mocks.role,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

function makeRuntimePlugin(
  overrides: Partial<RuntimePluginRecord> = {},
): RuntimePluginRecord {
  return {
    id: 'rp-1',
    pluginId: 'com.example.demo-rt',
    name: 'Demo Runtime',
    version: '0.1.0',
    author: 'AgentLoom Labs',
    description: '示例 runtime 插件',
    license: 'MIT',
    status: 'active',
    configSchema: null,
    sizeBytes: 3 * 1024,
    contentHash: 'b'.repeat(64),
    installedBy: null,
    occVersion: 4,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-02T08:30:00Z',
    ...overrides,
  }
}

function setup(
  options: { plugins?: RuntimePluginRecord[]; isError?: boolean } = {},
) {
  const { plugins = [makeRuntimePlugin()], isError = false } = options
  const statusMutate = vi.fn()
  const deleteMutate = vi.fn()

  mocks.useRuntimePlugins.mockReturnValue({
    data: isError
      ? undefined
      : { data: plugins, meta: { page: 1, pageSize: 20, total: plugins.length, totalPages: 1 } },
    isLoading: false,
    isError,
    refetch: mocks.refetch,
  })
  mocks.useRuntimePlugin.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  mocks.useUpdateRuntimePluginStatus.mockReturnValue({ mutate: statusMutate, isPending: false })
  mocks.useDeleteRuntimePlugin.mockReturnValue({ mutate: deleteMutate, isPending: false })
  mocks.useRegisterRuntimePlugin.mockReturnValue({ mutate: vi.fn(), isPending: false })

  return { statusMutate, deleteMutate }
}

describe('RuntimePluginManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.role = 'owner'
  })

  it('渲染列表的名称、版本、作者、状态与大小', () => {
    setup({
      plugins: [
        makeRuntimePlugin(),
        makeRuntimePlugin({ id: 'rp-2', name: 'Other Runtime', status: 'disabled' }),
      ],
    })
    render(<RuntimePluginManagementPage />)

    expect(screen.getByRole('heading', { name: 'Runtime 插件' })).toBeInTheDocument()
    expect(screen.getByText('Demo Runtime')).toBeInTheDocument()
    expect(screen.getAllByText('v0.1.0').length).toBeGreaterThan(0)
    expect(screen.getAllByText('AgentLoom Labs')).toHaveLength(2)
    expect(screen.getByText('已启用')).toBeInTheDocument()
    expect(screen.getByText('已停用')).toBeInTheDocument()
    expect(screen.getAllByText('3 KB')).toHaveLength(2)
  })

  it('空列表渲染引导式空态', () => {
    setup({ plugins: [] })
    render(<RuntimePluginManagementPage />)

    expect(screen.getByText('还没有上传任何 runtime 插件')).toBeInTheDocument()
  })

  it('加载失败渲染错误态并提示 toast', async () => {
    setup({ isError: true })
    render(<RuntimePluginManagementPage />)

    await waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }))
    })
    await userEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect(mocks.refetch).toHaveBeenCalled()
  })

  it('点击上传按钮打开上传对话框', async () => {
    setup()
    render(<RuntimePluginManagementPage />)

    await userEvent.click(screen.getByRole('button', { name: '上传 runtime 插件' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('heading', { name: '上传 .alp runtime 插件包' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByTestId('runtime-plugin-file-input')).toBeInTheDocument()
  })

  it('停用已启用的插件时回传当前 occVersion', async () => {
    const { statusMutate } = setup()
    render(<RuntimePluginManagementPage />)

    await userEvent.click(screen.getByRole('button', { name: '停用 Demo Runtime' }))

    expect(statusMutate).toHaveBeenCalledWith(
      { id: 'rp-1', status: 'disabled', occVersion: 4 },
      expect.anything(),
    )
  })

  it('删除需要二次确认后才发起请求', async () => {
    const { deleteMutate } = setup()
    render(<RuntimePluginManagementPage />)

    await userEvent.click(screen.getByRole('button', { name: '删除 Demo Runtime' }))
    expect(deleteMutate).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: '删除' }))

    expect(deleteMutate).toHaveBeenCalledWith('rp-1', expect.anything())
  })

  it('viewer 角色看不到上传入口与启停、删除操作', () => {
    mocks.role = 'viewer'
    setup()
    render(<RuntimePluginManagementPage />)

    expect(screen.queryByRole('button', { name: '上传 runtime 插件' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '停用 Demo Runtime' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除 Demo Runtime' })).not.toBeInTheDocument()
  })
})

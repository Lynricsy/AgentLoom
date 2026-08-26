import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HTTPError, type NormalizedOptions } from 'ky'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MarketplaceListingUpgradeStatus } from '@/features/marketplace'
import { PluginDetailSheet } from './PluginDetailSheet'
import { pluginKeys } from '../api/pluginKeys'
import type { PluginRecord } from '../types'

const { getMock, postMock, mocks } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  mocks: {
    notify: vi.fn(),
    role: 'owner' as string | null,
  },
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
    patch: vi.fn(),
    delete: vi.fn(),
  },
  toSnakeBody: (value: unknown) => value,
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

const PLUGIN_DB_ID = 'plugin-1'
const LISTING_ID = 'listing-1'
const UNINSTALL_PATH = `marketplace/listings/${LISTING_ID}/uninstall`
const UPGRADE_PATH = `marketplace/listings/${LISTING_ID}/upgrade`
const UPGRADE_CHECK_PATH = `marketplace/listings/${LISTING_ID}/upgrade-check`

/**
 * 服务端写入的 JSONB key 是 `cloned_from_marketplace`，全局 ky afterResponse
 * 递归转 camelCase，因此组件读到的是 `clonedFromMarketplace`。
 */
const MARKETPLACE_METADATA = {
  clonedFromMarketplace: {
    listingId: LISTING_ID,
    listingTitle: '文本翻译插件',
    sourceTenantId: 'tenant-src',
    sourceOrgId: 'org-src',
    sourcePluginDbId: 'plugin-src',
    sourcePluginId: 'com.example.translate',
    clonedAt: '2026-03-15T08:30:00.000Z',
    upgradedAt: null,
    pricingModel: 'per_execution',
    pricePerExecution: '0.02',
    sourceVersion: '1.0.0',
    sourceContentHash: 'hash-1',
  },
}

function makePlugin(overrides: Partial<PluginRecord> = {}): PluginRecord {
  return {
    id: PLUGIN_DB_ID,
    pluginId: 'com.example.translate',
    name: '翻译插件',
    version: '1.0.0',
    author: 'AgentLoom Labs',
    description: '批量翻译文本',
    license: 'MIT',
    status: 'active',
    manifest: { name: 'translate' },
    nodeDefinitions: [],
    permissions: [],
    metadata: null,
    occVersion: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-03-15T08:30:00.000Z',
    ...overrides,
  }
}

function makeUpgradeStatus(
  overrides: Partial<MarketplaceListingUpgradeStatus> = {},
): MarketplaceListingUpgradeStatus {
  return {
    installed: true,
    upgradeAvailable: true,
    installedPluginDbId: PLUGIN_DB_ID,
    currentVersion: '1.0.0',
    latestVersion: '2.0.0',
    reason: 'upgrade_available',
    ...overrides,
  }
}

function makeHttpError(status: number, body: unknown): HTTPError {
  const request = new Request(`http://localhost/api/v1/${UPGRADE_PATH}`)
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })

  return new HTTPError(response, request, {} as NormalizedOptions)
}

function setup(
  options: {
    plugin?: PluginRecord
    upgrade?: MarketplaceListingUpgradeStatus
  } = {},
) {
  const { plugin = makePlugin({ metadata: MARKETPLACE_METADATA }), upgrade } =
    options

  getMock.mockImplementation((url: string) => ({
    json: async () => {
      if (url === `plugins/${PLUGIN_DB_ID}`) {
        return { data: plugin }
      }
      if (url === UPGRADE_CHECK_PATH) {
        return upgrade ?? makeUpgradeStatus()
      }
      throw new Error(`unexpected GET ${url}`)
    },
  }))

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <PluginDetailSheet pluginId={PLUGIN_DB_ID} onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  )

  return { ...rendered, invalidateSpy }
}

async function findSourceSection(): Promise<HTMLElement> {
  return screen.findByTestId('plugin-marketplace-source')
}

describe('PluginDetailSheet 市场来源区块', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.role = 'owner'
  })

  it('非市场安装的插件不渲染来源区块', async () => {
    setup({ plugin: makePlugin({ metadata: null }) })

    expect(await screen.findByText('批量翻译文本')).toBeInTheDocument()
    expect(
      screen.queryByTestId('plugin-marketplace-source'),
    ).not.toBeInTheDocument()
    expect(getMock).not.toHaveBeenCalledWith(UPGRADE_CHECK_PATH)
  })

  it('渲染上架名称、安装时间与安装时计费口径', async () => {
    setup()

    const section = await findSourceSection()
    expect(within(section).getByText('文本翻译插件')).toBeInTheDocument()
    expect(within(section).getByText('$0.02/次')).toBeInTheDocument()
    expect(within(section).getByText(/2026\/03\/15/)).toBeInTheDocument()
    expect(within(section).queryByText('最近升级')).not.toBeInTheDocument()
  })

  it('有升级记录时展示最近升级时间', async () => {
    setup({
      plugin: makePlugin({
        metadata: {
          clonedFromMarketplace: {
            ...MARKETPLACE_METADATA.clonedFromMarketplace,
            upgradedAt: '2026-04-02T01:00:00.000Z',
          },
        },
      }),
    })

    const section = await findSourceSection()
    expect(within(section).getByText('最近升级')).toBeInTheDocument()
    expect(within(section).getByText(/2026\/04\/02/)).toBeInTheDocument()
  })

  it('快照字段缺失时降级为「未记录」而不是 undefined 或 Invalid Date', async () => {
    setup({
      plugin: makePlugin({
        metadata: {
          clonedFromMarketplace: {
            listingId: LISTING_ID,
            listingTitle: '',
            clonedAt: '',
          },
        },
      }),
    })

    const section = await findSourceSection()
    expect(within(section).getByText('未记录上架名称')).toBeInTheDocument()
    expect(within(section).getAllByText('未记录')).toHaveLength(2)
    expect(section.textContent).not.toContain('Invalid Date')
    expect(section.textContent).not.toContain('undefined')
  })

  it('metadata 里没有 listingId 时视同非市场安装', async () => {
    setup({
      plugin: makePlugin({
        metadata: { clonedFromMarketplace: { listingTitle: '缺 id' } },
      }),
    })

    expect(await screen.findByText('批量翻译文本')).toBeInTheDocument()
    expect(
      screen.queryByTestId('plugin-marketplace-source'),
    ).not.toBeInTheDocument()
  })

  it('creator 既看不到卸载也拿不到升级按钮，只看到新版本提示', async () => {
    mocks.role = 'creator'
    setup()

    const section = await findSourceSection()
    expect(
      within(section).queryByTestId('plugin-uninstall-btn'),
    ).not.toBeInTheDocument()
    expect(
      await within(section).findByText(/有新版本 v2\.0\.0/),
    ).toBeInTheDocument()
    expect(
      within(section).queryByTestId('plugin-upgrade-btn'),
    ).not.toBeInTheDocument()
  })

  it('admin 同时拿到卸载与升级入口', async () => {
    mocks.role = 'admin'
    setup()

    const section = await findSourceSection()
    expect(within(section).getByTestId('plugin-uninstall-btn')).toBeInTheDocument()
    expect(
      await within(section).findByTestId('plugin-upgrade-btn'),
    ).toBeInTheDocument()
  })

  it('viewer 既看不到卸载也不查升级', async () => {
    mocks.role = 'viewer'
    setup()

    const section = await findSourceSection()
    expect(
      within(section).queryByTestId('plugin-uninstall-btn'),
    ).not.toBeInTheDocument()
    expect(
      within(section).queryByTestId('plugin-upgrade-status'),
    ).not.toBeInTheDocument()
    expect(getMock).not.toHaveBeenCalledWith(UPGRADE_CHECK_PATH)
  })

  it('卸载需要二次确认，确认后调用 uninstall 端点并失效插件缓存', async () => {
    postMock.mockReturnValue({
      json: async () => ({
        disabledPluginDbIds: ['plugin-1', 'plugin-2'],
        message: '已停用 2 个来自该 listing 的插件副本',
      }),
    })
    const { invalidateSpy } = setup()

    const section = await findSourceSection()
    await userEvent.click(within(section).getByTestId('plugin-uninstall-btn'))
    expect(postMock).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: '停用副本' }))

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(UNINSTALL_PATH)
    })
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pluginKeys.all })
    })
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'success',
        description: expect.stringContaining('已停用 2 个'),
      }),
    )
  })

  it('没有可停用副本时提示幂等结果', async () => {
    postMock.mockReturnValue({
      json: async () => ({
        disabledPluginDbIds: [],
        message: '当前租户没有来自该 listing 的已安装插件',
      }),
    })
    setup()

    const section = await findSourceSection()
    await userEvent.click(within(section).getByTestId('plugin-uninstall-btn'))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: '停用副本' }))

    await waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'warning' }),
      )
    })
  })

  it('卸载失败展示服务端 detail', async () => {
    postMock.mockReturnValue({
      json: () => Promise.reject(makeHttpError(403, { detail: '没有权限卸载' })),
    })
    setup()

    const section = await findSourceSection()
    await userEvent.click(within(section).getByTestId('plugin-uninstall-btn'))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: '停用副本' }))

    await waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'error',
          description: '没有权限卸载',
        }),
      )
    })
  })

  it('upgrade_available 渲染升级按钮与当前版本', async () => {
    setup()

    const section = await findSourceSection()
    expect(
      await within(section).findByRole('button', { name: /升级到 v2\.0\.0/ }),
    ).toBeInTheDocument()
    expect(within(section).getByText('当前 v1.0.0')).toBeInTheDocument()
  })

  it('up_to_date 展示带当前版本号的静态文案', async () => {
    setup({
      upgrade: makeUpgradeStatus({
        reason: 'up_to_date',
        upgradeAvailable: false,
        latestVersion: '1.0.0',
      }),
    })

    const section = await findSourceSection()
    expect(
      await within(section).findByText('已是最新版本 v1.0.0。'),
    ).toBeInTheDocument()
    expect(
      within(section).queryByTestId('plugin-upgrade-btn'),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['source_unavailable', '源上架已下架或源插件已停用，无法升级。'],
    ['source_replaced', '该上架已换绑到其他插件，无法原地升级。'],
  ] as const)('%s 只提示文案不给升级按钮', async (reason, message) => {
    setup({
      upgrade: makeUpgradeStatus({ reason, upgradeAvailable: false }),
    })

    const section = await findSourceSection()
    expect(await within(section).findByText(message)).toBeInTheDocument()
    expect(
      within(section).queryByTestId('plugin-upgrade-btn'),
    ).not.toBeInTheDocument()
  })

  it('not_installed 不展示升级入口', async () => {
    setup({
      upgrade: makeUpgradeStatus({
        installed: false,
        upgradeAvailable: false,
        installedPluginDbId: null,
        currentVersion: null,
        latestVersion: null,
        reason: 'not_installed',
      }),
    })

    const section = await findSourceSection()
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith(UPGRADE_CHECK_PATH)
    })
    expect(
      within(section).queryByTestId('plugin-upgrade-status'),
    ).not.toBeInTheDocument()
    expect(
      within(section).queryByTestId('plugin-upgrade-btn'),
    ).not.toBeInTheDocument()
  })

  it('无升级权限的 operator 只看到新版本提示', async () => {
    mocks.role = 'operator'
    setup()

    const section = await findSourceSection()
    expect(
      await within(section).findByText(/有新版本 v2\.0\.0/),
    ).toBeInTheDocument()
    expect(
      within(section).queryByTestId('plugin-upgrade-btn'),
    ).not.toBeInTheDocument()
  })

  it('升级成功后失效插件缓存并提示版本变化', async () => {
    postMock.mockReturnValue({
      json: async () => ({
        pluginDbId: PLUGIN_DB_ID,
        pluginId: 'com.example.translate',
        fromVersion: '1.0.0',
        toVersion: '2.0.0',
        message: '已升级到版本 2.0.0',
      }),
    })
    const { invalidateSpy } = setup()

    const section = await findSourceSection()
    await userEvent.click(
      await within(section).findByTestId('plugin-upgrade-btn'),
    )

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(UPGRADE_PATH)
    })
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pluginKeys.all })
    })
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'success',
        description: expect.stringContaining('v1.0.0 → v2.0.0'),
      }),
    )
  })

  it('升级失败展示服务端 problem+json 的 detail', async () => {
    postMock.mockReturnValue({
      json: () =>
        Promise.reject(
          makeHttpError(409, {
            detail: '该 listing 当前绑定的插件已换为 com.other.plugin，无法升级',
          }),
        ),
    })
    setup()

    const section = await findSourceSection()
    await userEvent.click(
      await within(section).findByTestId('plugin-upgrade-btn'),
    )

    await waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'error',
          description: '该 listing 当前绑定的插件已换为 com.other.plugin，无法升级',
        }),
      )
    })
  })
})

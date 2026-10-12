import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HTTPError, type NormalizedOptions } from 'ky'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as LlmFeature from '@/features/llm'
import type { LlmModelInfo } from '@/features/llm'

const { installListingMock, navigateMock, notifyMock, useUsableChatModelsMock } = vi.hoisted(() => ({
  installListingMock: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  navigateMock: vi.fn(),
  notifyMock: vi.fn(),
  useUsableChatModelsMock: vi.fn(),
}))

vi.mock('@/features/llm', async (importOriginal) => ({
  ...(await importOriginal<typeof LlmFeature>()),
  useUsableChatModels: useUsableChatModelsMock,
}))

function makeHttpError(status: number, data?: unknown): HTTPError {
  const request = new Request('http://localhost/api/v1/marketplace/listings/listing-1/install')
  const error = new HTTPError(new Response(null, { status }), request, {} as NormalizedOptions)
  error.data = data
  return error
}

vi.mock('../../api/publicMarketplaceMutations', () => ({
  useInstallListing: () => installListingMock,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string
    children?: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}))

const { MarketplaceInstallDialog } = await import('../MarketplaceInstallDialog')

describe('MarketplaceInstallDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installListingMock.mutateAsync = vi.fn()
    installListingMock.isPending = false
    useUsableChatModelsMock.mockReturnValue({
      data: [
        {
          id: 'model-claude',
          name: 'Claude Sonnet',
          modelType: 'chat',
          isEnabled: true,
          isDefault: false,
          providerEntity: { name: 'Anthropic', isEnabled: true },
        } as LlmModelInfo,
      ],
      isSuccess: true,
    })
  })

  it('pre-fills the form with listing data', () => {
    render(
      <MarketplaceInstallDialog
        listingId="listing-1"
        listingTitle="Agent Workflow"
        listingSummary="Install this workflow into your workspace."
        listingType="workflow"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('工作流名称')).toHaveValue('Agent Workflow')
    expect(screen.getByLabelText(/描述/)).toHaveValue(
      'Install this workflow into your workspace.',
    )
  })

  it('submits install request and navigates on success for workflow', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    installListingMock.mutateAsync.mockResolvedValue({
      workflowDefinitionId: 'workflow-1',
      name: 'Agent Workflow',
      message: 'Workflow installed successfully',
    })

    render(
      <MarketplaceInstallDialog
        listingId="listing-1"
        listingTitle="Agent Workflow"
        listingSummary="Install this workflow into your workspace."
        listingType="workflow"
        open={true}
        onOpenChange={onOpenChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '确认安装' }))

    await waitFor(() => {
        expect(installListingMock.mutateAsync).toHaveBeenCalledWith({
          id: 'listing-1',
          body: {
            name: 'Agent Workflow',
            description: 'Install this workflow into your workspace.',
          },
        })
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '安装成功',
        variant: 'success',
      }),
    )
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/workflows/$workflowId',
      params: { workflowId: 'workflow-1' },
    })
  })

  it('workflow 安装选择备用模型时发送 modelConfigId，自动时不发送', async () => {
    const user = userEvent.setup()
    installListingMock.mutateAsync.mockResolvedValue({
      workflowDefinitionId: 'workflow-1',
      name: 'Agent Workflow',
      message: 'Workflow installed successfully',
    })

    const { unmount } = render(
      <MarketplaceInstallDialog
        listingId="listing-1"
        listingTitle="Agent Workflow"
        listingType="workflow"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '确认安装' }))
    await waitFor(() => expect(installListingMock.mutateAsync).toHaveBeenCalledTimes(1))
    expect(installListingMock.mutateAsync.mock.calls[0]?.[0]?.body?.modelConfigId).toBeUndefined()
    unmount()

    render(
      <MarketplaceInstallDialog
        listingId="listing-1"
        listingTitle="Agent Workflow"
        listingType="workflow"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('combobox', { name: /备用模型/ }))
    await user.click(await screen.findByRole('option', { name: /Claude Sonnet/ }))
    await user.click(screen.getByRole('button', { name: '确认安装' }))

    await waitFor(() => expect(installListingMock.mutateAsync).toHaveBeenCalledTimes(2))
    expect(installListingMock.mutateAsync).toHaveBeenNthCalledWith(2, {
      id: 'listing-1',
      body: {
        name: 'Agent Workflow',
        modelConfigId: 'model-claude',
      },
    })
  })

  it('plugin 安装成功后停在成功态并给出插件管理入口', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    installListingMock.mutateAsync.mockResolvedValue({
      pluginDbId: 'plugin-db-1',
      pluginId: 'text-uppercase',
      name: 'Text Uppercase',
      message: 'Plugin installed successfully',
    })

    render(
      <MarketplaceInstallDialog
        listingId="listing-plugin-1"
        listingTitle="Text Uppercase"
        listingSummary="Converts text to uppercase."
        listingType="plugin"
        open={true}
        onOpenChange={onOpenChange}
      />,
    )

    expect(screen.getByText('安装 Marketplace 插件')).toBeInTheDocument()
    expect(screen.getByLabelText('插件名称')).toHaveValue('Text Uppercase')

    await user.click(screen.getByRole('button', { name: '确认安装' }))

    await waitFor(() => {
      expect(installListingMock.mutateAsync).toHaveBeenCalledWith({
        id: 'listing-plugin-1',
        body: {
          name: 'Text Uppercase',
          description: 'Converts text to uppercase.',
        },
      })
    })

    // 插件不跳画布：留在成功态，给用户一个「前往插件管理」的去处
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByTestId('plugin-install-success')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '前往插件管理' }),
    ).toHaveAttribute('href', '/resources/plugins')
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '安装成功',
        variant: 'success',
      }),
    )
    expect(navigateMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '完成' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('plugin listing 不展示备用模型，也不加载模型列表', () => {
    render(
      <MarketplaceInstallDialog
        listingId="listing-plugin-1"
        listingTitle="Text Uppercase"
        listingType="plugin"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('install-fallback-model-select')).not.toBeInTheDocument()
    expect(useUsableChatModelsMock).toHaveBeenCalledWith({ enabled: false })
  })

  it('shows the server problem detail when installation fails', async () => {
    const user = userEvent.setup()
    installListingMock.mutateAsync.mockRejectedValue(
      makeHttpError(422, { detail: '所选模型不可用，请换一个对话模型' }),
    )

    render(
      <MarketplaceInstallDialog
        listingId="listing-1"
        listingTitle="Agent Workflow"
        listingSummary="Install this workflow into your workspace."
        listingType="workflow"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '确认安装' }))

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '安装失败',
          description: '所选模型不可用，请换一个对话模型',
          variant: 'error',
        }),
      )
    })

    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('shows plugin-specific error toast when plugin installation fails', async () => {
    const user = userEvent.setup()
    installListingMock.mutateAsync.mockRejectedValue(makeHttpError(500))

    render(
      <MarketplaceInstallDialog
        listingId="listing-plugin-1"
        listingTitle="Text Uppercase"
        listingType="plugin"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '确认安装' }))

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '安装失败',
          description: '无法安装这个插件，请稍后重试。',
          variant: 'error',
        }),
      )
    })
  })

  it('clicking cancel closes the dialog', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <MarketplaceInstallDialog
        listingId="listing-1"
        listingTitle="Agent Workflow"
        listingSummary="Install this workflow into your workspace."
        listingType="workflow"
        open={true}
        onOpenChange={onOpenChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

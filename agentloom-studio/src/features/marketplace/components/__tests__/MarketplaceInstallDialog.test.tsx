import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { installListingMock, navigateMock, notifyMock } = vi.hoisted(() => ({
  installListingMock: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  navigateMock: vi.fn(),
  notifyMock: vi.fn(),
}))

vi.mock('../../api/publicMarketplaceMutations', () => ({
  useInstallListing: () => installListingMock,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
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

  it('submits install request for plugin without navigating to workflow', async () => {
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

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '安装成功',
        variant: 'success',
      }),
    )
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('shows an error toast when installation fails', async () => {
    const user = userEvent.setup()
    installListingMock.mutateAsync.mockRejectedValue(new Error('install failed'))

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
          variant: 'error',
        }),
      )
    })

    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('shows plugin-specific error toast when plugin installation fails', async () => {
    const user = userEvent.setup()
    installListingMock.mutateAsync.mockRejectedValue(new Error('install failed'))

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

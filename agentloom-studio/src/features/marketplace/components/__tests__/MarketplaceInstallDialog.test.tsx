import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@radix-ui/react-dialog', async () => {
  const React = await import('react')
  const { Fragment, createContext, useContext, cloneElement, isValidElement } = React

  const DialogContext = createContext<{
    onOpenChange?: (open: boolean) => void
  } | null>(null)

  function Root({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean
    onOpenChange?: (open: boolean) => void
    children?: React.ReactNode
  }) {
    if (!open) {
      return null
    }

    return React.createElement(
      DialogContext.Provider,
      { value: { onOpenChange } },
      children,
    )
  }

  function Portal({ children }: { children?: React.ReactNode }) {
    return React.createElement(Fragment, null, children)
  }

  function Overlay(props: Record<string, unknown>) {
    return React.createElement('div', props)
  }

  function Content(props: Record<string, unknown>) {
    return React.createElement('div', { role: 'dialog', ...props })
  }

  function Title(props: Record<string, unknown>) {
    return React.createElement('h2', props)
  }

  function Description(props: Record<string, unknown>) {
    return React.createElement('p', props)
  }

  type CloseChildProps = {
    onClick?: React.MouseEventHandler
  }

  function Close({
    asChild,
    children,
  }: {
    asChild?: boolean
    children?: React.ReactNode
  }) {
    const ctx = useContext(DialogContext)
    const onOpenChange = ctx?.onOpenChange

    if (asChild && isValidElement<CloseChildProps>(children)) {
      const child = children
      return cloneElement(child, {
        onClick: (event: React.MouseEvent) => {
          child.props.onClick?.(event)
          onOpenChange?.(false)
        },
      })
    }

    return React.createElement(
      'button',
      { type: 'button', onClick: () => onOpenChange?.(false) },
      children,
    )
  }

  return { Root, Portal, Overlay, Content, Title, Description, Close }
})

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
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('工作流名称')).toHaveValue('Agent Workflow Copy')
    expect(screen.getByLabelText(/描述/)).toHaveValue(
      'Install this workflow into your workspace.',
    )
  })

  it('submits install request and navigates on success', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    installListingMock.mutateAsync.mockResolvedValue({
      id: 'workflow-1',
      name: 'Agent Workflow Copy',
      slug: 'agent-workflow-copy',
    })

    render(
      <MarketplaceInstallDialog
        listingId="listing-1"
        listingTitle="Agent Workflow"
        listingSummary="Install this workflow into your workspace."
        open={true}
        onOpenChange={onOpenChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '一键使用' }))

    await waitFor(() => {
      expect(installListingMock.mutateAsync).toHaveBeenCalledWith({
        id: 'listing-1',
        body: {
          name: 'Agent Workflow Copy',
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

  it('shows an error toast when installation fails', async () => {
    const user = userEvent.setup()
    installListingMock.mutateAsync.mockRejectedValue(new Error('install failed'))

    render(
      <MarketplaceInstallDialog
        listingId="listing-1"
        listingTitle="Agent Workflow"
        listingSummary="Install this workflow into your workspace."
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '一键使用' }))

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

  it('clicking cancel closes the dialog', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <MarketplaceInstallDialog
        listingId="listing-1"
        listingTitle="Agent Workflow"
        listingSummary="Install this workflow into your workspace."
        open={true}
        onOpenChange={onOpenChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

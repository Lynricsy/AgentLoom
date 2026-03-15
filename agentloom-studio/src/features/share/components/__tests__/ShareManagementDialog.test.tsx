import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ShareRecord } from '../../types'

// --- Radix Dialog mock ---
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
    if (!open) return null
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

  type CloseChildProps = { onClick?: React.MouseEventHandler }
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

// --- hoisted mocks ---
const { shareListMock, createShareMock, revokeShareMock, notifyMock } =
  vi.hoisted(() => ({
    shareListMock: {
      data: undefined as { data: ShareRecord[] } | undefined,
      isLoading: false,
    },
    createShareMock: {
      mutateAsync: vi.fn(),
      isPending: false,
      reset: vi.fn(),
    },
    revokeShareMock: {
      mutateAsync: vi.fn(),
      isPending: false,
    },
    notifyMock: vi.fn(),
  }))

vi.mock('../../api/shareQueries', () => ({
  useShareList: () => shareListMock,
}))

vi.mock('../../api/shareMutations', () => ({
  useCreateShare: () => createShareMock,
  useRevokeShare: () => revokeShareMock,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}))

// --- import after mocks ---
const { ShareManagementDialog } = await import('../ShareManagementDialog')

// --- helpers ---
function makeShare(overrides: Partial<ShareRecord> = {}): ShareRecord {
  return {
    id: 'share-1',
    workflowDefinitionId: 'test-wf-id',
    shareToken: 'tok-abc',
    shareType: 'read_only',
    shareUrl: 'https://app.example.com/s/tok-abc',
    viewCount: 10,
    copyCount: 3,
    isRevoked: false,
    expiresAt: null,
    createdAt: '2026-03-10T08:00:00.000Z',
    createdBy: 'user-1',
    ...overrides,
  }
}

describe('ShareManagementDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shareListMock.data = undefined
    shareListMock.isLoading = false
    createShareMock.mutateAsync = vi.fn()
    createShareMock.isPending = false
    createShareMock.reset = vi.fn()
    revokeShareMock.mutateAsync = vi.fn()
    revokeShareMock.isPending = false

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
  })

  it('renders dialog content when open=true', () => {
    shareListMock.data = { data: [] }
    render(
      <ShareManagementDialog
        open={true}
        onOpenChange={vi.fn()}
        workflowId="test-wf-id"
      />,
    )
    expect(screen.getByTestId('share-management-dialog')).toBeInTheDocument()
    expect(screen.getByText('分享管理')).toBeInTheDocument()
  })

  it('does not render when open=false', () => {
    render(
      <ShareManagementDialog
        open={false}
        onOpenChange={vi.fn()}
        workflowId="test-wf-id"
      />,
    )
    expect(screen.queryByTestId('share-management-dialog')).not.toBeInTheDocument()
  })

  it('shows empty state when no shares exist', () => {
    shareListMock.data = { data: [] }
    render(
      <ShareManagementDialog
        open={true}
        onOpenChange={vi.fn()}
        workflowId="test-wf-id"
      />,
    )
    expect(screen.getByText('暂无分享链接')).toBeInTheDocument()
  })

  it('renders share items with URL, view/copy counts, dates', () => {
    shareListMock.data = {
      data: [
        makeShare({ viewCount: 42, copyCount: 7 }),
      ],
    }
    render(
      <ShareManagementDialog
        open={true}
        onOpenChange={vi.fn()}
        workflowId="test-wf-id"
      />,
    )

    const item = screen.getByTestId('share-item')
    expect(item).toBeInTheDocument()
    expect(within(item).getByText('42')).toBeInTheDocument()
    expect(within(item).getByText('7')).toBeInTheDocument()
    expect(item).toHaveTextContent('app.example.com')
  })

  it('renders revoked shares with revoked status badge', () => {
    shareListMock.data = {
      data: [
        makeShare({ id: 's1', isRevoked: true }),
        makeShare({ id: 's2', isRevoked: false }),
      ],
    }
    render(
      <ShareManagementDialog
        open={true}
        onOpenChange={vi.fn()}
        workflowId="test-wf-id"
      />,
    )
    expect(screen.getAllByTestId('share-item')).toHaveLength(2)
    expect(screen.getByTestId('share-status-revoked')).toBeInTheDocument()
  })

  it('creates read_only share and calls mutateAsync with correct payload', async () => {
    const user = userEvent.setup()
    shareListMock.data = { data: [] }
    createShareMock.mutateAsync.mockResolvedValue(
      makeShare({ shareUrl: 'https://app.example.com/s/new-tok' }),
    )

    render(
      <ShareManagementDialog
        open={true}
        onOpenChange={vi.fn()}
        workflowId="test-wf-id"
      />,
    )

    await user.click(screen.getByTestId('btn-create-share'))

    expect(createShareMock.mutateAsync).toHaveBeenCalledWith({
      workflowDefinitionId: 'test-wf-id',
      shareType: 'read_only',
    })
  })

  it('creates copyable share after selecting copyable type', async () => {
    const user = userEvent.setup()
    shareListMock.data = { data: [] }
    createShareMock.mutateAsync.mockResolvedValue(
      makeShare({ shareType: 'copyable', shareUrl: 'https://app.example.com/s/new-tok' }),
    )

    render(
      <ShareManagementDialog
        open={true}
        onOpenChange={vi.fn()}
        workflowId="test-wf-id"
      />,
    )

    await user.click(screen.getByTestId('share-type-copyable'))
    await user.click(screen.getByTestId('btn-create-share'))

    expect(createShareMock.mutateAsync).toHaveBeenCalledWith({
      workflowDefinitionId: 'test-wf-id',
      shareType: 'copyable',
    })
  })

  it('creates share with preset expiry and maps it to expiresAt', async () => {
    const user = userEvent.setup()
    shareListMock.data = { data: [] }
    createShareMock.mutateAsync.mockResolvedValue(
      makeShare({ shareUrl: 'https://app.example.com/s/new-tok' }),
    )

    render(
      <ShareManagementDialog
        open={true}
        onOpenChange={vi.fn()}
        workflowId="test-wf-id"
      />,
    )

    await user.click(screen.getByTestId('share-expiry-7d'))
    await user.click(screen.getByTestId('btn-create-share'))

    expect(createShareMock.mutateAsync).toHaveBeenCalledWith({
      workflowDefinitionId: 'test-wf-id',
      shareType: 'read_only',
      expiresAt: expect.any(String),
    })
  })

  it('two-step revoke: click revoke → shows confirm/cancel → confirm calls mutateAsync', async () => {
    const user = userEvent.setup()
    shareListMock.data = { data: [makeShare({ id: 'share-to-revoke' })] }
    revokeShareMock.mutateAsync.mockResolvedValue(undefined)

    render(
      <ShareManagementDialog
        open={true}
        onOpenChange={vi.fn()}
        workflowId="test-wf-id"
      />,
    )

    await user.click(screen.getByTestId('btn-revoke-share'))

    expect(screen.getByTestId('btn-confirm-revoke')).toBeInTheDocument()
    expect(screen.getByTestId('btn-cancel-revoke')).toBeInTheDocument()

    await user.click(screen.getByTestId('btn-confirm-revoke'))

    expect(revokeShareMock.mutateAsync).toHaveBeenCalledWith('share-to-revoke')
  })

  it('cancel revoke: click cancel → reverts to normal state', async () => {
    const user = userEvent.setup()
    shareListMock.data = { data: [makeShare()] }

    render(
      <ShareManagementDialog
        open={true}
        onOpenChange={vi.fn()}
        workflowId="test-wf-id"
      />,
    )

    await user.click(screen.getByTestId('btn-revoke-share'))
    expect(screen.getByTestId('btn-confirm-revoke')).toBeInTheDocument()

    await user.click(screen.getByTestId('btn-cancel-revoke'))

    expect(screen.getByTestId('btn-revoke-share')).toBeInTheDocument()
    expect(screen.queryByTestId('btn-confirm-revoke')).not.toBeInTheDocument()
  })

  it('copies share URL to clipboard on btn-copy-share-url click', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })

    shareListMock.data = {
      data: [makeShare({ shareUrl: 'https://app.example.com/s/test-tok' })],
    }

    render(
      <ShareManagementDialog
        open={true}
        onOpenChange={vi.fn()}
        workflowId="test-wf-id"
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-copy-share-url'))
    })

    expect(writeTextMock).toHaveBeenCalledWith(
      'https://app.example.com/s/test-tok',
    )
  })
})

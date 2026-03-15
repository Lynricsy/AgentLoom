import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PublicShareData } from '../../types'

// --- hoisted mocks ---
const { publicShareMock, copyShareMock, navigateMock, notifyMock } =
  vi.hoisted(() => ({
    publicShareMock: {
      data: undefined as PublicShareData | undefined,
      isLoading: false,
      error: null as unknown,
    },
    copyShareMock: {
      mutate: vi.fn(),
      isPending: false,
    },
    navigateMock: vi.fn(),
    notifyMock: vi.fn(),
  }))

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ token: 'test-token' }),
  useNavigate: () => navigateMock,
}))

vi.mock('../../api/shareQueries', () => ({
  usePublicShare: () => publicShareMock,
}))

vi.mock('../../api/shareMutations', () => ({
  useCopyShare: () => copyShareMock,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}))

vi.mock('@/shared/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: Record<string, unknown>) => (
    <div data-testid="reactflow-canvas" {...props} />
  ),
  Background: () => <div data-testid="reactflow-background" />,
  Controls: () => <div data-testid="reactflow-controls" />,
  MiniMap: () => <div data-testid="reactflow-minimap" />,
}))

vi.mock('@xyflow/react/dist/style.css', () => ({}))

const { PublicSharePage } = await import('../PublicSharePage')

// --- helpers ---
function makePublicShareData(
  overrides: Partial<PublicShareData> = {},
): PublicShareData {
  return {
    token: 'test-token',
    shareType: 'read_only',
    workflowName: 'Test Workflow',
    workflowDescription: 'A test workflow description',
    definition: {
      nodes: [{ id: 'n1', type: 'default', position: { x: 0, y: 0 }, data: {} }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    createdAt: '2026-03-10T08:00:00.000Z',
    expiresAt: null,
    ...overrides,
  }
}

describe('PublicSharePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publicShareMock.data = undefined
    publicShareMock.isLoading = false
    publicShareMock.error = null
    copyShareMock.mutate = vi.fn()
    copyShareMock.isPending = false
  })

  it('shows loading state while data is loading', () => {
    publicShareMock.isLoading = true
    render(<PublicSharePage />)

    expect(screen.getByText('加载分享内容...')).toBeInTheDocument()
  })

  it('renders workflow name, description, and ReactFlow canvas when data loaded', () => {
    publicShareMock.data = makePublicShareData()
    render(<PublicSharePage />)

    expect(screen.getByText('Test Workflow')).toBeInTheDocument()
    expect(screen.getByText('A test workflow description')).toBeInTheDocument()
    expect(screen.getByTestId('reactflow-canvas')).toBeInTheDocument()
  })

  it('shows "仅查看" badge for read_only shares', () => {
    publicShareMock.data = makePublicShareData({ shareType: 'read_only' })
    render(<PublicSharePage />)

    expect(screen.getByText('仅查看')).toBeInTheDocument()
  })

  it('shows "可复制" badge + copy button for copyable shares', () => {
    publicShareMock.data = makePublicShareData({ shareType: 'copyable' })
    render(<PublicSharePage />)

    expect(screen.getByText('可复制')).toBeInTheDocument()
    expect(screen.getByTestId('btn-copy-to-workspace')).toBeInTheDocument()
  })

  it('does not show copy button for read_only shares', () => {
    publicShareMock.data = makePublicShareData({ shareType: 'read_only' })
    render(<PublicSharePage />)

    expect(screen.queryByTestId('btn-copy-to-workspace')).not.toBeInTheDocument()
  })

  it('shows expiry info when expiresAt is set', () => {
    publicShareMock.data = makePublicShareData({
      expiresAt: '2026-06-01T00:00:00.000Z',
    })
    render(<PublicSharePage />)

    expect(screen.getByText(/有效期至/)).toBeInTheDocument()
  })

  it('does not show expiry info when expiresAt is null', () => {
    publicShareMock.data = makePublicShareData({ expiresAt: null })
    render(<PublicSharePage />)

    expect(screen.queryByText(/有效期至/)).not.toBeInTheDocument()
  })

  it('shows 404 error state when share not found', () => {
    publicShareMock.error = { response: { status: 404 } }
    render(<PublicSharePage />)

    expect(screen.getByText('分享链接不存在')).toBeInTheDocument()
  })

  it('shows 410 error state when share expired/revoked', () => {
    publicShareMock.error = { response: { status: 410 } }
    render(<PublicSharePage />)

    expect(screen.getByText('分享链接已过期')).toBeInTheDocument()
  })

  it('shows generic error for other error codes', () => {
    publicShareMock.error = { response: { status: 500 } }
    render(<PublicSharePage />)

    expect(screen.getByText('加载失败')).toBeInTheDocument()
  })

  it('calls copyMutation.mutate when copy button is clicked', async () => {
    const user = userEvent.setup()
    publicShareMock.data = makePublicShareData({ shareType: 'copyable' })

    render(<PublicSharePage />)

    await user.click(screen.getByTestId('btn-copy-to-workspace'))

    expect(copyShareMock.mutate).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
  })
})

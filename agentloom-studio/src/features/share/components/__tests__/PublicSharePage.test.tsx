import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PublicShareData } from '../../types'

// --- hoisted mocks ---
const {
  publicShareMock,
  createWorkflowMock,
  importAgentShareMock,
  navigateMock,
  notifyMock,
} = vi.hoisted(() => ({
  publicShareMock: {
    data: undefined as PublicShareData | undefined,
    isLoading: false,
    error: null as unknown,
  },
  createWorkflowMock: {
    mutate: vi.fn(),
    isPending: false,
  },
  importAgentShareMock: {
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

vi.mock('@/features/workflow', () => ({
  useCreateWorkflow: () => createWorkflowMock,
}))

vi.mock('../../api/shareMutations', () => ({
  useImportAgentShare: () => importAgentShareMock,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}))

vi.mock('@/shared/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: Record<string, unknown>) => (
    <div
      data-testid={
        (props['data-testid'] as string | undefined) ?? 'reactflow-canvas'
      }
      data-node-types={
        Array.isArray(props.nodes)
          ? props.nodes
              .map((node) => (node as { type?: string }).type ?? '')
              .join(',')
          : ''
      }
      data-edge-types={
        Array.isArray(props.edges)
          ? props.edges
              .map((edge) => (edge as { type?: string }).type ?? '')
              .join(',')
          : ''
      }
    />
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  Background: () => <div data-testid="reactflow-background" />,
  BackgroundVariant: { Dots: 'dots' },
  Controls: () => <div data-testid="reactflow-controls" />,
  MiniMap: () => <div data-testid="reactflow-minimap" />,
}))

const { PublicSharePage } = await import('../PublicSharePage')

// --- helpers ---
function makePublicShareData(
  overrides: Partial<
    Extract<PublicShareData, { resourceType: 'workflow' }>
  > = {},
): Extract<PublicShareData, { resourceType: 'workflow' }> {
  return {
    token: 'test-token',
    resourceType: 'workflow',
    workflowDefinitionId: 'wf-1',
    workflowName: 'Test Workflow',
    workflowDescription: 'A test workflow description',
    title: 'Test Workflow',
    description: 'A test workflow description',
    shareType: 'read_only',
    author: {
      displayName: '酒狐',
      email: 'test@example.invalid',
      avatarUrl: null,
    },
    definition: {
      nodes: [
        {
          id: 'n1',
          type: 'workflow-node',
          position: { x: 0, y: 0 },
          data: { nodeType: 'agent', label: 'Start' },
        },
        {
          id: 'n2',
          type: 'workflow-node',
          position: { x: 280, y: 0 },
          data: { nodeType: 'text-output', label: 'End' },
        },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    nodeCount: 2,
    edgeCount: 1,
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
    createWorkflowMock.mutate = vi.fn()
    createWorkflowMock.isPending = false
    importAgentShareMock.mutate = vi.fn()
    importAgentShareMock.isPending = false
  })

  it('shows loading state while data is loading', () => {
    publicShareMock.isLoading = true
    render(<PublicSharePage />)

    expect(screen.getByText('加载分享内容...')).toBeInTheDocument()
  })

  it('shows empty state when the request settles without share data', () => {
    render(<PublicSharePage />)

    expect(screen.getByTestId('public-share-page')).toBeInTheDocument()
    expect(screen.getByText('没有可展示的分享内容')).toBeInTheDocument()
  })

  it('falls back to an empty preview notice when the definition has no nodes', () => {
    publicShareMock.data = makePublicShareData({
      definition: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    })
    render(<PublicSharePage />)

    expect(screen.queryByTestId('public-share-preview')).not.toBeInTheDocument()
    expect(screen.getByText('这个分享没有可预览的画布')).toBeInTheDocument()
  })

  it('renders workflow name, description, and ReactFlow canvas when data loaded', () => {
    publicShareMock.data = makePublicShareData()
    render(<PublicSharePage />)

    expect(screen.getByText('Test Workflow')).toBeInTheDocument()
    expect(screen.getByText('A test workflow description')).toBeInTheDocument()
    expect(screen.getByTestId('public-share-preview')).toBeInTheDocument()
    expect(screen.getByTestId('public-share-preview')).toHaveAttribute(
      'data-node-types',
      'agent,output',
    )
    expect(screen.getByTestId('public-share-preview')).toHaveAttribute(
      'data-edge-types',
      'smart',
    )
  })

  it('shows "仅查看" badge for read_only shares', () => {
    publicShareMock.data = makePublicShareData({ shareType: 'read_only' })
    render(<PublicSharePage />)

    expect(screen.getByText('仅查看')).toBeInTheDocument()
  })

  it('shows "可导入" badge + import button for copyable shares', () => {
    publicShareMock.data = makePublicShareData({ shareType: 'copyable' })
    render(<PublicSharePage />)

    expect(screen.getByText('可导入')).toBeInTheDocument()
    expect(screen.getByTestId('btn-copy-to-workspace')).toBeInTheDocument()
  })

  it('does not show copy button for read_only shares', () => {
    publicShareMock.data = makePublicShareData({ shareType: 'read_only' })
    render(<PublicSharePage />)

    expect(
      screen.queryByTestId('btn-copy-to-workspace'),
    ).not.toBeInTheDocument()
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

  it('calls createWorkflow mutation and navigates after successful copy', async () => {
    const user = userEvent.setup()
    publicShareMock.data = makePublicShareData({ shareType: 'copyable' })
    createWorkflowMock.mutate = vi.fn((payload, options) => {
      options.onSuccess?.({ id: 'wf-copy-id' }, payload, undefined, undefined)
    })

    render(<PublicSharePage />)

    await user.click(screen.getByTestId('btn-copy-to-workspace'))

    expect(createWorkflowMock.mutate).toHaveBeenCalledWith(
      {
        name: 'Test Workflow',
        description: 'A test workflow description',
        shareToken: 'test-token',
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/workflows/$workflowId',
      params: { workflowId: 'wf-copy-id' },
    })
    expect(notifyMock).toHaveBeenCalledWith({
      description: '已导入到你的工作流列表',
      variant: 'success',
    })
  })
})

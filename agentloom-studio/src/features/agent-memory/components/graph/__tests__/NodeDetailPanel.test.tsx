import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NodeDetailPanel } from '../NodeDetailPanel'

// Mock API hooks
const mockNodeDetail = vi.hoisted(() => vi.fn())
const mockNodeVersions = vi.hoisted(() => vi.fn())

vi.mock('../api', () => ({
  useMemoryNodeDetail: mockNodeDetail,
  useMemoryNodeVersions: mockNodeVersions,
}))

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe('NodeDetailPanel', () => {
  it('加载态显示 spinner', () => {
    mockNodeDetail.mockReturnValue({ data: undefined, isLoading: true })
    mockNodeVersions.mockReturnValue({ data: undefined, isLoading: true })

    render(
      <NodeDetailPanel
        instanceId="inst-1"
        nodeId="node-1"
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )
    expect(screen.getByTestId('node-detail-panel')).toBeInTheDocument()
    expect(screen.getByText('节点详情')).toBeInTheDocument()
  })

  it('显示节点详细信息', () => {
    mockNodeDetail.mockReturnValue({
      data: {
        id: 'node-1',
        instanceId: 'inst-1',
        name: '核心概念',
        nodeType: 'concept',
        domain: 'AI',
        content: '这是一段详细的节点内容描述',
        disclosureLevel: 'public',
        tenantId: 't-1',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      isLoading: false,
    })
    mockNodeVersions.mockReturnValue({
      data: [
        {
          id: 'v1',
          nodeId: 'node-1',
          version: 1,
          content: '初始版本内容',
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'v2',
          nodeId: 'node-1',
          version: 2,
          content: '更新版本内容',
          createdAt: '2025-01-02T00:00:00Z',
        },
      ],
      isLoading: false,
    })

    render(
      <NodeDetailPanel
        instanceId="inst-1"
        nodeId="node-1"
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByText('核心概念')).toBeInTheDocument()
    expect(screen.getByText('concept')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
    expect(screen.getByText('public')).toBeInTheDocument()
    expect(screen.getByText('这是一段详细的节点内容描述')).toBeInTheDocument()
  })

  it('显示版本历史列表', () => {
    mockNodeDetail.mockReturnValue({
      data: {
        id: 'node-1',
        instanceId: 'inst-1',
        name: '测试',
        nodeType: 'document',
        domain: null,
        content: 'abc',
        disclosureLevel: null,
        tenantId: 't-1',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      isLoading: false,
    })
    mockNodeVersions.mockReturnValue({
      data: [
        {
          id: 'v1',
          nodeId: 'node-1',
          version: 1,
          content: '初始',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
      isLoading: false,
    })

    render(
      <NodeDetailPanel
        instanceId="inst-1"
        nodeId="node-1"
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByTestId('version-list')).toBeInTheDocument()
    expect(screen.getByTestId('version-item-1')).toBeInTheDocument()
    expect(screen.getByText('v1')).toBeInTheDocument()
  })

  it('点击关闭按钮触发 onClose', () => {
    mockNodeDetail.mockReturnValue({
      data: { id: 'n1', name: 'x', nodeType: 'root', content: null, domain: null, disclosureLevel: null },
      isLoading: false,
    })
    mockNodeVersions.mockReturnValue({ data: [], isLoading: false })

    const onClose = vi.fn()
    render(
      <NodeDetailPanel
        instanceId="inst-1"
        nodeId="node-1"
        onClose={onClose}
      />,
      { wrapper: createWrapper() },
    )

    fireEvent.click(screen.getByTestId('node-detail-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('无版本时显示空态文字', () => {
    mockNodeDetail.mockReturnValue({
      data: { id: 'n1', name: 'x', nodeType: 'root', content: null, domain: null, disclosureLevel: null },
      isLoading: false,
    })
    mockNodeVersions.mockReturnValue({ data: [], isLoading: false })

    render(
      <NodeDetailPanel
        instanceId="inst-1"
        nodeId="node-1"
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByText('暂无版本记录')).toBeInTheDocument()
  })
})

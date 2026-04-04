import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBrowser } from './MemoryBrowser'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  createVersionMutate: vi.fn(),
  notify: vi.fn(),
  instance: {
    id: 'memory-1',
    name: 'Agent Memory',
    description: null,
    config: null,
    validDomains: ['core'],
    coreMemoryUris: [],
    systemPromptOverride: null,
    status: 'active' as const,
    createdAt: '2026-03-28T00:00:00.000Z',
    updatedAt: '2026-03-28T00:00:00.000Z',
    stats: {
      nodeCount: 2,
      edgeCount: 1,
      latestActivity: null,
    },
  },
  domains: [{ domain: 'core', rootCount: 1 }],
  browseData: {
    node: {
      id: 'node-1',
      nodeUuid: 'uuid-1',
      name: 'Root Node',
      path: 'topic/root',
      domain: 'core',
      content: 'Root content',
      contentType: 'text/markdown',
      priority: 2,
      disclosure: null,
      isVirtual: false,
      aliases: ['core://topic/root-alias'],
      glossaryKeywords: ['agent'],
      glossaryMatches: [],
      approxChildrenCount: 1,
      versionCount: 2,
      latestVersion: 2,
      createdAt: '2026-03-28T00:00:00.000Z',
      updatedAt: '2026-03-28T00:00:00.000Z',
    },
    children: [
      {
        id: 'child-1',
        nodeUuid: 'uuid-child-1',
        name: 'Child Node',
        path: 'topic/root/child',
        domain: 'core',
        content: null,
        contentType: 'text/plain',
        priority: 3,
        disclosure: null,
        isVirtual: false,
        aliases: [],
        glossaryKeywords: [],
        glossaryMatches: [],
        approxChildrenCount: 0,
        versionCount: 1,
        latestVersion: 1,
        createdAt: '2026-03-28T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:00.000Z',
      },
    ],
    breadcrumbs: [
      { path: '', label: 'core' },
      { path: 'topic', label: 'topic' },
      { path: 'topic/root', label: 'root' },
    ],
  },
  searchResults: [],
  isLoading: false,
  error: null as Error | null,
}))

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ instanceId: 'memory-1' }),
  useSearch: () => ({ domain: 'core', path: 'topic/root' }),
  useNavigate: () => mocks.navigate,
}))

vi.mock('../../api/memoryInstanceQueries', () => ({
  useMemoryInstanceDetail: () => ({ data: mocks.instance }),
  useMemoryDomains: () => ({ data: mocks.domains }),
  useMemoryBrowse: () => ({
    data: mocks.browseData,
    isLoading: mocks.isLoading,
    error: mocks.error,
  }),
  useMemorySearch: () => ({ data: mocks.searchResults }),
}))

vi.mock('../../api/memoryInstanceMutations', () => ({
  useCreateNodeVersion: () => ({
    mutate: mocks.createVersionMutate,
    isPending: false,
  }),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

vi.mock('./MemorySidebar', () => ({
  MemorySidebar: ({ domains }: { domains: Array<{ domain: string }> }) => (
    <div data-testid="memory-sidebar">{domains.map((item) => item.domain).join(',')}</div>
  ),
}))

vi.mock('./MemoryBreadcrumb', () => ({
  MemoryBreadcrumb: ({
    items,
  }: {
    items: Array<{ label: string }>
  }) => <div>{items.map((item) => item.label).join(' / ')}</div>,
}))

vi.mock('./NodeGridCard', () => ({
  NodeGridCard: ({
    node,
    onClick,
  }: {
    node: { name: string }
    onClick: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {node.name}
    </button>
  ),
}))

vi.mock('./PriorityBadge', () => ({
  PriorityBadge: ({ priority }: { priority: number }) => <div>Priority:{priority}</div>,
}))

vi.mock('./KeywordManager', () => ({
  KeywordManager: ({ keywords }: { keywords: string[] }) => (
    <div>Keywords:{keywords.join(',')}</div>
  ),
}))

vi.mock('./GlossaryHighlighter', () => ({
  GlossaryHighlighter: ({ content }: { content: string }) => <div>{content}</div>,
}))

vi.mock('./VersionHistoryDialog', () => ({
  VersionHistoryDialog: ({
    open,
    nodeName,
  }: {
    open: boolean
    nodeName: string
  }) => (open ? <div>Versions:{nodeName}</div> : null),
}))

describe('MemoryBrowser', () => {
  beforeEach(() => {
    mocks.navigate.mockReset()
    mocks.createVersionMutate.mockReset()
    mocks.notify.mockReset()
    mocks.searchResults = []
    mocks.isLoading = false
    mocks.error = null
  })

  it('渲染记忆浏览器内容并支持通过子节点导航', () => {
    render(<MemoryBrowser />)

    expect(screen.getByText('Agent Memory')).toBeInTheDocument()
    expect(screen.getByTestId('memory-sidebar')).toHaveTextContent('core')
    expect(screen.getByText('core://topic/root')).toBeInTheDocument()
    expect(screen.getByText('Root Node')).toBeInTheDocument()
    expect(screen.getByText('Priority:2')).toBeInTheDocument()
    expect(screen.getByText('Keywords:agent')).toBeInTheDocument()
    expect(screen.getByText('Root content')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Child Node' }))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/resources/memory-instances/$instanceId/browse',
      params: { instanceId: 'memory-1' },
      search: { domain: 'core', path: 'topic/root/child' },
    })
  })

  it('编辑节点时仅提交实际变更字段', () => {
    render(<MemoryBrowser />)

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByDisplayValue('Root content'), {
      target: { value: 'Updated content' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(mocks.createVersionMutate).toHaveBeenCalledWith(
      {
        nodeId: 'node-1',
        payload: {
          mode: 'patch',
          content: 'Updated content',
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
  })

  it('未发生变更时不提交新版本并允许打开版本历史', () => {
    render(<MemoryBrowser />)

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(mocks.createVersionMutate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '版本' }))

    expect(screen.getByText('Versions:Root Node')).toBeInTheDocument()
  })

  it('搜索切换按钮应提供可访问名称并在展开后更新名称', () => {
    render(<MemoryBrowser />)

    fireEvent.click(screen.getByRole('button', { name: '打开搜索' }))

    expect(screen.getByPlaceholderText('搜索记忆节点...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭搜索' })).toBeInTheDocument()
  })
})

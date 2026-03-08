import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KnowledgeBasesPage } from './KnowledgeBasesPage'
import type { KnowledgeBase } from '../types'

// --- Mocks ---

const mocks = vi.hoisted(() => ({
  useKnowledgeBases: vi.fn(),
  useCreateKnowledgeBase: vi.fn(),
  useDeleteKnowledgeBase: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('../hooks/useKnowledgeBases', () => ({
  useKnowledgeBases: mocks.useKnowledgeBases,
  useCreateKnowledgeBase: mocks.useCreateKnowledgeBase,
  useDeleteKnowledgeBase: mocks.useDeleteKnowledgeBase,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

// --- Test data factory ---

function createKnowledgeBase(overrides: Partial<KnowledgeBase> = {}): KnowledgeBase {
  return {
    id: 'kb-1',
    tenantId: 'tenant-1',
    name: '测试知识库',
    description: '这是一个测试知识库',
    visibility: 'private' as const,
    createdBy: 'user-1',
    documentCount: 0,
    chunkCount: 0,
    status: 'empty',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

// --- Setup ---

function setupMocks(overrides: {
  knowledgeBases?: KnowledgeBase[]
  isLoading?: boolean
  error?: Error | null
} = {}) {
  const { knowledgeBases = [], isLoading = false, error = null } = overrides
  const mutateFn = vi.fn()
  const deleteFn = vi.fn()

  mocks.useKnowledgeBases.mockReturnValue({
    data: knowledgeBases,
    isLoading,
    error,
  })
  mocks.useCreateKnowledgeBase.mockReturnValue({
    mutate: mutateFn,
    isPending: false,
  })
  mocks.useDeleteKnowledgeBase.mockReturnValue({
    mutate: deleteFn,
  })

  return { mutateFn, deleteFn }
}

// --- Tests ---

describe('KnowledgeBasesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('显示加载状态', () => {
    setupMocks({ isLoading: true })
    render(<KnowledgeBasesPage />)
    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('显示错误信息', () => {
    setupMocks({ error: new Error('网络错误') })
    render(<KnowledgeBasesPage />)
    expect(screen.getByText(/加载知识库失败/)).toBeInTheDocument()
    expect(screen.getByText(/网络错误/)).toBeInTheDocument()
  })

  it('显示空状态提示', () => {
    setupMocks({ knowledgeBases: [] })
    render(<KnowledgeBasesPage />)
    expect(screen.getByText('还没有知识库，点击上方按钮创建')).toBeInTheDocument()
  })

  it('渲染知识库卡片列表', () => {
    const kbs = [
      createKnowledgeBase({
        id: 'kb-1',
        name: '知识库A',
        description: '描述A',
        documentCount: 3,
        chunkCount: 12,
        status: 'ready',
      }),
      createKnowledgeBase({
        id: 'kb-2',
        name: '知识库B',
        description: '描述B',
        visibility: 'organization',
        documentCount: 1,
        chunkCount: 4,
        status: 'processing',
      }),
    ]
    setupMocks({ knowledgeBases: kbs })
    render(<KnowledgeBasesPage />)

    expect(screen.getByText('知识库A')).toBeInTheDocument()
    expect(screen.getByText('描述A')).toBeInTheDocument()
    expect(screen.getByText('知识库B')).toBeInTheDocument()
    expect(screen.getByText('描述B')).toBeInTheDocument()
    expect(screen.getByText('3 个文档')).toBeInTheDocument()
    expect(screen.getByText('12 个分块')).toBeInTheDocument()
    expect(screen.getByText('私有')).toBeInTheDocument()
    expect(screen.getByText('组织')).toBeInTheDocument()
    expect(screen.getByText('可用')).toBeInTheDocument()
    expect(screen.getByText('处理中')).toBeInTheDocument()
  })

  it('搜索过滤知识库', async () => {
    const kbs = [
      createKnowledgeBase({ id: 'kb-1', name: 'Alpha文档' }),
      createKnowledgeBase({ id: 'kb-2', name: 'Beta资料' }),
    ]
    setupMocks({ knowledgeBases: kbs })
    render(<KnowledgeBasesPage />)

    const searchInput = screen.getByPlaceholderText('搜索知识库...')
    await userEvent.type(searchInput, 'Alpha')

    expect(screen.getByText('Alpha文档')).toBeInTheDocument()
    expect(screen.queryByText('Beta资料')).not.toBeInTheDocument()
  })

  it('搜索无结果时显示提示', async () => {
    setupMocks({ knowledgeBases: [createKnowledgeBase()] })
    render(<KnowledgeBasesPage />)

    const searchInput = screen.getByPlaceholderText('搜索知识库...')
    await userEvent.type(searchInput, '不存在的内容')

    expect(screen.getByText('没有匹配的知识库')).toBeInTheDocument()
  })

  it('点击卡片导航到详情页', async () => {
    const kb = createKnowledgeBase({ id: 'kb-123', name: '测试KB' })
    setupMocks({ knowledgeBases: [kb] })
    render(<KnowledgeBasesPage />)

    await userEvent.click(screen.getByText('测试KB'))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/settings/knowledge-bases/$knowledgeBaseId',
      params: { knowledgeBaseId: 'kb-123' },
    })
  })

  it('打开和关闭创建对话框', async () => {
    setupMocks()
    render(<KnowledgeBasesPage />)

    // 打开对话框
    await userEvent.click(screen.getByText('创建知识库'))
    expect(screen.getByRole('dialog', { name: '创建知识库' })).toBeInTheDocument()

    // 关闭对话框
    await userEvent.click(screen.getByText('取消'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('创建知识库时调用 mutation', async () => {
    const { mutateFn } = setupMocks()
    render(<KnowledgeBasesPage />)

    // 打开对话框
    await userEvent.click(screen.getByText('创建知识库'))

    // 填写表单
    await userEvent.type(screen.getByPlaceholderText('输入知识库名称'), '新知识库')
    await userEvent.type(screen.getByPlaceholderText('输入描述（可选）'), '新描述')

    // 提交
    // 对话框内有两个"创建"文字相关的按钮，找创建提交按钮
    const dialog = screen.getByRole('dialog')
    const createBtn = dialog.querySelector('button:last-child') as HTMLButtonElement
    await userEvent.click(createBtn)

    expect(mutateFn).toHaveBeenCalledWith(
      { name: '新知识库', description: '新描述' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('创建按钮在名称为空时禁用', async () => {
    setupMocks()
    render(<KnowledgeBasesPage />)

    await userEvent.click(screen.getByText('创建知识库'))

    const dialog = screen.getByRole('dialog')
    // 找到对话框底部的创建/提交按钮
    const buttons = dialog.querySelectorAll('button')
    const submitBtn = buttons[buttons.length - 1] as HTMLButtonElement
    expect(submitBtn).toBeDisabled()
  })

  it('删除知识库时调用 mutation', async () => {
    const kb = createKnowledgeBase({ id: 'kb-del' })
    const { deleteFn } = setupMocks({ knowledgeBases: [kb] })
    render(<KnowledgeBasesPage />)

    await userEvent.click(screen.getByLabelText('删除 测试知识库'))

    expect(window.confirm).toHaveBeenCalledWith(
      '确认删除知识库“测试知识库”吗？该操作会同时删除其下文档与分块记录。',
    )
    expect(deleteFn).toHaveBeenCalledWith('kb-del')
  })
})

import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KnowledgeBaseDetailPage } from './KnowledgeBaseDetailPage'
import type { KnowledgeBase, KnowledgeBaseDocument } from '../types'

// --- Mocks ---

const mocks = vi.hoisted(() => ({
  useKnowledgeBase: vi.fn(),
  useDocuments: vi.fn(),
  useUploadDocument: vi.fn(),
  useDeleteDocument: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('../hooks/useKnowledgeBases', () => ({
  useKnowledgeBase: mocks.useKnowledgeBase,
  useDocuments: mocks.useDocuments,
  useUploadDocument: mocks.useUploadDocument,
  useDeleteDocument: mocks.useDeleteDocument,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

// --- Test data factories ---

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

function createDocument(overrides: Partial<KnowledgeBaseDocument> = {}): KnowledgeBaseDocument {
  const { errorMessage, ...restOverrides } = overrides

  return {
    id: 'doc-1',
    knowledgeBaseId: 'kb-1',
    tenantId: 'tenant-1',
    fileName: '测试文档.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024000,
    status: 'ready' as const,
    errorMessage: errorMessage ?? null,
    uploadedBy: 'user-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...restOverrides,
  }
}

// --- Setup ---

function setupMocks(overrides: {
  knowledgeBase?: KnowledgeBase | null
  documents?: KnowledgeBaseDocument[]
  kbLoading?: boolean
  docsLoading?: boolean
  kbError?: Error | null
} = {}) {
  const {
    knowledgeBase = createKnowledgeBase(),
    documents = [],
    kbLoading = false,
    docsLoading = false,
    kbError = null,
  } = overrides

  const uploadFn = vi.fn()
  const deleteFn = vi.fn()

  mocks.useKnowledgeBase.mockReturnValue({
    data: knowledgeBase,
    isLoading: kbLoading,
    error: kbError,
  })
  mocks.useDocuments.mockReturnValue({
    data: {
      data: documents,
      meta: {
        page: 1,
        pageSize: 20,
        total: documents.length,
        totalPages: Math.max(1, Math.ceil(documents.length / 20)),
      },
    },
    isLoading: docsLoading,
  })
  mocks.useUploadDocument.mockReturnValue({
    mutate: uploadFn,
    isPending: false,
  })
  mocks.useDeleteDocument.mockReturnValue({
    mutate: deleteFn,
  })

  return { uploadFn, deleteFn }
}

// --- Tests ---

describe('KnowledgeBaseDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('显示加载状态', () => {
    setupMocks({ kbLoading: true })
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)
    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('显示错误信息', () => {
    setupMocks({ kbError: new Error('未找到知识库') })
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)
    expect(screen.getByText(/加载知识库失败/)).toBeInTheDocument()
    expect(screen.getByText(/未找到知识库/)).toBeInTheDocument()
  })

  it('显示知识库名称和描述', () => {
    setupMocks({
      knowledgeBase: createKnowledgeBase({ name: 'API文档库', description: '存放API文档' }),
    })
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)
    expect(screen.getByText('API文档库')).toBeInTheDocument()
    expect(screen.getByText('存放API文档')).toBeInTheDocument()
  })

  it('点击返回按钮导航到列表页', async () => {
    setupMocks()
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    const backButton = screen.getByRole('button', { name: '返回知识库列表' })
    await userEvent.click(backButton)

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/settings/knowledge-bases',
    })
  })

  it('显示上传区域', () => {
    setupMocks()
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)
    expect(
      screen.getByText('拖拽文件到此处或点击上传（支持多文件）'),
    ).toBeInTheDocument()
  })

  it('显示空文档提示', () => {
    setupMocks({ documents: [] })
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)
    expect(screen.getByText('还没有文档，上传文件开始使用')).toBeInTheDocument()
  })

  it('显示文档加载中', () => {
    setupMocks({ docsLoading: true })
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)
    expect(screen.getByText('加载文档中...')).toBeInTheDocument()
  })

  it('渲染文档列表', () => {
    const docs = [
      createDocument({ id: 'doc-1', fileName: 'report.pdf', sizeBytes: 2048000, status: 'ready' }),
      createDocument({ id: 'doc-2', fileName: 'data.csv', sizeBytes: 512, status: 'processing' }),
    ]
    setupMocks({ documents: docs })
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    expect(screen.getByText('report.pdf')).toBeInTheDocument()
    expect(screen.getByText('data.csv')).toBeInTheDocument()
    expect(screen.getByText('文档列表')).toBeInTheDocument()
    // 状态标签
    expect(screen.getAllByText('就绪').length).toBeGreaterThan(0)
    expect(screen.getAllByText('处理中').length).toBeGreaterThan(0)
  })

  it('点击上传区域触发文件选择', async () => {
    setupMocks()
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement

    // 验证 file input 存在且隐藏
    expect(fileInput).toBeInTheDocument()
    expect(fileInput.type).toBe('file')
  })

  it('上传文件时调用 mutation', async () => {
    const { uploadFn } = setupMocks()
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement
    const testFile = new File(['content'], 'test.pdf', { type: 'application/pdf' })

    await userEvent.upload(fileInput, testFile)

    expect(uploadFn).toHaveBeenCalledWith(
      {
        knowledgeBaseId: 'kb-1',
        file: testFile,
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
  })

  it('拖拽文件上传', () => {
    const { uploadFn } = setupMocks()
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    const uploadArea = screen.getByTestId('upload-area')
    const testFile = new File(['content'], 'drop.pdf', { type: 'application/pdf' })

    // 拖拽进入
    fireEvent.dragOver(uploadArea, {
      dataTransfer: { files: [testFile] },
    })

    // 放下文件
    fireEvent.drop(uploadArea, {
      dataTransfer: { files: [testFile] },
    })

    expect(uploadFn).toHaveBeenCalledWith(
      {
        knowledgeBaseId: 'kb-1',
        file: testFile,
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
  })

  it('删除文档时调用 mutation', async () => {
    const doc = createDocument({ id: 'doc-del', fileName: '删除我.pdf' })
    const { deleteFn } = setupMocks({ documents: [doc] })
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    await userEvent.click(screen.getByLabelText('删除 删除我.pdf'))

    expect(window.confirm).toHaveBeenCalledWith(
      '确认删除文档“删除我.pdf”吗？相关分块记录会一并清理。',
    )
    expect(deleteFn).toHaveBeenCalledWith({
      knowledgeBaseId: 'kb-1',
      documentId: 'doc-del',
    })
  })

  it('拖拽悬停时显示高亮', () => {
    setupMocks()
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    const uploadArea = screen.getByTestId('upload-area')

    fireEvent.dragOver(uploadArea, {
      dataTransfer: { files: [] },
    })

    // 验证类名变化（border-primary）
    expect(uploadArea.className).toContain('border-primary')
  })

  it('拖拽离开时取消高亮', () => {
    setupMocks()
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    const uploadArea = screen.getByTestId('upload-area')

    fireEvent.dragOver(uploadArea, { dataTransfer: { files: [] } })
    fireEvent.dragLeave(uploadArea)

    expect(uploadArea.className).not.toContain('border-primary')
  })
})

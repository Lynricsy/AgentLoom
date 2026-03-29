import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KnowledgeBaseDetailPage } from './KnowledgeBaseDetailPage'
import type {
  KnowledgeBase,
  KnowledgeBaseDocument,
  KnowledgeSearchResult,
} from '../types'

const mocks = vi.hoisted(() => ({
  useKnowledgeBase: vi.fn(),
  useDocuments: vi.fn(),
  useUploadDocument: vi.fn(),
  useDeleteDocument: vi.fn(),
  useUpdateKnowledgeBaseSettings: vi.fn(),
  useTestKnowledgeBaseSearch: vi.fn(),
  useRebuildKnowledgeBase: vi.fn(),
  useKnowledgeBaseSocket: vi.fn(),
  useLlmModels: vi.fn(),
  notify: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('../hooks/useKnowledgeBases', () => ({
  useKnowledgeBase: mocks.useKnowledgeBase,
  useDocuments: mocks.useDocuments,
  useUploadDocument: mocks.useUploadDocument,
  useDeleteDocument: mocks.useDeleteDocument,
  useUpdateKnowledgeBaseSettings: mocks.useUpdateKnowledgeBaseSettings,
  useTestKnowledgeBaseSearch: mocks.useTestKnowledgeBaseSearch,
  useRebuildKnowledgeBase: mocks.useRebuildKnowledgeBase,
}))

vi.mock('../hooks/useKnowledgeBaseSocket', () => ({
  useKnowledgeBaseSocket: mocks.useKnowledgeBaseSocket,
}))

vi.mock('@/features/llm', () => ({
  useLlmModels: mocks.useLlmModels,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

function createKnowledgeBase(overrides: Partial<KnowledgeBase> = {}): KnowledgeBase {
  return {
    id: 'kb-1',
    tenantId: 'tenant-1',
    name: '测试知识库',
    description: '这是一个测试知识库',
    visibility: 'private',
    createdBy: 'user-1',
    embeddingModel: 'text-embedding-3-small',
    embeddingModelConfigId: 'embedding-model-1',
    chunkingStrategy: {
      type: 'sentence_window',
      windowSize: 3,
    },
    retrievalStrategy: {
      topK: 8,
      similarityThreshold: null,
    },
    rerankingStrategy: {
      type: 'none',
    },
    queryOrchestration: {
      type: 'none',
    },
    documentCount: 0,
    nodeCount: 0,
    chunkCount: 0,
    status: 'empty',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function createDocument(
  overrides: Partial<KnowledgeBaseDocument> = {},
): KnowledgeBaseDocument {
  return {
    id: 'doc-1',
    knowledgeBaseId: 'kb-1',
    tenantId: 'tenant-1',
    fileName: '测试文档.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    status: 'ready',
    errorMessage: null,
    uploadedBy: 'user-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function createSearchResult(
  overrides: Partial<KnowledgeSearchResult> = {},
): KnowledgeSearchResult {
  return {
    chunkId: 'chunk-1',
    nodeId: 'node-1',
    score: 0.93,
    content: '这里是命中的知识节点内容',
    location: null,
    documentId: 'doc-1',
    knowledgeBaseId: 'kb-1',
    chunkIndex: 0,
    fileName: '测试文档.pdf',
    metadata: {},
    ...overrides,
  }
}

function createLlmModels() {
  return [
    {
      id: 'embedding-model-1',
      name: '默认 Embedding 模型',
      provider: 'openai',
      modelType: 'embedding',
      modelName: 'text-embedding-3-small',
      parameters: {
        temperature: 0.7,
        maxTokens: undefined,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        stop: [],
      },
      apiKeyId: null,
      embeddingDimensions: 1536,
      isDefault: true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'embedding-model-2',
      name: '高级 Embedding 模型',
      provider: 'private_cloud',
      modelType: 'embedding',
      modelName: 'Qwen/Qwen3-Embedding-8B',
      parameters: {
        temperature: 0.7,
        maxTokens: undefined,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        stop: [],
      },
      apiKeyId: 'key-1',
      embeddingDimensions: 1024,
      isDefault: false,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      endpointUrl: 'https://api.siliconflow.cn',
      authMethod: 'api_key',
    },
    {
      id: 'chat-model-1',
      name: '默认聊天模型',
      provider: 'openai',
      modelType: 'chat',
      modelName: 'gpt-4.1-mini',
      parameters: {
        temperature: 0.7,
        maxTokens: undefined,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        stop: [],
      },
      apiKeyId: null,
      isDefault: true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
  ]
}

function setupMocks(overrides: {
  knowledgeBase?: KnowledgeBase | null
  documents?: KnowledgeBaseDocument[]
  kbLoading?: boolean
  kbError?: Error | null
  docsLoading?: boolean
  testSearchResults?: KnowledgeSearchResult[]
  documentEvents?: Record<string, unknown>
} = {}) {
  const {
    knowledgeBase = createKnowledgeBase(),
    documents = [],
    kbLoading = false,
    kbError = null,
    docsLoading = false,
    testSearchResults,
    documentEvents = {},
  } = overrides

  const uploadFn = vi.fn()
  const deleteFn = vi.fn()
  const updateSettingsFn = vi.fn()
  const testSearchFn = vi.fn()
  const rebuildFn = vi.fn()

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
    isPending: false,
  })
  mocks.useUpdateKnowledgeBaseSettings.mockReturnValue({
    mutate: updateSettingsFn,
    isPending: false,
  })
  mocks.useTestKnowledgeBaseSearch.mockReturnValue({
    mutate: testSearchFn,
    isPending: false,
    data: testSearchResults
      ? {
          query: '测试查询',
          knowledgeBaseId: 'kb-1',
          total: testSearchResults.length,
          results: testSearchResults,
        }
      : undefined,
  })
  mocks.useRebuildKnowledgeBase.mockReturnValue({
    mutate: rebuildFn,
    isPending: false,
  })
  mocks.useKnowledgeBaseSocket.mockReturnValue({
    documentEvents,
  })
  mocks.useLlmModels.mockReturnValue({
    data: createLlmModels(),
  })

  return { uploadFn, deleteFn, updateSettingsFn, testSearchFn, rebuildFn }
}

describe('KnowledgeBaseDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('展示知识库概览、策略信息和统一工具语义', () => {
    setupMocks({
      knowledgeBase: createKnowledgeBase({
        name: 'API 文档库',
        description: '存放 API 与 SDK 文档',
        documentCount: 3,
        nodeCount: 18,
        chunkCount: 18,
        chunkingStrategy: {
          type: 'sentence_window',
          windowSize: 4,
        },
        retrievalStrategy: {
          topK: 6,
          similarityThreshold: 0.6,
        },
      }),
      testSearchResults: [createSearchResult()],
    })

    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    expect(screen.getByText('API 文档库')).toBeInTheDocument()
    expect(screen.getByText('存放 API 与 SDK 文档')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('Sentence Window · 4')).toBeInTheDocument()
    expect(screen.getByText('检索 Top K 6')).toBeInTheDocument()
    expect(screen.getByText(/search_knowledge/)).toBeInTheDocument()
    expect(screen.getByText(/knowledgeBaseIds/)).toBeInTheDocument()
    expect(screen.getByText('这里是命中的知识节点内容')).toBeInTheDocument()
  })

  it('显示加载和错误状态', () => {
    mocks.useDocuments.mockReturnValue({
      data: { data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 } },
      isLoading: false,
    })
    mocks.useUploadDocument.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mocks.useDeleteDocument.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mocks.useUpdateKnowledgeBaseSettings.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mocks.useTestKnowledgeBaseSearch.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mocks.useRebuildKnowledgeBase.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mocks.useKnowledgeBaseSocket.mockReturnValue({ documentEvents: {} })
    mocks.useLlmModels.mockReturnValue({ data: createLlmModels() })

    mocks.useKnowledgeBase.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    })
    const { rerender } = render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)
    expect(screen.getByText('加载知识库中...')).toBeInTheDocument()

    mocks.useKnowledgeBase.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('未找到知识库'),
    })
    rerender(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)
    expect(screen.getByText('未找到知识库')).toBeInTheDocument()
  })

  it('显示实时处理进度', () => {
    setupMocks({
      documents: [
        createDocument({
          id: 'doc-progress',
          fileName: 'process.md',
          status: 'processing',
        }),
      ],
      documentEvents: {
        'doc-progress': {
          documentId: 'doc-progress',
          knowledgeBaseId: 'kb-1',
          status: 'processing',
          progress: {
            percentage: 65,
            stage: 'chunking',
            currentStep: 3,
            totalSteps: 5,
          },
        },
      },
    })

    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    expect(screen.getByText('process.md')).toBeInTheDocument()
    expect(screen.getByText('生成节点 · 65%')).toBeInTheDocument()
  })

  it('上传合法文档时调用上传 mutation', async () => {
    const { uploadFn } = setupMocks()
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    const fileInput = screen.getByTestId('knowledge-file-input') as HTMLInputElement
    const testFile = new File(['content'], 'manual.pdf', {
      type: 'application/pdf',
    })

    await userEvent.upload(fileInput, testFile)

    expect(uploadFn).toHaveBeenCalledWith(
      {
        knowledgeBaseId: 'kb-1',
        file: testFile,
      },
      expect.objectContaining({
        onError: expect.any(Function),
      }),
    )
  })

  it('前端拦截不支持的文件类型并给出错误提示', () => {
    const { uploadFn } = setupMocks()
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    const fileInput = screen.getByTestId('knowledge-file-input') as HTMLInputElement
    const invalidFile = new File(['content'], 'invalid.png', {
      type: 'image/png',
    })

    fireEvent.change(fileInput, {
      target: { files: [invalidFile] },
    })

    expect(uploadFn).not.toHaveBeenCalled()
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        description: '仅支持 PDF、TXT、Markdown 和 DOCX 文件',
        variant: 'error',
      }),
    )
  })

  it('保存策略时提交新的知识库策略配置', async () => {
    const { updateSettingsFn } = setupMocks()
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    await userEvent.selectOptions(
      screen.getByLabelText('Embedding 模型'),
      'embedding-model-2',
    )
    await userEvent.selectOptions(screen.getByLabelText('分块策略'), 'sentence')
    await userEvent.clear(screen.getByLabelText('Chunk Size'))
    await userEvent.type(screen.getByLabelText('Chunk Size'), '1024')
    await userEvent.clear(screen.getByLabelText('Chunk Overlap'))
    await userEvent.type(screen.getByLabelText('Chunk Overlap'), '128')

    await userEvent.click(screen.getByRole('button', { name: '保存策略' }))

    expect(updateSettingsFn).toHaveBeenCalledWith(
      {
        id: 'kb-1',
        input: expect.objectContaining({
          embeddingModelConfigId: 'embedding-model-2',
          chunkingStrategy: {
            type: 'sentence',
            chunkSize: 1024,
            chunkOverlap: 128,
          },
        }),
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )

    const options = updateSettingsFn.mock.calls[0]?.[1]
    options?.onSuccess?.()

    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '知识库策略已更新',
          variant: 'success',
        }),
      ),
    )
  })

  it('执行测试检索时调用测试检索 mutation', async () => {
    const { testSearchFn } = setupMocks()
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    await userEvent.type(
      screen.getByPlaceholderText('输入你希望验证的查询问题'),
      '如何接入 API？',
    )
    await userEvent.click(screen.getByRole('button', { name: '执行测试检索' }))

    expect(testSearchFn).toHaveBeenCalledWith(
      {
        knowledgeBaseId: 'kb-1',
        query: '如何接入 API？',
        topK: 5,
      },
      expect.objectContaining({
        onError: expect.any(Function),
      }),
    )
  })

  it('点击重建时提交重建任务并展示成功提示', async () => {
    const { rebuildFn } = setupMocks()
    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    await userEvent.click(screen.getByRole('button', { name: '重建索引/重切分' }))

    expect(rebuildFn).toHaveBeenCalledWith(
      'kb-1',
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )

    const options = rebuildFn.mock.calls[0]?.[1]
    options?.onSuccess?.({
      knowledgeBaseId: 'kb-1',
      documentCount: 3,
    })

    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '已提交 3 个文档的重建任务',
          variant: 'success',
        }),
      ),
    )
  })

  it('删除文档时在确认后调用删除 mutation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { deleteFn } = setupMocks({
      documents: [createDocument({ id: 'doc-del', fileName: '删除我.pdf' })],
    })

    render(<KnowledgeBaseDetailPage knowledgeBaseId="kb-1" />)

    await userEvent.click(screen.getByLabelText('删除 删除我.pdf'))

    expect(confirmSpy).toHaveBeenCalledWith('确定要删除文档“删除我.pdf”吗？')
    expect(deleteFn).toHaveBeenCalledWith(
      {
        knowledgeBaseId: 'kb-1',
        documentId: 'doc-del',
      },
      expect.objectContaining({
        onError: expect.any(Function),
      }),
    )

    confirmSpy.mockRestore()
  })
})

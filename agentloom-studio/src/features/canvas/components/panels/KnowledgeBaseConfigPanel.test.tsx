import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildKnowledgeBaseNodeConfig, type KnowledgeBase } from '@/features/knowledge/types'
import { KnowledgeBaseConfigPanel } from './KnowledgeBaseConfigPanel'

const mocks = vi.hoisted(() => ({
  useAllKnowledgeBases: vi.fn(),
}))

vi.mock('@/features/knowledge/hooks/useKnowledgeBases', () => ({
  useAllKnowledgeBases: mocks.useAllKnowledgeBases,
}))

function createKnowledgeBase(overrides: Partial<KnowledgeBase> = {}): KnowledgeBase {
  return {
    id: 'kb-1',
    tenantId: 'tenant-1',
    name: '产品手册库',
    description: '产品文档',
    visibility: 'private',
    createdBy: 'user-1',
    embeddingModel: 'text-embedding-3-small',
    embeddingModelConfigId: null,
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
    documentCount: 12,
    nodeCount: 80,
    chunkCount: 80,
    status: 'ready',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('KnowledgeBaseConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state while fetching all knowledge bases', () => {
    mocks.useAllKnowledgeBases.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    render(<KnowledgeBaseConfigPanel config={{}} onApply={vi.fn()} />)

    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('applies the selected knowledge base with full node config', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const selectedKnowledgeBase = createKnowledgeBase({
      id: 'kb-2',
      name: '研发规范库',
      documentCount: 24,
      nodeCount: 128,
      chunkCount: 128,
      status: 'processing',
    })
    const knowledgeBases = [
      createKnowledgeBase(),
      selectedKnowledgeBase,
    ]
    mocks.useAllKnowledgeBases.mockReturnValue({
      data: knowledgeBases,
      isLoading: false,
    })

    render(<KnowledgeBaseConfigPanel config={{}} onApply={onApply} />)

    await user.click(screen.getByLabelText('选择知识库'))
    await user.click(await screen.findByRole('option', { name: /研发规范库/ }))

    expect(onApply).toHaveBeenCalledWith({
      config: buildKnowledgeBaseNodeConfig(selectedKnowledgeBase),
      label: '研发规范库',
    })
  })

  it('shows the selected knowledge base summary from the full list', () => {
    const selectedKnowledgeBase = createKnowledgeBase({
      id: 'kb-120',
      name: '归档知识库',
      documentCount: 120,
      nodeCount: 640,
      chunkCount: 640,
    })
    mocks.useAllKnowledgeBases.mockReturnValue({
      data: [selectedKnowledgeBase],
      isLoading: false,
    })

    render(
      <KnowledgeBaseConfigPanel
        config={buildKnowledgeBaseNodeConfig(selectedKnowledgeBase)}
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByText('归档知识库')).toBeInTheDocument()
    expect(screen.getByText('120 个文档')).toBeInTheDocument()
    expect(screen.getByText('640 个知识节点')).toBeInTheDocument()
    expect(screen.getByText('可用')).toBeInTheDocument()
    expect(screen.getByText('ID: kb-120')).toBeInTheDocument()
  })

  it('shows required validation error after blur and clears it once a knowledge base is selected', async () => {
    const user = userEvent.setup()
    const onValidationChange = vi.fn()
    mocks.useAllKnowledgeBases.mockReturnValue({
      data: [createKnowledgeBase()],
      isLoading: false,
    })

    render(
      <KnowledgeBaseConfigPanel
        config={{}}
        onApply={vi.fn()}
        onValidationChange={onValidationChange}
      />,
    )

    const select = screen.getByLabelText('选择知识库')
    fireEvent.focus(select)
    fireEvent.blur(select)

    await waitFor(() => {
      expect(screen.getByText('此字段为必填项')).toBeInTheDocument()
    })
    expect(onValidationChange).toHaveBeenLastCalledWith(true)

    await user.click(select)
    await user.click(await screen.findByRole('option', { name: /产品手册库/ }))

    expect(screen.queryByText('此字段为必填项')).not.toBeInTheDocument()
    expect(onValidationChange).toHaveBeenLastCalledWith(false)
  })

  it('shows a warning when the configured knowledge base is no longer available', () => {
    mocks.useAllKnowledgeBases.mockReturnValue({
      data: [createKnowledgeBase({ id: 'kb-2', name: '仍然存在的知识库' })],
      isLoading: false,
    })

    render(
      <KnowledgeBaseConfigPanel
        config={{ knowledgeBaseId: 'kb-missing' }}
        onApply={vi.fn()}
      />,
    )

    expect(
      screen.getByText('当前已选择的知识库不可用或已删除，请重新选择。'),
    ).toBeInTheDocument()
    expect(screen.getByText('ID: kb-missing')).toBeInTheDocument()
    expect(
      screen.getByTestId('knowledge-base-missing-warning'),
    ).toBeInTheDocument()
  })
})

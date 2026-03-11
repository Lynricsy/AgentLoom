import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EvidenceChainNode, EvidenceRecord } from '../../types'
import { useEvidenceDetail, useEvidenceVerify } from '../../api/evidenceQueries'
import { useEvidenceUiActions } from '../../stores/evidenceUiStore'
import { EvidenceCard } from '../EvidenceCard'

vi.mock('../../api/evidenceQueries', () => ({
  useEvidenceDetail: vi.fn(),
  useEvidenceVerify: vi.fn(),
}))

vi.mock('../../stores/evidenceUiStore', () => ({
  useEvidenceUiActions: vi.fn(),
}))

vi.mock('../SourceStatusBadge', () => ({
  SourceStatusBadge: ({
    hashValid,
    sourceModified,
    sourceUnavailable,
    unavailableReason,
    currentHash,
    originalHash,
    hasOriginalSnapshot,
    snapshotVisible,
    onToggleOriginalSnapshot,
  }: {
    hashValid: boolean;
    sourceModified?: boolean;
    sourceUnavailable?: boolean;
    unavailableReason?: string;
    currentHash?: string;
    originalHash?: string;
    hasOriginalSnapshot?: boolean;
    snapshotVisible?: boolean;
    onToggleOriginalSnapshot?: () => void;
  }) => {
    const label = sourceUnavailable
      ? '来源不可用'
      : sourceModified || !hashValid
        ? '来源已修改'
        : '来源完整'

    return (
      <div>
        <button type="button" data-testid="source-status-badge">
          {label}
        </button>
        {label !== '来源完整' && (
          <div role="tooltip">
            <p>{label === '来源不可用' ? '源文档不可用' : '源文档已修改'}</p>
            {unavailableReason && <p>{unavailableReason}</p>}
            {currentHash && <p>{`当前哈希：${currentHash}`}</p>}
            {originalHash && <p>{`原始哈希：${originalHash}`}</p>}
          </div>
        )}
        {hasOriginalSnapshot && onToggleOriginalSnapshot && (
          <button
            type="button"
            data-testid="toggle-original-snapshot"
            onClick={onToggleOriginalSnapshot}
          >
            {snapshotVisible ? '隐藏原始快照' : '查看原始快照'}
          </button>
        )}
      </div>
    )
  },
}))

function createNode(overrides: Partial<EvidenceChainNode> = {}): EvidenceChainNode {
  return {
    evidenceId: 'ev-001',
    executionId: 'exec-001',
    stepId: 'step-001',
    sourceType: 'rag_retrieval',
    packetSummary: {
      title: 'RAG 检索 · report.md',
      excerpt: '命中的缓存内容',
      metadata: {
        relevanceScore: '0.82',
      },
    },
    contentHash: 'f'.repeat(64),
    parentEvidenceId: null,
    createdAt: '2026-03-10T10:00:00.000Z',
    depth: 0,
    hashValid: true,
    children: [],
    ...overrides,
  }
}

function createRecord(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: 'ev-001',
    executionId: 'exec-001',
    stepId: 'step-001',
    tenantId: 'tenant-001',
    sourceType: 'rag_retrieval',
    packet: {
      evidenceId: 'ev-001',
      sourceType: 'rag_retrieval',
      contentHash: 'f'.repeat(64),
      timestamp: '2026-03-10T10:00:00.000Z',
      physicalLocation: {
        documentId: 'doc-001',
        knowledgeBaseId: 'kb-001',
        fileName: 'report.md',
        offset: 2,
        length: 6,
        chunkId: 'chunk-001',
        paragraph: 1,
      },
      semanticLocation: {
        context: '相关语义上下文',
        relevanceScore: 0.82,
      },
      retrievedContent: '命中的缓存内容',
    },
    contentHash: 'f'.repeat(64),
    parentEvidenceId: null,
    createdAt: '2026-03-10T10:00:00.000Z',
    ...overrides,
  }
}

describe('EvidenceCard', () => {
  const openFromPhysicalLocation = vi.fn()
  const refetchVerify = vi.fn().mockResolvedValue({ data: undefined })

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useEvidenceUiActions).mockReturnValue({
      openPanel: vi.fn(),
      closePanel: vi.fn(),
      selectEvidence: vi.fn(),
      openDocumentViewer: vi.fn(),
      closeDocumentViewer: vi.fn(),
      openFromPhysicalLocation,
      clearHighlight: vi.fn(),
      reset: vi.fn(),
    })

    vi.mocked(useEvidenceDetail).mockReturnValue({
      data: { data: createRecord() },
      isLoading: false,
      error: null,
    } as never)

    vi.mocked(useEvidenceVerify).mockReturnValue({
      data: {
        data: {
          evidenceId: 'ev-001',
          valid: true,
          integrityWarning: false,
          currentHash: 'b'.repeat(64),
        },
      },
      isFetching: false,
      error: null,
      refetch: refetchVerify,
    } as never)
  })

  it('渲染 rag 证据的相关度、语义上下文、哈希提示与原始快照', async () => {
    render(
      <EvidenceCard
        node={createNode({
          sourceModified: true,
          originalSnapshot: '缓存快照内容',
        })}
      />,
    )

    expect(screen.getByText('相关度 0.82')).toBeInTheDocument()
    expect(screen.getByText('相关语义上下文')).toBeInTheDocument()
    expect(screen.getByTestId('location-link')).toBeInTheDocument()

    await waitFor(() => {
      expect(refetchVerify).toHaveBeenCalledTimes(1)
    })

    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('源文档已修改')
    expect(tooltip).toHaveTextContent(`当前哈希：${'b'.repeat(64)}`)
    expect(tooltip).toHaveTextContent(`原始哈希：${'f'.repeat(64)}`)

    fireEvent.click(screen.getByTestId('toggle-original-snapshot'))
    expect(screen.getByText('缓存快照内容')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('location-link'))
    expect(openFromPhysicalLocation).toHaveBeenCalledWith('ev-001', {
      documentId: 'doc-001',
      knowledgeBaseId: 'kb-001',
      fileName: 'report.md',
      offset: 2,
      length: 6,
      chunkId: 'chunk-001',
      paragraph: 1,
    })
  })

  it('来源不可用时禁用 LocationLink，但保留缓存上下文和快照入口', async () => {
    const unavailableNode = createNode({
      sourceUnavailable: true,
      unavailableReason: '源文档已删除',
      originalSnapshot: '仍可查看的缓存片段',
    })

    render(<EvidenceCard node={unavailableNode} />)

    expect(screen.getByText('相关语义上下文')).toBeInTheDocument()
    expect(screen.getByTestId('location-link')).toBeDisabled()
    expect(refetchVerify).not.toHaveBeenCalled()

    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('源文档不可用')
    expect(tooltip).toHaveTextContent('源文档已删除')

    fireEvent.click(screen.getByTestId('toggle-original-snapshot'))
    expect(screen.getByText('仍可查看的缓存片段')).toBeInTheDocument()
  })

  it('渲染 agent_decision 的结构化字段并支持选择证据', () => {
    const onSelect = vi.fn()
    vi.mocked(useEvidenceDetail).mockReturnValue({
      data: {
        data: createRecord({
          sourceType: 'agent_decision',
          packet: {
            evidenceId: 'ev-001',
            sourceType: 'agent_decision',
            contentHash: 'f'.repeat(64),
            timestamp: '2026-03-10T10:00:00.000Z',
            agentDecision: {
              nodeId: 'node-001',
              agentName: 'Planner',
              autonomyMode: 'AUTO',
              reasoning: '先看证据，再生成回复。',
              selectedAction: 'respond',
              alternatives: ['clarify', 'delegate'],
              confidence: 0.87,
            },
          },
        }),
      },
      isLoading: false,
      error: null,
    } as never)

    render(
      <EvidenceCard
        node={createNode({
          sourceType: 'agent_decision',
          packetSummary: {
            title: 'Agent 决策',
            excerpt: '选择了 respond',
            metadata: {
              selectedAction: 'respond',
            },
          },
        })}
        onSelect={onSelect}
      />,
    )

    expect(screen.getByText('Planner')).toBeInTheDocument()
    expect(screen.getByText('AUTO')).toBeInTheDocument()
    expect(screen.getByText('respond')).toBeInTheDocument()
    expect(screen.getByText('置信度')).toBeInTheDocument()
    expect(screen.getByText('备选方案（2）')).toBeInTheDocument()
    expect(screen.getByText('先看证据，再生成回复。')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('evidence-card-ev-001'))
    expect(onSelect).toHaveBeenCalledWith('ev-001')
  })

  it('渲染 tool_output 的工具名称与 JSON 输出预览', () => {
    vi.mocked(useEvidenceDetail).mockReturnValue({
      data: {
        data: createRecord({
          sourceType: 'tool_output',
          packet: {
            evidenceId: 'ev-001',
            sourceType: 'tool_output',
            contentHash: 'f'.repeat(64),
            timestamp: '2026-03-10T10:00:00.000Z',
            toolOutput: {
              toolName: 'searchDocs',
              toolInput: { query: 'evidence panel' },
              toolOutput: { answer: 'done' },
              transitions: [
                {
                  to: 'completed',
                  source: 'worker',
                  timestamp: '2026-03-10T10:00:00.000Z',
                },
              ],
            },
          },
        }),
      },
      isLoading: false,
      error: null,
    } as never)

    render(
      <EvidenceCard
        node={createNode({
          sourceType: 'tool_output',
          packetSummary: {
            title: '工具输出',
            excerpt: '工具已完成',
            metadata: {
              toolCallId: 'call-001',
            },
          },
        })}
      />,
    )

    expect(screen.getByText('searchDocs')).toBeInTheDocument()
    expect(screen.getByText('completed')).toBeInTheDocument()
    expect(screen.getByText(/"answer": "done"/)).toBeInTheDocument()
  })

  it('渲染 user_input 的结构化内容', () => {
    vi.mocked(useEvidenceDetail).mockReturnValue({
      data: {
        data: createRecord({
          sourceType: 'user_input',
          packet: {
            evidenceId: 'ev-001',
            sourceType: 'user_input',
            contentHash: 'f'.repeat(64),
            timestamp: '2026-03-10T10:00:00.000Z',
            userInput: {
              content: '请优先展示可用来源',
            },
          },
        }),
      },
      isLoading: false,
      error: null,
    } as never)

    render(
      <EvidenceCard
        node={createNode({
          sourceType: 'user_input',
          packetSummary: {
            title: '用户输入',
            excerpt: '请优先展示可用来源',
          },
        })}
      />,
    )

    expect(screen.getAllByText(/请优先展示可用来源/)).toHaveLength(2)
    expect(screen.getByText(/记录时间：/)).toBeInTheDocument()
  })

  it('渲染 intervention 的结构化内容', () => {
    vi.mocked(useEvidenceDetail).mockReturnValue({
      data: {
        data: createRecord({
          sourceType: 'intervention',
          packet: {
            evidenceId: 'ev-001',
            sourceType: 'intervention',
            contentHash: 'f'.repeat(64),
            timestamp: '2026-03-10T10:00:00.000Z',
            intervention: {
              action: 'modify',
              feedback: '请补充原始快照',
              modifiedContent: { reason: '补足上下文' },
              resolvedAt: '2026-03-10T10:05:00.000Z',
              resolvedBy: 'owner',
            },
          },
        }),
      },
      isLoading: false,
      error: null,
    } as never)

    render(
      <EvidenceCard
        node={createNode({
          sourceType: 'intervention',
          packetSummary: {
            title: '人工介入',
            excerpt: '已修改输出',
          },
        })}
      />,
    )

    expect(screen.getByText('修改')).toBeInTheDocument()
    expect(screen.getByText('处理人：owner')).toBeInTheDocument()
    expect(screen.getByText('请补充原始快照')).toBeInTheDocument()
    expect(screen.getByText(/"reason": "补足上下文"/)).toBeInTheDocument()
  })
})

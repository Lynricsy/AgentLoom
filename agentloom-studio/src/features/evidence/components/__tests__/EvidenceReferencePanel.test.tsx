import { useEffect, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EvidenceChainNode, EvidenceChainResponse } from '../../types'
import {
  useEvidenceChain,
  useDocumentContent,
  useEvidenceDetail,
  useEvidenceVerify,
} from '../../api/evidenceQueries'
import {
  useEvidenceUiActions,
  useEvidenceUiDocumentViewer,
  useEvidenceUiExecutionId,
  useEvidenceUiHighlightState,
  useEvidenceUiIsOpen,
  useEvidenceUiNodeId,
  useEvidenceUiNodeName,
  useEvidenceUiSelectedId,
} from '../../stores/evidenceUiStore'
import { EvidenceReferencePanel } from '../EvidenceReferencePanel'

vi.mock('../../stores/evidenceUiStore', () => ({
  useEvidenceUiActions: vi.fn(),
  useEvidenceUiDocumentViewer: vi.fn(),
  useEvidenceUiExecutionId: vi.fn(),
  useEvidenceUiHighlightState: vi.fn(),
  useEvidenceUiIsOpen: vi.fn(),
  useEvidenceUiNodeId: vi.fn(),
  useEvidenceUiNodeName: vi.fn(),
  useEvidenceUiSelectedId: vi.fn(),
}))

vi.mock('../../api/evidenceQueries', () => ({
  useDocumentContent: vi.fn(),
  useEvidenceChain: vi.fn(),
  useEvidenceDetail: vi.fn(),
  useEvidenceVerify: vi.fn(),
}))

function createNode(
  overrides: Partial<EvidenceChainNode> = {},
): EvidenceChainNode {
  return {
    evidenceId: 'ev-root',
    executionId: 'exec-001',
    stepId: 'step-001',
    sourceType: 'rag_retrieval',
    packetSummary: {
      title: 'RAG 检索 · report.md',
      excerpt: '命中文档内容',
      metadata: {
        chunkId: 'chunk-001',
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

function createChainResponse(
  overrides: Partial<EvidenceChainResponse> = {},
): { data: EvidenceChainResponse } {
  const childNode = createNode({
    evidenceId: 'ev-child',
    sourceType: 'agent_decision',
    depth: 1,
    packetSummary: {
      title: 'Agent 决策',
      excerpt: '选择了最终答案',
      metadata: {
        selectedAction: 'respond',
      },
    },
  })

  const rootNode = createNode({
    children: [childNode],
  })

  return {
    data: {
      roots: [rootNode],
      chainCompleteness: 1,
      totalNodes: 2,
      integrityStatus: {
        chainCompleteness: 1,
        totalNodes: 2,
        nodesWithPhysicalLocation: 1,
        completenessLabel: 'complete',
        integrityIssues: [],
      },
      ...overrides,
    },
  }
}

describe('EvidenceReferencePanel', () => {
  const closePanel = vi.fn()
  const selectEvidence = vi.fn()
  const clearHighlight = vi.fn()
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView

  beforeEach(() => {
    vi.clearAllMocks()

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })

    vi.mocked(useEvidenceUiIsOpen).mockReturnValue(true)
    vi.mocked(useEvidenceUiExecutionId).mockReturnValue('exec-001')
    vi.mocked(useEvidenceUiNodeId).mockReturnValue(null)
    vi.mocked(useEvidenceUiNodeName).mockReturnValue(null)
    vi.mocked(useEvidenceUiSelectedId).mockReturnValue(null)
    vi.mocked(useEvidenceUiHighlightState).mockReturnValue({
      highlightedEvidenceId: null,
      highlightUntil: null,
    })
    vi.mocked(useEvidenceUiDocumentViewer).mockReturnValue(null)
    vi.mocked(useEvidenceUiActions).mockReturnValue({
      closePanel,
      selectEvidence,
      openPanel: vi.fn(),
      openDocumentViewer: vi.fn(),
      closeDocumentViewer: vi.fn(),
      openFromPhysicalLocation: vi.fn(),
      clearHighlight,
      reset: vi.fn(),
    })
    vi.mocked(useEvidenceChain).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(useEvidenceDetail).mockReturnValue({
      isFetching: false,
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as never)
    vi.mocked(useEvidenceVerify).mockReturnValue({
      data: undefined,
      isFetching: false,
      error: null,
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as never)
    vi.mocked(useDocumentContent).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as never)
  })

  afterEach(() => {
    vi.unstubAllGlobals()

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView,
    })
  })

  it('面板关闭时不渲染内容', () => {
    vi.mocked(useEvidenceUiIsOpen).mockReturnValue(false)

    render(<EvidenceReferencePanel />)

    const panel = screen.getByTestId('evidence-reference-panel')
    expect(panel).toHaveClass('translate-x-full')
    expect(panel).not.toHaveClass('translate-x-0')
  })

  it('面板打开时显示证据链', () => {
    vi.mocked(useEvidenceChain).mockReturnValue({
      data: createChainResponse(),
      isLoading: false,
      error: null,
    } as never)

    render(<EvidenceReferencePanel />)

    expect(screen.getByText('RAG 检索 · report.md')).toBeInTheDocument()
    expect(screen.getByText('Agent 决策')).toBeInTheDocument()
    expect(screen.getByTestId('evidence-card-ev-root')).toBeInTheDocument()
    expect(screen.getByTestId('evidence-card-ev-child')).toBeInTheDocument()
    expect(screen.getByText('2 条')).toBeInTheDocument()
  })

  it('按Escape关闭面板', () => {
    render(<EvidenceReferencePanel />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(closePanel).toHaveBeenCalledTimes(1)
  })

  it('完整性警告显示', () => {
    vi.mocked(useEvidenceChain).mockReturnValue({
      data: createChainResponse({
        integrityStatus: {
          chainCompleteness: 0.5,
          totalNodes: 2,
          nodesWithPhysicalLocation: 1,
          completenessLabel: 'partial',
          integrityIssues: [
            {
              evidenceId: 'ev-root',
              issueType: 'hash_mismatch',
              description: '内容哈希不一致',
            },
          ],
        },
      }),
      isLoading: false,
      error: null,
    } as never)

    render(<EvidenceReferencePanel />)

    expect(screen.getByText('1 个完整性问题')).toBeInTheDocument()
  })

  it('点击卡片选择证据', () => {
    vi.mocked(useEvidenceChain).mockReturnValue({
      data: createChainResponse(),
      isLoading: false,
      error: null,
    } as never)

    render(<EvidenceReferencePanel />)

    fireEvent.click(screen.getByTestId('evidence-card-ev-root'))

    expect(selectEvidence).toHaveBeenCalledWith('ev-root')
  })

  it('异步加载证据链后会滚动到预选中的证据', async () => {
    const scrollIntoView = vi.fn()

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    vi.mocked(useEvidenceUiSelectedId).mockReturnValue('ev-root')
    vi.mocked(useEvidenceChain).mockImplementation(
      () => {
        const [chainState, setChainState] = useState<
          ReturnType<typeof createChainResponse> | undefined
        >(undefined)

        useEffect(() => {
          setChainState(createChainResponse())
        }, [])

        return {
          data: chainState,
          isLoading: false,
          error: null,
        } as never
      },
    )

    render(<EvidenceReferencePanel />)

    await waitFor(() => {
      expect(screen.getByTestId('evidence-card-ev-root')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
    })
  })
})

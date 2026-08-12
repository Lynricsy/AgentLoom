import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/toast'
import { OptimizationSuggestionsBoard } from '../components/OptimizationSuggestionsBoard'
import type {
  AdoptionStats,
  OptimizationSuggestion,
} from '../types/optimization-suggestion.types'

const mocks = vi.hoisted(() => ({
  useSuggestionList: vi.fn(),
  useAdoptionStats: vi.fn(),
  dismissMutate: vi.fn(),
}))

vi.mock('../api/optimization-suggestion-queries', () => ({
  useSuggestionList: mocks.useSuggestionList,
  useAdoptionStats: mocks.useAdoptionStats,
  useDismissSuggestion: () => ({
    mutate: mocks.dismissMutate,
    isPending: false,
  }),
}))

function createSuggestion(
  overrides: Partial<OptimizationSuggestion> = {},
): OptimizationSuggestion {
  return {
    id: 'sug-1',
    tenantId: 'tenant-1',
    workflowDefinitionId: 'wf-1',
    nodeId: 'node-1',
    suggestionType: 'model_downgrade',
    status: 'pending',
    confidence: 0.82,
    currentValue: { model: 'gpt-4o' },
    suggestedValue: { model: 'gpt-4o-mini' },
    rationale: '该节点近 7 天输出长度稳定，降级后成本下降 40%。',
    impactEstimate: { costSavingPct: 40 },
    analysisMetadata: null,
    analysisPeriodStart: '2026-03-01T00:00:00.000Z',
    analysisPeriodEnd: '2026-03-08T00:00:00.000Z',
    appliedAt: null,
    dismissedAt: null,
    createdAt: '2026-03-10T10:00:00.000Z',
    updatedAt: '2026-03-10T10:00:00.000Z',
    ...overrides,
  }
}

const stats: AdoptionStats = {
  total: 10,
  applied: 7,
  dismissed: 2,
  pending: 1,
  blocked: 0,
  adoptionRate: 0.7,
  targetRate: 0.5,
  byType: [],
}

function listQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  }
}

function statsQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  }
}

function withList(suggestions: OptimizationSuggestion[], total = suggestions.length) {
  return listQuery({
    data: {
      data: suggestions,
      meta: { total, limit: 20, offset: 0, hasMore: total > 20 },
    },
  })
}

function renderBoard() {
  return render(
    <ToastProvider>
      <OptimizationSuggestionsBoard />
    </ToastProvider>,
  )
}

describe('OptimizationSuggestionsBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useAdoptionStats.mockReturnValue(statsQuery({ data: stats }))
    mocks.useSuggestionList.mockReturnValue(withList([]))
  })

  it('渲染采纳率卡片与达标状态', () => {
    mocks.useSuggestionList.mockReturnValue(withList([createSuggestion()]))
    renderBoard()

    expect(screen.getByTestId('suggestion-adoption-rate')).toHaveTextContent('70%')
    expect(screen.getByTestId('suggestion-stats-card')).toHaveTextContent('已达目标')
    expect(screen.getByTestId('suggestion-stats-card')).toHaveTextContent('目标 50%')
  })

  it('采纳率低于目标时给出警示', () => {
    mocks.useAdoptionStats.mockReturnValue(
      statsQuery({ data: { ...stats, adoptionRate: 0.2 } }),
    )
    renderBoard()

    expect(screen.getByTestId('suggestion-stats-card')).toHaveTextContent('低于目标')
  })

  it('尚无建议时采纳率卡片渲染空态', () => {
    mocks.useAdoptionStats.mockReturnValue(
      statsQuery({ data: { ...stats, total: 0 } }),
    )
    renderBoard()

    expect(screen.getByTestId('suggestion-stats-empty')).toBeInTheDocument()
  })

  it('加载中渲染骨架行，失败渲染错误卡片', () => {
    mocks.useAdoptionStats.mockReturnValue(statsQuery({ isLoading: true }))
    mocks.useSuggestionList.mockReturnValue(listQuery({ isLoading: true }))
    const { unmount } = renderBoard()

    expect(screen.getByTestId('suggestion-stats-loading')).toBeInTheDocument()
    expect(
      screen.queryByTestId('optimization-suggestions-empty'),
    ).not.toBeInTheDocument()
    unmount()

    mocks.useAdoptionStats.mockReturnValue(statsQuery({ data: stats }))
    mocks.useSuggestionList.mockReturnValue(
      listQuery({ isError: true, error: new Error('suggestion boom') }),
    )
    renderBoard()

    expect(screen.getByTestId('optimization-suggestions-error')).toHaveTextContent(
      'suggestion boom',
    )
  })

  it('无建议时渲染列表空态', () => {
    renderBoard()

    expect(screen.getByTestId('optimization-suggestions-empty')).toBeInTheDocument()
  })

  it('行内提供忽略与在画布中查看深链，不提供采纳', async () => {
    const user = userEvent.setup()
    mocks.useSuggestionList.mockReturnValue(withList([createSuggestion()]))
    renderBoard()

    expect(screen.getByText('模型降级')).toBeInTheDocument()
    expect(screen.getByText('82%')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '采纳' })).not.toBeInTheDocument()

    expect(screen.getByTestId('suggestion-canvas-link-sug-1')).toHaveAttribute(
      'href',
      '/workflows/wf-1',
    )

    await user.click(screen.getByTestId('suggestion-dismiss-sug-1'))

    expect(mocks.dismissMutate).toHaveBeenCalledWith(
      'sug-1',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('非 pending 建议不展示忽略按钮', () => {
    mocks.useSuggestionList.mockReturnValue(
      withList([createSuggestion({ id: 'sug-2', status: 'applied' })]),
    )
    renderBoard()

    expect(screen.queryByTestId('suggestion-dismiss-sug-2')).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('已采纳')).toBeInTheDocument()
  })

  it('切换状态筛选后按新状态查询并回到第一页', async () => {
    const user = userEvent.setup()
    mocks.useSuggestionList.mockReturnValue(withList([createSuggestion()]))
    renderBoard()

    await user.click(screen.getByTestId('suggestion-filter-dismissed'))

    await waitFor(() => {
      expect(mocks.useSuggestionList).toHaveBeenLastCalledWith({
        limit: 20,
        offset: 0,
        status: 'dismissed',
      })
    })
  })
})

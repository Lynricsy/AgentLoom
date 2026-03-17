import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUseNodeSuggestions = vi.fn()
const mockUseApplySuggestion = vi.fn()
const mockUseDismissSuggestion = vi.fn()

vi.mock('../api/optimization-suggestion-queries', () => ({
  useNodeSuggestions: (...args: unknown[]) => mockUseNodeSuggestions(...args),
  useApplySuggestion: () => mockUseApplySuggestion(),
  useDismissSuggestion: () => mockUseDismissSuggestion(),
}))

import { OptimizationSuggestionsPanel } from '../components/OptimizationSuggestionsPanel'
import type { OptimizationSuggestion } from '../types/optimization-suggestion.types'

function makeSuggestion(
  overrides: Partial<OptimizationSuggestion> = {},
): OptimizationSuggestion {
  return {
    id: 'sug-1',
    tenantId: 'tenant-1',
    workflowDefinitionId: 'wf-1',
    nodeId: 'node-1',
    suggestionType: 'model_downgrade',
    status: 'pending',
    confidence: 0.85,
    currentValue: { model: 'gpt-4' },
    suggestedValue: { model: 'gpt-3.5-turbo' },
    rationale: '可使用低成本模型',
    impactEstimate: null,
    analysisPeriodStart: '2026-03-01T00:00:00Z',
    analysisPeriodEnd: '2026-03-15T00:00:00Z',
    createdAt: '2026-03-15T10:00:00Z',
    updatedAt: '2026-03-15T10:00:00Z',
    ...overrides,
  }
}

describe('OptimizationSuggestionsPanel', () => {
  const mutateFn = vi.fn()

  beforeEach(() => {
    mockUseApplySuggestion.mockReturnValue({ mutate: mutateFn })
    mockUseDismissSuggestion.mockReturnValue({ mutate: mutateFn })
  })

  it('shows loading skeleton', () => {
    mockUseNodeSuggestions.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    })

    render(
      <OptimizationSuggestionsPanel
        workflowDefinitionId="wf-1"
        nodeId="node-1"
      />,
    )

    const panel = screen.getByTestId('optimization-suggestions-panel')
    expect(panel.querySelectorAll('.animate-pulse')).toHaveLength(2)
  })

  it('shows empty state when no suggestions', () => {
    mockUseNodeSuggestions.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    })

    render(
      <OptimizationSuggestionsPanel
        workflowDefinitionId="wf-1"
        nodeId="node-1"
      />,
    )

    expect(screen.getByText('暂无优化建议')).toBeInTheDocument()
  })

  it('shows error state', () => {
    mockUseNodeSuggestions.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
    })

    render(
      <OptimizationSuggestionsPanel
        workflowDefinitionId="wf-1"
        nodeId="node-1"
      />,
    )

    expect(screen.getByText(/加载优化建议失败/)).toBeInTheDocument()
    expect(screen.getByText(/Network error/)).toBeInTheDocument()
  })

  it('renders suggestion cards when data available', () => {
    mockUseNodeSuggestions.mockReturnValue({
      data: [makeSuggestion({ id: 'sug-1' }), makeSuggestion({ id: 'sug-2' })],
      isLoading: false,
      isError: false,
      error: null,
    })

    render(
      <OptimizationSuggestionsPanel
        workflowDefinitionId="wf-1"
        nodeId="node-1"
      />,
    )

    expect(screen.getByText('优化建议')).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
    expect(screen.getAllByTestId('optimization-suggestion-card')).toHaveLength(2)
  })
})

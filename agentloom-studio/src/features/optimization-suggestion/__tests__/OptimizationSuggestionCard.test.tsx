import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { OptimizationSuggestion } from '../types/optimization-suggestion.types'
import { OptimizationSuggestionCard } from '../components/OptimizationSuggestionCard'

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
    rationale: '历史数据显示该节点可使用低成本模型',
    impactEstimate: {
      costSavingPct: 60,
      latencyImpactPct: -10,
    },
    analysisPeriodStart: '2026-03-01T00:00:00Z',
    analysisPeriodEnd: '2026-03-15T00:00:00Z',
    createdAt: '2026-03-15T10:00:00Z',
    updatedAt: '2026-03-15T10:00:00Z',
    ...overrides,
  }
}

describe('OptimizationSuggestionCard', () => {
  it('renders suggestion type, confidence, and rationale', () => {
    const suggestion = makeSuggestion()
    render(
      <OptimizationSuggestionCard
        suggestion={suggestion}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByTestId('optimization-suggestion-card')).toBeInTheDocument()
    expect(screen.getByText('模型降级')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('历史数据显示该节点可使用低成本模型')).toBeInTheDocument()
  })

  it('shows model change for model_downgrade type', () => {
    const suggestion = makeSuggestion()
    render(
      <OptimizationSuggestionCard
        suggestion={suggestion}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('gpt-4')).toBeInTheDocument()
    expect(screen.getByText('gpt-3.5-turbo')).toBeInTheDocument()
  })

  it('shows apply/dismiss buttons when status is pending', () => {
    const onApply = vi.fn()
    const onDismiss = vi.fn()
    const suggestion = makeSuggestion({ status: 'pending' })

    render(
      <OptimizationSuggestionCard
        suggestion={suggestion}
        onApply={onApply}
        onDismiss={onDismiss}
      />,
    )

    const applyBtn = screen.getByText('采纳')
    const dismissBtn = screen.getByText('忽略')

    fireEvent.click(applyBtn)
    expect(onApply).toHaveBeenCalledWith('sug-1')

    fireEvent.click(dismissBtn)
    expect(onDismiss).toHaveBeenCalledWith('sug-1')
  })

  it('hides action buttons and shows status when applied', () => {
    const suggestion = makeSuggestion({
      status: 'applied',
      appliedAt: '2026-03-15T12:00:00Z',
    })

    render(
      <OptimizationSuggestionCard
        suggestion={suggestion}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('已采纳')).toBeInTheDocument()
    expect(screen.queryByText('采纳')).not.toBeInTheDocument()
    expect(screen.queryByText('忽略')).not.toBeInTheDocument()
  })

  it('shows impact estimates', () => {
    const suggestion = makeSuggestion({
      impactEstimate: {
        costSavingPct: 40,
        latencyImpactPct: 5,
        reliabilityImpactPct: -2,
      },
    })

    render(
      <OptimizationSuggestionCard
        suggestion={suggestion}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('成本 -40%')).toBeInTheDocument()
    expect(screen.getByText('延迟 +5%')).toBeInTheDocument()
    expect(screen.getByText('可靠性 -2%')).toBeInTheDocument()
  })

  it('renders timeout_adjustment type correctly', () => {
    const suggestion = makeSuggestion({
      suggestionType: 'timeout_adjustment',
      currentValue: { timeoutMs: 30000 },
      suggestedValue: { timeoutMs: 15000 },
    })

    render(
      <OptimizationSuggestionCard
        suggestion={suggestion}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('超时调整')).toBeInTheDocument()
    expect(screen.getByText('30000ms')).toBeInTheDocument()
    expect(screen.getByText('15000ms')).toBeInTheDocument()
  })

  it('renders tool_pruning type correctly', () => {
    const suggestion = makeSuggestion({
      suggestionType: 'tool_pruning',
      currentValue: { tools: ['search', 'calculate', 'weather'] },
      suggestedValue: { removedTools: ['weather'] },
    })

    render(
      <OptimizationSuggestionCard
        suggestion={suggestion}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('工具精简')).toBeInTheDocument()
    expect(screen.getByText('weather')).toBeInTheDocument()
  })
})

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

  it('disables action buttons while a mutation is in flight', () => {
    const suggestion = makeSuggestion({ status: 'pending' })

    render(
      <OptimizationSuggestionCard
        suggestion={suggestion}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
        actionsDisabled
      />,
    )

    expect(screen.getByText('采纳')).toBeDisabled()
    expect(screen.getByText('忽略')).toBeDisabled()
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

  it('shows blocked badge and policy-block reason without apply actions', () => {
    const suggestion = makeSuggestion({
      suggestionType: 'autonomy_upgrade',
      status: 'blocked',
      currentValue: { autonomyMode: 'RULE_BASED' },
      suggestedValue: { autonomyMode: 'LLM_SUGGEST' },
      analysisMetadata: {
        policyBlock: {
          autonomyCap: 'RULE_BASED',
          rawMode: 'LLM_SUGGEST',
          canonicalMode: 'LLM_SUGGEST',
          replacementMode: 'RULE_BASED',
          source: 'organization_policy',
          reasonCode: 'AUTONOMY_CAP_EXCEEDED',
          message: '组织自治上限禁止升级到 LLM 建议。',
          blockedAt: '2026-03-16T10:00:00Z',
        },
      },
    })

    render(
      <OptimizationSuggestionCard
        suggestion={suggestion}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('已阻断')).toBeInTheDocument()
    expect(screen.getByTestId('optimization-suggestion-policy-block')).toHaveTextContent(
      '组织自治上限禁止升级到 LLM 建议。',
    )
    expect(screen.getByText(/组织上限：规则补全/)).toBeInTheDocument()
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

  it('renders autonomy_upgrade using autonomyMode as the canonical payload key', () => {
    const suggestion = makeSuggestion({
      suggestionType: 'autonomy_upgrade',
      currentValue: {
        autonomyMode: 'MANUAL_CONFIRM',
        mode: 'LEGACY_CURRENT_MODE',
      },
      suggestedValue: {
        autonomyMode: 'LLM_SUGGEST',
        mode: 'LEGACY_SUGGESTED_MODE',
      },
    })

    render(
      <OptimizationSuggestionCard
        suggestion={suggestion}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('自主升级')).toBeInTheDocument()
    expect(screen.getByText('手动确认')).toBeInTheDocument()
    expect(screen.getByText('LLM 建议')).toBeInTheDocument()
    expect(screen.queryByText('LEGACY_CURRENT_MODE')).not.toBeInTheDocument()
    expect(screen.queryByText('LEGACY_SUGGESTED_MODE')).not.toBeInTheDocument()
  })

  it('falls back to legacy mode when autonomyMode is missing', () => {
    const suggestion = makeSuggestion({
      suggestionType: 'autonomy_upgrade',
      currentValue: { mode: 'RULE_BASED' },
      suggestedValue: { mode: 'LLM_SUGGEST' },
    })

    render(
      <OptimizationSuggestionCard
        suggestion={suggestion}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('规则补全')).toBeInTheDocument()
    expect(screen.getByText('LLM 建议')).toBeInTheDocument()
  })
})

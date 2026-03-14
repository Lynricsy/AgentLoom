import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MappingSuggestionCard } from './MappingSuggestionCard'
import type { MappingSuggestion } from '../../types'

afterEach(cleanup)

function makeSuggestion(overrides?: Partial<MappingSuggestion>): MappingSuggestion {
  return {
    sourceField: 'response.title',
    targetField: 'input.name',
    sourceTypeLabel: '文本',
    targetTypeLabel: '文本',
    score: 0.88,
    nameScore: 0.7,
    semanticScore: 0.9,
    typeScore: 1,
    confidenceLevel: 'high',
    compatibilityLabel: 'exact',
    ...overrides,
  }
}

describe('MappingSuggestionCard', () => {
  it('renders source and target paths', () => {
    render(<MappingSuggestionCard suggestion={makeSuggestion()} onApply={vi.fn()} />)
    expect(screen.getByTestId('suggestion-source')).toHaveTextContent('response.title')
    expect(screen.getByTestId('suggestion-target')).toHaveTextContent('input.name')
  })

  it('renders score as percentage', () => {
    render(
      <MappingSuggestionCard suggestion={makeSuggestion({ score: 0.923 })} onApply={vi.fn()} />,
    )
    expect(screen.getByTestId('suggestion-score')).toHaveTextContent('92%')
  })

  it('renders confidence badge', () => {
    render(
      <MappingSuggestionCard suggestion={makeSuggestion({ confidenceLevel: 'medium' })} onApply={vi.fn()} />,
    )
    const badge = screen.getByTestId('suggestion-confidence')
    expect(badge).toHaveTextContent('中')
    expect(badge.className).toContain('medium')
  })

  it('renders compatibility and concrete type-pair labels', () => {
    render(
      <MappingSuggestionCard
        suggestion={makeSuggestion({
          compatibilityLabel: 'coercible',
          sourceTypeLabel: '数组',
          targetTypeLabel: '文本',
        })}
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByTestId('suggestion-compat')).toHaveTextContent('可转换')
    expect(screen.getByTestId('suggestion-type-pair')).toHaveTextContent('数组 → 文本')
  })

  it('renders suggested coercion label when available', () => {
    render(
      <MappingSuggestionCard
        suggestion={makeSuggestion({ suggestedCoercion: { strategy: 'JSON.parse' } })}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByTestId('suggestion-coercion')).toHaveTextContent('JSON Parse')
  })

  it('calls onApply when the card is clicked', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const suggestion = makeSuggestion()

    render(<MappingSuggestionCard suggestion={suggestion} onApply={onApply} />)
    await user.click(screen.getByTestId('suggestion-card-input.name'))

    expect(onApply).toHaveBeenCalledWith(suggestion)
  })
})

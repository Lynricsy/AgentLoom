import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MappingSuggestionCard } from './MappingSuggestionCard'
import type { MappingSuggestion } from '../../types'

afterEach(cleanup)

function makeSuggestion(overrides?: Partial<MappingSuggestion>): MappingSuggestion {
  return {
    sourceField: 'response.title',
    targetField: 'input.name',
    score: 0.88,
    nameScore: 0.7,
    semanticScore: 0.9,
    typeScore: 1.0,
    confidenceLevel: 'high',
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
    render(<MappingSuggestionCard suggestion={makeSuggestion({ score: 0.923 })} onApply={vi.fn()} />)
    expect(screen.getByTestId('suggestion-score')).toHaveTextContent('92%')
  })

  it('renders high confidence badge', () => {
    render(<MappingSuggestionCard suggestion={makeSuggestion({ confidenceLevel: 'high' })} onApply={vi.fn()} />)
    const badge = screen.getByTestId('suggestion-confidence')
    expect(badge).toHaveTextContent('高')
    expect(badge.className).toContain('high')
  })

  it('renders medium confidence badge', () => {
    render(<MappingSuggestionCard suggestion={makeSuggestion({ confidenceLevel: 'medium', score: 0.75 })} onApply={vi.fn()} />)
    const badge = screen.getByTestId('suggestion-confidence')
    expect(badge).toHaveTextContent('中')
    expect(badge.className).toContain('medium')
  })

  it('renders low confidence badge', () => {
    render(<MappingSuggestionCard suggestion={makeSuggestion({ confidenceLevel: 'low', score: 0.55 })} onApply={vi.fn()} />)
    const badge = screen.getByTestId('suggestion-confidence')
    expect(badge).toHaveTextContent('低')
    expect(badge.className).toContain('low')
  })

  it('renders coercion label when suggested', () => {
    render(
      <MappingSuggestionCard
        suggestion={makeSuggestion({ suggestedCoercion: { strategy: 'JSON.parse' } })}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByTestId('suggestion-coercion')).toHaveTextContent('JSON Parse')
  })

  it('does not render coercion label when not suggested', () => {
    render(<MappingSuggestionCard suggestion={makeSuggestion()} onApply={vi.fn()} />)
    expect(screen.queryByTestId('suggestion-coercion')).not.toBeInTheDocument()
  })

  it('calls onApply when clicked', () => {
    const onApply = vi.fn()
    const suggestion = makeSuggestion()
    render(<MappingSuggestionCard suggestion={suggestion} onApply={onApply} />)
    fireEvent.click(screen.getByTestId('suggestion-card-input.name'))
    expect(onApply).toHaveBeenCalledWith(suggestion)
  })

  it('rounds score to nearest integer', () => {
    render(<MappingSuggestionCard suggestion={makeSuggestion({ score: 0.855 })} onApply={vi.fn()} />)
    expect(screen.getByTestId('suggestion-score')).toHaveTextContent('86%')
  })
})

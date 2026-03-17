import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mockUseAdoptionStats = vi.fn()

vi.mock('../api/optimization-suggestion-queries', () => ({
  useAdoptionStats: (...args: unknown[]) => mockUseAdoptionStats(...args),
}))

import { AdoptionStatsBadge } from '../components/AdoptionStatsBadge'

describe('AdoptionStatsBadge', () => {
  it('renders nothing while loading', () => {
    mockUseAdoptionStats.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    const { container } = render(<AdoptionStatsBadge />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when total is 0', () => {
    mockUseAdoptionStats.mockReturnValue({
      data: { total: 0, adoptionRate: 0 },
      isLoading: false,
    })

    const { container } = render(<AdoptionStatsBadge />)
    expect(container.firstChild).toBeNull()
  })

  it('shows green badge when adoption rate >= 50%', () => {
    mockUseAdoptionStats.mockReturnValue({
      data: {
        total: 10,
        applied: 7,
        dismissed: 2,
        pending: 1,
        adoptionRate: 0.7,
        targetRate: 0.5,
        byType: [],
      },
      isLoading: false,
    })

    render(<AdoptionStatsBadge />)

    const badge = screen.getByTestId('adoption-stats-badge')
    expect(badge).toHaveTextContent('采纳率: 70% ✓')
    expect(badge.className).toContain('text-emerald-400')
  })

  it('shows amber badge when adoption rate < 50%', () => {
    mockUseAdoptionStats.mockReturnValue({
      data: {
        total: 10,
        applied: 3,
        dismissed: 5,
        pending: 2,
        adoptionRate: 0.3,
        targetRate: 0.5,
        byType: [],
      },
      isLoading: false,
    })

    render(<AdoptionStatsBadge />)

    const badge = screen.getByTestId('adoption-stats-badge')
    expect(badge).toHaveTextContent('采纳率: 30% ⚠')
    expect(badge.className).toContain('text-amber-400')
  })
})

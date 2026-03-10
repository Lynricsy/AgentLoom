import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EvidenceChips } from './EvidenceChips'

describe('EvidenceChips', () => {
  it('渲染证据计数', () => {
    render(<EvidenceChips count={5} />)
    const chips = screen.getByTestId('evidence-chips')
    expect(chips).toHaveTextContent('5 条证据')
  })

  it('count 为 1 时正常显示', () => {
    render(<EvidenceChips count={1} />)
    expect(screen.getByTestId('evidence-chips')).toHaveTextContent('1 条证据')
  })

  it('count 为 0 时不渲染', () => {
    const { container } = render(<EvidenceChips count={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('count 为负数时不渲染', () => {
    const { container } = render(<EvidenceChips count={-1} />)
    expect(container.firstChild).toBeNull()
  })
})

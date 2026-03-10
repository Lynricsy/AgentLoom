import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OutputLevelBadge } from './OutputLevelBadge'

describe('OutputLevelBadge', () => {
  it('渲染 L1 原生结构化', () => {
    render(<OutputLevelBadge level={1} />)
    const badge = screen.getByTestId('output-level-badge-1')
    expect(badge).toHaveTextContent('L1')
    expect(badge).toHaveTextContent('原生结构化')
  })

  it('渲染 L2 提示约束', () => {
    render(<OutputLevelBadge level={2} />)
    const badge = screen.getByTestId('output-level-badge-2')
    expect(badge).toHaveTextContent('L2')
    expect(badge).toHaveTextContent('提示约束')
  })

  it('渲染 L3 验证修复', () => {
    render(<OutputLevelBadge level={3} />)
    const badge = screen.getByTestId('output-level-badge-3')
    expect(badge).toHaveTextContent('L3')
    expect(badge).toHaveTextContent('验证修复')
  })

  it('渲染 L4 降级解析', () => {
    render(<OutputLevelBadge level={4} />)
    const badge = screen.getByTestId('output-level-badge-4')
    expect(badge).toHaveTextContent('L4')
    expect(badge).toHaveTextContent('降级解析')
  })

  it('null level 不渲染', () => {
    const { container } = render(<OutputLevelBadge level={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('level 0 不渲染', () => {
    const { container } = render(<OutputLevelBadge level={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('level 5 不渲染', () => {
    const { container } = render(<OutputLevelBadge level={5} />)
    expect(container.firstChild).toBeNull()
  })
})

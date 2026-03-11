import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SourceStatusBadge } from '../SourceStatusBadge'

vi.mock('@radix-ui/react-tooltip', () => ({
  Provider: ({ children }: { children: React.ReactNode }) => children,
  Root: ({ children }: { children: React.ReactNode }) => children,
  Trigger: ({ children }: { children: React.ReactNode }) => children,
  Portal: ({ children }: { children: React.ReactNode }) => children,
  Content: ({ children }: { children: React.ReactNode }) => (
    <div role="tooltip">{children}</div>
  ),
  Arrow: () => null,
}))

describe('SourceStatusBadge', () => {
  it('valid 状态只显示完整标签', () => {
    render(<SourceStatusBadge hashValid />)

    expect(screen.getByTestId('source-status-badge')).toHaveTextContent('来源完整')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.queryByTestId('toggle-original-snapshot')).not.toBeInTheDocument()
  })

  it('modified 状态显示哈希 tooltip 与快照切换入口', () => {
    const onToggleOriginalSnapshot = vi.fn()

    render(
      <SourceStatusBadge
        hashValid={false}
        sourceModified
        createdAt="2026-03-10T10:00:00.000Z"
        currentHash={'b'.repeat(64)}
        originalHash={'a'.repeat(64)}
        hasOriginalSnapshot
        snapshotVisible={false}
        onToggleOriginalSnapshot={onToggleOriginalSnapshot}
      />,
    )

    expect(screen.getByTestId('source-status-badge')).toHaveTextContent('来源已修改')
    expect(screen.getByRole('tooltip')).toHaveTextContent('源文档已修改')
    expect(screen.getByRole('tooltip')).toHaveTextContent(`当前哈希：${'b'.repeat(64)}`)
    expect(screen.getByRole('tooltip')).toHaveTextContent(`原始哈希：${'a'.repeat(64)}`)

    fireEvent.click(screen.getByTestId('toggle-original-snapshot'))
    expect(onToggleOriginalSnapshot).toHaveBeenCalledTimes(1)
  })

  it('unavailable 状态显示原因并支持隐藏原始快照文案', () => {
    render(
      <SourceStatusBadge
        hashValid={false}
        sourceUnavailable
        unavailableReason="源文档已删除"
        createdAt="2026-03-10T10:00:00.000Z"
        originalHash={'f'.repeat(64)}
        hasOriginalSnapshot
        snapshotVisible
        onToggleOriginalSnapshot={vi.fn()}
      />,
    )

    expect(screen.getByTestId('source-status-badge')).toHaveTextContent('来源不可用')
    expect(screen.getByRole('tooltip')).toHaveTextContent('源文档不可用')
    expect(screen.getByRole('tooltip')).toHaveTextContent('源文档已删除')
    expect(screen.getByRole('tooltip')).toHaveTextContent(`原始哈希：${'f'.repeat(64)}`)
    expect(screen.getByTestId('toggle-original-snapshot')).toHaveTextContent('隐藏原始快照')
  })
})

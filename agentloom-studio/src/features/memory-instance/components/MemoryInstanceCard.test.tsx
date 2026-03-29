import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryInstanceCard } from './MemoryInstanceCard'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    className,
    children,
  }: {
    to: string
    params: { instanceId: string }
    className?: string
    children: React.ReactNode
  }) => (
    <a href={to.replace('$instanceId', params.instanceId)} className={className}>
      {children}
    </a>
  ),
}))

vi.mock('@/features/canvas', () => ({
  formatRelativeTime: () => '刚刚',
}))

describe('MemoryInstanceCard', () => {
  it('渲染浏览入口与实例摘要信息', () => {
    render(
      <MemoryInstanceCard
        instance={{
          id: 'memory-1',
          name: 'Agent Memory',
          description: '用于测试浏览器入口',
          config: null,
          validDomains: ['core', 'project'],
          coreMemoryUris: [],
          systemPromptOverride: null,
          status: 'active',
          createdAt: '2026-03-28T00:00:00.000Z',
          updatedAt: '2026-03-28T00:00:00.000Z',
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleStatus={vi.fn()}
      />,
    )

    expect(screen.getByText('Agent Memory')).toBeInTheDocument()
    expect(screen.getByText('活跃')).toBeInTheDocument()
    expect(screen.getByText('用于测试浏览器入口')).toBeInTheDocument()
    expect(screen.getByText('core')).toBeInTheDocument()
    expect(screen.getByText('project')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '浏览' })).toHaveAttribute(
      'href',
      '/resources/memory-instances/memory-1/browse',
    )
  })
})

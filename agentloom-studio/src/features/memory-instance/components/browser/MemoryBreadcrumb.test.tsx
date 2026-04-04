import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MemoryBreadcrumb } from './MemoryBreadcrumb'

describe('MemoryBreadcrumb', () => {
  it('为根路径按钮提供可访问名称并支持返回根路径', () => {
    const onNavigate = vi.fn()

    render(
      <MemoryBreadcrumb
        items={[
          { path: '', label: 'core' },
          { path: 'topic', label: 'topic' },
        ]}
        onNavigate={onNavigate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '返回根路径' }))

    expect(onNavigate).toHaveBeenCalledWith('')
  })
})

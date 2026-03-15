import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VersionToolbar } from '../VersionToolbar'

vi.mock('@/features/workflow/components/CreateVersionDialog', () => ({
  CreateVersionDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="mock-create-version-dialog">CreateVersionDialog</div> : null,
}))

vi.mock('@/features/workflow/components/ArchiveDialog', () => ({
  ArchiveDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="mock-archive-dialog">ArchiveDialog</div> : null,
}))

const defaultProps = {
  workflowId: 'wf-001',
  workflowStatus: 'draft' as const,
  onOpenVersionHistory: vi.fn(),
  onOpenPublish: vi.fn(),
  onToggleInterventionPolicies: vi.fn(),
  onToggleTriggers: vi.fn(),
}

describe('VersionToolbar workflow settings toggles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('提供 toggle 回调时显示两个设置入口并分别响应点击', () => {
    render(<VersionToolbar {...defaultProps} />)

    const interventionButton = screen.getByTestId('btn-intervention-policies')
    const triggerButton = screen.getByTestId('btn-triggers')
    expect(interventionButton).toHaveTextContent('介入策略')
    expect(triggerButton).toHaveTextContent('触发器')

    fireEvent.click(interventionButton)
    expect(defaultProps.onToggleInterventionPolicies).toHaveBeenCalledTimes(1)

    fireEvent.click(triggerButton)
    expect(defaultProps.onToggleTriggers).toHaveBeenCalledTimes(1)
  })

  it('介入策略打开状态下显示隐藏文案', () => {
    render(
      <VersionToolbar
        {...defaultProps}
        isInterventionPoliciesOpen
      />,
    )

    expect(screen.getByTestId('btn-intervention-policies')).toHaveTextContent('隐藏介入策略')
  })

  it('触发器打开状态下显示隐藏文案', () => {
    render(
      <VersionToolbar
        {...defaultProps}
        isTriggersOpen
      />,
    )

    expect(screen.getByTestId('btn-triggers')).toHaveTextContent('隐藏触发器')
  })

  it('未提供设置 toggle 回调时不显示相关按钮', () => {
    render(
      <VersionToolbar
        workflowId="wf-001"
        workflowStatus="draft"
        onOpenVersionHistory={vi.fn()}
        onOpenPublish={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('btn-intervention-policies')).not.toBeInTheDocument()
    expect(screen.queryByTestId('btn-triggers')).not.toBeInTheDocument()
  })
})

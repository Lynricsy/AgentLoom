import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useEvidenceUiActions } from '@/features/evidence'

import { EvidenceChips } from '../EvidenceChips'

vi.mock('@/features/evidence', () => ({
  useEvidenceUiActions: vi.fn(),
}))

describe('EvidenceChips', () => {
  const openPanel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useEvidenceUiActions).mockReturnValue({
      openPanel,
      closePanel: vi.fn(),
      selectEvidence: vi.fn(),
      openDocumentViewer: vi.fn(),
      closeDocumentViewer: vi.fn(),
      openFromPhysicalLocation: vi.fn(),
      clearHighlight: vi.fn(),
      reset: vi.fn(),
    })
  })

  it('渲染证据来源标签', () => {
    render(
      <EvidenceChips
        count={3}
        executionId="exec-001"
        nodeId="node-001"
        nodeName="节点A"
      />,
    )

    expect(screen.getByTestId('evidence-chips')).toHaveTextContent('3 条证据')
  })

  it('数量为0时不渲染', () => {
    render(<EvidenceChips count={0} executionId="exec-001" />)

    expect(screen.queryByTestId('evidence-chips')).not.toBeInTheDocument()
  })

  it('点击标签打开证据面板', () => {
    render(
      <EvidenceChips
        count={2}
        executionId="exec-001"
        nodeId="node-001"
        nodeName="节点A"
      />,
    )

    fireEvent.click(screen.getByTestId('evidence-chips'))

    expect(openPanel).toHaveBeenCalledWith('exec-001', 'node-001', '节点A')
  })

  it('无executionId时点击无效', () => {
    render(<EvidenceChips count={2} />)

    fireEvent.click(screen.getByTestId('evidence-chips'))

    expect(openPanel).not.toHaveBeenCalled()
  })
})

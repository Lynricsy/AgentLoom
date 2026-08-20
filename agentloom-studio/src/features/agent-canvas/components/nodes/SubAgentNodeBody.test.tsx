import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CanvasNodeData } from '@/features/canvas'
import { SubAgentNodeBody } from './SubAgentNodeBody'

function createSubAgentNodeData(overrides: Partial<CanvasNodeData> = {}): CanvasNodeData {
  return {
    label: '子 Agent',
    nodeType: 'sub-agent' as CanvasNodeData['nodeType'],
    category: 'agent',
    config: {
      agentDefinitionId: 'agent-2',
      alias: 'review-agent',
      _agentName: 'Review Agent',
      _versionLabel: 'v2 (稳定版)',
    },
    inputPorts: [],
    outputPorts: [],
    ...overrides,
  }
}

describe('SubAgentNodeBody', () => {
  it('未配置时显示占位文案', () => {
    render(<SubAgentNodeBody data={createSubAgentNodeData({ config: {} })} />)

    expect(screen.getByText('选择子 Agent')).toBeInTheDocument()
  })

  it('显示 agent 名称、alias 与版本标签', () => {
    render(<SubAgentNodeBody data={createSubAgentNodeData()} />)

    expect(screen.getByText('Review Agent')).toBeInTheDocument()
    expect(screen.getByText('@review-agent')).toBeInTheDocument()
    expect(screen.getByText('v2 (稳定版)')).toBeInTheDocument()
  })
})

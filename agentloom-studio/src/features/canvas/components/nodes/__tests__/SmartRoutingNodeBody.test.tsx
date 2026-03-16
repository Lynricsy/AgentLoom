import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SmartRoutingNodeData } from '../../../types'
import { SmartRoutingNodeBody } from '../SmartRoutingNodeBody'

function createSmartRoutingData(
  overrides: Partial<SmartRoutingNodeData> = {},
): SmartRoutingNodeData {
  return {
    label: '智能路由',
    nodeType: 'smart-routing',
    category: 'agent',
    description: '根据策略从多个 LLM 模型中选择最优模型',
    config: {},
    strategy: 'FALLBACK_CHAIN',
    inputPorts: [
      {
        id: 'model-in-0',
        label: '模型 1',
        direction: 'input',
        dataType: 'model',
        required: true,
        multiple: false,
        maxConnections: 1,
        schema: { kind: 'model', title: '模型 1' },
      },
      {
        id: 'model-in-1',
        label: '模型 2',
        direction: 'input',
        dataType: 'model',
        required: true,
        multiple: false,
        maxConnections: 1,
        schema: { kind: 'model', title: '模型 2' },
      },
    ],
    outputPorts: [
      {
        id: 'model-out',
        label: '选定模型',
        direction: 'output',
        dataType: 'model',
        required: false,
        multiple: true,
        maxConnections: 5,
        schema: { kind: 'model', title: '选定模型' },
      },
    ],
    ...overrides,
  }
}

describe('SmartRoutingNodeBody', () => {
  it('renders strategy label for FALLBACK_CHAIN by default', () => {
    render(<SmartRoutingNodeBody data={createSmartRoutingData()} />)

    expect(screen.getByText('回退链')).toBeInTheDocument()
  })

  it('renders strategy label for TOKEN_OPTIMIZED', () => {
    render(<SmartRoutingNodeBody data={createSmartRoutingData({ strategy: 'TOKEN_OPTIMIZED' })} />)

    expect(screen.getByText('Token 优化')).toBeInTheDocument()
  })

  it('renders strategy label for HISTORICAL_BEST', () => {
    render(<SmartRoutingNodeBody data={createSmartRoutingData({ strategy: 'HISTORICAL_BEST' })} />)

    expect(screen.getByText('历史最佳')).toBeInTheDocument()
  })

  it('prefers connectedModelCount over other sources', () => {
    render(
      <SmartRoutingNodeBody
        data={createSmartRoutingData({ modelConfigIds: ['m1', 'm2', 'm3'] })}
        connectedModelCount={1}
      />,
    )

    expect(screen.getByText('1 个模型')).toBeInTheDocument()
  })

  it('falls back to modelConfigIds when connectedModelCount is not provided', () => {
    render(
      <SmartRoutingNodeBody
        data={createSmartRoutingData({ modelConfigIds: ['m1', 'm2', 'm3'] })}
      />,
    )

    expect(screen.getByText('3 个模型')).toBeInTheDocument()
  })

  it('does not infer model count from inputPorts anymore', () => {
    render(<SmartRoutingNodeBody data={createSmartRoutingData()} />)

    expect(screen.getByText('0 个模型')).toBeInTheDocument()
  })

  it('shows raw strategy value when unrecognized', () => {
    render(
      <SmartRoutingNodeBody
        data={createSmartRoutingData({ strategy: 'UNKNOWN_STRATEGY' as SmartRoutingNodeData['strategy'] })}
      />,
    )

    expect(screen.getByText('UNKNOWN_STRATEGY')).toBeInTheDocument()
  })
})

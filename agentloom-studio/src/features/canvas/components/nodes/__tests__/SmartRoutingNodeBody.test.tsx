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
    strategy: 'QUALITY_FIRST',
    inputPorts: [
      {
        id: 'model-input-1',
        label: '模型 1',
        direction: 'input',
        dataType: 'model',
        required: true,
        multiple: false,
        maxConnections: 1,
        schema: { kind: 'model', title: '模型 1' },
      },
      {
        id: 'model-input-2',
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
        id: 'model-output',
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
  it('renders strategy label for QUALITY_FIRST', () => {
    render(<SmartRoutingNodeBody data={createSmartRoutingData()} />)

    expect(screen.getByText('质量优先')).toBeInTheDocument()
  })

  it('renders strategy label for TOKEN_OPTIMIZED', () => {
    render(
      <SmartRoutingNodeBody
        data={createSmartRoutingData({ strategy: 'TOKEN_OPTIMIZED' })}
      />,
    )

    expect(screen.getByText('Token 优化')).toBeInTheDocument()
  })

  it('renders strategy label for COST_OPTIMIZED', () => {
    render(
      <SmartRoutingNodeBody
        data={createSmartRoutingData({ strategy: 'COST_OPTIMIZED' })}
      />,
    )

    expect(screen.getByText('成本优化')).toBeInTheDocument()
  })

  it('renders strategy label for LATENCY_FIRST', () => {
    render(
      <SmartRoutingNodeBody
        data={createSmartRoutingData({ strategy: 'LATENCY_FIRST' })}
      />,
    )

    expect(screen.getByText('延迟优先')).toBeInTheDocument()
  })

  it('renders strategy label for HISTORICAL_BEST', () => {
    render(
      <SmartRoutingNodeBody
        data={createSmartRoutingData({ strategy: 'HISTORICAL_BEST' })}
      />,
    )

    expect(screen.getByText('历史最佳')).toBeInTheDocument()
  })

  it('renders strategy label for FALLBACK_CHAIN', () => {
    render(
      <SmartRoutingNodeBody
        data={createSmartRoutingData({ strategy: 'FALLBACK_CHAIN' })}
      />,
    )

    expect(screen.getByText('回退链')).toBeInTheDocument()
  })

  it('shows model count from inputPorts', () => {
    render(<SmartRoutingNodeBody data={createSmartRoutingData()} />)

    expect(screen.getByText('2 个模型')).toBeInTheDocument()
  })

  it('shows model count from modelConfigIds when available', () => {
    render(
      <SmartRoutingNodeBody
        data={createSmartRoutingData({
          modelConfigIds: ['m1', 'm2', 'm3'],
        })}
      />,
    )

    expect(screen.getByText('3 个模型')).toBeInTheDocument()
  })

  it('shows 0 models when no ports or config ids', () => {
    render(
      <SmartRoutingNodeBody
        data={createSmartRoutingData({
          inputPorts: undefined,
          modelConfigIds: undefined,
        })}
      />,
    )

    expect(screen.getByText('0 个模型')).toBeInTheDocument()
  })

  it('shows raw strategy value when unrecognized', () => {
    render(
      <SmartRoutingNodeBody
        data={createSmartRoutingData({
          strategy: 'UNKNOWN_STRATEGY' as SmartRoutingNodeData['strategy'],
        })}
      />,
    )

    expect(screen.getByText('UNKNOWN_STRATEGY')).toBeInTheDocument()
  })
})

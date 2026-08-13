import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SmartRoutingNodeData } from '../../../types'
import { SmartRoutingNodeBody } from '../SmartRoutingNodeBody'
import { PreviewModeContext } from '../../PreviewModeContext'

const mocks = vi.hoisted(() => ({
  useHealthStatus: vi.fn().mockReturnValue({ data: undefined }),
}))

vi.mock('@/features/smart-routing', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useHealthStatus: mocks.useHealthStatus,
  }
})

function createSmartRoutingData(
  overrides: Partial<SmartRoutingNodeData> = {},
): SmartRoutingNodeData {
  return {
    label: '智能路由',
    nodeType: 'smart-routing',
    category: 'agent',
    description: '根据策略从多个 LLM 模型中选择最优模型',
    config: {},
    strategy: 'random',
    strategyConfig: {},
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
  beforeEach(() => {
    mocks.useHealthStatus.mockReturnValue({ data: undefined })
  })

  describe('策略显示', () => {
    it('renders strategy label for random (default)', () => {
      render(<SmartRoutingNodeBody data={createSmartRoutingData()} />)

      expect(screen.getByText('随机路由')).toBeInTheDocument()
    })

    it('renders strategy label for fallback_chain', () => {
      render(
        <SmartRoutingNodeBody data={createSmartRoutingData({ strategy: 'fallback_chain' })} />,
      )

      expect(screen.getByText('回退链')).toBeInTheDocument()
    })

    it('renders strategy label for knn', () => {
      render(<SmartRoutingNodeBody data={createSmartRoutingData({ strategy: 'knn' })} />)

      expect(screen.getByText('KNN 路由')).toBeInTheDocument()
    })

    it('renders strategy label for elo', () => {
      render(<SmartRoutingNodeBody data={createSmartRoutingData({ strategy: 'elo' })} />)

      expect(screen.getByText('Elo 评分')).toBeInTheDocument()
    })

    it('renders strategy label for memory_bank', () => {
      render(
        <SmartRoutingNodeBody data={createSmartRoutingData({ strategy: 'memory_bank' })} />,
      )

      expect(screen.getByText('记忆库路由')).toBeInTheDocument()
    })

    it('renders strategy label for wasm_plugin', () => {
      render(
        <SmartRoutingNodeBody data={createSmartRoutingData({ strategy: 'wasm_plugin' })} />,
      )

      expect(screen.getByText('WASM 插件')).toBeInTheDocument()
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

  describe('模型计数', () => {
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

    it('shows 0 when no model count sources available', () => {
      render(<SmartRoutingNodeBody data={createSmartRoutingData()} />)

      expect(screen.getByText('0 个模型')).toBeInTheDocument()
    })
  })

  describe('健康状态摘要', () => {
    it('shows health summary dots when health data is available', () => {
      mocks.useHealthStatus.mockReturnValue({
        data: [
          { providerName: 'openai', modelId: 'gpt-4', status: 'healthy', failureCount: 0, lastFailureAt: null },
          { providerName: 'anthropic', modelId: 'claude-3', status: 'degraded', failureCount: 2, lastFailureAt: '2026-01-01' },
        ],
      })

      render(<SmartRoutingNodeBody data={createSmartRoutingData()} />)

      const summary = screen.getByTestId('provider-health-summary')
      expect(summary).toBeInTheDocument()

      expect(screen.getByTestId('provider-health-badge-healthy')).toHaveTextContent('1')
      expect(screen.getByTestId('provider-health-badge-degraded')).toHaveTextContent('1')
    })

    it('shows open badge when providers have open circuit', () => {
      mocks.useHealthStatus.mockReturnValue({
        data: [
          { providerName: 'openai', modelId: 'gpt-4', status: 'open', failureCount: 10, lastFailureAt: '2026-01-01' },
        ],
      })

      render(<SmartRoutingNodeBody data={createSmartRoutingData()} />)

      expect(screen.getByTestId('provider-health-badge-open')).toHaveTextContent('1')
    })

    it('does not show health summary when no health data', () => {
      mocks.useHealthStatus.mockReturnValue({ data: undefined })

      render(<SmartRoutingNodeBody data={createSmartRoutingData()} />)

      expect(screen.queryByTestId('provider-health-summary')).not.toBeInTheDocument()
    })

    it('does not show health summary when health data is empty', () => {
      mocks.useHealthStatus.mockReturnValue({ data: [] })

      render(<SmartRoutingNodeBody data={createSmartRoutingData()} />)

      expect(screen.queryByTestId('provider-health-summary')).not.toBeInTheDocument()
    })
  })

  describe('预览态隔离', () => {
    it('editor 渲染时启用 health 查询', () => {
      render(<SmartRoutingNodeBody data={createSmartRoutingData()} />)

      expect(mocks.useHealthStatus).toHaveBeenCalledWith(true)
    })

    it('预览态禁用受保护的 health 查询', () => {
      render(
        <PreviewModeContext.Provider value={{ edges: [], lodOverride: null }}>
          <SmartRoutingNodeBody data={createSmartRoutingData()} />
        </PreviewModeContext.Provider>,
      )

      expect(mocks.useHealthStatus).toHaveBeenCalledWith(false)
    })
  })
})

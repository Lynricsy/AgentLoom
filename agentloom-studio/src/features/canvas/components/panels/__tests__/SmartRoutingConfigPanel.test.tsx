import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasNode } from '../../../types'
import { SmartRoutingConfigPanel } from '../SmartRoutingConfigPanel'

const mocks = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
  useStrategies: vi.fn().mockReturnValue({
    data: [
      { name: 'random', category: 'simple', requiresEmbedding: false, configSchema: null },
      { name: 'round_robin', category: 'simple', requiresEmbedding: false, configSchema: null },
      { name: 'rules', category: 'simple', requiresEmbedding: false, configSchema: null },
      { name: 'llm_as_router', category: 'simple', requiresEmbedding: false, configSchema: null },
      { name: 'fallback_chain', category: 'simple', requiresEmbedding: false, configSchema: null },
      { name: 'knn', category: 'ml', requiresEmbedding: true, configSchema: null },
      { name: 'mlp', category: 'ml', requiresEmbedding: false, configSchema: null },
      { name: 'elo', category: 'ml', requiresEmbedding: false, configSchema: null },
      { name: 'memory_bank', category: 'rag', requiresEmbedding: true, configSchema: null },
      { name: 'wasm_plugin', category: 'plugin', requiresEmbedding: false, configSchema: null },
    ],
    isLoading: false,
  }),
  useHealthStatus: vi.fn().mockReturnValue({ data: undefined }),
  useConfigSchema: vi.fn().mockReturnValue({ data: undefined }),
}))

vi.mock('../../../stores/canvasStore', () => ({
  useCanvasActions: () => ({
    updateNodeData: mocks.updateNodeData,
  }),
}))

vi.mock('@/features/smart-routing', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useStrategies: mocks.useStrategies,
    useHealthStatus: mocks.useHealthStatus,
    useConfigSchema: mocks.useConfigSchema,
  }
})

function createSmartRoutingNode(overrides: Partial<CanvasNode['data']> = {}): CanvasNode {
  return {
    id: 'smart-routing-1',
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
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
    } as CanvasNode['data'],
  }
}

describe('SmartRoutingConfigPanel', () => {
  const onConfigChange = vi.fn()

  beforeEach(() => {
    onConfigChange.mockReset()
    mocks.updateNodeData.mockReset()
    mocks.useStrategies.mockReturnValue({
      data: [
        { name: 'random', category: 'simple', requiresEmbedding: false, configSchema: null },
        { name: 'round_robin', category: 'simple', requiresEmbedding: false, configSchema: null },
        { name: 'rules', category: 'simple', requiresEmbedding: false, configSchema: null },
        { name: 'llm_as_router', category: 'simple', requiresEmbedding: false, configSchema: null },
        { name: 'fallback_chain', category: 'simple', requiresEmbedding: false, configSchema: null },
        { name: 'knn', category: 'ml', requiresEmbedding: true, configSchema: null },
        { name: 'mlp', category: 'ml', requiresEmbedding: false, configSchema: null },
        { name: 'elo', category: 'ml', requiresEmbedding: false, configSchema: null },
        { name: 'memory_bank', category: 'rag', requiresEmbedding: true, configSchema: null },
        { name: 'wasm_plugin', category: 'plugin', requiresEmbedding: false, configSchema: null },
      ],
      isLoading: false,
    })
    mocks.useHealthStatus.mockReturnValue({ data: undefined })
    mocks.useConfigSchema.mockReturnValue({ data: undefined })
  })

  describe('基础渲染', () => {
    it('renders panel with title', () => {
      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode()}
          onConfigChange={onConfigChange}
        />,
      )

      expect(screen.getByTestId('smart-routing-config-panel')).toBeInTheDocument()
      expect(screen.getByText('智能路由配置')).toBeInTheDocument()
    })

    it('renders strategy selector with random as default strategy', () => {
      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode()}
          onConfigChange={onConfigChange}
        />,
      )

      const select = screen.getByTestId('strategy-select') as HTMLSelectElement
      expect(select.value).toBe('random')
    })

    it('shows strategy description', () => {
      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode()}
          onConfigChange={onConfigChange}
        />,
      )

      expect(screen.getByText('从可用模型中随机选择一个')).toBeInTheDocument()
    })
  })

  describe('分类分组', () => {
    it('renders strategy groups for all four categories', () => {
      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode()}
          onConfigChange={onConfigChange}
        />,
      )

      const select = screen.getByTestId('strategy-select')
      const optgroups = select.querySelectorAll('optgroup')
      expect(optgroups.length).toBe(4)

      const labels = Array.from(optgroups).map((og) => og.getAttribute('label'))
      expect(labels).toEqual(['基础策略', '机器学习', 'RAG 增强', '插件扩展'])
    })

    it('renders all 10 strategy options', () => {
      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode()}
          onConfigChange={onConfigChange}
        />,
      )

      const select = screen.getByTestId('strategy-select')
      const options = select.querySelectorAll('option')
      expect(options.length).toBe(10)
    })

    it('shows category badge for selected strategy', () => {
      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode({ strategy: 'knn' })}
          onConfigChange={onConfigChange}
        />,
      )

      expect(screen.getByText('机器学习')).toBeInTheDocument()
    })
  })

  describe('策略切换', () => {
    it('calls onConfigChange with strategy and empty strategyConfig when strategy changes', () => {
      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode()}
          onConfigChange={onConfigChange}
        />,
      )

      fireEvent.change(screen.getByTestId('strategy-select'), {
        target: { value: 'round_robin' },
      })

      expect(onConfigChange).toHaveBeenCalledWith({
        strategy: 'round_robin',
        strategyConfig: {},
      })
    })

    it('switching to fallback_chain seeds fallbackPriority with model port ids', () => {
      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode({ fallbackPriority: undefined })}
          onConfigChange={onConfigChange}
        />,
      )

      fireEvent.change(screen.getByTestId('strategy-select'), {
        target: { value: 'fallback_chain' },
      })

      expect(onConfigChange).toHaveBeenCalledWith({
        strategy: 'fallback_chain',
        strategyConfig: {},
        fallbackPriority: ['model-in-0', 'model-in-1'],
      })
    })

    it('shows fallback_chain description after switching', () => {
      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode({ strategy: 'fallback_chain' })}
          onConfigChange={onConfigChange}
        />,
      )

      expect(
        screen.getByText('按优先级依次尝试，失败时切换到下一个模型'),
      ).toBeInTheDocument()
    })
  })

  describe('动态配置参数', () => {
    it('renders number field from config schema', () => {
      mocks.useConfigSchema.mockReturnValue({
        data: {
          type: 'object',
          properties: {
            k: {
              type: 'number',
              title: 'K 值',
              description: '近邻数量',
              minimum: 1,
              maximum: 50,
              default: 5,
            },
          },
        },
      })

      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode({ strategy: 'knn', strategyConfig: { k: 10 } })}
          onConfigChange={onConfigChange}
        />,
      )

      const input = screen.getByTestId('strategy-param-k') as HTMLInputElement
      expect(input).toBeInTheDocument()
      expect(input.type).toBe('number')
      expect(input.value).toBe('10')
    })

    it('renders string field from config schema', () => {
      mocks.useConfigSchema.mockReturnValue({
        data: {
          type: 'object',
          properties: {
            promptTemplate: {
              type: 'string',
              title: '提示模板',
              description: '路由提示',
            },
          },
        },
      })

      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode({
            strategy: 'llm_as_router',
            strategyConfig: { promptTemplate: 'Choose the best model' },
          })}
          onConfigChange={onConfigChange}
        />,
      )

      const input = screen.getByTestId('strategy-param-promptTemplate') as HTMLInputElement
      expect(input).toBeInTheDocument()
      expect(input.type).toBe('text')
      expect(input.value).toBe('Choose the best model')
    })

    it('renders boolean field from config schema', () => {
      mocks.useConfigSchema.mockReturnValue({
        data: {
          type: 'object',
          properties: {
            enableExploration: {
              type: 'boolean',
              title: '启用探索',
              default: true,
            },
          },
        },
      })

      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode({
            strategy: 'elo',
            strategyConfig: { enableExploration: true },
          })}
          onConfigChange={onConfigChange}
        />,
      )

      const input = screen.getByTestId('strategy-param-enableExploration') as HTMLInputElement
      expect(input).toBeInTheDocument()
      expect(input.type).toBe('checkbox')
      expect(input.checked).toBe(true)
    })

    it('renders enum field as select from config schema', () => {
      mocks.useConfigSchema.mockReturnValue({
        data: {
          type: 'object',
          properties: {
            distanceMetric: {
              type: 'string',
              title: '距离度量',
              enum: ['cosine', 'euclidean', 'dot_product'],
              default: 'cosine',
            },
          },
        },
      })

      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode({
            strategy: 'knn',
            strategyConfig: { distanceMetric: 'euclidean' },
          })}
          onConfigChange={onConfigChange}
        />,
      )

      const select = screen.getByTestId('strategy-param-distanceMetric') as HTMLSelectElement
      expect(select).toBeInTheDocument()
      expect(select.value).toBe('euclidean')
      expect(select.querySelectorAll('option').length).toBe(3)
    })

    it('calls onConfigChange when a schema param changes', () => {
      mocks.useConfigSchema.mockReturnValue({
        data: {
          type: 'object',
          properties: {
            k: { type: 'number', title: 'K 值', default: 5 },
          },
        },
      })

      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode({ strategy: 'knn', strategyConfig: { k: 5 } })}
          onConfigChange={onConfigChange}
        />,
      )

      fireEvent.change(screen.getByTestId('strategy-param-k'), {
        target: { value: '10' },
      })

      expect(onConfigChange).toHaveBeenCalledWith({
        strategyConfig: { k: 10 },
      })
    })
  })

  describe('Provider 健康状态', () => {
    it('shows health badges when health data is available', () => {
      mocks.useHealthStatus.mockReturnValue({
        data: [
          { providerName: 'openai', modelId: 'gpt-4', status: 'healthy', failureCount: 0, lastFailureAt: null },
          { providerName: 'anthropic', modelId: 'claude-3', status: 'healthy', failureCount: 0, lastFailureAt: null },
          { providerName: 'cohere', modelId: 'command', status: 'degraded', failureCount: 3, lastFailureAt: '2026-01-01' },
        ],
      })

      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode()}
          onConfigChange={onConfigChange}
        />,
      )

      const summary = screen.getByTestId('provider-health-summary')
      expect(summary).toBeInTheDocument()

      expect(screen.getByTestId('provider-health-badge-healthy')).toHaveTextContent('2')
      expect(screen.getByTestId('provider-health-badge-degraded')).toHaveTextContent('1')
    })

    it('shows open circuit warning', () => {
      mocks.useHealthStatus.mockReturnValue({
        data: [
          { providerName: 'openai', modelId: 'gpt-4', status: 'open', failureCount: 10, lastFailureAt: '2026-01-01' },
        ],
      })

      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode()}
          onConfigChange={onConfigChange}
        />,
      )

      expect(screen.getByText(/1 个 Provider 已断路/)).toBeInTheDocument()
    })

    it('does not show health section when no health data', () => {
      mocks.useHealthStatus.mockReturnValue({ data: undefined })

      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode()}
          onConfigChange={onConfigChange}
        />,
      )

      expect(screen.queryByTestId('provider-health-summary')).not.toBeInTheDocument()
    })
  })

  describe('回退链优先级', () => {
    it('shows fallback priority list for fallback_chain strategy', () => {
      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode({
            strategy: 'fallback_chain',
            fallbackPriority: ['model-in-0', 'model-in-1'],
          })}
          onConfigChange={onConfigChange}
        />,
      )

      const list = screen.getByTestId('fallback-priority-list')
      expect(list).toBeInTheDocument()
      expect(within(list).getByText('模型 1')).toBeInTheDocument()
      expect(within(list).getByText('模型 2')).toBeInTheDocument()
    })

    it('shows fallback priority list even when fallbackPriority is missing', () => {
      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode({
            strategy: 'fallback_chain',
            fallbackPriority: undefined,
          })}
          onConfigChange={onConfigChange}
        />,
      )

      const list = screen.getByTestId('fallback-priority-list')
      expect(list).toBeInTheDocument()
      expect(within(list).getByText('模型 1')).toBeInTheDocument()
      expect(within(list).getByText('模型 2')).toBeInTheDocument()
    })

    it('does not show fallback priority list for non-fallback_chain strategy', () => {
      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode({ strategy: 'random' })}
          onConfigChange={onConfigChange}
        />,
      )

      expect(screen.queryByTestId('fallback-priority-list')).not.toBeInTheDocument()
    })
  })

  describe('模型端口管理', () => {
    it('lists model input ports', () => {
      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode()}
          onConfigChange={onConfigChange}
        />,
      )

      expect(screen.getByText(/模型输入端口\s*\(2\)/)).toBeInTheDocument()
    })

    it('adds a model port and keeps fallbackPriority in sync', () => {
      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode()}
          onConfigChange={onConfigChange}
        />,
      )

      fireEvent.click(screen.getByTestId('add-model-port'))

      expect(mocks.updateNodeData).toHaveBeenCalledWith('smart-routing-1', {
        inputPorts: expect.arrayContaining([expect.objectContaining({ id: 'model-in-2' })]),
        fallbackPriority: ['model-in-0', 'model-in-1', 'model-in-2'],
      })
    })

    it('does not show remove button at minimum port count', () => {
      render(
        <SmartRoutingConfigPanel
          node={createSmartRoutingNode()}
          onConfigChange={onConfigChange}
        />,
      )

      expect(screen.queryByTestId('remove-port-model-in-0')).not.toBeInTheDocument()
      expect(screen.queryByTestId('remove-port-model-in-1')).not.toBeInTheDocument()
    })

    it('shows remove button when above minimum port count', () => {
      const node = createSmartRoutingNode({
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
          {
            id: 'model-in-2',
            label: '模型 3',
            direction: 'input',
            dataType: 'model',
            required: false,
            multiple: false,
            maxConnections: 1,
            schema: { kind: 'model', title: '模型 3' },
          },
        ],
        fallbackPriority: ['model-in-0', 'model-in-1', 'model-in-2'],
      })

      render(
        <SmartRoutingConfigPanel node={node} onConfigChange={onConfigChange} />,
      )

      expect(screen.getByTestId('remove-port-model-in-0')).toBeInTheDocument()
    })

    it('removes a port and syncs fallbackPriority', () => {
      const node = createSmartRoutingNode({
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
          {
            id: 'model-in-2',
            label: '模型 3',
            direction: 'input',
            dataType: 'model',
            required: false,
            multiple: false,
            maxConnections: 1,
            schema: { kind: 'model', title: '模型 3' },
          },
        ],
        fallbackPriority: ['model-in-0', 'model-in-1', 'model-in-2'],
      })

      render(
        <SmartRoutingConfigPanel node={node} onConfigChange={onConfigChange} />,
      )

      fireEvent.click(screen.getByTestId('remove-port-model-in-2'))

      expect(mocks.updateNodeData).toHaveBeenCalledWith('smart-routing-1', {
        inputPorts: expect.not.arrayContaining([expect.objectContaining({ id: 'model-in-2' })]),
        fallbackPriority: ['model-in-0', 'model-in-1'],
      })
    })
  })
})

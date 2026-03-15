import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasNode } from '../../../types'
import { SmartRoutingConfigPanel } from '../SmartRoutingConfigPanel'

const mocks = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
}))

vi.mock('../../../stores/canvasStore', () => ({
  useCanvasActions: () => ({
    updateNodeData: mocks.updateNodeData,
  }),
}))

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
      config: {
        strategy: 'QUALITY_FIRST',
      },
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
    },
  }
}

describe('SmartRoutingConfigPanel', () => {
  const onConfigChange = vi.fn()

  beforeEach(() => {
    onConfigChange.mockReset()
    mocks.updateNodeData.mockReset()
  })

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

  it('renders strategy selector with current strategy', () => {
    render(
      <SmartRoutingConfigPanel
        node={createSmartRoutingNode()}
        onConfigChange={onConfigChange}
      />,
    )

    const select = screen.getByTestId('strategy-select') as HTMLSelectElement
    expect(select.value).toBe('QUALITY_FIRST')
  })

  it('calls onConfigChange when strategy changes', () => {
    render(
      <SmartRoutingConfigPanel
        node={createSmartRoutingNode()}
        onConfigChange={onConfigChange}
      />,
    )

    fireEvent.change(screen.getByTestId('strategy-select'), {
      target: { value: 'COST_OPTIMIZED' },
    })

    expect(onConfigChange).toHaveBeenCalledWith({ strategy: 'COST_OPTIMIZED' })
  })

  it('shows strategy description', () => {
    render(
      <SmartRoutingConfigPanel
        node={createSmartRoutingNode()}
        onConfigChange={onConfigChange}
      />,
    )

    expect(screen.getByText('选择质量排名最高的模型')).toBeInTheDocument()
  })

  it('shows token threshold input for TOKEN_OPTIMIZED strategy', () => {
    render(
      <SmartRoutingConfigPanel
        node={createSmartRoutingNode({
          config: { strategy: 'TOKEN_OPTIMIZED', tokenThreshold: 8192 },
        })}
        onConfigChange={onConfigChange}
      />,
    )

    const input = screen.getByTestId('token-threshold-input') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('8192')
  })

  it('does not show token threshold for non-TOKEN_OPTIMIZED strategies', () => {
    render(
      <SmartRoutingConfigPanel
        node={createSmartRoutingNode()}
        onConfigChange={onConfigChange}
      />,
    )

    expect(screen.queryByTestId('token-threshold-input')).not.toBeInTheDocument()
  })

  it('shows fallback priority list for FALLBACK_CHAIN strategy with priorities', () => {
    render(
      <SmartRoutingConfigPanel
        node={createSmartRoutingNode({
          config: {
            strategy: 'FALLBACK_CHAIN',
            fallbackPriority: ['gpt-4', 'claude-3'],
          },
        })}
        onConfigChange={onConfigChange}
      />,
    )

    expect(screen.getByTestId('fallback-priority-list')).toBeInTheDocument()
    expect(screen.getByText('gpt-4')).toBeInTheDocument()
    expect(screen.getByText('claude-3')).toBeInTheDocument()
  })

  it('lists model input ports', () => {
    render(
      <SmartRoutingConfigPanel
        node={createSmartRoutingNode()}
        onConfigChange={onConfigChange}
      />,
    )

    expect(screen.getByText('模型 1')).toBeInTheDocument()
    expect(screen.getByText('模型 2')).toBeInTheDocument()
    expect(screen.getByText(/模型输入端口\s*\(2\)/)).toBeInTheDocument()
  })

  it('shows add port button when under max', () => {
    render(
      <SmartRoutingConfigPanel
        node={createSmartRoutingNode()}
        onConfigChange={onConfigChange}
      />,
    )

    expect(screen.getByTestId('add-model-port')).toBeInTheDocument()
    expect(screen.getByText('添加模型端口')).toBeInTheDocument()
  })

  it('adds a model port when add button clicked', () => {
    render(
      <SmartRoutingConfigPanel
        node={createSmartRoutingNode()}
        onConfigChange={onConfigChange}
      />,
    )

    fireEvent.click(screen.getByTestId('add-model-port'))

    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'smart-routing-1',
      expect.objectContaining({
        inputPorts: expect.arrayContaining([
          expect.objectContaining({ id: 'model-input-3' }),
        ]),
      }),
    )
  })

  it('does not show remove button at minimum port count', () => {
    render(
      <SmartRoutingConfigPanel
        node={createSmartRoutingNode()}
        onConfigChange={onConfigChange}
      />,
    )

    expect(screen.queryByTestId('remove-port-model-input-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('remove-port-model-input-2')).not.toBeInTheDocument()
  })

  it('shows remove button when above minimum port count', () => {
    const node = createSmartRoutingNode({
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
        {
          id: 'model-input-3',
          label: '模型 3',
          direction: 'input',
          dataType: 'model',
          required: false,
          multiple: false,
          maxConnections: 1,
          schema: { kind: 'model', title: '模型 3' },
        },
      ],
    })

    render(
      <SmartRoutingConfigPanel node={node} onConfigChange={onConfigChange} />,
    )

    expect(screen.getByTestId('remove-port-model-input-1')).toBeInTheDocument()
  })

  it('removes a port when remove button clicked', () => {
    const node = createSmartRoutingNode({
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
        {
          id: 'model-input-3',
          label: '模型 3',
          direction: 'input',
          dataType: 'model',
          required: false,
          multiple: false,
          maxConnections: 1,
          schema: { kind: 'model', title: '模型 3' },
        },
      ],
    })

    render(
      <SmartRoutingConfigPanel node={node} onConfigChange={onConfigChange} />,
    )

    fireEvent.click(screen.getByTestId('remove-port-model-input-3'))

    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'smart-routing-1',
      expect.objectContaining({
        inputPorts: expect.not.arrayContaining([
          expect.objectContaining({ id: 'model-input-3' }),
        ]),
      }),
    )
  })
})

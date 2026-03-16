import { fireEvent, render, screen, within } from '@testing-library/react'
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
    } as CanvasNode['data'],
  }
}

describe('SmartRoutingConfigPanel', () => {
  const onConfigChange = vi.fn()

  beforeEach(() => {
    onConfigChange.mockReset()
    mocks.updateNodeData.mockReset()
  })

  it('renders panel with title', () => {
    render(<SmartRoutingConfigPanel node={createSmartRoutingNode()} onConfigChange={onConfigChange} />)

    expect(screen.getByTestId('smart-routing-config-panel')).toBeInTheDocument()
    expect(screen.getByText('智能路由配置')).toBeInTheDocument()
  })

  it('renders strategy selector with FALLBACK_CHAIN as default strategy', () => {
    render(<SmartRoutingConfigPanel node={createSmartRoutingNode()} onConfigChange={onConfigChange} />)

    const select = screen.getByTestId('strategy-select') as HTMLSelectElement
    expect(select.value).toBe('FALLBACK_CHAIN')
  })

  it('calls onConfigChange when strategy changes', () => {
    render(<SmartRoutingConfigPanel node={createSmartRoutingNode()} onConfigChange={onConfigChange} />)

    fireEvent.change(screen.getByTestId('strategy-select'), {
      target: { value: 'COST_OPTIMIZED' },
    })

    expect(onConfigChange).toHaveBeenCalledWith({ strategy: 'COST_OPTIMIZED' })
  })

  it('switching to FALLBACK_CHAIN seeds fallbackPriority with model port ids', () => {
    render(
      <SmartRoutingConfigPanel
        node={createSmartRoutingNode({ strategy: 'QUALITY_FIRST', fallbackPriority: undefined })}
        onConfigChange={onConfigChange}
      />,
    )

    fireEvent.change(screen.getByTestId('strategy-select'), {
      target: { value: 'FALLBACK_CHAIN' },
    })

    expect(onConfigChange).toHaveBeenCalledWith({
      strategy: 'FALLBACK_CHAIN',
      fallbackPriority: ['model-in-0', 'model-in-1'],
    })
  })

  it('shows strategy description', () => {
    render(<SmartRoutingConfigPanel node={createSmartRoutingNode()} onConfigChange={onConfigChange} />)

    expect(screen.getByText('按优先级依次尝试，失败时切换到下一个模型')).toBeInTheDocument()
  })

  it('shows token threshold input for TOKEN_OPTIMIZED strategy', () => {
    render(
      <SmartRoutingConfigPanel
        node={createSmartRoutingNode({ strategy: 'TOKEN_OPTIMIZED', tokenThreshold: 8192 })}
        onConfigChange={onConfigChange}
      />,
    )

    const input = screen.getByTestId('token-threshold-input') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('8192')
  })

  it('shows fallback priority list for FALLBACK_CHAIN even when fallbackPriority is missing', () => {
    render(
      <SmartRoutingConfigPanel
        node={createSmartRoutingNode({ fallbackPriority: undefined })}
        onConfigChange={onConfigChange}
      />,
    )

    const list = screen.getByTestId('fallback-priority-list')
    expect(list).toBeInTheDocument()
    expect(within(list).getByText('模型 1')).toBeInTheDocument()
    expect(within(list).getByText('模型 2')).toBeInTheDocument()
  })

  it('lists model input ports', () => {
    render(<SmartRoutingConfigPanel node={createSmartRoutingNode()} onConfigChange={onConfigChange} />)

    expect(screen.getByText(/模型输入端口\s*\(2\)/)).toBeInTheDocument()
  })

  it('adds a model port and keeps fallbackPriority in sync', () => {
    render(<SmartRoutingConfigPanel node={createSmartRoutingNode()} onConfigChange={onConfigChange} />)

    fireEvent.click(screen.getByTestId('add-model-port'))

    expect(mocks.updateNodeData).toHaveBeenCalledWith('smart-routing-1', {
      inputPorts: expect.arrayContaining([expect.objectContaining({ id: 'model-in-2' })]),
      fallbackPriority: ['model-in-0', 'model-in-1', 'model-in-2'],
    })
  })

  it('does not show remove button at minimum port count', () => {
    render(<SmartRoutingConfigPanel node={createSmartRoutingNode()} onConfigChange={onConfigChange} />)

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

    render(<SmartRoutingConfigPanel node={node} onConfigChange={onConfigChange} />)

    expect(screen.getByTestId('remove-port-model-in-0')).toBeInTheDocument()
  })

  it('removes a port and同步清理 fallbackPriority', () => {
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

    render(<SmartRoutingConfigPanel node={node} onConfigChange={onConfigChange} />)

    fireEvent.click(screen.getByTestId('remove-port-model-in-2'))

    expect(mocks.updateNodeData).toHaveBeenCalledWith('smart-routing-1', {
      inputPorts: expect.not.arrayContaining([expect.objectContaining({ id: 'model-in-2' })]),
      fallbackPriority: ['model-in-0', 'model-in-1'],
    })
  })
})

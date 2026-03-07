import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Position } from '@xyflow/react'
import { TypedPort } from './TypedPort'
import type { PortDefinition } from '../types/nodeTypeRegistry'

const { useNodeConnectionsMock } = vi.hoisted(() => ({
  useNodeConnectionsMock: vi.fn<() => Array<{ id: string }>>(() => []),
}))

vi.mock('@xyflow/react', () => ({
  Handle: ({
    className,
      'data-testid': dataTestId,
      'data-node-id': dataNodeId,
      'data-port-id': dataPortId,
      'data-port-direction': dataPortDirection,
      'data-port-type': dataPortType,
    'data-port-shape': dataPortShape,
    'data-port-state': dataPortState,
    'aria-label': ariaLabel,
  }: {
    className?: string
    'data-testid'?: string
    'data-node-id'?: string
    'data-port-id'?: string
    'data-port-direction'?: string
    'data-port-type'?: string
    'data-port-shape'?: string
    'data-port-state'?: string
    'aria-label'?: string
  }) => (
    <button
      type="button"
      className={className}
          data-testid={dataTestId}
          data-node-id={dataNodeId}
          data-port-id={dataPortId}
          data-port-direction={dataPortDirection}
          data-port-type={dataPortType}
      data-port-shape={dataPortShape}
      data-port-state={dataPortState}
      aria-label={ariaLabel}
    />
  ),
  Position: { Left: 'left', Right: 'right' },
  useNodeConnections: useNodeConnectionsMock,
}))

const mockPort: PortDefinition = {
  id: 'prompt',
  label: '提示词',
  direction: 'input',
  dataType: 'text',
  required: true,
  multiple: false,
  maxConnections: 1,
  schema: {
    kind: 'text',
    title: '提示词',
  },
}

const mockOutputPort: PortDefinition = {
  id: 'result',
  label: '结果',
  direction: 'output',
  dataType: 'model',
  required: false,
  multiple: true,
  maxConnections: null,
  schema: {
    kind: 'model',
    title: '结果',
  },
}

const mockJsonPort: PortDefinition = {
  id: 'payload',
  label: 'payload',
  direction: 'output',
  dataType: 'json',
  required: false,
  multiple: false,
  maxConnections: 1,
  schema: {
    kind: 'json',
    shape: 'object',
    title: 'payload',
    properties: {},
    additionalProperties: true,
  },
}

describe('TypedPort', () => {
  it('renders stable DOM contract attributes', () => {
    render(
      <TypedPort
        nodeId="node-1"
        port={mockPort}
        position={Position.Left}
        isConnectable
      />,
    )

    const handle = screen.getByTestId('port-node-1-prompt-input')

    expect(handle).toHaveAttribute('data-node-id', 'node-1')
    expect(handle).toHaveAttribute('data-port-id', 'prompt')
    expect(handle).toHaveAttribute('data-port-direction', 'input')
    expect(handle).toHaveAttribute('data-port-type', 'text')
    expect(handle).toHaveAttribute('data-port-shape', 'circle')
    expect(handle).toHaveAttribute('data-port-state', 'idle')
    expect(handle).toHaveAttribute('aria-label', '输入端口: 提示词, 类型: Text')
  })

  it('passes node-aware connection lookup arguments to React Flow', () => {
    render(
      <TypedPort
        nodeId="node-2"
        port={mockPort}
        position={Position.Left}
        isConnectable
      />,
    )

    expect(useNodeConnectionsMock).toHaveBeenCalledWith({
      id: 'node-2',
      handleId: 'prompt',
      handleType: 'target',
    })
  })

  it('switches to connected state when connections exist', () => {
    useNodeConnectionsMock.mockReturnValueOnce([{ id: 'edge-1' }])

    render(
      <TypedPort
        nodeId="node-3"
        port={mockOutputPort}
        position={Position.Right}
        isConnectable={false}
      />,
    )

    expect(screen.getByTestId('port-node-3-result-output')).toHaveAttribute('data-port-state', 'connected')
  })

  it('lets compatibility state override connection state', () => {
    render(
      <TypedPort
        nodeId="node-4"
        port={mockOutputPort}
        position={Position.Right}
        isConnectable
        compatibilityState="incompatible"
      />,
    )

    const handle = screen.getByTestId('port-node-4-result-output')

    expect(handle).toHaveAttribute('data-port-state', 'incompatible')
    expect(handle.className).toContain('typed-port--shake')
  })

  it('renders json ports with the square shape metadata', () => {
    render(
      <TypedPort
        nodeId="node-5"
        port={mockJsonPort}
        position={Position.Right}
        isConnectable
      />,
    )

    const handle = screen.getByTestId('port-node-5-payload-output')

    expect(handle).toHaveAttribute('data-port-type', 'json')
    expect(handle).toHaveAttribute('data-port-shape', 'square')
    expect(handle).toHaveAttribute('aria-label', '输出端口: payload, 类型: JSON')
  })
})

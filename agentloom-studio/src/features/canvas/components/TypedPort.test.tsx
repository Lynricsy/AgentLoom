import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TypedPort } from './TypedPort'
import { PORT_DATA_TYPE_META } from '../nodeTypeRegistry'
import type { PortDefinition } from '../typeSchema'

vi.mock('@xyflow/react', () => ({
  Handle: (props: Record<string, unknown>) => (
    <div
      data-testid={props['data-testid'] as string}
      data-port-type={props['data-port-type'] as string}
      data-port-state={props['data-port-state'] as string}
      aria-label={props['aria-label'] as string}
      className={props.className as string}
    />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useNodeConnections: vi.fn(() => []),
}))

const mockPort: PortDefinition = {
  id: 'input-prompt',
  label: '提示词',
  direction: 'input',
  dataType: 'text',
  required: true,
  multiple: false,
  maxConnections: 1,
  schema: { kind: 'scalar', type: 'string' },
}

const mockOutputPort: PortDefinition = {
  id: 'output-result',
  label: '结果',
  direction: 'output',
  dataType: 'model',
  required: false,
  multiple: true,
  maxConnections: null,
  schema: { kind: 'scalar', type: 'string' },
}

describe('TypedPort', () => {
  it('应该渲染正确的 data-testid', () => {
    render(
      <TypedPort
        nodeId="node-1"
        port={mockPort}
        position={'left' as never}
        isConnectable={true}
      />,
    )

    expect(
      screen.getByTestId('port-node-1-input-prompt-input'),
    ).toBeInTheDocument()
  })

  it('应该设置正确的 data-port-type', () => {
    render(
      <TypedPort
        nodeId="node-1"
        port={mockPort}
        position={'left' as never}
        isConnectable={true}
      />,
    )

    const el = screen.getByTestId('port-node-1-input-prompt-input')
    expect(el.getAttribute('data-port-type')).toBe('text')
  })

  it('无连接时状态应为 idle', () => {
    render(
      <TypedPort
        nodeId="node-1"
        port={mockPort}
        position={'left' as never}
        isConnectable={true}
      />,
    )

    const el = screen.getByTestId('port-node-1-input-prompt-input')
    expect(el.getAttribute('data-port-state')).toBe('idle')
  })

  it('应该使用 compatibilityState 覆盖默认状态', () => {
    render(
      <TypedPort
        nodeId="node-1"
        port={mockPort}
        position={'left' as never}
        isConnectable={true}
        compatibilityState="incompatible"
      />,
    )

    const el = screen.getByTestId('port-node-1-input-prompt-input')
    expect(el.getAttribute('data-port-state')).toBe('incompatible')
  })

  it('有连接时状态应为 connected', async () => {
    const { useNodeConnections } = await import('@xyflow/react')
    vi.mocked(useNodeConnections).mockReturnValue([{ edgeId: 'e1', source: 's', target: 't', sourceHandle: 'sh', targetHandle: 'th' }] as never)

    render(
      <TypedPort
        nodeId="node-1"
        port={mockPort}
        position={'left' as never}
        isConnectable={true}
      />,
    )

    const el = screen.getByTestId('port-node-1-input-prompt-input')
    expect(el.getAttribute('data-port-state')).toBe('connected')

    vi.mocked(useNodeConnections).mockReturnValue([] as never)
  })

  it('应该渲染正确的 aria-label（输入端口）', () => {
    render(
      <TypedPort
        nodeId="node-1"
        port={mockPort}
        position={'left' as never}
        isConnectable={true}
      />,
    )

    const meta = PORT_DATA_TYPE_META[mockPort.dataType]
    const el = screen.getByTestId('port-node-1-input-prompt-input')
    expect(el.getAttribute('aria-label')).toBe(
      `输入端口: ${mockPort.label}, 类型: ${meta.label}`,
    )
  })

  it('应该渲染正确的 aria-label（输出端口）', () => {
    render(
      <TypedPort
        nodeId="node-1"
        port={mockOutputPort}
        position={'right' as never}
        isConnectable={true}
      />,
    )

    const meta = PORT_DATA_TYPE_META[mockOutputPort.dataType]
    const el = screen.getByTestId('port-node-1-output-result-output')
    expect(el.getAttribute('aria-label')).toBe(
      `输出端口: ${mockOutputPort.label}, 类型: ${meta.label}`,
    )
  })

  it('应该包含正确的 CSS 类名', () => {
    render(
      <TypedPort
        nodeId="node-1"
        port={mockPort}
        position={'left' as never}
        isConnectable={true}
      />,
    )

    const meta = PORT_DATA_TYPE_META[mockPort.dataType]
    const el = screen.getByTestId('port-node-1-input-prompt-input')
    expect(el.className).toContain('typed-port')
    expect(el.className).toContain(`typed-port-shape--${meta.shape}`)
    expect(el.className).toContain('typed-port-state--idle')
  })
})

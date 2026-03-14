import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BlockNodeData } from '../../types'
import { ReusableBlockPanel } from './ReusableBlockPanel'

function createBlockNodeData(overrides: Partial<BlockNodeData> = {}): BlockNodeData {
  return {
    label: '复用分析块',
    nodeType: 'reusable-block',
    category: 'control',
    description: '封装的数据处理块',
    config: {},
    blockId: 'block-def-1',
    blockName: '复用分析块',
    inputPorts: [
      {
        id: 'input-1',
        label: '输入上下文',
        direction: 'input',
        dataType: 'json',
        required: false,
        multiple: false,
        maxConnections: 1,
        schema: {
          kind: 'json',
          shape: 'object',
          title: '输入上下文',
          properties: {},
          additionalProperties: true,
        },
      },
    ],
    outputPorts: [
      {
        id: 'output-1',
        label: '结构化结果',
        direction: 'output',
        dataType: 'json',
        required: false,
        multiple: false,
        maxConnections: 1,
        schema: {
          kind: 'json',
          shape: 'object',
          title: '结构化结果',
          properties: {},
          additionalProperties: true,
        },
      },
    ],
    blockDefinition: {
      nodes: [
        {
          id: 'inner-1',
          type: 'tool',
          position: { x: 0, y: 0 },
          data: {
            label: '内部节点 1',
            nodeType: 'code-tool',
            category: 'tool',
            config: {},
            inputPorts: [],
            outputPorts: [],
          },
        },
        {
          id: 'inner-2',
          type: 'output',
          position: { x: 200, y: 0 },
          data: {
            label: '内部节点 2',
            nodeType: 'text-output',
            category: 'output',
            config: {},
            inputPorts: [],
            outputPorts: [],
          },
        },
      ],
      edges: [
        {
          id: 'inner-edge-1',
          source: 'inner-1',
          target: 'inner-2',
        },
      ],
      inputPorts: [
        {
          id: 'derived-input-1',
          label: '输入上下文',
          dataType: 'json',
          sourceNodeId: 'inner-1',
          sourcePortId: 'context',
        },
      ],
      outputPorts: [
        {
          id: 'derived-output-1',
          label: '结构化结果',
          dataType: 'json',
          sourceNodeId: 'inner-2',
          sourcePortId: 'result',
        },
      ],
    },
    isExpanded: false,
    ...overrides,
  }
}

describe('ReusableBlockPanel', () => {
  it('renders block metadata and exposed ports', () => {
    render(<ReusableBlockPanel data={createBlockNodeData()} onApply={vi.fn()} />)

    expect(screen.getByDisplayValue('复用分析块')).toBeInTheDocument()
    expect(screen.getByDisplayValue('封装的数据处理块')).toBeInTheDocument()
    expect(screen.getByText('2 个节点')).toBeInTheDocument()
    expect(screen.getByText('输入上下文')).toBeInTheDocument()
    expect(screen.getByText('结构化结果')).toBeInTheDocument()
  })

  it('applies block name and expanded-state changes', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()

    render(<ReusableBlockPanel data={createBlockNodeData()} onApply={onApply} />)

    const nameInput = screen.getByLabelText('块名称')
    await user.clear(nameInput)
    await user.type(nameInput, '新的复用块')

    expect(onApply).toHaveBeenLastCalledWith({
      label: '新的复用块',
      blockName: '新的复用块',
    })

    await user.click(screen.getByLabelText('查看内部图'))

    expect(onApply).toHaveBeenLastCalledWith({
      isExpanded: true,
    })
  })
})

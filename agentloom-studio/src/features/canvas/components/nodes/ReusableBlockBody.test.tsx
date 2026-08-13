import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlockNodeData } from '../../types'
import { ReusableBlockBody } from './ReusableBlockBody'
import { PreviewModeContext } from '../PreviewModeContext'

const mocks = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
}))

vi.mock('../../stores/canvasStore', () => ({
  useCanvasActions: () => ({
    updateNodeData: mocks.updateNodeData,
  }),
}))

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
      {
        id: 'output-2',
        label: '文本摘要',
        direction: 'output',
        dataType: 'text',
        required: false,
        multiple: false,
        maxConnections: 1,
        schema: {
          kind: 'text',
          title: '文本摘要',
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

describe('ReusableBlockBody', () => {
  beforeEach(() => {
    mocks.updateNodeData.mockReset()
  })

  it('renders block name and port summary in collapsed mode', () => {
    render(<ReusableBlockBody nodeId="block-node-1" data={createBlockNodeData()} />)

    const body = screen.getByTestId('reusable-block-body')

    expect(body).toHaveTextContent(/复用分析块/)
    expect(body).toHaveTextContent(/1入\s*\/\s*2出/)
    expect(body).toHaveTextContent(/2\s*节点\s*\/\s*1\s*连线/)
  })

  it('renders expanded preview when isExpanded is true', () => {
    render(
      <ReusableBlockBody
        nodeId="block-node-1"
        data={createBlockNodeData({ isExpanded: true })}
      />,
    )

    expect(screen.getByTestId('reusable-block-expanded-view')).toBeInTheDocument()
    expect(screen.getByText('内部图预览')).toBeInTheDocument()
  })

  it('toggles expanded state through the canvas store action', async () => {
    const user = userEvent.setup()

    render(<ReusableBlockBody nodeId="block-node-1" data={createBlockNodeData()} />)

    await user.click(screen.getByRole('button', { name: /展开内.*图/ }))

    expect(mocks.updateNodeData).toHaveBeenCalledWith('block-node-1', {
      isExpanded: true,
    })
  })

  it('预览态不渲染写编辑器 store 的展开按钮', () => {
    render(
      <PreviewModeContext.Provider value={{ edges: [], lodOverride: null }}>
        <ReusableBlockBody nodeId="block-1" data={createBlockNodeData()} />
      </PreviewModeContext.Provider>,
    )

    expect(screen.getByTestId('reusable-block-body')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '展开内部图' }),
    ).not.toBeInTheDocument()
  })
})

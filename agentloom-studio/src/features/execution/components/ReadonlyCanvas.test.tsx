import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReadonlyCanvas } from './ReadonlyCanvas'

let capturedProps: Record<string, unknown> = {}

vi.mock('@xyflow/react', () => {
  function MockReactFlow(props: Record<string, unknown>) {
    capturedProps = props

    return (
      <button
        type="button"
        data-testid="readonly-canvas-node-click"
        onClick={() => {
          const handler = props.onNodeClick as
            | ((event: unknown, node: { id: string }) => void)
            | undefined
          handler?.({}, { id: 'node-1' })
        }}
      >
        trigger node click
      </button>
    )
  }

  return {
    Background: () => null,
    BackgroundVariant: { Dots: 'dots' },
    Controls: () => null,
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom' },
    ReactFlow: MockReactFlow,
  }
})

describe('ReadonlyCanvas', () => {
  beforeEach(() => {
    capturedProps = {}
  })

  it('向 ReactFlow 传递只读交互约束', () => {
    const onSelectNode = vi.fn()

    render(
      <ReadonlyCanvas
        graph={{
          nodes: [
            {
              id: 'node-1',
              type: 'agent',
              position: { x: 10, y: 20 },
              data: { label: 'Node One', nodeType: 'chat-agent' },
            },
          ],
          edges: [{ id: 'edge-1', source: 'node-1', target: 'node-1' }],
        }}
        steps={[
          {
            id: 'step-1',
            executionId: 'exec-1',
            nodeId: 'node-1',
            nodeName: 'Node One',
            nodeType: 'chat-agent',
            status: 'running',
            input: null,
            output: null,
            errorMessage: null,
            startedAt: '2026-03-10T10:00:00.000Z',
            completedAt: null,
            retryCount: 0,
          },
        ]}
        selectedNodeId="node-1"
        onSelectNode={onSelectNode}
      />,
    )

    expect(capturedProps.nodesDraggable).toBe(false)
    expect(capturedProps.nodesConnectable).toBe(false)
    expect(capturedProps.elementsSelectable).toBe(false)
    expect(capturedProps.connectOnClick).toBe(false)
    expect(capturedProps.edgesReconnectable).toBe(false)
    expect(
      ((capturedProps.nodes as Array<{ data: { isSelected: boolean } }>)[0]?.data
        ?.isSelected),
    ).toBe(true)
    expect((capturedProps.nodes as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
      'selected',
    )

    fireEvent.click(screen.getByTestId('readonly-canvas-node-click'))

    expect(onSelectNode).toHaveBeenCalledWith('node-1')
  })

  it('应移除原图的 handle 信息以兼容只读节点边渲染', () => {
    render(
      <ReadonlyCanvas
        graph={{
          nodes: [
            {
              id: 'node-1',
              type: 'agent',
              position: { x: 10, y: 20 },
              data: { label: 'Node One', nodeType: 'chat-agent' },
            },
            {
              id: 'node-2',
              type: 'text-output',
              position: { x: 30, y: 40 },
              data: { label: 'Node Two', nodeType: 'text-output' },
            },
          ],
          edges: [
            {
              id: 'edge-1',
              source: 'node-1',
              target: 'node-2',
              sourceHandle: 'agent-output',
              targetHandle: 'content',
            },
          ],
        }}
        steps={[
          {
            id: 'step-1',
            executionId: 'exec-1',
            nodeId: 'node-2',
            nodeName: 'Node Two',
            nodeType: 'text-output',
            status: 'running',
            input: null,
            output: null,
            errorMessage: null,
            startedAt: '2026-03-10T10:00:00.000Z',
            completedAt: null,
            retryCount: 0,
          },
        ]}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />,
    )

    expect(capturedProps.edges).toEqual([
      {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        animated: true,
      },
    ])
  })
})

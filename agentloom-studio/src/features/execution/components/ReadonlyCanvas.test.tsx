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

    fireEvent.click(screen.getByTestId('readonly-canvas-node-click'))

    expect(onSelectNode).toHaveBeenCalledWith('node-1')
  })
})

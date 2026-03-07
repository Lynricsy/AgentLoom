import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowDefinition } from '@/features/workflow'
import { useCanvasStore } from '../stores/canvasStore'
import { clonePortDefinitions, getNodeTypeConfig } from '../types/nodeTypeRegistry'
import { WorkflowCanvasPage } from './WorkflowCanvasPage'

function createNodeData(nodeType: Parameters<typeof getNodeTypeConfig>[0]) {
  const config = getNodeTypeConfig(nodeType)

  return {
    label: config.label,
    nodeType: config.type,
    category: config.category,
    description: config.description,
    config: {},
    inputPorts: clonePortDefinitions(config.inputPorts),
    outputPorts: clonePortDefinitions(config.outputPorts),
  }
}

let routeWorkflowId = 'wf-001'
let workflowResult: {
  data?: WorkflowDefinition
  isLoading: boolean
  error: Error | null
}

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ workflowId: routeWorkflowId }),
}))

vi.mock('@/features/workflow', () => ({
  useWorkflow: () => workflowResult,
}))

vi.mock('../hooks/useAutoSave', () => ({
  useAutoSave: vi.fn(),
}))

vi.mock('./NodePalette', () => ({
  NodePalette: () => <div>Node Palette</div>,
}))

vi.mock('./WorkflowCanvas', () => ({
  WorkflowCanvas: () => <div>Workflow Canvas</div>,
}))

vi.mock('./status/WorkflowStatusBar', () => ({
  WorkflowStatusBar: () => <div data-testid="workflow-status-bar" />,
}))

vi.mock('./panels/FieldMappingPanel', () => ({
  FieldMappingPanel: (props: { open: boolean; edgeId: string; onClose: () => void }) => (
    <div data-testid="field-mapping-panel" data-edge-id={props.edgeId}>
      <button type="button" data-testid="mapping-panel-close" onClick={props.onClose}>Close</button>
    </div>
  ),
}))

const workflowOne: WorkflowDefinition = {
  id: 'wf-001',
  tenantId: 'tenant-1',
  name: 'Workflow One',
  slug: 'workflow-one',
  description: null,
  nodes: [
    {
      id: 'node-1',
      type: 'agent',
      position: { x: 100, y: 120 },
      data: createNodeData('llm-agent'),
    },
  ],
  edges: [],
  viewport: { x: 10, y: 20, zoom: 1.25 },
  version: 1,
  status: 'draft',
  createdBy: 'user-1',
  updatedBy: 'user-1',
  createdAt: '2026-03-07T00:00:00.000Z',
  updatedAt: '2026-03-07T00:00:00.000Z',
}

const workflowTwo: WorkflowDefinition = {
  ...workflowOne,
  id: 'wf-002',
  name: 'Workflow Two',
  slug: 'workflow-two',
  nodes: [
    {
      id: 'node-2',
      type: 'tool',
      position: { x: 300, y: 260 },
      data: createNodeData('http-tool'),
    },
  ],
  viewport: { x: 30, y: 40, zoom: 1.5 },
}

describe('WorkflowCanvasPage', () => {
  beforeEach(() => {
    routeWorkflowId = 'wf-001'
    workflowResult = {
      data: workflowOne,
      isLoading: false,
      error: null,
    }
    useCanvasStore.getState().actions.reset()
  })

  it('相同工作流的查询刷新不应重新覆盖本地画布状态', () => {
    const { rerender } = render(<WorkflowCanvasPage />)

    act(() => {
      useCanvasStore.getState().actions.selectNode('node-1')
    })

    workflowResult = {
      data: { ...workflowOne, version: 2 },
      isLoading: false,
      error: null,
    }

    rerender(<WorkflowCanvasPage />)

    expect(useCanvasStore.getState().workflowId).toBe('wf-001')
    expect(useCanvasStore.getState().selectedNodeId).toBe('node-1')
    expect(useCanvasStore.getState().nodes[0]?.id).toBe('node-1')
  })

  it('切换到新的 workflowId 时应应用新的服务端快照', () => {
    const { rerender } = render(<WorkflowCanvasPage />)

    routeWorkflowId = 'wf-002'
    workflowResult = {
      data: workflowTwo,
      isLoading: false,
      error: null,
    }

    rerender(<WorkflowCanvasPage />)

    expect(useCanvasStore.getState().workflowId).toBe('wf-002')
    expect(useCanvasStore.getState().nodes[0]?.id).toBe('node-2')
    expect(useCanvasStore.getState().viewport).toEqual({ x: 30, y: 40, zoom: 1.5 })
    expect(useCanvasStore.getState().selectedNodeId).toBeNull()
  })

  it('mappingPanelEdgeId 有值且边存在时应渲染 FieldMappingPanel', () => {
    workflowResult = {
      data: {
        ...workflowOne,
        nodes: [
          {
            id: 'node-1',
            type: 'agent',
            position: { x: 100, y: 120 },
            data: createNodeData('llm-agent'),
          },
          {
            id: 'node-2',
            type: 'tool',
            position: { x: 300, y: 260 },
            data: createNodeData('http-tool'),
          },
        ],
        edges: [{ id: 'e-1', source: 'node-1', target: 'node-2' }],
      },
      isLoading: false,
      error: null,
    }

    render(<WorkflowCanvasPage />)

    act(() => {
      useCanvasStore.getState().actions.openFieldMapping('e-1')
    })

    expect(screen.getByTestId('field-mapping-panel')).toBeInTheDocument()
    expect(screen.getByTestId('field-mapping-panel').getAttribute('data-edge-id')).toBe('e-1')
  })

  it('mappingPanelEdgeId 为 null 时不应渲染 FieldMappingPanel', () => {
    render(<WorkflowCanvasPage />)

    expect(screen.queryByTestId('field-mapping-panel')).not.toBeInTheDocument()
  })

  it('关闭映射面板后不再渲染 FieldMappingPanel', () => {
    workflowResult = {
      data: {
        ...workflowOne,
        edges: [{ id: 'e-1', source: 'node-1', target: 'node-1' }],
      },
      isLoading: false,
      error: null,
    }

    render(<WorkflowCanvasPage />)

    act(() => {
      useCanvasStore.getState().actions.openFieldMapping('e-1')
    })

    expect(screen.getByTestId('field-mapping-panel')).toBeInTheDocument()

    act(() => {
      useCanvasStore.getState().actions.closeFieldMapping()
    })

    expect(screen.queryByTestId('field-mapping-panel')).not.toBeInTheDocument()
  })
})

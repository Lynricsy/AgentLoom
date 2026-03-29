import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgentNodeTypeConfig } from '@/features/canvas/registry/agent-canvas-registry';
import type { CanvasNodeData } from '@/features/canvas/types';
import { AgentCanvas } from './AgentCanvas';

interface ReactFlowStubProps {
  children?: ReactNode;
  nodeTypes?: Record<string, unknown>;
  isValidConnection?: (connection: {
    source?: string | null;
    sourceHandle?: string | null;
    target?: string | null;
    targetHandle?: string | null;
  }) => boolean;
}

const mocks = vi.hoisted(() => ({
  nodes: [] as Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: CanvasNodeData;
  }>,
  edges: [] as Array<Record<string, unknown>>,
  lastReactFlowProps: null as ReactFlowStubProps | null,
  onNodesChange: vi.fn(),
  onEdgesChange: vi.fn(),
  createConnection: vi.fn(),
  selectNode: vi.fn(),
  selectEdge: vi.fn(),
  setViewport: vi.fn(),
  loadAgent: vi.fn(),
  reset: vi.fn(),
  onDragOver: vi.fn(),
  onDrop: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: ReactFlowStubProps) => {
    mocks.lastReactFlowProps = props;
    return <div data-testid="react-flow">{props.children}</div>;
  },
  Background: () => <div data-testid="background" />,
  Controls: () => <div data-testid="controls" />,
}));

vi.mock('@/features/canvas/components/CanvasNode', () => ({
  CanvasNodeShell: () => <div data-testid="canvas-node-shell" />,
}));

vi.mock('@/features/canvas/components/edges/SmartEdge', () => ({
  SmartEdge: () => <div data-testid="smart-edge" />,
}));

vi.mock('@/features/canvas/components/AgentNodePalette', () => ({
  AgentNodePalette: () => <div data-testid="agent-node-palette" />,
}));

vi.mock('./panels/AgentNodeConfigPanel', () => ({
  AgentNodeConfigPanel: () => <div data-testid="agent-node-config-panel" />,
}));

vi.mock('../hooks/useAgentCanvasDrop', () => ({
  useAgentCanvasDrop: () => ({
    onDragOver: mocks.onDragOver,
    onDrop: mocks.onDrop,
  }),
}));

vi.mock('../stores/agent-canvas.store', () => ({
  useAgentCanvasNodes: () => mocks.nodes,
  useAgentCanvasEdges: () => mocks.edges,
  useAgentCanvasActions: () => ({
    onNodesChange: mocks.onNodesChange,
    onEdgesChange: mocks.onEdgesChange,
    createConnection: mocks.createConnection,
    selectNode: mocks.selectNode,
    selectEdge: mocks.selectEdge,
    setViewport: mocks.setViewport,
    loadAgent: mocks.loadAgent,
    reset: mocks.reset,
  }),
}));

function createNode(nodeType: 'memory' | 'agent-main', id: string): {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: CanvasNodeData;
} {
  const config = getAgentNodeTypeConfig(nodeType);
  if (!config) {
    throw new Error(`Missing agent node config for ${nodeType}`);
  }

  return {
    id,
    type: config.category,
    position: { x: 0, y: 0 },
    data: {
      label: config.label,
      nodeType: nodeType as CanvasNodeData['nodeType'],
      category: config.category,
      description: config.description,
      config: nodeType === 'memory' ? { memoryInstanceId: 'memory-1' } : {},
      inputPorts: [...config.inputPorts],
      outputPorts: [...config.outputPorts],
    },
  };
}

describe('AgentCanvas', () => {
  beforeEach(() => {
    mocks.nodes = [createNode('memory', 'memory-node'), createNode('agent-main', 'agent-main')];
    mocks.edges = [];
    mocks.lastReactFlowProps = null;
    mocks.onNodesChange.mockReset();
    mocks.onEdgesChange.mockReset();
    mocks.createConnection.mockReset();
    mocks.selectNode.mockReset();
    mocks.selectEdge.mockReset();
    mocks.setViewport.mockReset();
    mocks.loadAgent.mockReset();
    mocks.reset.mockReset();
  });

  it('registers a dedicated renderer for memory nodes and accepts memory connections', () => {
    render(<AgentCanvas agentId="agent-1" />);

    const isValidConnection = mocks.lastReactFlowProps?.isValidConnection;

    expect(mocks.loadAgent).toHaveBeenCalledWith('agent-1');
    expect(Object.keys(mocks.lastReactFlowProps?.nodeTypes ?? {})).toContain('memory');
    expect(isValidConnection).toBeDefined();
    expect(
      isValidConnection?.({
        source: 'memory-node',
        sourceHandle: 'memory-out-0',
        target: 'agent-main',
        targetHandle: 'memory-in',
      }),
    ).toBe(true);
  });
});

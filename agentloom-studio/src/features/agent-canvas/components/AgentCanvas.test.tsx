import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgentNodeTypeConfig } from '@/features/canvas/registry/agent-canvas-registry';
import type { CanvasNodeData } from '@/features/canvas/types';
import {
  DESKTOP_WIDTH,
  MOBILE_WIDTH,
  restoreViewport,
  stubViewportWidth,
} from '@/features/canvas/testing/viewport';
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
  nodesDraggable?: boolean;
  nodesConnectable?: boolean;
  elementsSelectable?: boolean;
  onConnect?: unknown;
  onDrop?: unknown;
}

const mocks = vi.hoisted(() => ({
  nodes: [] as Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: CanvasNodeData;
  }>,
  edges: [] as Array<Record<string, unknown>>,
  selectedNodeId: null as string | null,
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
  useAgentCanvasSelectedNodeId: () => mocks.selectedNodeId,
  useAgentCanvasRuntimeMode: () => 'sandbox',
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
    stubViewportWidth(DESKTOP_WIDTH);
    mocks.selectedNodeId = null;
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

  afterEach(() => {
    restoreViewport();
  });

  it('registers dedicated renderers for memory and output nodes and accepts memory connections', () => {
    render(<AgentCanvas agentId="agent-1" />);

    const isValidConnection = mocks.lastReactFlowProps?.isValidConnection;

    expect(mocks.loadAgent).toHaveBeenCalledWith('agent-1');
    expect(Object.keys(mocks.lastReactFlowProps?.nodeTypes ?? {})).toEqual(
      expect.arrayContaining(['memory', 'output']),
    );
    expect(isValidConnection).toBeDefined();
    expect(
      isValidConnection?.({
        source: 'memory-node',
        sourceHandle: 'memory-out',
        target: 'agent-main',
        targetHandle: 'memory-in',
      }),
    ).toBe(true);
  });

  describe('小屏只读浏览（<lg）', () => {
    beforeEach(() => {
      stubViewportWidth(MOBILE_WIDTH);
    });

    it('关闭拖拽 / 连线 / 选中与编辑面板', () => {
      render(<AgentCanvas agentId="agent-1" />);

      expect(mocks.lastReactFlowProps?.nodesDraggable).toBe(false);
      expect(mocks.lastReactFlowProps?.nodesConnectable).toBe(false);
      expect(mocks.lastReactFlowProps?.elementsSelectable).toBe(false);
      expect(mocks.lastReactFlowProps?.onConnect).toBeUndefined();
      expect(mocks.lastReactFlowProps?.onDrop).toBeUndefined();
      expect(
        mocks.lastReactFlowProps?.isValidConnection?.({
          source: 'memory-node',
          sourceHandle: 'memory-out',
          target: 'agent-main',
          targetHandle: 'memory-in',
        }),
      ).toBe(false);

      expect(screen.queryByTestId('agent-node-palette')).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('agent-node-config-panel'),
      ).not.toBeInTheDocument();
      // 只读提示条由 agent 路由页的顶部 overlay 统一渲染，画布容器不再重复挂一份
      expect(
        screen.queryByTestId('canvas-readonly-banner'),
      ).not.toBeInTheDocument();
    });

    it('选中节点时打开底部只读弹层', async () => {
      mocks.selectedNodeId = 'memory-node';

      render(<AgentCanvas agentId="agent-1" />);

      expect(await screen.findByTestId('readonly-node-sheet')).toBeInTheDocument();
      expect(screen.getByTestId('readonly-node-config')).toBeInTheDocument();
      // agent 画布没有执行态，不渲染输出区块
      expect(
        screen.queryByTestId('readonly-node-output-section'),
      ).not.toBeInTheDocument();
    });
  });
});

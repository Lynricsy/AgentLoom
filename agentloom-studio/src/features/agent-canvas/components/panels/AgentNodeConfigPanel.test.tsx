import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import type { CanvasNodeData } from '@/features/canvas/types';
import { AgentNodeConfigPanel } from './AgentNodeConfigPanel';

const mocks = vi.hoisted(() => ({
  selectedNodeId: null as string | null,
  nodes: [] as Array<{ id: string; data: CanvasNodeData }>,
  updateNodeData: vi.fn(),
  deleteSelectedNode: vi.fn(),
}));

vi.mock('../../stores/agent-canvas.store', () => ({
  useAgentCanvasSelectedNodeId: () => mocks.selectedNodeId,
  useAgentCanvasNodes: () => mocks.nodes,
  useAgentCanvasActions: () => ({
    updateNodeData: mocks.updateNodeData,
    deleteSelectedNode: mocks.deleteSelectedNode,
  }),
}));

vi.mock('@/features/canvas/components/panels/customPanelRegistry', () => ({
  CUSTOM_PANEL_REGISTRY: {
    'mcp-tool': {
      render: () => <div data-testid="mock-mcp-panel">mock mcp panel</div>,
    },
  },
}));

function createMcpNodeData(): CanvasNodeData {
  return {
    label: 'MCP Search Tool',
    nodeType: 'mcp-tool',
    category: 'tool',
    config: {},
    inputPorts: [],
    outputPorts: [],
  };
}

describe('AgentNodeConfigPanel', () => {
  afterEach(() => {
    mocks.selectedNodeId = null;
    mocks.nodes = [];
    mocks.updateNodeData.mockReset();
    mocks.deleteSelectedNode.mockReset();
  });

  it('renders after switching from no selection to an mcp node selection', () => {
    const { rerender } = render(<AgentNodeConfigPanel className="initial" />);

    expect(screen.queryByTestId('mock-mcp-panel')).not.toBeInTheDocument();

    mocks.selectedNodeId = 'node-1';
    mocks.nodes = [
      {
        id: 'node-1',
        data: createMcpNodeData(),
      },
    ];

    rerender(<AgentNodeConfigPanel className="selected" />);

    expect(screen.getByText('MCP Search Tool')).toBeInTheDocument();
    expect(screen.getByTestId('mock-mcp-panel')).toBeInTheDocument();
  });
});

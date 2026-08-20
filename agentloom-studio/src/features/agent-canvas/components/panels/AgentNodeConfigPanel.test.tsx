import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import type { CanvasNodeData } from '@/features/canvas';
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
  useAgentCanvasRuntimeMode: () => 'sandbox',
  useAgentCanvasActions: () => ({
    updateNodeData: mocks.updateNodeData,
    deleteSelectedNode: mocks.deleteSelectedNode,
  }),
}));

vi.mock('@/features/canvas', () => ({
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

function createAgentMainNodeData(): CanvasNodeData {
  return {
    label: 'Agent Main',
    nodeType: 'agent-main' as unknown as CanvasNodeData['nodeType'],
    category: 'agent',
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

  it('renders agent-main config and writes nested policy updates', () => {
    mocks.selectedNodeId = 'main';
    mocks.nodes = [
      {
        id: 'main',
        data: createAgentMainNodeData(),
      },
    ];

    render(<AgentNodeConfigPanel />);

    expect(screen.getByText('原生工具')).toBeInTheDocument();
    expect(screen.getByText('自进化')).toBeInTheDocument();
    expect(screen.getByTestId('agent-node-config-scroll')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-y-auto',
      'overscroll-contain',
    );
    expect(screen.getByTestId('agent-node-config-scroll').parentElement).toHaveClass(
      'flex',
      'max-h-[calc(100vh-6rem)]',
      'flex-col',
      'overflow-hidden',
    );

    fireEvent.click(screen.getByRole('checkbox', { name: '文件写入' }));

    expect(mocks.updateNodeData).toHaveBeenCalledWith('main', {
      config: {
        nativeToolPolicy: {
          readEnabled: true,
          writeEnabled: false,
          editEnabled: true,
          terminalEnabled: true,
        },
      },
    });
  });

  it('stops wheel propagation from the scroll container so the canvas does not steal scroll', () => {
    mocks.selectedNodeId = 'main';
    mocks.nodes = [
      {
        id: 'main',
        data: createAgentMainNodeData(),
      },
    ];

    const parentWheelHandler = vi.fn();

    render(
      <div onWheel={parentWheelHandler}>
        <AgentNodeConfigPanel />
      </div>,
    );

    fireEvent.wheel(screen.getByTestId('agent-node-config-scroll'));

    expect(parentWheelHandler).not.toHaveBeenCalled();
  });
});

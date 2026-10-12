import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, afterEach } from 'vitest';
import type { CanvasNodeData } from '@/features/canvas';
import type { ModelThinkingCapability } from '@/features/llm';
import { AgentNodeConfigPanel } from './AgentNodeConfigPanel';

const mocks = vi.hoisted(() => ({
  selectedNodeId: null as string | null,
  nodes: [] as Array<{ id: string; data: CanvasNodeData }>,
  updateNodeData: vi.fn(),
  deleteSelectedNode: vi.fn(),
  selectNode: vi.fn(),
  apiGet: vi.fn(),
}));

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/client')>()),
  apiClient: { get: mocks.apiGet },
}));

vi.mock('../../stores/agent-canvas.store', () => ({
  useAgentCanvasSelectedNodeId: () => mocks.selectedNodeId,
  useAgentCanvasNodes: () => mocks.nodes,
  useAgentCanvasRuntimeMode: () => 'sandbox',
  useAgentCanvasActions: () => ({
    updateNodeData: mocks.updateNodeData,
    deleteSelectedNode: mocks.deleteSelectedNode,
    selectNode: mocks.selectNode,
  }),
}));

vi.mock('@/features/canvas', () => ({
  CANVAS_FLOATING_CLASS: 'canvas-floating',
  CANVAS_PANEL_HEADER_CLASS: 'canvas-panel-header',
  getNodeAccentToken: () => 'var(--color-node-tool)',
  resolveNodeIcon: () => () => null,
  CanvasPanelHeader: ({
    title,
    actions,
    onClose,
  }: {
    title: React.ReactNode;
    actions?: React.ReactNode;
    onClose?: () => void;
  }) => (
    <div>
      <span>{title}</span>
      {actions}
      <button type="button" onClick={onClose}>
        关闭节点配置
      </button>
    </div>
  ),
  CUSTOM_PANEL_REGISTRY: {
    'mcp-tool': {
      render: () => <div data-testid="mock-mcp-panel">mock mcp panel</div>,
    },
    'llm-model': {
      render: ({
        onConfigChange,
      }: {
        onConfigChange: (patch: Record<string, unknown>) => void;
      }) => (
        <button
          type="button"
          onClick={() =>
            onConfigChange({
              config: { llmConfigId: 'cfg-2', modelName: 'claude-sonnet-4-6' },
              llmConfigId: 'cfg-2',
            })
          }
        >
          mock switch model
        </button>
      ),
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

/** 按模型配置 id 返回思考能力；值为 Error 时请求失败 */
function mockThinkingCapabilities(byConfigId: Record<string, ModelThinkingCapability | Error>) {
  mocks.apiGet.mockImplementation((url: string) => ({
    json: async () => {
      const id = /^llm-models\/([^/]+)\/thinking-capability$/.exec(url)?.[1];
      const result = id ? byConfigId[id] : undefined;
      if (result === undefined) throw new Error(`unexpected GET ${url}`);
      if (result instanceof Error) throw result;
      return { data: result };
    },
  }));
}

function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrap = (node: ReactElement) => (
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  );
  const result = render(wrap(ui));
  return { ...result, rerender: (next: ReactElement) => result.rerender(wrap(next)) };
}

function selectLlmModelNode(config: Record<string, unknown>) {
  mocks.selectedNodeId = 'model-1';
  mocks.nodes = [{ id: 'model-1', data: createLlmModelNodeData(config) }];
}

async function openThinkingLevelOptions(user: ReturnType<typeof userEvent.setup>) {
  // Radix Select 是 button + portal，选项只在展开后进入无障碍树
  await user.click(screen.getByRole('combobox', { name: '思考强度' }));
  return screen.findAllByRole('option');
}

const SUPPORTED_WITHOUT_OFF: ModelThinkingCapability = {
  status: 'supported',
  levels: ['low', 'medium', 'high', 'xhigh', 'max'],
  defaultLevel: 'medium',
  source: 'litellm',
};

function createLlmModelNodeData(
  config: Record<string, unknown> = {},
): CanvasNodeData {
  return {
    label: 'LLM 模型',
    nodeType: 'llm-model',
    category: 'agent',
    config,
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
    mocks.apiGet.mockReset();
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

  it('asks for confirmation before deleting the node and closes via selectNode(null)', async () => {
    const user = userEvent.setup();
    mocks.selectedNodeId = 'node-1';
    mocks.nodes = [{ id: 'node-1', data: createMcpNodeData() }];

    render(<AgentNodeConfigPanel />);

    await user.click(screen.getByRole('button', { name: '关闭节点配置' }));
    expect(mocks.selectNode).toHaveBeenCalledWith(null);

    await user.click(screen.getByRole('button', { name: '删除节点' }));
    expect(mocks.deleteSelectedNode).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: '删除' }));
    expect(mocks.deleteSelectedNode).toHaveBeenCalledTimes(1);
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
      'max-h-[calc(100%-6rem)]',
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

  it('llm-model 节点的思考强度选项严格等于模型能力返回的 levels', async () => {
    const user = userEvent.setup();
    mockThinkingCapabilities({ 'cfg-1': SUPPORTED_WITHOUT_OFF });
    selectLlmModelNode({ llmConfigId: 'cfg-1', modelName: 'gpt-6.1-sol' });

    renderWithQuery(<AgentNodeConfigPanel />);

    const select = await screen.findByRole('combobox', { name: '思考强度' });
    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveTextContent('默认');
    expect(screen.getByText('模型默认：中')).toBeInTheDocument();
    expect(mocks.apiGet).toHaveBeenCalledWith('llm-models/cfg-1/thinking-capability');

    const options = await openThinkingLevelOptions(user);
    expect(options.map((option) => option.textContent)).toEqual([
      '默认',
      '低',
      '中',
      '高',
      '极高',
      '最高',
    ]);

    await user.click(screen.getByRole('option', { name: '中' }));

    expect(mocks.updateNodeData).toHaveBeenCalledWith('model-1', {
      config: { llmConfigId: 'cfg-1', modelName: 'gpt-6.1-sol', thinkingLevel: 'medium' },
    });
  });

  it('llm-model 节点选择「默认」时从 config 中移除 thinkingLevel', async () => {
    const user = userEvent.setup();
    mockThinkingCapabilities({ 'cfg-1': SUPPORTED_WITHOUT_OFF });
    selectLlmModelNode({ llmConfigId: 'cfg-1', modelName: 'gpt-6.1-sol', thinkingLevel: 'high' });

    renderWithQuery(<AgentNodeConfigPanel />);

    const select = screen.getByRole('combobox', { name: '思考强度' });
    await waitFor(() => expect(select).toHaveTextContent('高'));

    await openThinkingLevelOptions(user);
    await user.click(screen.getByRole('option', { name: '默认' }));

    expect(mocks.updateNodeData).toHaveBeenCalledWith('model-1', {
      config: { llmConfigId: 'cfg-1', modelName: 'gpt-6.1-sol' },
    });
  });

  it('llm-model 节点所选模型不支持思考时禁用下拉并提示', async () => {
    mockThinkingCapabilities({ 'cfg-1': { status: 'unsupported', source: 'litellm' } });
    selectLlmModelNode({ llmConfigId: 'cfg-1', modelName: 'gpt-4o' });

    renderWithQuery(<AgentNodeConfigPanel />);

    expect(await screen.findByText('该模型不支持思考')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '思考强度' })).toBeDisabled();
  });

  it('llm-model 节点所选模型不在模型目录时禁用下拉并提示能力未知', async () => {
    mockThinkingCapabilities({ 'cfg-1': { status: 'unknown' } });
    selectLlmModelNode({ llmConfigId: 'cfg-1', modelName: 'private-model' });

    renderWithQuery(<AgentNodeConfigPanel />);

    expect(
      await screen.findByText('未能获取该模型的思考能力（模型目录里没有这个模型）'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '思考强度' })).toBeDisabled();
  });

  it('llm-model 节点获取能力期间禁用下拉并显示加载中', () => {
    mocks.apiGet.mockImplementation(() => ({ json: () => new Promise(() => {}) }));
    selectLlmModelNode({ llmConfigId: 'cfg-1', modelName: 'gpt-6.1-sol' });

    renderWithQuery(<AgentNodeConfigPanel />);

    const select = screen.getByRole('combobox', { name: '思考强度' });
    expect(select).toBeDisabled();
    expect(select).toHaveTextContent('正在获取模型思考能力…');
  });

  it('llm-model 节点未选择模型时禁用下拉且不请求能力', () => {
    selectLlmModelNode({});

    renderWithQuery(<AgentNodeConfigPanel />);

    const select = screen.getByRole('combobox', { name: '思考强度' });
    expect(select).toBeDisabled();
    expect(select).toHaveTextContent('先选择模型');
    expect(mocks.apiGet).not.toHaveBeenCalled();
  });

  it('llm-model 节点获取能力失败时可重试', async () => {
    const user = userEvent.setup();
    mockThinkingCapabilities({ 'cfg-1': new Error('network down') });
    selectLlmModelNode({ llmConfigId: 'cfg-1', modelName: 'gpt-6.1-sol' });

    renderWithQuery(<AgentNodeConfigPanel />);

    const retry = await screen.findByRole('button', { name: '重试' });
    expect(screen.getByRole('combobox', { name: '思考强度' })).toBeDisabled();

    mockThinkingCapabilities({ 'cfg-1': SUPPORTED_WITHOUT_OFF });
    await user.click(retry);

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: '思考强度' })).toBeEnabled(),
    );
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument();
  });

  it('llm-model 节点已存强度不在模型能力内时标注不支持并提示运行时就近取值', async () => {
    const user = userEvent.setup();
    mockThinkingCapabilities({
      'cfg-1': {
        status: 'supported',
        levels: ['off', 'low', 'medium', 'high'],
        defaultLevel: null,
        source: 'pi-catalog',
      },
    });
    selectLlmModelNode({ llmConfigId: 'cfg-1', modelName: 'gpt-5', thinkingLevel: 'xhigh' });

    renderWithQuery(<AgentNodeConfigPanel />);

    const select = screen.getByRole('combobox', { name: '思考强度' });
    await waitFor(() => expect(select).toHaveTextContent('极高（当前模型不支持）'));
    expect(screen.getByText(/运行时会改用最接近的受支持强度/)).toBeInTheDocument();
    expect(screen.queryByText(/模型默认：/)).not.toBeInTheDocument();

    const options = await openThinkingLevelOptions(user);
    expect(options.map((option) => option.textContent)).toEqual([
      '默认',
      '关闭',
      '低',
      '中',
      '高',
      '极高（当前模型不支持）',
    ]);
  });

  it('llm-model 节点模型不支持思考但已存强度时仍可清回「默认」', async () => {
    const user = userEvent.setup();
    mockThinkingCapabilities({ 'cfg-1': { status: 'unsupported', source: 'pi-catalog' } });
    selectLlmModelNode({ llmConfigId: 'cfg-1', modelName: 'gpt-4o', thinkingLevel: 'high' });

    renderWithQuery(<AgentNodeConfigPanel />);

    const select = screen.getByRole('combobox', { name: '思考强度' });
    await waitFor(() => expect(select).toHaveTextContent('高（当前模型不支持）'));
    expect(screen.getByText('该模型不支持思考')).toBeInTheDocument();
    expect(screen.getByText(/运行时会改用最接近的受支持强度/)).toBeInTheDocument();

    await openThinkingLevelOptions(user);
    await user.click(screen.getByRole('option', { name: '默认' }));

    expect(mocks.updateNodeData).toHaveBeenCalledWith('model-1', {
      config: { llmConfigId: 'cfg-1', modelName: 'gpt-4o' },
    });
  });

  it('llm-model 节点切换模型时保留已选思考强度并按新模型重新获取能力', async () => {
    mockThinkingCapabilities({
      'cfg-1': SUPPORTED_WITHOUT_OFF,
      'cfg-2': {
        status: 'supported',
        levels: ['off', 'low', 'medium'],
        defaultLevel: null,
        source: 'litellm',
      },
    });
    selectLlmModelNode({ llmConfigId: 'cfg-1', thinkingLevel: 'high' });

    const { rerender } = renderWithQuery(<AgentNodeConfigPanel />);

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: '思考强度' })).toHaveTextContent('高'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'mock switch model' }));

    expect(mocks.updateNodeData).toHaveBeenCalledWith('model-1', {
      config: {
        llmConfigId: 'cfg-2',
        modelName: 'claude-sonnet-4-6',
        thinkingLevel: 'high',
      },
      llmConfigId: 'cfg-2',
    });

    // 模拟 store 写回后的节点：新模型不支持「高」，保留并提示
    selectLlmModelNode({
      llmConfigId: 'cfg-2',
      modelName: 'claude-sonnet-4-6',
      thinkingLevel: 'high',
    });
    // store hook 已被 mock 而非响应式，换个 prop 让 memo 面板重新读取节点
    rerender(<AgentNodeConfigPanel className="after-switch" />);

    await waitFor(() =>
      expect(mocks.apiGet).toHaveBeenCalledWith('llm-models/cfg-2/thinking-capability'),
    );
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: '思考强度' })).toHaveTextContent(
        '高（当前模型不支持）',
      ),
    );
  });
});

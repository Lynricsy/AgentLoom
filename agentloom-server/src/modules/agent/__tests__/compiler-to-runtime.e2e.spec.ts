import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolSet } from 'ai';
import { z } from 'zod';
import { AgentDefinitionService } from '../../agent-definition/agent-definition.service';
import type { AgentRuntimeConfig } from '../../agent-definition/agent-runtime-config.interface';
import { SubAgentToolsProvider } from '../../agent-execution/subagent/subagent-tools.provider';
import type { ExecuteSubAgent } from '../../agent-execution/subagent/subagent-tools.provider';
import { PiAgentCoreAdapter } from '../pi-agent-core.adapter';
import type { AgentEvent } from '../types/agent-event.types';

const hoisted = vi.hoisted(() => {
  type MockAgentOptions = {
    streamFn?: unknown;
    sessionId?: string;
    beforeToolCall?: (
      context: Record<string, unknown>,
      signal?: AbortSignal,
    ) => Promise<{ block: boolean; reason?: string } | undefined>;
    initialState?: Record<string, unknown>;
  };

  class MockPiAgent {
    static instances: MockPiAgent[] = [];
    static script:
      | ((agent: MockPiAgent, input: string) => Promise<void>)
      | null = null;

    readonly listeners = new Set<(event: Record<string, unknown>) => void>();
    readonly setTools = vi.fn((tools: unknown[]) => {
      this.tools = tools;
    });
    readonly abort = vi.fn();
    readonly prompt = vi.fn(async (input: string) => {
      this.promptInputs.push(input);
      await MockPiAgent.script?.(this, input);
    });

    streamFn: unknown;
    tools: unknown[] = [];
    promptInputs: string[] = [];

    constructor(public readonly options: MockAgentOptions = {}) {
      this.streamFn = options.streamFn;
      MockPiAgent.instances.push(this);
    }

    subscribe(listener: (event: Record<string, unknown>) => void): () => void {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit(event: Record<string, unknown>): void {
      for (const listener of this.listeners) {
        listener(event);
      }
    }

    static reset(): void {
      MockPiAgent.instances = [];
      MockPiAgent.script = null;
    }
  }

  return {
    MockPiAgent,
    importPiAgentCore: vi.fn(async () => ({ Agent: MockPiAgent })),
    streamFnFactory: vi.fn((model: unknown, toolSet?: ToolSet) => ({
      model,
      toolSet,
      tag: 'mock-stream-fn',
    })),
    typeBoxToZod: vi.fn(() => z.any()),
    zodToTypeBox: vi.fn((schema: unknown) => ({ converted: schema })),
    getTenantDb: vi.fn((db: unknown) => db),
  };
});

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: hoisted.getTenantDb,
}));

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: vi.fn(
    async (
      db: unknown,
      _tenantId: string,
      operation: (tenantDb: unknown) => Promise<unknown>,
    ) => operation(db),
  ),
}));

vi.mock('../pi-imports', () => ({
  importPiAgentCore: hoisted.importPiAgentCore,
}));

vi.mock('../stream-fn.adapter', () => ({
  createVercelStreamFn: hoisted.streamFnFactory,
}));

vi.mock('../tool-schema-converter', () => ({
  typeBoxToZod: hoisted.typeBoxToZod,
  zodToTypeBox: hoisted.zodToTypeBox,
}));

type CanvasNode = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

type CanvasEdge = {
  id: string;
  source: string;
  target: string;
  targetHandle?: string;
};

type InjectedTool = {
  name: string;
  execute: (toolCallId: string, params: unknown) => Promise<unknown>;
};

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi
        .fn()
        .mockResolvedValue(Array.isArray(result) ? result : [result]),
    }),
  };
}

async function collectEvents(
  iterable: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

function createNode(
  id: string,
  nodeType: string,
  config: Record<string, unknown> = {},
): CanvasNode {
  return {
    id,
    type: nodeType,
    data: {
      nodeType,
      config,
    },
  };
}

function connectToAgentMain(
  source: string,
  targetHandle: string,
  target = 'agent-main',
): CanvasEdge {
  return {
    id: `${source}-${targetHandle}`,
    source,
    target,
    targetHandle,
  };
}

describe('compiler → runtime tool injection E2E', () => {
  let compiler: AgentDefinitionService;
  let adapter: PiAgentCoreAdapter;
  let subAgentToolsProvider: SubAgentToolsProvider;
  let mockDb: { select: ReturnType<typeof vi.fn> };
  let mockPiAiAdapter: { getModel: ReturnType<typeof vi.fn> };
  let mockMcpService: {
    resolveRuntimeConnection: ReturnType<typeof vi.fn>;
    callRuntimeTool: ReturnType<typeof vi.fn>;
  };
  let mockRagService: { search: ReturnType<typeof vi.fn> };
  let mockEventBridge: { emitAgentEvent: ReturnType<typeof vi.fn> };

  const defaultModelConfig = {
    id: 'model-config-001',
    tenantId: 'tenant-001',
    provider: 'openai',
    modelName: 'gpt-4.1-mini',
    apiKeyId: 'api-key-001',
    isDefault: true,
  };

  const baseNodes: CanvasNode[] = [createNode('agent-main', 'agent-main')];

  beforeEach(() => {
    hoisted.MockPiAgent.reset();
    hoisted.importPiAgentCore.mockClear();
    hoisted.streamFnFactory.mockClear();
    hoisted.typeBoxToZod.mockClear();
    hoisted.zodToTypeBox.mockClear();
    hoisted.getTenantDb.mockClear();

    mockDb = {
      select: vi.fn().mockReturnValue(createSelectChain([defaultModelConfig])),
    };
    mockPiAiAdapter = {
      getModel: vi.fn().mockResolvedValue('mock-language-model'),
    };
    mockMcpService = {
      resolveRuntimeConnection: vi.fn().mockResolvedValue({
        transportType: 'streamable_http',
        url: 'https://example.com/mcp',
      }),
      callRuntimeTool: vi.fn().mockResolvedValue({ hits: ['doc-1'] }),
    };
    mockRagService = {
      search: vi.fn().mockResolvedValue([
        {
          chunkId: 'chunk-1',
          score: 0.91,
          content: 'AgentLoom 文档',
          location: null,
          documentId: 'doc-1',
          knowledgeBaseId: 'kb-1',
          chunkIndex: 0,
        },
      ]),
    };
    mockEventBridge = {
      emitAgentEvent: vi.fn(),
    };

    type CompilerArgs = ConstructorParameters<typeof AgentDefinitionService>;
    compiler = new AgentDefinitionService(mockDb as unknown as CompilerArgs[0]);

    type AdapterArgs = ConstructorParameters<typeof PiAgentCoreAdapter>;
    adapter = new PiAgentCoreAdapter(
      mockDb as unknown as AdapterArgs[0],
      mockPiAiAdapter as unknown as AdapterArgs[1],
      mockMcpService as unknown as AdapterArgs[2],
      mockRagService as unknown as AdapterArgs[3],
    );

    subAgentToolsProvider = new SubAgentToolsProvider(
      compiler,
      mockEventBridge as unknown as ConstructorParameters<
        typeof SubAgentToolsProvider
      >[1],
    );

    hoisted.MockPiAgent.script = async (agent) => {
      agent.emit({
        type: 'agent_end',
        messages: [{ role: 'assistant', stopReason: 'stop' }],
      });
    };
  });

  async function compileAndLoadTools(params: {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
  }): Promise<{ runtimeConfig: AgentRuntimeConfig; tools: InjectedTool[] }> {
    const runtimeConfig = compiler.buildRuntimeConfigFromNodes(
      params.nodes,
      params.edges,
      'agent-parent',
    );

    const session = await adapter.createSession({
      agentId: 'agent-parent',
      mode: 'conversation',
      tenantId: 'tenant-001',
      systemPrompt: '你是一个测试助手',
      runtimeConfig,
    });

    if (runtimeConfig.subAgents?.length) {
      const executeSubAgent: ExecuteSubAgent = vi.fn().mockResolvedValue({
        content: 'sub-agent result',
        stopReason: 'end_turn',
      });
      adapter.registerSessionToolProvider(
        session.id,
        subAgentToolsProvider.createSessionToolProvider(
          runtimeConfig.subAgents,
          {
            conversationId: 'conversation-001',
            tenantId: 'tenant-001',
            depth: 0,
            parentAbortSignal: new AbortController().signal,
            visitedAgentIds: new Set(['agent-parent']),
          },
          executeSubAgent,
        ),
      );
    }

    await collectEvents(
      adapter.prompt(session.id, [{ type: 'text', text: 'hello' }]),
    );

    const agent = hoisted.MockPiAgent.instances[0];
    const tools = (agent.setTools.mock.lastCall?.[0] ?? []) as InjectedTool[];

    return {
      runtimeConfig,
      tools,
    };
  }

  it('MCP Tool chain: 画布 MCP 节点编译后会进入真实 adapter 的 setTools()', async () => {
    const mcpNode = createNode('mcp-1', 'mcp-tool', {
      name: 'search_docs',
      description: '搜索产品文档',
      mcpServerConfigId: 'mcp-server-1',
      toolName: 'searchDocs',
      enabled: true,
    });

    const { runtimeConfig, tools } = await compileAndLoadTools({
      nodes: [...baseNodes, mcpNode],
      edges: [connectToAgentMain('mcp-1', 'tools-in')],
    });

    expect(runtimeConfig.tools).toEqual([
      expect.objectContaining({
        toolType: 'mcp',
        name: 'search_docs',
        mcpServerConfigId: 'mcp-server-1',
        toolName: 'searchDocs',
      }),
    ]);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ name: 'search_docs' });
    expect(typeof tools[0]?.execute).toBe('function');
  });

  it('Sub-Agent chain: 画布子代理节点编译后经 SubAgentToolsProvider 注入 callable tools', async () => {
    const subAgentNode = createNode('sub-1', 'sub-agent', {
      agentDefinitionId: 'agent-child',
      agentVersionId: 'version-child',
      alias: 'writer',
      description: '负责写作',
      maxTimeoutMs: 5_000,
    });

    const { runtimeConfig, tools } = await compileAndLoadTools({
      nodes: [...baseNodes, subAgentNode],
      edges: [connectToAgentMain('sub-1', 'sub-agents-in')],
    });

    expect(runtimeConfig.subAgents).toEqual([
      expect.objectContaining({
        agentDefinitionId: 'agent-child',
        agentVersionId: 'version-child',
        alias: 'writer',
        maxTimeoutMs: 5_000,
      }),
    ]);
    expect(tools.map((tool) => tool.name)).toEqual([
      'call_subagent',
      'spawn_subagent',
      'wait_for_subagents',
      'get_subagent_status',
    ]);
    expect(tools.every((tool) => typeof tool.execute === 'function')).toBe(
      true,
    );
  });

  it('Knowledge chain: 画布 knowledge 节点编译后会注入知识检索工具', async () => {
    const knowledgeNode = createNode('kb-1-node', 'knowledge-base', {
      knowledgeBaseId: 'kb-1',
      topK: 5,
      similarityThreshold: 0.42,
      enabled: true,
    });

    const { runtimeConfig, tools } = await compileAndLoadTools({
      nodes: [...baseNodes, knowledgeNode],
      edges: [connectToAgentMain('kb-1-node', 'knowledge-in')],
    });

    expect(runtimeConfig.knowledgeBindings).toEqual([
      expect.objectContaining({
        knowledgeBaseId: 'kb-1',
        topK: 5,
        similarityThreshold: 0.42,
      }),
    ]);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ name: 'searchKnowledge_kb-1' });
    expect(typeof tools[0]?.execute).toBe('function');
  });

  it('Mixed scenario: MCP + Sub-Agent + Knowledge + HTTP 同时接线时会完整注入全部工具', async () => {
    const nodes = [
      ...baseNodes,
      createNode('mcp-1', 'mcp-tool', {
        name: 'search_docs',
        mcpServerConfigId: 'mcp-server-1',
        toolName: 'searchDocs',
        enabled: true,
      }),
      createNode('sub-1', 'sub-agent', {
        agentDefinitionId: 'agent-child',
        alias: 'writer',
      }),
      createNode('kb-1-node', 'knowledge-base', {
        knowledgeBaseId: 'kb-1',
        enabled: true,
      }),
      createNode('http-1', 'http-tool', {
        name: 'fetch_api',
        url: 'https://example.com/search',
        method: 'GET',
        enabled: true,
      }),
    ];

    const edges = [
      connectToAgentMain('mcp-1', 'tools-in'),
      connectToAgentMain('sub-1', 'sub-agents-in'),
      connectToAgentMain('kb-1-node', 'knowledge-in'),
      connectToAgentMain('http-1', 'tools-in'),
    ];

    const { runtimeConfig, tools } = await compileAndLoadTools({
      nodes,
      edges,
    });

    expect(runtimeConfig.tools).toEqual([
      expect.objectContaining({ toolType: 'mcp', name: 'search_docs' }),
      expect.objectContaining({ toolType: 'http', name: 'fetch_api' }),
    ]);
    expect(runtimeConfig.knowledgeBindings).toHaveLength(1);
    expect(runtimeConfig.subAgents).toHaveLength(1);
    expect(tools).toHaveLength(7);
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'search_docs',
        'fetch_api',
        'searchKnowledge_kb-1',
        'call_subagent',
        'spawn_subagent',
        'wait_for_subagents',
        'get_subagent_status',
      ]),
    );
  });

  it('Orphan exclusion: 只有接到 agent-main 的节点才会进入最终 setTools()', async () => {
    const nodes = [
      ...baseNodes,
      createNode('mcp-connected', 'mcp-tool', {
        name: 'search_docs',
        mcpServerConfigId: 'mcp-server-1',
        toolName: 'searchDocs',
      }),
      createNode('knowledge-connected', 'knowledge-base', {
        knowledgeBaseId: 'kb-1',
      }),
      createNode('http-orphan', 'http-tool', {
        name: 'fetch_orphan',
        url: 'https://example.com/orphan',
      }),
      createNode('sub-orphan', 'sub-agent', {
        agentDefinitionId: 'agent-orphan',
        alias: 'orphan_writer',
      }),
    ];

    const edges = [
      connectToAgentMain('mcp-connected', 'tools-in'),
      connectToAgentMain('knowledge-connected', 'knowledge-in'),
    ];

    const { runtimeConfig, tools } = await compileAndLoadTools({
      nodes,
      edges,
    });
    const toolNames = tools.map((tool) => tool.name);

    expect(runtimeConfig.tools).toEqual([
      expect.objectContaining({ name: 'search_docs', toolType: 'mcp' }),
    ]);
    expect(runtimeConfig.knowledgeBindings).toEqual([
      expect.objectContaining({ knowledgeBaseId: 'kb-1' }),
    ]);
    expect(runtimeConfig.subAgents).toBeUndefined();
    expect(toolNames).toEqual(['search_docs', 'searchKnowledge_kb-1']);
    expect(toolNames).not.toContain('fetch_orphan');
    expect(toolNames).not.toContain('call_subagent');
  });
});

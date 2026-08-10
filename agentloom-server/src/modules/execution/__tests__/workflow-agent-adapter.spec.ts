import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentVersionSnapshot } from '../../../database/schema/agent-definitions.schema';
import type { ExecutionStep } from '../../../database/schema';
import type { AgentEvent } from '../../agent/types/agent-event.types';
import type { ContentBlock } from '../../agent/types/content-block.types';
import type { SessionToolProvider } from '../../agent/ports/agent-runtime.port';
import { SubAgentToolsProvider } from '../../agent-execution/subagent';
import { WorkflowAgentAdapter } from '../workflow-agent-adapter';

const { mockResolveSubAgent } = vi.hoisted(() => ({
  mockResolveSubAgent: vi.fn(),
}));

vi.mock('../node-handlers/sub-agent.handler', async () => {
  const actual = await vi.importActual<
    typeof import('../node-handlers/sub-agent.handler')
  >('../node-handlers/sub-agent.handler');

  return {
    ...actual,
    resolveSubAgent: mockResolveSubAgent,
  };
});

vi.mock('../../agent-execution/subagent/resolve-subagent', async () => {
  const actual = await vi.importActual<
    typeof import('../../agent-execution/subagent/resolve-subagent')
  >('../../agent-execution/subagent/resolve-subagent');

  return {
    ...actual,
    resolveSubAgent: mockResolveSubAgent,
  };
});

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn((db: unknown) => db),
}));

const TENANT_ID = '019577a0-0000-7000-8000-000000000099';
const EXECUTION_ID = '019577a0-0000-7000-8000-000000000001';

function makeStep(overrides: Partial<ExecutionStep> = {}): ExecutionStep {
  return {
    id: '019577a0-0000-7000-8000-step00000001',
    executionId: EXECUTION_ID,
    nodeId: 'workflow-agent-node',
    stepOrder: 0,
    status: 'pending',
    nodeType: 'agent',
    nodeData: {},
    input: null,
    result: null,
    checkpointData: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  } as ExecutionStep;
}

function makeSnapshot(
  nodeId: string,
  sandboxConfig?: AgentVersionSnapshot['sandboxConfig'],
): AgentVersionSnapshot {
  return {
    nodes: [{ id: nodeId, type: 'agent', position: { x: 0, y: 0 }, data: {} }],
    edges: [],
    viewport: null,
    ...(sandboxConfig ? { sandboxConfig } : {}),
    metadata: {
      nodeCount: 1,
      edgeCount: 0,
      createdFromVersion: 1,
    },
  };
}

async function* emit(events: AgentEvent[]): AsyncGenerator<AgentEvent> {
  for (const event of events) {
    yield event;
  }
}

function createAdapter(
  deps: Record<string, unknown>,
  config: Record<string, unknown> = { agentDefinitionId: 'parent-agent' },
) {
  const adapterDeps: Record<string, unknown> = {
    db: deps.db ?? ({} as never),
    agentRuntime: deps.agentRuntime ?? ({} as never),
    runtimeAdapterFactory: deps.runtimeAdapterFactory ?? ({} as never),
    agentDefinitionService: deps.agentDefinitionService ?? ({} as never),
    sandboxService: deps.sandboxService ?? ({} as never),
    eventBridge: deps.eventBridge ?? ({} as never),
  };
  if (deps.skillResolverService) {
    adapterDeps.skillResolverService = deps.skillResolverService;
  }
  if (deps.subAgentToolsProvider) {
    adapterDeps.subAgentToolsProvider = deps.subAgentToolsProvider;
  }

  return new WorkflowAgentAdapter(adapterDeps as never, config as never);
}

describe('WorkflowAgentAdapter', () => {
  const parentSnapshot = makeSnapshot('parent-node', {
    cpu: 2,
    memory: 1024,
    disk: 4,
    timeout: 5,
  });
  const childSnapshot = makeSnapshot('child-node');

  const db = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  };

  const mockAgentRuntime = {
    createSession: vi.fn(),
    loadSession: vi.fn(),
    prompt: vi.fn(),
    cancel: vi.fn(),
  };
  const mockSandboxRuntime = {
    createSession: vi.fn(),
    loadSession: vi.fn(),
    prompt: vi.fn(),
    cancel: vi.fn(),
    registerSessionToolProvider: vi.fn(),
    unregisterSessionToolProvider: vi.fn(),
  };
  const mockRuntimeAdapterFactory = {
    selectAdapter: vi.fn(),
  };
  const mockAgentDefinitionService = {
    findDetailById: vi.fn(),
    buildRuntimeConfigFromNodes: vi.fn(),
    resolveSystemPromptFromNodes: vi.fn(),
  };
  const mockSandboxService = {
    createSandboxSession: vi.fn(),
  };
  const mockEventBridge = {
    emitOutputChunk: vi.fn(),
    emitStepAgentEvent: vi.fn(),
    emitToolCallStatus: vi.fn(),
    emitToolPermissionRequired: vi.fn(),
  };
  const mockSkillResolverService = {
    resolveSkillsForAgent: vi.fn(),
    buildSkillAugmentedPrompt: vi.fn(),
  };
  let updateWhereMock: ReturnType<typeof vi.fn>;
  let updateSetMock: ReturnType<typeof vi.fn>;
  let selectWhereMock: ReturnType<typeof vi.fn>;
  let selectFromMock: ReturnType<typeof vi.fn>;
  let sessionProviders: Map<string, SessionToolProvider>;
  let sessionAgentIds: Map<string, string>;
  let realSubAgentToolsProvider: SubAgentToolsProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    sessionProviders = new Map();
    sessionAgentIds = new Map();

    selectWhereMock = vi.fn().mockResolvedValue([{ triggerType: 'manual' }]);
    selectFromMock = vi.fn().mockReturnValue({
      where: selectWhereMock,
    });
    db.select.mockReturnValue({
      from: selectFromMock,
    });

    updateWhereMock = vi.fn().mockResolvedValue(undefined);
    updateSetMock = vi.fn().mockReturnValue({
      where: updateWhereMock,
    });
    db.update.mockReturnValue({
      set: updateSetMock,
    });

    mockRuntimeAdapterFactory.selectAdapter.mockReturnValue(mockSandboxRuntime);
    mockSandboxRuntime.registerSessionToolProvider.mockImplementation(
      (sessionId: string, provider: SessionToolProvider) => {
        sessionProviders.set(sessionId, provider);
      },
    );
    mockSandboxRuntime.unregisterSessionToolProvider.mockImplementation(
      (sessionId: string) => {
        sessionProviders.delete(sessionId);
      },
    );
    mockSandboxRuntime.createSession.mockImplementation(
      async (params: { sessionId?: string; agentId: string }) => {
        const id = params.sessionId ?? `${params.agentId}-session`;
        sessionAgentIds.set(id, params.agentId);
        return { id };
      },
    );
    mockAgentDefinitionService.findDetailById.mockImplementation(
      async (agentDefinitionId: string) => ({
        id: agentDefinitionId,
        publishedVersionId: `${agentDefinitionId}-version`,
        systemPrompt:
          agentDefinitionId === 'parent-agent'
            ? '父 Agent 提示词'
            : '子 Agent 提示词',
        sandboxConfig:
          agentDefinitionId === 'parent-agent'
            ? { cpu: 2, memory: 1024, disk: 4, timeout: 5 }
            : null,
      }),
    );
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockImplementation(
      (nodes: Array<{ id?: string }>) => {
        if (nodes[0]?.id === 'parent-node') {
          return {
            modelConfig: { modelId: 'model-parent' },
            sandboxConfig: { cpu: 2, memory: 1024, disk: 4, timeout: 5 },
            subAgents: [{ agentDefinitionId: 'child-agent', alias: 'writer' }],
          };
        }

        return {
          modelConfig: { modelId: 'model-child' },
          subAgents: [],
        };
      },
    );
    mockResolveSubAgent.mockResolvedValue({
      agentDefinition: { id: 'child-agent' },
      versionSnapshot: { snapshot: childSnapshot },
    });
    mockSkillResolverService.resolveSkillsForAgent.mockResolvedValue([]);
    mockSkillResolverService.buildSkillAugmentedPrompt.mockImplementation(
      (baseSystemPrompt: string, skills: Array<{ name: string }>) =>
        `${baseSystemPrompt}\n\n${skills.map((skill) => skill.name).join(',')}`,
    );
    realSubAgentToolsProvider = new SubAgentToolsProvider(
      db as never,
      mockAgentDefinitionService as never,
      mockEventBridge as never,
    );
  });

  it('工作流已有 sandbox 绑定时不会新建沙箱，且子 Agent 共享父级绑定', async () => {
    mockSandboxRuntime.prompt.mockImplementation(async function* (
      sessionId: string,
      content: ContentBlock[],
    ) {
      if (sessionAgentIds.get(sessionId) === 'child-agent') {
        expect(content[0]).toMatchObject({ type: 'text' });
        yield { type: 'message_chunk', content: 'child-output' };
        yield {
          type: 'decision',
          suggestedContent: 'child decision',
          confidence: 0.9,
        };
        yield { type: 'done', stopReason: 'end_turn' };
        return;
      }

      expect((content[0] as { text: string }).text).toContain('hello');
      const provider = sessionProviders.get(sessionId);
      expect(provider).toBeTypeOf('function');
      const tools = await provider?.();
      const childResult = await tools?.call_subagent.execute?.(
        { alias: 'writer', task: '整理 hello', context: '只保留关键事实' },
        { toolCallId: 'tool-call-subagent-1' } as never,
      );
      expect(JSON.parse(childResult as string)).toMatchObject({
        content: 'child-output',
        decision: {
          suggestedContent: 'child decision',
          confidence: 0.9,
        },
      });

      yield { type: 'message_chunk', content: 'parent-output' };
      yield { type: 'done', stopReason: 'end_turn' };
    });

    const adapter = new WorkflowAgentAdapter(
      {
        db: db as never,
        agentRuntime: mockAgentRuntime as never,
        runtimeAdapterFactory: mockRuntimeAdapterFactory as never,
        agentDefinitionService: mockAgentDefinitionService as never,
        sandboxService: mockSandboxService as never,
        eventBridge: mockEventBridge as never,
        subAgentToolsProvider: realSubAgentToolsProvider as never,
      },
      {
        agentDefinitionId: 'parent-agent',
        sandboxConfig: { cpu: 6, memory: 4096, disk: 10, timeout: 8 },
      },
    );

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: { prompt: 'hello' },
      tenantId: TENANT_ID,
      versionSnapshot: parentSnapshot,
      sandboxBinding: { executionId: EXECUTION_ID },
    });

    expect(mockSandboxService.createSandboxSession).not.toHaveBeenCalled();
    expect(mockRuntimeAdapterFactory.selectAdapter).toHaveBeenCalledTimes(2);
    expect(mockSandboxRuntime.createSession).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        agentId: 'parent-agent',
        llmModelConfigId: 'model-parent',
        serverSandbox: { executionId: EXECUTION_ID },
        context: expect.objectContaining({
          serverSandbox: { executionId: EXECUTION_ID },
        }),
      }),
    );
    expect(mockSandboxRuntime.createSession).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        agentId: 'child-agent',
        llmModelConfigId: 'model-child',
        serverSandbox: { executionId: EXECUTION_ID },
        context: expect.objectContaining({
          serverSandbox: { executionId: EXECUTION_ID },
        }),
      }),
    );
    expect(
      mockSandboxRuntime.createSession.mock.calls[0]?.[0]?.sessionId,
    ).not.toBe(mockSandboxRuntime.createSession.mock.calls[1]?.[0]?.sessionId);
    expect(mockEventBridge.emitOutputChunk).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ content: 'parent-output' });
  });

  it('没有工作流 sandbox 时会按 Agent 全局 sandboxConfig 新建执行级沙箱，并保留多模态输入块', async () => {
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-parent' },
      sandboxConfig: { cpu: 2, memory: 1024, disk: 4, timeout: 5 },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({ id: 'solo-session' });
    mockSandboxRuntime.prompt.mockImplementation(
      (_sessionId: string, content: ContentBlock[]) => {
        expect(content[0]).toMatchObject({ type: 'text' });
        expect((content[0] as { text: string }).text).toContain(
          '[image:image/png]',
        );
        expect(content[1]).toMatchObject({
          type: 'image',
          mimeType: 'image/png',
          data: 'base64-image',
        });

        return emit([
          { type: 'message_chunk', content: 'sandbox-output' },
          { type: 'done', stopReason: 'end_turn' },
        ]);
      },
    );

    const adapter = new WorkflowAgentAdapter(
      {
        db: db as never,
        agentRuntime: mockAgentRuntime as never,
        runtimeAdapterFactory: mockRuntimeAdapterFactory as never,
        agentDefinitionService: mockAgentDefinitionService as never,
        sandboxService: mockSandboxService as never,
        eventBridge: mockEventBridge as never,
      },
      {
        agentDefinitionId: 'parent-agent',
      },
    );

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: {
        prompt: 'hello',
        multimodal: {
          type: 'image',
          mimeType: 'image/png',
          data: 'base64-image',
        },
      },
      tenantId: TENANT_ID,
      versionSnapshot: parentSnapshot,
    });

    expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith({
      executionId: EXECUTION_ID,
      sandboxNodeId: 'workflow-agent-node',
      config: {
        cpu: 2,
        memory: 1024,
        disk: 4,
        timeout: 5,
        conversationIdleAutoEndMinutes: 10,
      },
      tenantId: TENANT_ID,
    });
    expect(mockSandboxRuntime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'parent-agent',
        serverSandbox: {
          executionId: EXECUTION_ID,
          sandboxNodeId: 'workflow-agent-node',
        },
      }),
    );
    expect(result).toMatchObject({ content: 'sandbox-output' });
  });

  it('已发布快照 persisted sandboxConfig 丢失 timeoutSeconds 时应从画布节点恢复秒级超时', async () => {
    const snapshotWithLegacySandbox = {
      nodes: [
        {
          id: 'parent-main',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: { nodeType: 'agent-main' },
        },
        {
          id: 'parent-sandbox',
          type: 'tool',
          position: { x: 120, y: 0 },
          data: {
            nodeType: 'sandbox',
            cpuLimit: 3,
            memoryLimitMb: 1536,
            diskLimitGb: 6,
            timeoutSeconds: 450,
          },
        },
      ],
      edges: [
        {
          id: 'edge-parent-sandbox',
          source: 'parent-sandbox',
          target: 'parent-main',
          sourceHandle: 'sandbox-out',
          targetHandle: 'sandbox-in',
        },
      ],
      viewport: null,
      sandboxConfig: { cpu: 3, memory: 1536, disk: 6, timeout: 450 },
      metadata: {
        nodeCount: 2,
        edgeCount: 1,
        createdFromVersion: 1,
      },
    } satisfies AgentVersionSnapshot;

    mockAgentDefinitionService.findDetailById.mockResolvedValue({
      id: 'parent-agent',
      publishedVersionId: 'parent-agent-version',
      systemPrompt: '父 Agent 提示词',
      nodes: snapshotWithLegacySandbox.nodes,
      edges: snapshotWithLegacySandbox.edges,
      sandboxConfig: { cpu: 3, memory: 1536, disk: 6, timeout: 450 },
    });
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-parent' },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({ id: 'solo-session' });
    mockSandboxRuntime.prompt.mockImplementation(() =>
      emit([
        { type: 'message_chunk', content: 'legacy-timeout-fixed' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );

    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: { prompt: 'hello' },
      tenantId: TENANT_ID,
      versionSnapshot: snapshotWithLegacySandbox,
    });

    expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith({
      executionId: EXECUTION_ID,
      sandboxNodeId: 'workflow-agent-node',
      config: {
        cpu: 3,
        memory: 1536,
        disk: 6,
        timeout: 1,
        timeoutSeconds: 450,
        conversationIdleAutoEndMinutes: 10,
      },
      tenantId: TENANT_ID,
    });
  });

  it('text-in 应作为主提示文本注入，并从摘要 JSON 中剔除', async () => {
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-parent' },
      sandboxConfig: { cpu: 2, memory: 1024, disk: 4, timeout: 5 },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({ id: 'solo-session' });
    mockSandboxRuntime.prompt.mockImplementation(
      (_sessionId: string, content: ContentBlock[]) => {
        expect(content[0]).toMatchObject({ type: 'text' });
        expect((content[0] as { text: string }).text).toBe('请总结这个主题');

        return emit([
          { type: 'message_chunk', content: 'handled-text-input' },
          { type: 'done', stopReason: 'end_turn' },
        ]);
      },
    );

    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: {
        'text-in': '请总结这个主题',
        'sandbox-in': { status: 'creating', sessionId: 'sandbox-001' },
      },
      tenantId: TENANT_ID,
      versionSnapshot: parentSnapshot,
    });

    expect(result).toMatchObject({ content: 'handled-text-input' });
  });

  it('工作流上游的 skill/MCP/knowledge 节点会扩展 runtime，并从 prompt 输入中剥离配置载荷', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-parent' },
      tools: [
        {
          toolType: 'mcp',
          toolId: 'base-tool',
          name: 'base_search',
          enabled: true,
          mcpServerConfigId: 'mcp-base',
          toolName: 'base_search',
        },
      ],
      knowledgeBindings: [{ knowledgeBaseId: 'kb-base', enabled: true }],
      skillIds: ['skill-base'],
      subAgents: [],
    });
    mockSkillResolverService.resolveSkillsForAgent.mockResolvedValue([
      {
        id: 'skill-base',
        name: '内置技能',
        description: '内置技能描述',
        content: 'BUILTIN_SKILL_CONTENT',
      },
    ]);
    mockSkillResolverService.buildSkillAugmentedPrompt.mockReturnValue(
      'augmented-system-prompt',
    );
    mockSandboxRuntime.createSession.mockResolvedValue({
      id: 'capability-session',
    });
    mockSandboxRuntime.prompt.mockImplementation(
      (_sessionId: string, content: ContentBlock[]) => {
        const promptText = (content[0] as { text: string }).text;

        expect(promptText).toContain('请结合能力回答');
        expect(promptText).toContain('保留的上下文');
        expect(promptText).not.toContain('skill-upstream-1');
        expect(promptText).not.toContain('mcp-upstream');
        expect(promptText).not.toContain('knowledge-base');

        return emit([
          { type: 'message_chunk', content: 'capability-output' },
          { type: 'done', stopReason: 'end_turn' },
        ]);
      },
    );

    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
      skillResolverService: mockSkillResolverService,
    });

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: {
        'text-in': '请结合能力回答',
        'skills-in': [
          {
            skills: [
              {
                id: 'skill-upstream-1',
                name: '上游技能一',
                description: '第一个上游技能',
                content: 'UPSTREAM_SKILL_ONE',
              },
            ],
          },
          {
            skills: [
              {
                id: 'skill-upstream-2',
                name: '上游技能二',
                description: '第二个上游技能',
                content: 'UPSTREAM_SKILL_TWO',
              },
            ],
          },
        ],
        'tools-in': [
          {
            type: 'mcp-tool',
            mcpServerConfigId: 'mcp-upstream',
            enabledToolIds: ['tool-fast', 'tool-deep'],
            tools: [
              {
                id: 'tool-fast',
                name: 'fast_search',
                inputSchema: { type: 'object' },
              },
              {
                id: 'tool-deep',
                name: 'deep_search',
                inputSchema: { type: 'object' },
              },
            ],
          },
        ],
        context: [
          {
            type: 'knowledge-base',
            knowledgeBaseId: 'kb-upstream',
          },
          {
            userNote: '保留的上下文',
          },
        ],
      },
      tenantId: TENANT_ID,
      versionSnapshot: makeSnapshot('no-sandbox-node'),
    });

    expect(mockSkillResolverService.resolveSkillsForAgent).toHaveBeenCalledWith(
      TENANT_ID,
      ['skill-base'],
    );
    expect(
      mockSkillResolverService.buildSkillAugmentedPrompt,
    ).toHaveBeenCalledWith(
      '',
      expect.arrayContaining([
        expect.objectContaining({ id: 'skill-base', name: '内置技能' }),
        expect.objectContaining({ id: 'skill-upstream-1', name: '上游技能一' }),
        expect.objectContaining({ id: 'skill-upstream-2', name: '上游技能二' }),
      ]),
    );
    expect(mockSandboxRuntime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: 'augmented-system-prompt',
        runtimeConfig: expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              toolId: 'base-tool',
              toolName: 'base_search',
            }),
            expect.objectContaining({
              toolType: 'mcp',
              mcpServerConfigId: 'mcp-upstream',
              toolName: 'fast_search',
            }),
            expect.objectContaining({
              toolType: 'mcp',
              mcpServerConfigId: 'mcp-upstream',
              toolName: 'deep_search',
            }),
          ]),
          knowledgeBindings: expect.arrayContaining([
            expect.objectContaining({ knowledgeBaseId: 'kb-base' }),
            expect.objectContaining({ knowledgeBaseId: 'kb-upstream' }),
          ]),
        }),
        context: expect.objectContaining({
          input: {
            'text-in': '请结合能力回答',
            context: [{ userNote: '保留的上下文' }],
          },
        }),
      }),
    );
    expect(result).toMatchObject({ content: 'capability-output' });
  });

  function setupNoSandboxAgent() {
    mockAgentDefinitionService.findDetailById.mockResolvedValue({
      id: 'parent-agent',
      publishedVersionId: 'parent-agent-version',
      systemPrompt: null,
      sandboxConfig: null,
    });
  }

  it('无显式 sandbox 时也应创建默认 sandbox 并使用 adapterFactory', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-1' },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({ id: 'session-1' });
    mockSandboxRuntime.prompt.mockReturnValue(
      emit([
        { type: 'message_chunk', content: 'direct-output' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );

    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: { prompt: 'test' },
      tenantId: TENANT_ID,
      versionSnapshot: makeSnapshot('no-sandbox-node'),
    });

    expect(mockRuntimeAdapterFactory.selectAdapter).toHaveBeenCalledWith(true);
    expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith({
      executionId: EXECUTION_ID,
      sandboxNodeId: 'workflow-agent-node',
      config: {
        cpu: 1,
        memory: 512,
        disk: 2,
        timeout: 0,
        conversationIdleAutoEndMinutes: 10,
      },
      tenantId: TENANT_ID,
    });
    expect(mockSandboxRuntime.createSession).toHaveBeenCalled();
    expect(mockAgentRuntime.createSession).not.toHaveBeenCalled();
    expect(result.content).toBe('direct-output');
  });

  it('会按运行中进度把 partialContent 与 segments 持久化到 checkpoint', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T00:00:00.000Z'));
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-1' },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({ id: 'session-1' });
    mockSandboxRuntime.prompt.mockImplementation(
      async function* (): AsyncGenerator<AgentEvent> {
        yield { type: 'message_chunk', content: '第一段' };
        vi.setSystemTime(new Date('2026-04-01T00:00:01.000Z'));
        yield { type: 'message_chunk', content: '第二段' };
        yield { type: 'plan', title: '计划', content: '先整理上下文' };
        yield { type: 'done', stopReason: 'end_turn' };
      },
    );

    const step = makeStep();
    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step,
      input: { prompt: 'test' },
      tenantId: TENANT_ID,
      versionSnapshot: makeSnapshot('no-sandbox-node'),
    });

    expect(result).toMatchObject({ content: '第一段第二段' });
    expect(db.update.mock.calls.length).toBeGreaterThan(1);
    expect(step.checkpointData).toMatchObject({
      sessionId: expect.any(String),
      partialContent: '第一段第二段',
      segments: [
        { type: 'text', content: '第一段第二段' },
        { type: 'thinking', content: '先整理上下文' },
      ],
      round: 1,
      chunkIndex: 2,
    });
  });

  it('tool_call 事件会写入 checkpoint 瀑布流并广播 dedicated tool 状态事件', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-1' },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({ id: 'session-1' });
    mockSandboxRuntime.prompt.mockReturnValue(
      emit([
        { type: 'message_chunk', content: '准备写文件' },
        {
          type: 'decision',
          suggestedContent: '先创建 notes.md',
          rationale: '需要先落盘中间结果',
        },
        {
          type: 'tool_call',
          call: {
            id: 'tool-1',
            tool: 'write_file',
            args: { path: 'notes.md' },
            status: 'awaiting_permission',
            permissionRequest: {
              description: '写入工作区文件 notes.md',
              resourcePaths: ['notes.md'],
            },
            transitions: [
              {
                to: 'awaiting_permission',
                timestamp: '2026-04-01T00:00:01.500Z',
                source: 'runtime',
              },
            ],
          },
        },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );

    const step = makeStep();
    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    await adapter.execute({
      executionId: EXECUTION_ID,
      step,
      input: { prompt: 'test' },
      tenantId: TENANT_ID,
      versionSnapshot: makeSnapshot('no-sandbox-node'),
    });

    expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledWith(
      TENANT_ID,
      EXECUTION_ID,
      expect.objectContaining({
        stepId: step.id,
        nodeId: step.nodeId,
        executionType: 'workflow',
        toolCallId: 'tool-1',
        tool: 'write_file',
        status: 'awaiting_permission',
      }),
    );
    expect(mockEventBridge.emitToolPermissionRequired).toHaveBeenCalledWith(
      TENANT_ID,
      EXECUTION_ID,
      expect.objectContaining({
        stepId: step.id,
        nodeId: step.nodeId,
        executionType: 'workflow',
        toolCallId: 'tool-1',
        tool: 'write_file',
      }),
    );
    expect(step.checkpointData).toMatchObject({
      partialContent: '准备写文件',
      decision: {
        suggestedContent: '先创建 notes.md',
        rationale: '需要先落盘中间结果',
      },
      toolCalls: [
        expect.objectContaining({
          id: 'tool-1',
          tool: 'write_file',
          status: 'awaiting_permission',
        }),
      ],
      segments: [
        { type: 'text', content: '准备写文件' },
        { type: 'thinking', content: '需要先落盘中间结果' },
        { type: 'tool_call', toolCallId: 'tool-1' },
      ],
    });
  });

  it('tool_use 触发多轮循环直到 end_turn', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-1' },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({ id: 'session-1' });
    mockSandboxRuntime.prompt
      .mockReturnValueOnce(
        emit([
          { type: 'message_chunk', content: '准备调用工具...' },
          { type: 'done', stopReason: 'tool_use' },
        ]),
      )
      .mockReturnValueOnce(
        emit([
          { type: 'message_chunk', content: '工具结果处理完毕' },
          { type: 'done', stopReason: 'end_turn' },
        ]),
      );

    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: { prompt: 'test' },
      tenantId: TENANT_ID,
      versionSnapshot: makeSnapshot('no-sandbox-node'),
    });

    expect(mockSandboxRuntime.prompt).toHaveBeenCalledTimes(2);
    expect(result.content).toBe('准备调用工具...工具结果处理完毕');
  });

  it('system trigger 的 no_sandbox workflow agent 会从 execution 记录判定自动授权并传给 runtime session', async () => {
    mockRuntimeAdapterFactory.selectAdapter.mockImplementation(
      (hasSandbox: boolean) =>
        hasSandbox ? mockSandboxRuntime : mockAgentRuntime,
    );
    selectWhereMock.mockResolvedValueOnce([{ triggerType: 'system' }]);
    mockAgentDefinitionService.findDetailById.mockResolvedValue({
      id: 'news-agent',
      publishedVersionId: 'news-agent-version',
      systemPrompt: '汇总新闻',
      sandboxConfig: null,
      runtimeMode: 'no_sandbox',
    });
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-news' },
      runtimeMode: 'no_sandbox',
      subAgents: [],
    });
    mockAgentRuntime.createSession.mockResolvedValue({ id: 'session-news' });
    mockAgentRuntime.prompt.mockReturnValue(
      emit([
        { type: 'message_chunk', content: '今日新闻简报' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );

    const adapter = createAdapter(
      {
        db,
        agentRuntime: mockAgentRuntime,
        runtimeAdapterFactory: mockRuntimeAdapterFactory,
        agentDefinitionService: mockAgentDefinitionService,
        sandboxService: mockSandboxService,
        eventBridge: mockEventBridge,
      },
      { agentDefinitionId: 'news-agent' },
    );

    const snapshot = {
      ...makeSnapshot('news-agent-main'),
      runtimeMode: 'no_sandbox',
    } as AgentVersionSnapshot;

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: {
        'exec-in': {
          triggered: true,
        },
        'text-in': '请总结今天新闻',
      },
      tenantId: TENANT_ID,
      versionSnapshot: snapshot,
    });

    expect(mockRuntimeAdapterFactory.selectAdapter).toHaveBeenCalledWith(false);
    expect(mockAgentRuntime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'news-agent',
        mode: 'workflow',
        context: expect.objectContaining({
          autoApproveToolPermissions: true,
          input: expect.objectContaining({
            'text-in': '请总结今天新闻',
          }),
        }),
      }),
    );
    expect(result.content).toBe('今日新闻简报');
  });

  it('execution 记录不是 system 时不应被 exec-in 的旧 triggerType 误放行', async () => {
    mockRuntimeAdapterFactory.selectAdapter.mockImplementation(
      (hasSandbox: boolean) =>
        hasSandbox ? mockSandboxRuntime : mockAgentRuntime,
    );
    selectWhereMock.mockResolvedValueOnce([{ triggerType: 'manual' }]);
    mockAgentDefinitionService.findDetailById.mockResolvedValue({
      id: 'news-agent',
      publishedVersionId: 'news-agent-version',
      systemPrompt: '汇总新闻',
      sandboxConfig: null,
      runtimeMode: 'no_sandbox',
    });
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-news' },
      runtimeMode: 'no_sandbox',
      subAgents: [],
    });
    mockAgentRuntime.createSession.mockResolvedValue({ id: 'session-news' });
    mockAgentRuntime.prompt.mockReturnValue(
      emit([
        { type: 'message_chunk', content: '今日新闻简报' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );

    const adapter = createAdapter(
      {
        db,
        agentRuntime: mockAgentRuntime,
        runtimeAdapterFactory: mockRuntimeAdapterFactory,
        agentDefinitionService: mockAgentDefinitionService,
        sandboxService: mockSandboxService,
        eventBridge: mockEventBridge,
      },
      { agentDefinitionId: 'news-agent' },
    );

    const snapshot = {
      ...makeSnapshot('news-agent-main'),
      runtimeMode: 'no_sandbox',
    } as AgentVersionSnapshot;

    await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: {
        'exec-in': {
          triggerType: 'system',
          triggered: true,
        },
        'text-in': '请总结今天新闻',
      },
      tenantId: TENANT_ID,
      versionSnapshot: snapshot,
    });

    expect(mockAgentRuntime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.not.objectContaining({
          autoApproveToolPermissions: true,
        }),
      }),
    );
  });

  it('达到 MAX_TOOL_ROUNDS 上限时抛出异常', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-1' },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({ id: 'session-1' });
    mockSandboxRuntime.prompt.mockImplementation(() =>
      emit([{ type: 'done', stopReason: 'tool_use' }]),
    );

    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    await expect(
      adapter.execute({
        executionId: EXECUTION_ID,
        step: makeStep(),
        input: { prompt: 'loop' },
        tenantId: TENANT_ID,
        versionSnapshot: makeSnapshot('no-sandbox-node'),
      }),
    ).rejects.toThrow('exceeded the maximum tool rounds');
  });

  it('decision 事件被正确收集到结果中', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-1' },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({ id: 'session-1' });
    mockSandboxRuntime.prompt.mockReturnValue(
      emit([
        { type: 'message_chunk', content: 'decided' },
        {
          type: 'decision',
          suggestedContent: 'approval needed',
          autonomyMode: 'suggest',
          confidence: 0.95,
        },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );

    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: { prompt: 'decide' },
      tenantId: TENANT_ID,
      versionSnapshot: makeSnapshot('no-sandbox-node'),
    });

    expect(result.decision).toMatchObject({
      suggestedContent: 'approval needed',
      autonomyMode: 'suggest',
      confidence: 0.95,
    });
  });

  it('无版本快照时抛出异常', async () => {
    mockAgentDefinitionService.findDetailById.mockResolvedValue({
      id: 'no-snap-agent',
      publishedVersionId: null,
      systemPrompt: null,
      sandboxConfig: null,
    });

    const adapter = createAdapter(
      {
        db,
        agentRuntime: mockAgentRuntime,
        runtimeAdapterFactory: mockRuntimeAdapterFactory,
        agentDefinitionService: mockAgentDefinitionService,
        sandboxService: mockSandboxService,
        eventBridge: mockEventBridge,
      },
      { agentDefinitionId: 'no-snap-agent' },
    );

    await expect(
      adapter.execute({
        executionId: EXECUTION_ID,
        step: makeStep(),
        input: { prompt: 'test' },
        tenantId: TENANT_ID,
      }),
    ).rejects.toThrow('no published version snapshot');
  });

  it('emitEvents=false 时不调用 eventBridge', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-1' },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({ id: 'session-1' });
    mockSandboxRuntime.prompt.mockReturnValue(
      emit([
        { type: 'message_chunk', content: 'silent' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );

    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: { prompt: 'test' },
      tenantId: TENANT_ID,
      versionSnapshot: makeSnapshot('no-sandbox-node'),
      emitEvents: false,
    });

    expect(mockEventBridge.emitOutputChunk).not.toHaveBeenCalled();
    expect(mockEventBridge.emitStepAgentEvent).not.toHaveBeenCalled();
  });

  it('stopReason 非 end_turn 时包含在结果中', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-1' },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({ id: 'session-1' });
    mockSandboxRuntime.prompt.mockReturnValue(
      emit([
        { type: 'message_chunk', content: 'cancelled' },
        { type: 'done', stopReason: 'cancelled' },
      ]),
    );

    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: {},
      tenantId: TENANT_ID,
      versionSnapshot: makeSnapshot('no-sandbox-node'),
    });

    expect(result.stopReason).toBe('cancelled');
  });

  it('system-prompt-in 应覆盖已发布 Agent 的系统提示词，并从 prompt 输入摘要中剔除', async () => {
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-parent' },
      sandboxConfig: { cpu: 2, memory: 1024, disk: 4, timeout: 5 },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({
      id: 'parent-session',
    });
    mockSandboxRuntime.prompt.mockImplementation(
      (_sessionId: string, content: ContentBlock[]) => {
        const summary = JSON.parse(
          (content[0] as { text: string }).text,
        ) as Record<string, unknown>;

        expect(summary).toEqual({ prompt: 'hello' });

        return emit([
          { type: 'message_chunk', content: 'parent-output' },
          { type: 'done', stopReason: 'end_turn' },
        ]);
      },
    );

    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: {
        prompt: 'hello',
        'system-prompt-in': '只返回三条重点',
      },
      tenantId: TENANT_ID,
      versionSnapshot: parentSnapshot,
    });

    expect(mockSandboxRuntime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: '只返回三条重点',
      }),
    );
  });

  it('嵌套 subAgentRef 应把局部 override/extension 合并到子 Agent 运行时', async () => {
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockImplementation(
      (nodes: Array<{ id?: string }>) => {
        if (nodes[0]?.id === 'parent-node') {
          return {
            modelConfig: { modelId: 'model-parent' },
            sandboxConfig: { cpu: 2, memory: 1024, disk: 4, timeout: 5 },
            subAgents: [
              {
                agentDefinitionId: 'child-agent',
                alias: 'writer',
                overrides: {
                  systemPrompt: '子代理覆盖提示词',
                  outputSchema: {
                    type: 'object',
                    properties: {
                      summary: { type: 'string' },
                    },
                  },
                },
                extensions: {
                  skillIds: ['skill-child'],
                },
              },
            ],
          };
        }

        return {
          modelConfig: { modelId: 'model-child' },
          subAgents: [],
        };
      },
    );
    mockSandboxRuntime.prompt.mockImplementation(async function* (
      sessionId: string,
    ) {
      if (sessionAgentIds.get(sessionId) === 'child-agent') {
        yield { type: 'message_chunk', content: 'child-result' };
        yield { type: 'done', stopReason: 'end_turn' };
        return;
      }

      const provider = sessionProviders.get(sessionId);
      const tools = await provider?.();
      await tools?.call_subagent.execute?.(
        { alias: 'writer', task: '写总结' },
        { toolCallId: 'tool-call-subagent-2' } as never,
      );
      yield { type: 'message_chunk', content: 'parent-result' };
      yield { type: 'done', stopReason: 'end_turn' };
    });

    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
      subAgentToolsProvider: realSubAgentToolsProvider,
    });

    await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: { prompt: 'test' },
      tenantId: TENANT_ID,
      versionSnapshot: parentSnapshot,
      sandboxBinding: { executionId: EXECUTION_ID },
    });

    expect(mockSandboxRuntime.createSession).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        systemPrompt: expect.stringContaining('子代理覆盖提示词'),
        runtimeConfig: expect.objectContaining({
          outputSchema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
            },
          },
          skillIds: ['skill-child'],
        }),
      }),
    );
  });

  it('子 Agent 无 alias 时使用 agentDefinitionId 作为 key', async () => {
    mockAgentDefinitionService.findDetailById.mockImplementation(
      async (agentDefinitionId: string) => ({
        id: agentDefinitionId,
        publishedVersionId: `${agentDefinitionId}-version`,
        systemPrompt: null,
        sandboxConfig: null,
      }),
    );
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockImplementation(
      (nodes: Array<{ id?: string }>) => {
        if (nodes[0]?.id === 'parent-node') {
          return {
            modelConfig: { modelId: 'model-parent' },
            subAgents: [{ agentDefinitionId: 'child-agent' }],
          };
        }

        return {
          modelConfig: { modelId: 'model-child' },
          subAgents: [],
        };
      },
    );

    mockSandboxRuntime.prompt.mockImplementation(async function* (
      sessionId: string,
    ) {
      if (sessionAgentIds.get(sessionId) === 'child-agent') {
        yield { type: 'message_chunk', content: 'child-result' };
        yield { type: 'done', stopReason: 'end_turn' };
        return;
      }

      const provider = sessionProviders.get(sessionId);
      const tools = await provider?.();
      const result = await tools?.call_subagent.execute?.(
        { alias: 'child-agent', task: '写输出' },
        { toolCallId: 'tool-call-subagent-3' } as never,
      );
      expect(JSON.parse(result as string)).toMatchObject({
        content: 'child-result',
      });
      yield { type: 'message_chunk', content: 'parent-result' };
      yield { type: 'done', stopReason: 'end_turn' };
    });

    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
      subAgentToolsProvider: realSubAgentToolsProvider,
    });

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: { prompt: 'test' },
      tenantId: TENANT_ID,
      versionSnapshot: makeSnapshot('parent-node'),
    });

    expect(result.content).toBe('parent-result');
    expect(mockSandboxRuntime.createSession).toHaveBeenCalledTimes(2);
  });

  it('子 Agent 无可执行版本快照时抛出异常', async () => {
    mockResolveSubAgent.mockResolvedValue({
      agentDefinition: { id: 'child-agent' },
      versionSnapshot: { snapshot: null },
    });

    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-parent' },
      sandboxConfig: { cpu: 2, memory: 1024, disk: 4, timeout: 5 },
      subAgents: [{ agentDefinitionId: 'child-agent', alias: 'writer' }],
    });

    mockSandboxRuntime.prompt.mockImplementation(async function* (
      sessionId: string,
    ) {
      const provider = sessionProviders.get(sessionId);
      const tools = await provider?.();
      const result = await tools?.call_subagent.execute?.(
        { alias: 'writer', task: '写输出' },
        { toolCallId: 'tool-call-subagent-4' } as never,
      );
      expect(result).toBe(
        'Sub-agent "child-agent" has no executable version snapshot',
      );
      yield { type: 'message_chunk', content: 'child-result' };
      yield { type: 'done', stopReason: 'end_turn' };
    });

    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
      subAgentToolsProvider: realSubAgentToolsProvider,
    });

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: { prompt: 'test' },
      tenantId: TENANT_ID,
      versionSnapshot: parentSnapshot,
      sandboxBinding: { executionId: EXECUTION_ID },
    });

    expect(result.content).toBe('child-result');
  });
  it('已有 checkpoint session 时仍为本次调用创建隔离 session，不加载旧 session', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-1' },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({ id: 'new-session' });
    mockSandboxRuntime.prompt.mockReturnValue(
      emit([
        { type: 'message_chunk', content: 'fresh' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );
    const step = makeStep({
      checkpointData: {
        sessionId: 'stale-session',
        partialContent: 'stale',
        round: 4,
      },
    });
    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step,
      input: { prompt: '重新执行' },
      tenantId: TENANT_ID,
      versionSnapshot: makeSnapshot('no-sandbox-node'),
    });

    expect(mockSandboxRuntime.loadSession).not.toHaveBeenCalled();
    expect(mockSandboxRuntime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: expect.not.stringMatching(/^stale-session$/),
      }),
    );
    expect(mockSandboxRuntime.prompt).toHaveBeenCalledWith(
      'new-session',
      expect.any(Array),
    );
    expect(result).toMatchObject({
      content: 'fresh',
      'exec-out': { triggered: true },
    });
  });

  it('session 创建失败时注销为该次调用预注册的子 Agent tool provider', async () => {
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-parent' },
      sandboxConfig: { cpu: 2, memory: 1024, disk: 4, timeout: 5 },
      subAgents: [{ agentDefinitionId: 'child-agent', alias: 'writer' }],
    });
    mockSandboxRuntime.createSession.mockRejectedValueOnce(
      new Error('session backend unavailable'),
    );
    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
      subAgentToolsProvider: realSubAgentToolsProvider,
    });

    await expect(
      adapter.execute({
        executionId: EXECUTION_ID,
        step: makeStep(),
        input: { prompt: 'test' },
        tenantId: TENANT_ID,
        versionSnapshot: parentSnapshot,
        sandboxBinding: { executionId: EXECUTION_ID },
      }),
    ).rejects.toThrow('session backend unavailable');

    const registeredSessionId =
      mockSandboxRuntime.registerSessionToolProvider.mock.calls[0]?.[0];
    expect(registeredSessionId).toEqual(expect.any(String));
    expect(
      mockSandboxRuntime.unregisterSessionToolProvider,
    ).toHaveBeenCalledWith(registeredSessionId);
    expect(mockSandboxRuntime.prompt).not.toHaveBeenCalled();
  });

  it('无 sandbox 父 Agent 拒绝调用 sandbox 子 Agent，并且不会创建 runtime session', async () => {
    mockAgentDefinitionService.findDetailById.mockResolvedValue({
      id: 'sandbox-child',
      publishedVersionId: 'sandbox-child-version',
      systemPrompt: null,
      runtimeMode: 'sandbox',
    });
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-child' },
      runtimeMode: 'sandbox',
      sandboxConfig: { cpu: 1, memory: 512, disk: 2, timeout: 1 },
      subAgents: [],
    });
    const adapter = createAdapter(
      {
        db,
        agentRuntime: mockAgentRuntime,
        runtimeAdapterFactory: mockRuntimeAdapterFactory,
        agentDefinitionService: mockAgentDefinitionService,
        sandboxService: mockSandboxService,
        eventBridge: mockEventBridge,
      },
      { agentDefinitionId: 'sandbox-child' },
    );

    await expect(
      adapter.execute({
        executionId: EXECUTION_ID,
        step: makeStep(),
        input: { prompt: 'child task' },
        tenantId: TENANT_ID,
        versionSnapshot: {
          ...makeSnapshot('sandbox-child-node'),
          runtimeMode: 'sandbox',
        } as AgentVersionSnapshot,
        parentUsesSandboxRuntime: false,
      }),
    ).rejects.toThrow('无 sandbox Agent 不支持调用有 sandbox 的子 Agent');

    expect(mockSandboxService.createSandboxSession).not.toHaveBeenCalled();
    expect(mockRuntimeAdapterFactory.selectAdapter).not.toHaveBeenCalled();
  });

  it('sandbox 父级运行 no_sandbox 子 Agent 时复用绑定并收紧原生工具为只读', async () => {
    mockRuntimeAdapterFactory.selectAdapter.mockImplementation(
      (usesSandbox: boolean) =>
        usesSandbox ? mockSandboxRuntime : mockAgentRuntime,
    );
    mockAgentDefinitionService.findDetailById.mockResolvedValue({
      id: 'readonly-child',
      publishedVersionId: 'readonly-child-version',
      systemPrompt: '只读分析',
      runtimeMode: 'no_sandbox',
    });
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-child' },
      runtimeMode: 'no_sandbox',
      nativeToolPolicy: {
        readEnabled: false,
        writeEnabled: true,
        editEnabled: true,
        terminalEnabled: true,
      },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({ id: 'child-session' });
    mockSandboxRuntime.prompt.mockReturnValue(
      emit([
        { type: 'message_chunk', content: 'read-only-result' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );
    const adapter = createAdapter(
      {
        db,
        agentRuntime: mockAgentRuntime,
        runtimeAdapterFactory: mockRuntimeAdapterFactory,
        agentDefinitionService: mockAgentDefinitionService,
        sandboxService: mockSandboxService,
        eventBridge: mockEventBridge,
      },
      { agentDefinitionId: 'readonly-child' },
    );

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: { prompt: 'inspect' },
      tenantId: TENANT_ID,
      versionSnapshot: {
        ...makeSnapshot('readonly-child-node'),
        runtimeMode: 'no_sandbox',
      } as AgentVersionSnapshot,
      parentUsesSandboxRuntime: true,
      sandboxBinding: {
        executionId: EXECUTION_ID,
        sandboxNodeId: 'parent-sandbox',
      },
    });

    expect(mockSandboxService.createSandboxSession).not.toHaveBeenCalled();
    expect(mockRuntimeAdapterFactory.selectAdapter).toHaveBeenCalledWith(true);
    expect(mockSandboxRuntime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        serverSandbox: {
          executionId: EXECUTION_ID,
          sandboxNodeId: 'parent-sandbox',
        },
        runtimeConfig: expect.objectContaining({
          nativeToolPolicy: {
            readEnabled: true,
            writeEnabled: false,
            editEnabled: false,
            terminalEnabled: false,
          },
        }),
      }),
    );
    expect(result.content).toBe('read-only-result');
  });

  it('sandbox 父级调用 no_sandbox 子 Agent 但未传绑定时给出明确错误', async () => {
    mockAgentDefinitionService.findDetailById.mockResolvedValue({
      id: 'orphan-child',
      publishedVersionId: 'orphan-child-version',
      systemPrompt: null,
      runtimeMode: 'no_sandbox',
    });
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-child' },
      runtimeMode: 'no_sandbox',
      subAgents: [],
    });
    const adapter = createAdapter(
      {
        db,
        agentRuntime: mockAgentRuntime,
        runtimeAdapterFactory: mockRuntimeAdapterFactory,
        agentDefinitionService: mockAgentDefinitionService,
        sandboxService: mockSandboxService,
        eventBridge: mockEventBridge,
      },
      { agentDefinitionId: 'orphan-child' },
    );

    await expect(
      adapter.execute({
        executionId: EXECUTION_ID,
        step: makeStep(),
        input: {},
        tenantId: TENANT_ID,
        versionSnapshot: {
          ...makeSnapshot('orphan-child-node'),
          runtimeMode: 'no_sandbox',
        } as AgentVersionSnapshot,
        parentUsesSandboxRuntime: true,
      }),
    ).rejects.toThrow('当前子 Agent 缺少可复用的 sandbox 绑定');

    expect(mockRuntimeAdapterFactory.selectAdapter).not.toHaveBeenCalled();
  });
  it('上游 schema、MCP、knowledge、memory 与 Skill 的别名和无效值按契约合并或剥离', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-extensions' },
      tools: [
        {
          toolType: 'mcp',
          toolId: 'existing',
          name: 'search',
          enabled: true,
          mcpServerConfigId: 'mcp-shared',
          toolName: 'search',
        },
      ],
      knowledgeBindings: [{ knowledgeBaseId: 'kb-shared', enabled: true }],
      skillIds: [],
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({
      id: 'extension-session',
    });
    mockSandboxRuntime.prompt.mockReturnValue(
      emit([
        { type: 'message_chunk', content: '{"answer":"ok"}' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );
    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: {
        text: 'answer',
        systemPromptIn: { value: '上游系统提示' },
        schemaIn: {
          type: 'object',
          properties: { answer: { type: 'string' } },
        },
        'skills-in': {
          skills: [
            {
              id: 'skill-1',
              name: '推理',
              description: 42,
              content: 'SKILL_BODY',
            },
            { id: 3, name: 'invalid' },
          ],
        },
        'tools-in': [
          {
            type: 'mcp-tool',
            mcpServerConfigId: 'mcp-shared',
            enabledToolIds: ['search', 'lookup', '', 1],
            tools: [
              { id: 'search', name: 'search' },
              {
                id: 'lookup',
                name: 'lookup',
                mcpToolDefinitionId: 'definition-lookup',
                inputSchema: { type: 'object' },
                portMappingMetadata: { query: 'q' },
              },
              { id: 'disabled', name: 'disabled' },
            ],
          },
        ],
        context: [
          {
            type: 'knowledge-base',
            knowledgeBaseId: 'kb-shared',
            topK: 2,
          },
          {
            type: 'knowledge-base',
            knowledgeBaseId: 'kb-new',
            topK: 7,
            similarityThreshold: 0.6,
          },
          { type: 'knowledge-base', knowledgeBaseId: 7 },
          { type: 'memory', memoryId: 'memory-1' },
          { nested: [{ keep: 'yes' }, { type: 'memory' }] },
        ],
      },
      tenantId: TENANT_ID,
      versionSnapshot: makeSnapshot('extension-node'),
    });

    expect(mockSandboxRuntime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining('SKILL_BODY'),
        runtimeConfig: expect.objectContaining({
          outputSchema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
          },
          tools: [
            expect.objectContaining({
              mcpServerConfigId: 'mcp-shared',
              toolName: 'search',
            }),
            expect.objectContaining({
              mcpToolDefinitionId: 'lookup',
              toolName: 'lookup',
              inputSchema: { type: 'object' },
              portMapping: { query: 'q' },
            }),
          ],
          knowledgeBindings: [
            { knowledgeBaseId: 'kb-shared', enabled: true },
            {
              knowledgeBaseId: 'kb-new',
              enabled: true,
              topK: 7,
              similarityThreshold: 0.6,
            },
          ],
        }),
        context: expect.objectContaining({
          input: {
            text: 'answer',
            context: [{ nested: [{ keep: 'yes' }] }],
          },
        }),
      }),
    );
  });

  it('同一 tool_call 的权限、完成结果与错误字段按增量事件合并到 checkpoint', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-tools' },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({ id: 'tool-session' });
    mockSandboxRuntime.prompt.mockReturnValue(
      emit([
        {
          type: 'tool_call',
          call: {
            id: 'tool-merge',
            tool: 'fetch',
            args: { url: 'https://example.test' },
            status: 'awaiting_permission',
            permissionRequest: { description: '访问远端资源' },
          },
        },
        {
          type: 'tool_call',
          call: {
            id: 'tool-merge',
            tool: 'fetch',
            status: 'completed',
            result: { status: 200 },
          },
        },
        {
          type: 'tool_call',
          call: {
            id: 'tool-merge',
            tool: 'fetch',
            status: 'failed',
            error: 'response parse failed',
          },
        },
        { type: 'done', stopReason: 'end_turn' },
      ] as AgentEvent[]),
    );
    const step = makeStep();
    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    await adapter.execute({
      executionId: EXECUTION_ID,
      step,
      input: { prompt: 'fetch' },
      tenantId: TENANT_ID,
      versionSnapshot: makeSnapshot('tool-node'),
    });

    expect(step.checkpointData).toMatchObject({
      toolCalls: [
        {
          id: 'tool-merge',
          tool: 'fetch',
          args: { url: 'https://example.test' },
          status: 'failed',
          result: { status: 200 },
          error: 'response parse failed',
          permissionRequest: { description: '访问远端资源' },
        },
      ],
      segments: [{ type: 'tool_call', toolCallId: 'tool-merge' }],
    });
    expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledTimes(3);
    expect(mockEventBridge.emitToolPermissionRequired).toHaveBeenCalledWith(
      TENANT_ID,
      EXECUTION_ID,
      expect.objectContaining({
        toolCallId: 'tool-merge',
        requestedAt: expect.any(String),
      }),
    );
  });

  it('子 Agent cancel stream 会广播 envelope 并以 CANCELLED 生命周期持久化', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-child' },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({
      id: 'cancelled-child-session',
    });
    mockSandboxRuntime.prompt.mockReturnValue(
      emit([
        { type: 'message_chunk', content: 'partial child' },
        { type: 'done', stopReason: 'cancelled' },
      ]),
    );
    const step = makeStep({
      checkpointData: {
        subAgentStreams: {
          invalid: { handle: 1 },
        },
      },
    });
    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step,
      input: {},
      tenantId: TENANT_ID,
      versionSnapshot: makeSnapshot('child-stream-node'),
      currentDepth: 2,
      subAgentInvocation: {
        handle: 'subagent:writer:1',
        alias: 'writer',
        parentToolCallId: 'parent-call-1',
        task: '  写摘要  ',
        context: '  参考背景  ',
      },
    });

    expect(mockSandboxRuntime.prompt).toHaveBeenCalledWith(
      'cancelled-child-session',
      [
        {
          type: 'text',
          text: '任务：\n写摘要\n\n额外上下文：\n参考背景',
        },
      ],
    );
    expect(mockEventBridge.emitOutputChunk).not.toHaveBeenCalled();
    expect(mockEventBridge.emitStepAgentEvent).toHaveBeenCalledWith(
      TENANT_ID,
      EXECUTION_ID,
      expect.objectContaining({
        subagent: {
          handle: 'subagent:writer:1',
          alias: 'writer',
          depth: 2,
          parentToolCallId: 'parent-call-1',
        },
      }),
    );
    expect(step.checkpointData).toMatchObject({
      subAgentStreams: {
        'subagent:writer:1': expect.objectContaining({
          handle: 'subagent:writer:1',
          alias: 'writer',
          depth: 2,
          parentToolCallId: 'parent-call-1',
          status: 'cancelled',
          events: expect.any(Array),
          completedAt: expect.any(Number),
        }),
      },
    });
    expect(result).toMatchObject({
      content: 'partial child',
      stopReason: 'cancelled',
    });
  });
  it('子 Agent stream 抛出非 Error 时持久化 FAILED 状态并原样向上传播', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-child' },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({
      id: 'failed-child-session',
    });
    mockSandboxRuntime.prompt.mockImplementation(async function* () {
      yield { type: 'message_chunk', content: 'before failure' } as AgentEvent;
      throw 'runtime disconnected';
    });
    const step = makeStep();
    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    await expect(
      adapter.execute({
        executionId: EXECUTION_ID,
        step,
        input: {},
        tenantId: TENANT_ID,
        versionSnapshot: makeSnapshot('failed-child-node'),
        subAgentInvocation: {
          handle: 'subagent:reviewer:2',
          alias: 'reviewer',
          parentToolCallId: 'parent-call-2',
          task: 'review',
        },
      }),
    ).rejects.toBe('runtime disconnected');

    expect(step.checkpointData).toMatchObject({
      subAgentStreams: {
        'subagent:reviewer:2': expect.objectContaining({
          status: 'failed',
          error: 'runtime disconnected',
          completedAt: expect.any(Number),
        }),
      },
    });
  });

  it('checkpoint 写入失败不会中断流式结果，仍广播输出和完成事件', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-checkpoint' },
      subAgents: [],
    });
    updateWhereMock.mockRejectedValue(new Error('database unavailable'));
    mockSandboxRuntime.createSession.mockResolvedValue({
      id: 'checkpoint-session',
    });
    mockSandboxRuntime.prompt.mockReturnValue(
      emit([
        { type: 'message_chunk', content: 'survives' },
        { type: 'plan', title: 'fallback title', content: '' },
        {
          type: 'decision',
          suggestedContent: 'continue',
          selectedAction: 'proceed',
          alternatives: ['stop'],
          rationale: '',
        },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );
    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: { prompt: 'continue despite checkpoint failure' },
      tenantId: TENANT_ID,
      versionSnapshot: makeSnapshot('checkpoint-node'),
    });

    expect(result).toEqual({
      content: 'survives',
      'exec-out': { triggered: true },
      decision: {
        suggestedContent: 'continue',
        selectedAction: 'proceed',
        alternatives: ['stop'],
      },
    });
    expect(mockEventBridge.emitOutputChunk).toHaveBeenCalledWith(
      TENANT_ID,
      EXECUTION_ID,
      expect.objectContaining({ chunk: 'survives', index: 0 }),
    );
    expect(mockEventBridge.emitStepAgentEvent).toHaveBeenCalledWith(
      TENANT_ID,
      EXECUTION_ID,
      expect.objectContaining({
        event: { type: 'done', stopReason: 'end_turn' },
      }),
    );
  });

  it('未查到 execution 记录时兼容 exec_in.trigger_type 的 system 自动授权', async () => {
    mockRuntimeAdapterFactory.selectAdapter.mockImplementation(
      (usesSandbox: boolean) =>
        usesSandbox ? mockSandboxRuntime : mockAgentRuntime,
    );
    selectWhereMock.mockResolvedValueOnce([]);
    mockAgentDefinitionService.findDetailById.mockResolvedValue({
      id: 'fallback-trigger-agent',
      publishedVersionId: 'fallback-trigger-version',
      systemPrompt: null,
      runtimeMode: 'no_sandbox',
    });
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'model-fallback' },
      runtimeMode: 'no_sandbox',
      subAgents: [],
    });
    mockAgentRuntime.createSession.mockResolvedValue({
      id: 'fallback-trigger-session',
    });
    mockAgentRuntime.prompt.mockReturnValue(
      emit([{ type: 'done', stopReason: 'end_turn' }]),
    );
    const adapter = createAdapter(
      {
        db,
        agentRuntime: mockAgentRuntime,
        runtimeAdapterFactory: mockRuntimeAdapterFactory,
        agentDefinitionService: mockAgentDefinitionService,
        sandboxService: mockSandboxService,
        eventBridge: mockEventBridge,
      },
      { agentDefinitionId: 'fallback-trigger-agent' },
    );

    await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: {
        exec_in: { trigger_type: 'system' },
      },
      tenantId: TENANT_ID,
      versionSnapshot: {
        ...makeSnapshot('fallback-trigger-node'),
        runtimeMode: 'no_sandbox',
      } as AgentVersionSnapshot,
    });

    expect(mockAgentRuntime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          autoApproveToolPermissions: true,
        }),
      }),
    );
  });
  it('未显式传快照时加载已发布版本，并优先采用快照画布提示词与 runtimeMode', async () => {
    const publishedSnapshot = {
      ...makeSnapshot('published-node'),
      runtimeMode: 'no_sandbox',
    } as AgentVersionSnapshot;
    const versionLimitMock = vi
      .fn()
      .mockResolvedValue([{ snapshot: publishedSnapshot }]);
    const versionWhereMock = vi.fn().mockReturnValue({
      limit: versionLimitMock,
    });
    const versionFromMock = vi.fn().mockReturnValue({
      where: versionWhereMock,
    });
    db.select
      .mockReturnValueOnce({ from: versionFromMock })
      .mockReturnValueOnce({ from: selectFromMock });
    mockRuntimeAdapterFactory.selectAdapter.mockImplementation(
      (usesSandbox: boolean) =>
        usesSandbox ? mockSandboxRuntime : mockAgentRuntime,
    );
    mockAgentDefinitionService.findDetailById.mockResolvedValue({
      id: 'published-agent',
      publishedVersionId: 'published-version',
      systemPrompt: 'definition fallback',
      nodes: [{ id: 'definition-node' }],
      edges: [],
      runtimeMode: 'sandbox',
    });
    mockAgentDefinitionService.resolveSystemPromptFromNodes
      .mockReturnValueOnce('definition canvas prompt')
      .mockReturnValueOnce('snapshot canvas prompt');
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'published-model' },
      subAgents: [],
    });
    mockAgentRuntime.createSession.mockResolvedValue({
      id: 'published-session',
    });
    mockAgentRuntime.prompt.mockReturnValue(
      emit([
        { type: 'message_chunk', content: 'published result' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );
    const adapter = createAdapter(
      {
        db,
        agentRuntime: mockAgentRuntime,
        runtimeAdapterFactory: mockRuntimeAdapterFactory,
        agentDefinitionService: mockAgentDefinitionService,
        sandboxService: mockSandboxService,
        eventBridge: mockEventBridge,
      },
      { agentDefinitionId: 'published-agent' },
    );

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: { prompt: 'published' },
      tenantId: TENANT_ID,
    });

    expect(versionLimitMock).toHaveBeenCalledWith(1);
    expect(
      mockAgentDefinitionService.buildRuntimeConfigFromNodes,
    ).toHaveBeenCalledWith(
      publishedSnapshot.nodes,
      publishedSnapshot.edges,
      undefined,
      'no_sandbox',
    );
    expect(mockRuntimeAdapterFactory.selectAdapter).toHaveBeenCalledWith(false);
    expect(mockAgentRuntime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'published-agent',
        llmModelConfigId: 'published-model',
        systemPrompt: 'snapshot canvas prompt',
        runtimeConfig: expect.objectContaining({
          runtimeMode: 'no_sandbox',
          sandboxConfig: undefined,
        }),
      }),
    );
    expect(result.content).toBe('published result');
  });
  it('会合并无显式定义 ID 的 MCP、knowledge 与重复 skill，并清理纯扩展上下文', async () => {
    selectWhereMock.mockResolvedValueOnce([]);
    mockRuntimeAdapterFactory.selectAdapter.mockImplementation(
      (usesSandbox: boolean) =>
        usesSandbox ? mockSandboxRuntime : mockAgentRuntime,
    );
    mockAgentDefinitionService.findDetailById.mockResolvedValue({
      id: 'extension-default-agent',
      publishedVersionId: 'extension-default-version',
      systemPrompt: null,
      runtimeMode: 'no_sandbox',
    });
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'extension-default-model' },
      runtimeMode: 'no_sandbox',
      skillIds: ['skill-shared'],
      subAgents: [],
    });
    mockSkillResolverService.resolveSkillsForAgent.mockResolvedValue([
      {
        id: 'skill-shared',
        name: '共享技能',
        description: 'built in',
        content: 'BUILT_IN',
      },
    ]);
    mockSkillResolverService.buildSkillAugmentedPrompt.mockImplementation(
      (base: string, skills: Array<{ content: string | null }>) =>
        [base, ...skills.map((skill) => skill.content)]
          .filter((value): value is string => typeof value === 'string')
          .join('|'),
    );
    mockAgentRuntime.createSession.mockResolvedValue({
      id: 'extension-default-session',
    });
    mockAgentRuntime.prompt.mockReturnValue(
      emit([{ type: 'done', stopReason: 'end_turn' }]),
    );
    const adapter = createAdapter(
      {
        db,
        agentRuntime: mockAgentRuntime,
        runtimeAdapterFactory: mockRuntimeAdapterFactory,
        agentDefinitionService: mockAgentDefinitionService,
        sandboxService: mockSandboxService,
        eventBridge: mockEventBridge,
        skillResolverService: mockSkillResolverService,
      },
      { agentDefinitionId: 'extension-default-agent' },
    );

    await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: {
        'text-in': 'run extensions',
        'system-prompt-in': { text: '  record prompt  ' },
        'tools-in': [
          {
            type: 'mcp-tool',
            mcpServerConfigId: 'server-a',
            toolName: 'search',
          },
          {
            type: 'mcp-tool',
            mcpServerConfigId: 'server-a',
            toolName: 'search',
          },
          {
            type: 'mcp-tool',
            mcpServerConfigId: 'server-b',
            toolName: 'summarize',
          },
        ],
        'skills-in': [
          {
            skills: [
              null,
              {
                id: 'skill-shared',
                name: '共享技能',
                description: 'duplicate',
                content: 'DUPLICATE',
              },
              {
                id: 'skill-null-content',
                name: '无正文技能',
                description: 42,
                content: 42,
              },
            ],
          },
        ],
        context: [
          { type: 'knowledge-base', knowledgeBaseId: 'kb-new' },
          { type: 'knowledge-base', knowledgeBaseId: 'kb-new' },
          { type: 'memory', memoryId: 'memory-only' },
        ],
      },
      tenantId: TENANT_ID,
      versionSnapshot: {
        ...makeSnapshot('extension-default-node'),
        runtimeMode: 'no_sandbox',
      } as AgentVersionSnapshot,
    });

    expect(mockAgentRuntime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: 'record prompt|BUILT_IN',
        runtimeConfig: expect.objectContaining({
          tools: [
            expect.objectContaining({
              mcpServerConfigId: 'server-a',
              toolName: 'search',
            }),
            expect.objectContaining({
              toolId: 'workflow-mcp:server-b:summarize',
              mcpServerConfigId: 'server-b',
              toolName: 'summarize',
            }),
          ],
          knowledgeBindings: [
            expect.objectContaining({ knowledgeBaseId: 'kb-new' }),
          ],
        }),
        context: expect.objectContaining({
          input: { 'text-in': 'run extensions' },
        }),
      }),
    );
    expect(
      mockSkillResolverService.buildSkillAugmentedPrompt,
    ).toHaveBeenCalledWith('record prompt', [
      expect.objectContaining({ id: 'skill-shared', content: 'BUILT_IN' }),
      expect.objectContaining({ id: 'skill-null-content', content: null }),
    ]);
  });

  it('合并多条 tool_call 更新时保留其他工具，并吞掉非 Error checkpoint 故障', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'tool-merge-model' },
      subAgents: [],
    });
    updateWhereMock.mockRejectedValue('checkpoint offline');
    mockSandboxRuntime.createSession.mockResolvedValue({
      id: 'tool-merge-session',
    });
    mockSandboxRuntime.prompt.mockReturnValue(
      emit([
        {
          type: 'tool_call',
          call: {
            id: 'tool-a',
            tool: 'read_file',
            args: { path: 'a.txt' },
            status: 'running',
          },
        },
        {
          type: 'tool_call',
          call: {
            id: 'tool-b',
            tool: 'read_file',
            args: { path: 'b.txt' },
            status: 'completed',
            result: 'B',
          },
        },
        {
          type: 'tool_call',
          call: {
            id: 'tool-a',
            tool: 'read_file',
            status: 'completed',
            result: 'A',
          },
        },
        { type: 'done', stopReason: 'end_turn' },
      ] as AgentEvent[]),
    );
    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    const result = await adapter.execute({
      executionId: EXECUTION_ID,
      step: makeStep(),
      input: {},
      tenantId: TENANT_ID,
      versionSnapshot: makeSnapshot('tool-merge-node'),
    });

    expect(result).toEqual({
      content: '',
      'exec-out': { triggered: true },
    });
    expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledTimes(3);
    expect(mockSandboxRuntime.prompt).toHaveBeenCalledTimes(1);
  });

  it('子 Agent 流抛出 Error 时静默持久化失败状态并过滤旧的无效 stream', async () => {
    setupNoSandboxAgent();
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'failed-child-model' },
      subAgents: [],
    });
    mockSandboxRuntime.createSession.mockResolvedValue({
      id: 'failed-error-child-session',
    });
    mockSandboxRuntime.prompt.mockImplementation(async function* () {
      yield { type: 'message_chunk', content: 'partial' } as AgentEvent;
      throw new Error('child runtime failed');
    });
    const step = makeStep({
      checkpointData: {
        subAgentStreams: {
          invalid: null,
        },
      },
    });
    const adapter = createAdapter({
      db,
      agentRuntime: mockAgentRuntime,
      runtimeAdapterFactory: mockRuntimeAdapterFactory,
      agentDefinitionService: mockAgentDefinitionService,
      sandboxService: mockSandboxService,
      eventBridge: mockEventBridge,
    });

    await expect(
      adapter.execute({
        executionId: EXECUTION_ID,
        step,
        input: {},
        tenantId: TENANT_ID,
        versionSnapshot: makeSnapshot('failed-error-child-node'),
        emitEvents: false,
        subAgentInvocation: {
          handle: 'subagent:error:1',
          alias: 'error-child',
          parentToolCallId: 'parent-error-call',
          task: 'fail',
        },
      }),
    ).rejects.toThrow('child runtime failed');

    expect(mockEventBridge.emitStepAgentEvent).not.toHaveBeenCalled();
    expect(step.checkpointData).toMatchObject({
      subAgentStreams: {
        'subagent:error:1': expect.objectContaining({
          status: 'failed',
          error: 'child runtime failed',
        }),
      },
    });
    const checkpointData = step.checkpointData;
    expect(checkpointData).not.toBeNull();
    if (!checkpointData || typeof checkpointData !== 'object') {
      throw new Error('Expected checkpoint data to be persisted');
    }
    expect(checkpointData.subAgentStreams).not.toHaveProperty('invalid');
  });

  it('已发布版本查询到空 snapshot 时报告不可执行版本', async () => {
    const versionLimitMock = vi.fn().mockResolvedValue([{ snapshot: null }]);
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: versionLimitMock }),
      }),
    });
    mockAgentDefinitionService.findDetailById.mockResolvedValue({
      id: 'empty-snapshot-agent',
      publishedVersionId: 'empty-snapshot-version',
      runtimeMode: 'no_sandbox',
    });
    const adapter = createAdapter(
      {
        db,
        agentRuntime: mockAgentRuntime,
        runtimeAdapterFactory: mockRuntimeAdapterFactory,
        agentDefinitionService: mockAgentDefinitionService,
        sandboxService: mockSandboxService,
        eventBridge: mockEventBridge,
      },
      { agentDefinitionId: 'empty-snapshot-agent' },
    );

    await expect(
      adapter.execute({
        executionId: EXECUTION_ID,
        step: makeStep(),
        input: {},
        tenantId: TENANT_ID,
      }),
    ).rejects.toThrow(
      'Agent definition "empty-snapshot-agent" has no published version snapshot',
    );
    expect(versionLimitMock).toHaveBeenCalledWith(1);
    expect(mockRuntimeAdapterFactory.selectAdapter).not.toHaveBeenCalled();
  });
});

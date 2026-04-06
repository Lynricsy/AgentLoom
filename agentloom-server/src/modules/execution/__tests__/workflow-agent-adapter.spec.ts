import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentVersionSnapshot } from '../../../database/schema/agent-definitions.schema';
import type { ExecutionStep } from '../../../database/schema';
import type { AgentEvent } from '../../agent/types/agent-event.types';
import type { ContentBlock } from '../../agent/types/content-block.types';
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
  };
  const mockRuntimeAdapterFactory = {
    selectAdapter: vi.fn(),
  };
  const mockAgentDefinitionService = {
    findDetailById: vi.fn(),
    buildRuntimeConfigFromNodes: vi.fn(),
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

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
  });

  it('工作流已有 sandbox 绑定时不会新建沙箱，且子 Agent 共享父级绑定', async () => {
    mockSandboxRuntime.createSession
      .mockResolvedValueOnce({ id: 'child-session' })
      .mockResolvedValueOnce({ id: 'parent-session' });
    mockSandboxRuntime.prompt.mockImplementation(
      (sessionId: string, content: ContentBlock[]) => {
        if (sessionId === 'child-session') {
          expect(content[0]).toMatchObject({ type: 'text' });
          return emit([
            { type: 'message_chunk', content: 'child-output' },
            { type: 'done', stopReason: 'end_turn' },
          ]);
        }

        const summary = JSON.parse((content[0] as { text: string }).text) as {
          input: { prompt: string };
          subAgents: { writer: { content: string } };
        };

        expect(summary.input.prompt).toBe('hello');
        expect(summary.subAgents.writer.content).toBe('child-output');

        return emit([
          { type: 'message_chunk', content: 'parent-output' },
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
        agentId: 'child-agent',
        serverSandbox: { executionId: EXECUTION_ID },
        context: expect.objectContaining({
          serverSandbox: { executionId: EXECUTION_ID },
        }),
      }),
    );
    expect(mockSandboxRuntime.createSession).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        agentId: 'parent-agent',
        serverSandbox: { executionId: EXECUTION_ID },
        context: expect.objectContaining({
          serverSandbox: { executionId: EXECUTION_ID },
        }),
      }),
    );
    expect(mockEventBridge.emitOutputChunk).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      content: 'parent-output',
      subAgents: {
        writer: {
          content: 'child-output',
        },
      },
    });
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
        timeout: 2,
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
      sessionId: 'session-1',
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
    mockSandboxRuntime.createSession
      .mockResolvedValueOnce({ id: 'child-session' })
      .mockResolvedValueOnce({ id: 'parent-session' });
    mockSandboxRuntime.prompt
      .mockReturnValueOnce(
        emit([
          { type: 'message_chunk', content: 'child-result' },
          { type: 'done', stopReason: 'end_turn' },
        ]),
      )
      .mockReturnValueOnce(
        emit([
          { type: 'message_chunk', content: 'parent-result' },
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
      versionSnapshot: parentSnapshot,
      sandboxBinding: { executionId: EXECUTION_ID },
    });

    expect(mockSandboxRuntime.createSession).toHaveBeenNthCalledWith(
      1,
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

    mockSandboxRuntime.createSession
      .mockResolvedValueOnce({ id: 'child-session' })
      .mockResolvedValueOnce({ id: 'parent-session' });
    mockSandboxRuntime.prompt
      .mockReturnValueOnce(
        emit([
          { type: 'message_chunk', content: 'child-result' },
          { type: 'done', stopReason: 'end_turn' },
        ]),
      )
      .mockReturnValueOnce(
        emit([
          { type: 'message_chunk', content: 'parent-result' },
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
      versionSnapshot: makeSnapshot('parent-node'),
    });

    expect(result.subAgents).toHaveProperty('child-agent');
    expect(result.subAgents?.['child-agent']).toMatchObject({
      content: 'child-result',
    });
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
        input: { prompt: 'test' },
        tenantId: TENANT_ID,
        versionSnapshot: parentSnapshot,
        sandboxBinding: { executionId: EXECUTION_ID },
      }),
    ).rejects.toThrow('no executable version snapshot');
  });
});

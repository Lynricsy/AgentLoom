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
  const actual = await vi.importActual<typeof import('../node-handlers/sub-agent.handler')>(
    '../node-handlers/sub-agent.handler',
  );

  return {
    ...actual,
    resolveSubAgent: mockResolveSubAgent,
  };
});

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
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRuntimeAdapterFactory.selectAdapter.mockReturnValue(mockSandboxRuntime);
    mockAgentDefinitionService.findDetailById.mockImplementation(
      async (agentDefinitionId: string) => ({
        id: agentDefinitionId,
        publishedVersionId: `${agentDefinitionId}-version`,
        systemPrompt:
          agentDefinitionId === 'parent-agent' ? '父 Agent 提示词' : '子 Agent 提示词',
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
        expect((content[0] as { text: string }).text).toContain('[image:image/png]');
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
      config: { cpu: 2, memory: 1024, disk: 4, timeout: 5 },
      tenantId: TENANT_ID,
    });
    expect(mockSandboxRuntime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'parent-agent',
        serverSandbox: { executionId: EXECUTION_ID },
      }),
    );
    expect(result).toMatchObject({ content: 'sandbox-output' });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentExecutionWorker } from '../agent-execution.worker';
import { createSubAgentEventProxy } from './subagent-event-proxy';
import type { SubAgentHandle } from './subagent-execution.types';

const {
  mockRuntime,
  mockAdapterFactory,
  mockExecutionService,
  mockEventBridge,
  mockSandboxService,
  mockAgentDefinitionService,
  mockSubAgentToolsProvider,
} = vi.hoisted(() => ({
  mockRuntime: {
    prompt: vi.fn(),
    cancel: vi.fn(),
    createSession: vi.fn(),
    loadSession: vi.fn(),
    registerSessionToolProvider: vi.fn(),
  },
  mockAdapterFactory: {
    selectAdapter: vi.fn(),
  },
  mockExecutionService: {
    injectMessage: vi.fn(),
  },
  mockEventBridge: {
    emitSubAgentConversationEvent: vi.fn(),
  },
  mockSandboxService: {
    createSandboxSession: vi.fn(),
  },
  mockAgentDefinitionService: {
    compileCanvas: vi.fn(),
    buildRuntimeConfigFromNodes: vi.fn(),
  },
  mockSubAgentToolsProvider: {
    createSessionToolProvider: vi.fn(),
  },
}));

function createAsyncIterable<T>(items: readonly T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    agentId: 'agent-child',
    mode: 'conversation',
    context: { history: [] },
    status: 'active',
    tenantId: 'tenant-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAgentDefinition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agent-child',
    tenantId: 'tenant-1',
    name: 'Child Agent',
    systemPrompt: 'child system prompt',
    nodes: [],
    edges: [],
    sandboxConfig: null,
    ...overrides,
  };
}

describe('AgentExecutionWorker sub-agent lifecycle', () => {
  let worker: AgentExecutionWorker;
  const subAgentHandle = 'sa_subagent-1' as SubAgentHandle;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentDefinitionService.compileCanvas.mockResolvedValue({});
    mockAdapterFactory.selectAdapter.mockReturnValue(mockRuntime);
    mockRuntime.createSession.mockResolvedValue(makeSession());
    mockRuntime.prompt.mockReturnValue(
      createAsyncIterable([
        { type: 'message_chunk', content: 'sub-agent summary' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );
    mockExecutionService.injectMessage.mockResolvedValue(undefined);
    mockSubAgentToolsProvider.createSessionToolProvider.mockReturnValue(
      () => ({}),
    );

    worker = new AgentExecutionWorker(
      {} as never,
      mockRuntime as never,
      mockAdapterFactory as never,
      mockExecutionService as never,
      mockEventBridge as never,
      mockSandboxService as never,
      mockAgentDefinitionService as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      mockSubAgentToolsProvider as never,
    );
  });

  it('registerSubAgentToolsProvider() 会按 session 注册子代理工具提供者', () => {
    const tracker = { abortControllers: new Map() };
    const runtime = {
      registerSessionToolProvider: vi.fn(),
    };

    (worker as any).registerSubAgentToolsProvider({
      runtime,
      sessionId: 'session-1',
      runtimeConfig: {
        subAgents: [{ alias: 'researcher', agentDefinitionId: 'agent-child' }],
      },
      conversationId: 'conversation-1',
      tenantId: 'tenant-1',
      parentAbortSignal: new AbortController().signal,
      currentAgentDefinitionId: 'agent-parent',
      currentDepth: 0,
      subAgentTracker: tracker,
    });

    expect(
      mockSubAgentToolsProvider.createSessionToolProvider,
    ).toHaveBeenCalledWith(
      [{ alias: 'researcher', agentDefinitionId: 'agent-child' }],
      expect.objectContaining({
        conversationId: 'conversation-1',
        tenantId: 'tenant-1',
        depth: 0,
        parentAbortSignal: expect.any(AbortSignal),
      }),
      expect.any(Function),
    );
    expect(runtime.registerSessionToolProvider).toHaveBeenCalledWith(
      'session-1',
      expect.any(Function),
    );

    const parentContext =
      mockSubAgentToolsProvider.createSessionToolProvider.mock.calls[0]?.[1];
    expect(parentContext.visitedAgentIds).toBeInstanceOf(Set);
    expect([...parentContext.visitedAgentIds]).toEqual(['agent-parent']);
  });

  it('registerSubAgentToolsProvider() 在 runtime 不支持注册时跳过', () => {
    (worker as any).registerSubAgentToolsProvider({
      runtime: {},
      sessionId: 'session-1',
      runtimeConfig: {
        subAgents: [{ alias: 'researcher', agentDefinitionId: 'agent-child' }],
      },
      conversationId: 'conversation-1',
      tenantId: 'tenant-1',
      parentAbortSignal: new AbortController().signal,
      currentAgentDefinitionId: 'agent-parent',
      currentDepth: 0,
      subAgentTracker: { abortControllers: new Map() },
    });

    expect(
      mockSubAgentToolsProvider.createSessionToolProvider,
    ).not.toHaveBeenCalled();
  });

  it('abortTrackedSubAgents() 会级联中止所有子代理控制器', () => {
    const firstAbort = new AbortController();
    const secondAbort = new AbortController();

    (worker as any).abortTrackedSubAgents(
      {
        abortControllers: new Map([
          ['sa_subagent-1', firstAbort],
          ['sa_subagent-2', secondAbort],
        ]),
      },
      'parent aborted',
    );

    expect(firstAbort.signal.aborted).toBe(true);
    expect(secondAbort.signal.aborted).toBe(true);
  });

  it('executeSubAgent() 会通过 event bridge 转发子代理事件', async () => {
    const tracker = { abortControllers: new Map() };
    const eventProxy = createSubAgentEventProxy({
      conversationId: 'conversation-1',
      tenantId: 'tenant-1',
      envelope: {
        handle: subAgentHandle,
        alias: 'researcher',
        parentToolCallId: 'tool-call-1',
        depth: 1,
      },
      eventBridge: mockEventBridge as never,
    });

    await (worker as any).executeSubAgent(
      {
        handle: subAgentHandle,
        invocationMode: 'call',
        alias: 'researcher',
        task: '请总结结果',
        context: '补充上下文',
        parentContext: {
          conversationId: 'conversation-1',
          depth: 0,
          tenantId: 'tenant-1',
          parentAbortSignal: new AbortController().signal,
          visitedAgentIds: new Set(['agent-parent']),
        },
        parentToolCallId: 'tool-call-1',
        depth: 1,
        agentDefinition: makeAgentDefinition(),
        versionSnapshot: null,
        abortSignal: new AbortController().signal,
        eventProxy,
      },
      tracker,
    );

    expect(mockEventBridge.emitSubAgentConversationEvent).toHaveBeenCalledWith(
      'conversation-1',
      'tenant-1',
      { type: 'message_chunk', content: 'sub-agent summary' },
      {
        handle: subAgentHandle,
        alias: 'researcher',
        parentToolCallId: 'tool-call-1',
        depth: 1,
      },
    );
  });

  it('executeSubAgent() 在 spawn 完成后注入父对话完成通知', async () => {
    const tracker = { abortControllers: new Map() };

    await (worker as any).executeSubAgent(
      {
        handle: subAgentHandle,
        invocationMode: 'spawn',
        alias: 'researcher',
        task: '请总结结果',
        parentContext: {
          conversationId: 'conversation-1',
          depth: 0,
          tenantId: 'tenant-1',
          parentAbortSignal: new AbortController().signal,
          visitedAgentIds: new Set(['agent-parent']),
        },
        parentToolCallId: 'tool-call-1',
        depth: 1,
        agentDefinition: makeAgentDefinition(),
        versionSnapshot: null,
        abortSignal: new AbortController().signal,
      },
      tracker,
    );

    expect(mockExecutionService.injectMessage).toHaveBeenCalledWith(
      'conversation-1',
      expect.objectContaining({
        role: 'user',
        contentType: 'text',
        content: '[Sub-Agent: Child Agent] Completed: sub-agent summary',
        metadata: expect.objectContaining({
          type: 'subagent_completion_notice',
          handle: subAgentHandle,
          alias: 'researcher',
        }),
      }),
    );
  });
});

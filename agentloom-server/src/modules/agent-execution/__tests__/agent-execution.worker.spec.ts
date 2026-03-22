import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentExecutionWorker } from '../agent-execution.worker';

const {
  mockRuntime,
  mockAdapterFactory,
  mockExecutionService,
  mockEventBridge,
  mockSandboxService,
  mockAgentDefinitionService,
  mockMemoryToolsService,
  mockMemoryFusionService,
  mockMemoryResourceProvider,
} = vi.hoisted(() => ({
  mockRuntime: {
    prompt: vi.fn(),
    cancel: vi.fn(),
    createSession: vi.fn(),
    loadSession: vi.fn(),
    registerSessionToolProvider: vi.fn(),
    unregisterSessionToolProvider: vi.fn(),
  },
  mockAdapterFactory: {
    selectAdapter: vi.fn(),
  },
  mockExecutionService: {
    registerActiveRun: vi.fn(),
    clearActiveRun: vi.fn(),
    waitForNotification: vi.fn(),
  },
  mockEventBridge: {
    emitExecutionStatusChanged: vi.fn(),
    emitStepAgentEvent: vi.fn(),
    emitOutputChunk: vi.fn(),
    emitToolCallStatus: vi.fn(),
  },
  mockSandboxService: {
    createSandboxSession: vi.fn(),
  },
  mockAgentDefinitionService: {
    compileCanvas: vi.fn(),
    buildRuntimeConfigFromNodes: vi.fn(),
  },
  mockMemoryToolsService: {
    createSessionToolProvider: vi.fn(),
  },
  mockMemoryFusionService: {
    bootAll: vi.fn(),
  },
  mockMemoryResourceProvider: {
    create: vi.fn(),
    destroy: vi.fn(),
  },
}));

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: vi.fn(
    async (
      db: unknown,
      _tenantId: string,
      operation: (dbClient: unknown) => Promise<unknown>,
    ) => operation(db),
  ),
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

type WorkerInternals = {
  loadConversationExecutionContext: ReturnType<typeof vi.fn>;
  prepareRuntimeSession: ReturnType<typeof vi.fn>;
  loadPendingUserMessages: ReturnType<typeof vi.fn>;
  updateExecutionMetadata: ReturnType<typeof vi.fn>;
  persistConversationTurn: ReturnType<typeof vi.fn>;
  safeUpdateExecutionMetadata: ReturnType<typeof vi.fn>;
  buildPromptBlocks: ReturnType<typeof vi.fn>;
  readExecutionMetadata: ReturnType<typeof vi.fn>;
  mergeExecutionMetadata: ReturnType<typeof vi.fn>;
  writeExecutionMetadata: ReturnType<typeof vi.fn>;
  runConversationTurn: ReturnType<typeof vi.fn>;
};

function createJob(name: string, data: Record<string, unknown>) {
  return { id: 'job-1', name, data } as never;
}

function makeActiveContext(
  overrides: Record<string, unknown> = {},
) {
  return {
    conversation: {
      id: 'conversation-1',
      agentDefinitionId: 'agent-1',
      tenantId: 'tenant-1',
      status: 'active',
      metadata: {},
    },
    runtimeConfig: {},
    systemPrompt: 'system',
    hasSandbox: false,
    executionMetadata: {},
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    agentId: 'agent-1',
    mode: 'conversation',
    context: { history: [] },
    status: 'active',
    tenantId: 'tenant-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setupLoopMocks(
  workerInternals: WorkerInternals,
  opts: {
    context?: Record<string, unknown> | null;
    pendingMessages?: unknown[][];
    persistResult?: Record<string, unknown>;
  } = {},
) {
  workerInternals.loadConversationExecutionContext = vi
    .fn()
    .mockResolvedValue(opts.context ?? makeActiveContext());
  workerInternals.prepareRuntimeSession = vi.fn().mockResolvedValue({
    runtime: mockRuntime,
    session: makeSession(),
  });

  const pendingMsgMock = vi.fn();
  const msgs = opts.pendingMessages ?? [[], []];
  for (const batch of msgs) {
    pendingMsgMock.mockResolvedValueOnce(batch);
  }
  workerInternals.loadPendingUserMessages = pendingMsgMock;

  workerInternals.updateExecutionMetadata = vi.fn().mockResolvedValue({
    sessionId: 'session-1',
    runningState: 'running',
  });
  workerInternals.persistConversationTurn = vi.fn().mockResolvedValue(
    opts.persistResult ?? {
      sessionId: 'session-1',
      lastProcessedMessageId: 'message-1',
      lastStopReason: 'end_turn',
      runningState: 'running',
    },
  );
  workerInternals.safeUpdateExecutionMetadata = vi.fn().mockResolvedValue({
    sessionId: 'session-1',
    runningState: 'idle',
  });
}

describe('AgentExecutionWorker', () => {
  let worker: AgentExecutionWorker;
  let workerInternals: WorkerInternals;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAdapterFactory.selectAdapter.mockReturnValue(mockRuntime);
    mockMemoryToolsService.createSessionToolProvider.mockReset();
    mockMemoryFusionService.bootAll.mockReset();
    mockMemoryResourceProvider.create.mockReset();
    mockMemoryResourceProvider.destroy.mockReset();

    worker = new AgentExecutionWorker(
      {} as never,
      mockRuntime as never,
      mockAdapterFactory as never,
      mockExecutionService as never,
      mockEventBridge as never,
      mockSandboxService as never,
      mockAgentDefinitionService as never,
      mockMemoryToolsService as never,
      mockMemoryFusionService as never,
      mockMemoryResourceProvider as never,
    );
    workerInternals = worker as unknown as WorkerInternals;
  });

  describe('process()', () => {
    it('跳过非 agent-conversation-execution job', async () => {
      const job = createJob('other-job', {
        conversationId: 'c-1',
        tenantId: 't-1',
      });
      await worker.process(job);
      expect(mockExecutionService.registerActiveRun).not.toHaveBeenCalled();
    });

    it('正确分发 agent-conversation-execution job', async () => {
      mockExecutionService.registerActiveRun.mockReturnValue(null);

      setupLoopMocks(workerInternals);

      const job = createJob('execute-agent-loop', {
        conversationId: 'c-1',
        tenantId: 't-1',
      });
      await worker.process(job);
      expect(mockExecutionService.registerActiveRun).toHaveBeenCalledWith(
        'c-1',
        expect.any(AbortController),
      );
    });
  });

  describe('onFailed()', () => {
    it('undefined job 时不抛异常', () => {
      expect(() =>
        worker.onFailed(undefined, new Error('test error')),
      ).not.toThrow();
    });

    it('有 job 时记录错误（无异常）', () => {
      const job = createJob('agent-conversation-execution', {
        conversationId: 'c-1',
        tenantId: 't-1',
      });
      expect(() =>
        worker.onFailed(job, new Error('test error')),
      ).not.toThrow();
    });
  });

  describe('executeAgentLoop() — duplicate guard', () => {
    it('registerActiveRun 返回 null 时直接退出', async () => {
      mockExecutionService.registerActiveRun.mockReturnValue(null);
      await worker.executeAgentLoop('c-1', 't-1');
      expect(
        mockEventBridge.emitExecutionStatusChanged,
      ).not.toHaveBeenCalled();
    });
  });

  describe('executeAgentLoop() — context not found', () => {
    it('loadConversationExecutionContext 返回 null 时直接退出并清理', async () => {
      mockExecutionService.registerActiveRun.mockImplementation(
        (_id: string, abort: AbortController) => ({ abort, notify: vi.fn() }),
      );
      workerInternals.loadConversationExecutionContext = vi
        .fn()
        .mockResolvedValue(null);
      workerInternals.safeUpdateExecutionMetadata = vi
        .fn()
        .mockResolvedValue({});

      await worker.executeAgentLoop('c-1', 't-1');

      expect(mockExecutionService.clearActiveRun).toHaveBeenCalled();
      expect(
        mockEventBridge.emitExecutionStatusChanged,
      ).not.toHaveBeenCalled();
    });
  });

  describe('executeAgentLoop() — non-active conversation', () => {
    it('failed 状态的会话直接退出，不发送状态事件', async () => {
      mockExecutionService.registerActiveRun.mockImplementation(
        (_id: string, abort: AbortController) => ({ abort, notify: vi.fn() }),
      );
      workerInternals.loadConversationExecutionContext = vi
        .fn()
        .mockResolvedValue(
          makeActiveContext({
            conversation: {
              id: 'c-1',
              agentDefinitionId: 'a-1',
              tenantId: 't-1',
              status: 'failed',
              metadata: {},
            },
          }),
        );
      workerInternals.safeUpdateExecutionMetadata = vi
        .fn()
        .mockResolvedValue({});

      await worker.executeAgentLoop('c-1', 't-1');

      expect(mockExecutionService.clearActiveRun).toHaveBeenCalled();
      expect(
        mockEventBridge.emitExecutionStatusChanged,
      ).not.toHaveBeenCalled();
    });

    it('ended 状态的会话直接退出，不发送状态事件', async () => {
      mockExecutionService.registerActiveRun.mockImplementation(
        (_id: string, abort: AbortController) => ({ abort, notify: vi.fn() }),
      );
      workerInternals.loadConversationExecutionContext = vi
        .fn()
        .mockResolvedValue(
          makeActiveContext({
            conversation: {
              id: 'c-1',
              agentDefinitionId: 'a-1',
              tenantId: 't-1',
              status: 'ended',
              metadata: {},
            },
          }),
        );
      workerInternals.safeUpdateExecutionMetadata = vi
        .fn()
        .mockResolvedValue({});

      await worker.executeAgentLoop('c-1', 't-1');

      expect(mockExecutionService.clearActiveRun).toHaveBeenCalled();
      expect(
        mockEventBridge.emitExecutionStatusChanged,
      ).not.toHaveBeenCalled();
    });
  });

  describe('executeAgentLoop() — error path', () => {
    it('出错时更新状态为 failed 并重新抛出', async () => {
      mockExecutionService.registerActiveRun.mockImplementation(
        (_id: string, abort: AbortController) => ({ abort, notify: vi.fn() }),
      );
      mockExecutionService.waitForNotification.mockResolvedValue('timeout');

      workerInternals.loadConversationExecutionContext = vi
        .fn()
        .mockResolvedValue(makeActiveContext());
      workerInternals.prepareRuntimeSession = vi
        .fn()
        .mockRejectedValue(new Error('Runtime init failed'));
      workerInternals.safeUpdateExecutionMetadata = vi
        .fn()
        .mockResolvedValue({});

      await expect(
        worker.executeAgentLoop('c-1', 't-1'),
      ).rejects.toThrow('Runtime init failed');

      expect(
        workerInternals.safeUpdateExecutionMetadata,
      ).toHaveBeenCalledWith(
        't-1',
        'c-1',
        expect.objectContaining({ runningState: 'failed' }),
      );
      expect(
        mockEventBridge.emitExecutionStatusChanged,
      ).toHaveBeenCalledWith(
        't-1',
        'c-1',
        expect.objectContaining({
          status: 'failed',
          errorMessage: 'Runtime init failed',
        }),
      );
    });

    it('非 Error 对象也能生成错误消息', async () => {
      mockExecutionService.registerActiveRun.mockImplementation(
        (_id: string, abort: AbortController) => ({ abort, notify: vi.fn() }),
      );

      workerInternals.loadConversationExecutionContext = vi
        .fn()
        .mockResolvedValue(makeActiveContext());
      workerInternals.prepareRuntimeSession = vi
        .fn()
        .mockRejectedValue('string-error');
      workerInternals.safeUpdateExecutionMetadata = vi
        .fn()
        .mockResolvedValue({});

      await expect(
        worker.executeAgentLoop('c-1', 't-1'),
      ).rejects.toThrow();

      expect(
        mockEventBridge.emitExecutionStatusChanged,
      ).toHaveBeenCalledWith(
        't-1',
        'c-1',
        expect.objectContaining({
          errorMessage: 'Agent conversation execution failed',
        }),
      );
    });

    it('abort 状态下出错时不重新抛出', async () => {
      let activeAbort: AbortController | null = null;
      mockExecutionService.registerActiveRun.mockImplementation(
        (_id: string, abort: AbortController) => {
          activeAbort = abort;
          return { abort, notify: vi.fn() };
        },
      );

      workerInternals.loadConversationExecutionContext = vi
        .fn()
        .mockResolvedValue(makeActiveContext());
      workerInternals.prepareRuntimeSession = vi
        .fn()
        .mockImplementation(async () => {
          activeAbort!.abort();
          throw new Error('Cancelled by abort');
        });
      workerInternals.safeUpdateExecutionMetadata = vi
        .fn()
        .mockResolvedValue({});

      await worker.executeAgentLoop('c-1', 't-1');

      expect(
        mockEventBridge.emitExecutionStatusChanged,
      ).toHaveBeenCalledWith(
        't-1',
        'c-1',
        expect.objectContaining({ status: 'cancelled' }),
      );
    });
  });

  describe('executeAgentLoop() — sandbox adapter selection', () => {
    it('hasSandbox=true 时 prepareRuntimeSession 传入正确 context', async () => {
      mockExecutionService.registerActiveRun.mockImplementation(
        (_id: string, abort: AbortController) => ({ abort, notify: vi.fn() }),
      );
      mockExecutionService.waitForNotification.mockResolvedValue('timeout');

      const sandboxContext = makeActiveContext({
        hasSandbox: true,
        runtimeConfig: { sandboxConfig: { image: 'node:20' } },
      });

      setupLoopMocks(workerInternals, {
        context: sandboxContext,
        pendingMessages: [[]],
      });

      await worker.executeAgentLoop('c-1', 't-1');

      expect(workerInternals.prepareRuntimeSession).toHaveBeenCalledWith(
        expect.objectContaining({ hasSandbox: true }),
        'c-1',
        't-1',
      );
    });
  });

  describe('executeAgentLoop() — session resumption', () => {
    it('有 sessionId 时尝试恢复 session', async () => {
      mockExecutionService.registerActiveRun.mockImplementation(
        (_id: string, abort: AbortController) => ({ abort, notify: vi.fn() }),
      );
      mockExecutionService.waitForNotification.mockResolvedValue('timeout');

      const contextWithSession = makeActiveContext({
        executionMetadata: { sessionId: 'existing-session' },
      });

      setupLoopMocks(workerInternals, {
        context: contextWithSession,
        pendingMessages: [[]],
      });

      await worker.executeAgentLoop('c-1', 't-1');

      expect(workerInternals.prepareRuntimeSession).toHaveBeenCalledWith(
        contextWithSession,
        'c-1',
        't-1',
      );
    });
  });

  describe('prepareRuntimeSession() — memory integration', () => {
    it('会创建对话 memory sessions、prepend boot prompt 并注册 session tools', async () => {
      const toolProvider = vi.fn();
      const runtimeSessionWorker = worker as unknown as {
        prepareRuntimeSession: (
          context: Record<string, unknown>,
          conversationId: string,
          tenantId: string,
        ) => Promise<{
          runtime: typeof mockRuntime;
          session: ReturnType<typeof makeSession>;
          memorySessionIds: string[];
        }>;
      };

      mockMemoryResourceProvider.create
        .mockResolvedValueOnce({
          sessionId: 'memory-session-1',
          session: { id: 'memory-session-1' },
          memoryInstanceId: 'memory-instance-1',
          tenantId: 'tenant-1',
        })
        .mockResolvedValueOnce({
          sessionId: 'memory-session-2',
          session: { id: 'memory-session-2' },
          memoryInstanceId: 'memory-instance-2',
          tenantId: 'tenant-1',
        });
      mockMemoryFusionService.bootAll.mockResolvedValue({
        systemPrompt: 'memory-system-prompt',
        boot: 'memory-boot',
        index: [{ domain: 'core', pathString: 'profile/name' }],
        glossary: [{ keyword: 'fox', nodeId: 'node-1' }],
      });
      mockMemoryToolsService.createSessionToolProvider.mockReturnValue(toolProvider);
      mockRuntime.createSession.mockResolvedValue(makeSession());

      const result = await runtimeSessionWorker.prepareRuntimeSession(
        makeActiveContext({
          systemPrompt: 'agent-system-prompt',
          memoryInstanceIds: ['memory-instance-1', 'memory-instance-2'],
          runtimeConfig: { modelConfig: { modelId: 'model-1' } },
        }),
        'conversation-1',
        'tenant-1',
      );

      expect(mockMemoryResourceProvider.create).toHaveBeenNthCalledWith(1, {
        memoryInstanceId: 'memory-instance-1',
        role: 'primary',
        bootUris: ['system://boot', 'system://index', 'system://glossary'],
        fusionPriority: 1,
        tenantId: 'tenant-1',
        agentConversationId: 'conversation-1',
      });
      expect(mockMemoryResourceProvider.create).toHaveBeenNthCalledWith(2, {
        memoryInstanceId: 'memory-instance-2',
        role: 'readonly',
        bootUris: ['system://boot', 'system://index', 'system://glossary'],
        fusionPriority: 2,
        tenantId: 'tenant-1',
        agentConversationId: 'conversation-1',
      });
      expect(mockRuntime.createSession).toHaveBeenCalledWith({
        agentId: 'agent-1',
        mode: 'conversation',
        tenantId: 'tenant-1',
        llmModelConfigId: 'model-1',
        systemPrompt:
          'memory-system-prompt\n\n## Memory Boot\nmemory-boot\n\n## Memory Index\n- core://profile/name\n\n## Memory Glossary\n- fox -> node:node-1\n\nagent-system-prompt',
        serverSandbox: { agentConversationId: 'conversation-1' },
        context: {
          tenantId: 'tenant-1',
          agentConversationId: 'conversation-1',
          serverSandbox: { agentConversationId: 'conversation-1' },
          memorySessionIds: ['memory-session-1', 'memory-session-2'],
        },
      });
      expect(mockRuntime.registerSessionToolProvider).toHaveBeenCalledWith(
        'session-1',
        toolProvider,
      );
      expect(result.memorySessionIds).toEqual([
        'memory-session-1',
        'memory-session-2',
      ]);
    });
  });

  describe('executeAgentLoop() — notified loop', () => {
    it('waitForNotification 返回 notified 时继续循环', async () => {
      mockExecutionService.registerActiveRun.mockImplementation(
        (_id: string, abort: AbortController) => ({ abort, notify: vi.fn() }),
      );
      mockExecutionService.waitForNotification
        .mockResolvedValueOnce('notified')
        .mockResolvedValueOnce('timeout');

      setupLoopMocks(workerInternals, {
        pendingMessages: [
          [],
          [{ id: 'msg-1', content: '你好', createdAt: new Date() }],
          [],
        ],
      });

      mockRuntime.prompt.mockReturnValueOnce(
        createAsyncIterable([
          { type: 'message_chunk', content: '回复' },
          { type: 'done', stopReason: 'end_turn' },
        ]),
      );

      await worker.executeAgentLoop('c-1', 't-1');

      expect(
        mockExecutionService.waitForNotification,
      ).toHaveBeenCalledTimes(2);
      expect(mockRuntime.prompt).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeAgentLoop() — turn cancelled', () => {
    it('stopReason=cancelled 时退出循环', async () => {
      mockExecutionService.registerActiveRun.mockImplementation(
        (_id: string, abort: AbortController) => ({ abort, notify: vi.fn() }),
      );

      setupLoopMocks(workerInternals, {
        pendingMessages: [
          [{ id: 'msg-1', content: '请取消', createdAt: new Date() }],
        ],
        persistResult: {
          sessionId: 'session-1',
          lastProcessedMessageId: 'msg-1',
          lastStopReason: 'cancelled',
          runningState: 'running',
        },
      });

      mockRuntime.prompt.mockReturnValueOnce(
        createAsyncIterable([
          { type: 'done', stopReason: 'cancelled' },
        ]),
      );

      await worker.executeAgentLoop('c-1', 't-1');

      expect(
        mockEventBridge.emitExecutionStatusChanged,
      ).toHaveBeenCalledWith(
        't-1',
        'c-1',
        expect.objectContaining({ status: 'cancelled' }),
      );
    });
  });


  it('执行多轮 loop，并在 tool_use 后自动续轮直到完成', async () => {
    mockExecutionService.registerActiveRun.mockImplementation(
      (_conversationId: string, abort: AbortController) => ({
        abort,
        notify: vi.fn(),
      }),
    );
    mockExecutionService.waitForNotification.mockResolvedValue('timeout');

    workerInternals.loadConversationExecutionContext = vi.fn().mockResolvedValue({
      conversation: {
        id: 'conversation-1',
        agentDefinitionId: 'agent-1',
        tenantId: 'tenant-1',
        status: 'active',
        metadata: {},
      },
      runtimeConfig: {},
      systemPrompt: 'system',
      hasSandbox: false,
      executionMetadata: {},
    });
    workerInternals.prepareRuntimeSession = vi.fn().mockResolvedValue({
      runtime: mockRuntime,
      session: {
        id: 'session-1',
        agentId: 'agent-1',
        mode: 'conversation',
        context: { history: [] },
        status: 'active',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    workerInternals.loadPendingUserMessages = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 'message-1', content: '请先调用工具', createdAt: new Date() },
      ])
      .mockResolvedValueOnce([]);
    workerInternals.updateExecutionMetadata = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      runningState: 'running',
    });
    workerInternals.persistConversationTurn = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      lastProcessedMessageId: 'message-1',
      lastStopReason: 'end_turn',
      runningState: 'running',
    });
    workerInternals.safeUpdateExecutionMetadata = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      runningState: 'idle',
    });

    mockRuntime.prompt
      .mockReturnValueOnce(
        createAsyncIterable([
          {
            type: 'tool_call',
            call: {
              id: 'tool-1',
              tool: 'search',
              args: { query: 'hello' },
              status: 'pending',
            },
          },
          { type: 'done', stopReason: 'tool_use' },
        ]),
      )
      .mockReturnValueOnce(
        createAsyncIterable([
          { type: 'message_chunk', content: '处理完成' },
          { type: 'done', stopReason: 'end_turn' },
        ]),
      );

    await worker.executeAgentLoop('conversation-1', 'tenant-1');

    expect(mockRuntime.prompt).toHaveBeenNthCalledWith(
      1,
      'session-1',
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: '请先调用工具' }),
      ]),
    );
    expect(mockRuntime.prompt).toHaveBeenNthCalledWith(2, 'session-1', []);
    expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledTimes(1);
    expect(mockEventBridge.emitOutputChunk).toHaveBeenCalledWith(
      'tenant-1',
      'conversation-1',
      expect.objectContaining({ chunk: '处理完成', index: 0 }),
    );
    expect(mockEventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
      'tenant-1',
      'conversation-1',
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('检测到新增消息后会继续下一轮 prompt', async () => {
    mockExecutionService.registerActiveRun.mockImplementation(
      (_conversationId: string, abort: AbortController) => ({
        abort,
        notify: vi.fn(),
      }),
    );
    mockExecutionService.waitForNotification.mockResolvedValue('timeout');

    workerInternals.loadConversationExecutionContext = vi.fn().mockResolvedValue({
      conversation: {
        id: 'conversation-1',
        agentDefinitionId: 'agent-1',
        tenantId: 'tenant-1',
        status: 'active',
        metadata: {},
      },
      runtimeConfig: {},
      systemPrompt: 'system',
      hasSandbox: false,
      executionMetadata: {},
    });
    workerInternals.prepareRuntimeSession = vi.fn().mockResolvedValue({
      runtime: mockRuntime,
      session: {
        id: 'session-1',
        agentId: 'agent-1',
        mode: 'conversation',
        context: { history: [] },
        status: 'active',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    workerInternals.loadPendingUserMessages = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 'message-1', content: '先回答第一条', createdAt: new Date() },
      ])
      .mockResolvedValueOnce([
        { id: 'message-2', content: '再处理补充消息', createdAt: new Date() },
      ])
      .mockResolvedValueOnce([]);
    workerInternals.updateExecutionMetadata = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      runningState: 'running',
    });
    const persistSpy = vi
      .fn()
      .mockResolvedValueOnce({
        sessionId: 'session-1',
        lastProcessedMessageId: 'message-1',
        lastStopReason: 'end_turn',
        runningState: 'running',
      })
      .mockResolvedValueOnce({
        sessionId: 'session-1',
        lastProcessedMessageId: 'message-2',
        lastStopReason: 'end_turn',
        runningState: 'running',
      });
    workerInternals.persistConversationTurn = persistSpy;
    workerInternals.safeUpdateExecutionMetadata = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      runningState: 'idle',
    });

    mockRuntime.prompt
      .mockReturnValueOnce(
        createAsyncIterable([
          { type: 'message_chunk', content: '第一轮响应' },
          { type: 'done', stopReason: 'end_turn' },
        ]),
      )
      .mockReturnValueOnce(
        createAsyncIterable([
          { type: 'message_chunk', content: '第二轮响应' },
          { type: 'done', stopReason: 'end_turn' },
        ]),
      );

    await worker.executeAgentLoop('conversation-1', 'tenant-1');

    expect(mockRuntime.prompt).toHaveBeenNthCalledWith(
      1,
      'session-1',
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: '先回答第一条' }),
      ]),
    );
    expect(mockRuntime.prompt).toHaveBeenNthCalledWith(
      2,
      'session-1',
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: '再处理补充消息' }),
      ]),
    );
    expect(persistSpy).toHaveBeenCalledTimes(2);
  });

  it('收到取消信号后会中止 runtime 并以 cancelled 收口', async () => {
    let activeAbort: AbortController | null = null;

    mockExecutionService.registerActiveRun.mockImplementation(
      (_conversationId: string, abort: AbortController) => {
        activeAbort = abort;
        return {
          abort,
          notify: vi.fn(),
        };
      },
    );
    mockExecutionService.waitForNotification.mockImplementation(
      async (_conversationId: string, signal: AbortSignal) => {
        if (signal.aborted) {
          return 'aborted';
        }

        return new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve('aborted'), {
            once: true,
          });
        });
      },
    );

    workerInternals.loadConversationExecutionContext = vi.fn().mockResolvedValue({
      conversation: {
        id: 'conversation-1',
        agentDefinitionId: 'agent-1',
        tenantId: 'tenant-1',
        status: 'active',
        metadata: {},
      },
      runtimeConfig: {},
      systemPrompt: 'system',
      hasSandbox: false,
      executionMetadata: {},
    });
    workerInternals.prepareRuntimeSession = vi.fn().mockResolvedValue({
      runtime: mockRuntime,
      session: {
        id: 'session-1',
        agentId: 'agent-1',
        mode: 'conversation',
        context: { history: [] },
        status: 'active',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    workerInternals.loadPendingUserMessages = vi.fn().mockResolvedValue([]);
    workerInternals.updateExecutionMetadata = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      runningState: 'running',
    });
    workerInternals.safeUpdateExecutionMetadata = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      runningState: 'cancelled',
    });

    const loopPromise = worker.executeAgentLoop('conversation-1', 'tenant-1');

    await vi.waitFor(() => {
      expect(mockExecutionService.waitForNotification).toHaveBeenCalledTimes(1);
    });

    expect(activeAbort).not.toBeNull();
    activeAbort!.abort();

    await loopPromise;

    expect(mockRuntime.cancel).toHaveBeenCalledWith('session-1');
    expect(mockEventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
      'tenant-1',
      'conversation-1',
      expect.objectContaining({ status: 'cancelled' }),
    );
  });
});

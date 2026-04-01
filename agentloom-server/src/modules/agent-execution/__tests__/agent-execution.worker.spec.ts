import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentExecutionWorker } from '../agent-execution.worker';
import type { LlmService } from '../../llm/llm.service';

const {
  mockDb,
  mockDbSelectChain,
  mockRuntime,
  mockSandboxRuntime,
  mockAdapterFactory,
  mockExecutionService,
  mockEventBridge,
  mockSandboxService,
  mockWorkspaceIntegrationService,
  mockAgentDefinitionService,
  mockLlmService,
  mockMemoryToolsService,
  mockMemoryFusionService,
  mockMemoryResourceProvider,
  mockSkillResolverService,
  mockMcpService,
} = vi.hoisted(() => ({
  mockDbSelectChain: {
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
  },
  mockDb: {
    select: vi.fn(),
  },
  mockRuntime: {
    prompt: vi.fn(),
    cancel: vi.fn(),
    createSession: vi.fn(),
    loadSession: vi.fn(),
    registerSessionToolProvider: vi.fn(),
    unregisterSessionToolProvider: vi.fn(),
  },
  mockSandboxRuntime: {
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
    findByConversationId: vi.fn(),
    createSandboxSession: vi.fn(),
  },
  mockWorkspaceIntegrationService: {
    startFileWatcher: vi.fn(),
  },
  mockAgentDefinitionService: {
    compileCanvas: vi.fn(),
    buildRuntimeConfigFromNodes: vi.fn(),
  },
  mockLlmService: {
    findById: vi.fn(),
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
  mockSkillResolverService: {
    resolveSkillsForAgent: vi.fn(),
    buildSkillAugmentedPrompt: vi.fn(),
  },
  mockMcpService: {
    resolveRuntimeConnection: vi.fn(),
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

function createFailingAsyncIterable<T>(
  items: readonly T[],
  error: unknown,
): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
      throw error;
    },
  };
}

type WorkerInternals = {
  loadConversationExecutionContext: ReturnType<typeof vi.fn>;
  prepareRuntimeSession: ReturnType<typeof vi.fn>;
  loadConversationHistoryMessages: ReturnType<typeof vi.fn>;
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

function makeActiveContext(overrides: Record<string, unknown> = {}) {
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
    hasSandbox: true,
    executionMetadata: {},
    memoryInstanceIds: [],
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
    mockAdapterFactory.selectAdapter.mockReturnValue(mockSandboxRuntime);
    mockLlmService.findById.mockReset().mockResolvedValue({
      id: 'model-1',
      orgId: 'org-1',
      tenantId: 'tenant-1',
      name: 'CodeHub Claude',
      provider: 'private_cloud',
      modelName: 'claude-opus-4-6',
      parameters: { baseUrl: 'https://models.example.test/v1' },
      apiKeyId: 'api-key-1',
      endpointUrl: 'https://models.example.test/v1',
      authMethod: 'api_key',
      authConfig: null,
      timeoutMs: 120000,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockDb.select.mockReset().mockReturnValue(mockDbSelectChain);
    mockDbSelectChain.from.mockReset().mockReturnThis();
    mockDbSelectChain.where.mockReset().mockResolvedValue([]);
    mockSandboxService.findByConversationId.mockReset().mockResolvedValue(null);
    mockSandboxService.createSandboxSession.mockReset().mockResolvedValue({
      id: 'sandbox-session-1',
    });
    mockWorkspaceIntegrationService.startFileWatcher.mockReset();
    mockMemoryToolsService.createSessionToolProvider.mockReset();
    mockMemoryFusionService.bootAll.mockReset();
    mockMemoryResourceProvider.create.mockReset();
    mockMemoryResourceProvider.destroy.mockReset();
    mockSkillResolverService.resolveSkillsForAgent.mockReset();
    mockSkillResolverService.buildSkillAugmentedPrompt.mockReset();
    mockMcpService.resolveRuntimeConnection.mockReset();

    worker = new AgentExecutionWorker(
      mockDb as never,
      mockRuntime as never,
      mockAdapterFactory as never,
      mockExecutionService as never,
      mockEventBridge as never,
      mockSandboxService as never,
      mockWorkspaceIntegrationService as never,
      mockAgentDefinitionService as never,
      mockLlmService as unknown as LlmService,
      mockMemoryToolsService as never,
      mockMemoryFusionService as never,
      mockMemoryResourceProvider as never,
      mockSkillResolverService as never,
      undefined,
      mockMcpService as never,
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
      expect(() => worker.onFailed(job, new Error('test error'))).not.toThrow();
    });
  });

  describe('executeAgentLoop() — duplicate guard', () => {
    it('registerActiveRun 返回 null 时直接退出', async () => {
      mockExecutionService.registerActiveRun.mockReturnValue(null);
      await worker.executeAgentLoop('c-1', 't-1');
      expect(mockEventBridge.emitExecutionStatusChanged).not.toHaveBeenCalled();
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
      ).toHaveBeenNthCalledWith(
        1,
        't-1',
        'c-1',
        expect.objectContaining({
          status: 'preparing',
          phase: 'queued',
          executionType: 'conversation',
        }),
      );
      expect(
        mockEventBridge.emitExecutionStatusChanged,
      ).toHaveBeenNthCalledWith(
        2,
        't-1',
        'c-1',
        expect.objectContaining({
          status: 'preparing',
          phase: 'preparing',
          executionType: 'conversation',
        }),
      );
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
      ).toHaveBeenNthCalledWith(
        1,
        't-1',
        'c-1',
        expect.objectContaining({
          status: 'preparing',
          phase: 'queued',
          executionType: 'conversation',
        }),
      );
      expect(
        mockEventBridge.emitExecutionStatusChanged,
      ).toHaveBeenNthCalledWith(
        2,
        't-1',
        'c-1',
        expect.objectContaining({
          status: 'preparing',
          phase: 'preparing',
          executionType: 'conversation',
        }),
      );
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
      ).toHaveBeenNthCalledWith(
        1,
        't-1',
        'c-1',
        expect.objectContaining({
          status: 'preparing',
          phase: 'queued',
          executionType: 'conversation',
        }),
      );
      expect(
        mockEventBridge.emitExecutionStatusChanged,
      ).toHaveBeenNthCalledWith(
        2,
        't-1',
        'c-1',
        expect.objectContaining({
          status: 'preparing',
          phase: 'preparing',
          executionType: 'conversation',
        }),
      );
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

      await expect(worker.executeAgentLoop('c-1', 't-1')).rejects.toThrow(
        'Runtime init failed',
      );

      expect(workerInternals.safeUpdateExecutionMetadata).toHaveBeenCalledWith(
        't-1',
        'c-1',
        expect.objectContaining({ runningState: 'failed' }),
      );
      expect(mockEventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
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

      await expect(worker.executeAgentLoop('c-1', 't-1')).rejects.toThrow();

      expect(mockEventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
        't-1',
        'c-1',
        expect.objectContaining({
          errorMessage: 'Agent conversation execution failed',
        }),
      );
    });

    it('运行中 terminated 时会先持久化 partial assistant turn，再以 failed 收口', async () => {
      mockExecutionService.registerActiveRun.mockImplementation(
        (_id: string, abort: AbortController) => ({ abort, notify: vi.fn() }),
      );

      setupLoopMocks(workerInternals, {
        pendingMessages: [
          [
            {
              id: 'message-1',
              content: '请继续研究这个项目的记忆系统',
              createdAt: new Date(),
            },
          ],
        ],
      });

      const persistSpy = vi.fn().mockResolvedValue({
        sessionId: 'session-1',
        lastProcessedMessageId: 'message-1',
        lastAssistantMessageId: 'assistant-1',
        lastStopReason: 'end_turn',
        runningState: 'running',
      });
      workerInternals.persistConversationTurn = persistSpy;

      mockRuntime.prompt.mockReturnValueOnce(
        createFailingAsyncIterable(
          [
            { type: 'message_chunk', content: '先整理仓库结构，再回看记忆模块。' },
            {
              type: 'tool_call',
              call: {
                id: 'tool-1',
                tool: 'git.clone',
                args: { repo: 'https://github.com/Dataojitori/nocturne_memory' },
                status: 'completed',
                result: { ok: true },
              },
            },
          ],
          new Error('terminated'),
        ),
      );

      await expect(worker.executeAgentLoop('conversation-1', 'tenant-1')).rejects.toThrow(
        'terminated',
      );

      expect(persistSpy).toHaveBeenCalledWith(
        'conversation-1',
        'tenant-1',
        expect.any(Object),
        [
          expect.objectContaining({
            id: 'message-1',
            content: '请继续研究这个项目的记忆系统',
          }),
        ],
        expect.objectContaining({
          assistantText: '先整理仓库结构，再回看记忆模块。',
          toolCalls: [
            expect.objectContaining({
              id: 'tool-1',
              tool: 'git.clone',
              status: 'completed',
            }),
          ],
          segments: [
            { type: 'text', content: '先整理仓库结构，再回看记忆模块。' },
            { type: 'tool_call', toolCallId: 'tool-1' },
          ],
        }),
        'session-1',
        expect.objectContaining({
          incomplete: true,
          errorMessage: 'terminated',
        }),
      );
      expect(mockEventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
        'tenant-1',
        'conversation-1',
        expect.objectContaining({
          status: 'failed',
          errorMessage: 'terminated',
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

      expect(mockEventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
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
        expect.any(AbortSignal),
        expect.objectContaining({ abortControllers: expect.any(Map) }),
        'agent-1',
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
        expect.any(AbortSignal),
        expect.objectContaining({ abortControllers: expect.any(Map) }),
        'agent-1',
      );
    });

    it('session 未恢复时会在首轮重建历史消息上下文', async () => {
      mockExecutionService.registerActiveRun.mockImplementation(
        (_id: string, abort: AbortController) => ({ abort, notify: vi.fn() }),
      );
      mockExecutionService.waitForNotification.mockResolvedValue('timeout');

      const historyMessages = [
        {
          id: 'history-1',
          role: 'assistant',
          content: '上一轮已调用工具并给出结论',
          toolCalls: [
            {
              tool: 'search_query',
              status: 'completed',
            },
          ],
          metadata: {},
          createdAt: new Date('2026-03-29T10:00:00.000Z'),
        },
      ];

      workerInternals.loadConversationExecutionContext = vi
        .fn()
        .mockResolvedValue(
          makeActiveContext({
            executionMetadata: { lastProcessedMessageId: 'message-0' },
          }),
        );
      workerInternals.prepareRuntimeSession = vi.fn().mockResolvedValue({
        runtime: mockRuntime,
        session: makeSession(),
        memorySessionIds: [],
        restoredExistingSession: false,
      });
      workerInternals.loadConversationHistoryMessages = vi
        .fn()
        .mockResolvedValue(historyMessages);
      workerInternals.loadPendingUserMessages = vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'message-1',
            content: '继续基于之前的结果推进',
            createdAt: new Date('2026-03-29T10:05:00.000Z'),
          },
        ])
        .mockResolvedValueOnce([]);
      workerInternals.updateExecutionMetadata = vi.fn().mockResolvedValue({
        sessionId: 'session-1',
        lastProcessedMessageId: 'message-0',
        runningState: 'running',
      });
      workerInternals.runConversationTurn = vi.fn().mockResolvedValue({
        assistantText: '收到，我继续处理。',
        stopReason: 'end_turn',
        toolCalls: [],
        toolResults: [],
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

      await worker.executeAgentLoop('conversation-1', 'tenant-1');

      expect(
        workerInternals.loadConversationHistoryMessages,
      ).toHaveBeenCalledWith('conversation-1', 'tenant-1', 'message-1');
      expect(workerInternals.runConversationTurn).toHaveBeenCalledWith(
        mockRuntime,
        expect.objectContaining({ id: 'session-1' }),
        'conversation-1',
        'tenant-1',
        expect.arrayContaining([expect.objectContaining({ id: 'message-1' })]),
        true,
        historyMessages,
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
          parentAbortSignal: AbortSignal,
          subAgentTracker: { abortControllers: Map<string, AbortController> },
          currentAgentDefinitionId: string,
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
      mockMemoryToolsService.createSessionToolProvider.mockReturnValue(
        toolProvider,
      );
      mockRuntime.createSession.mockResolvedValue(makeSession());

      const result = await runtimeSessionWorker.prepareRuntimeSession(
        makeActiveContext({
          hasSandbox: true,
          systemPrompt: 'agent-system-prompt',
          memoryInstanceIds: ['memory-instance-1', 'memory-instance-2'],
          runtimeConfig: {
            modelConfig: { modelId: 'model-1' },
            sandboxConfig: { cpu: 1, memory: 512, disk: 2, timeout: 2 },
          },
        }),
        'conversation-1',
        'tenant-1',
        new AbortController().signal,
        { abortControllers: new Map() },
        'agent-1',
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
      expect(mockSandboxRuntime.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          mode: 'conversation',
          tenantId: 'tenant-1',
          llmModelConfigId: 'model-1',
          runtimeConfig: {
            modelConfig: { modelId: 'model-1' },
            sandboxConfig: { cpu: 1, memory: 512, disk: 2, timeout: 2 },
          },
          systemPrompt:
            'memory-system-prompt\n\n## Memory Boot\nmemory-boot\n\n## Memory Index\n- core://profile/name\n\n## Memory Glossary\n- fox -> node:node-1\n\nagent-system-prompt',
          serverSandbox: { agentConversationId: 'conversation-1' },
          context: {
            tenantId: 'tenant-1',
            agentConversationId: 'conversation-1',
            serverSandbox: { agentConversationId: 'conversation-1' },
            memorySessionIds: ['memory-session-1', 'memory-session-2'],
          },
        }),
      );
      expect(
        mockSandboxRuntime.registerSessionToolProvider,
      ).toHaveBeenCalledWith(expect.any(String), toolProvider);
      expect(result.memorySessionIds).toEqual([
        'memory-session-1',
        'memory-session-2',
      ]);
    });
  });

  describe('prepareRuntimeSession() — runtime routing', () => {
    it('sandbox 配置存在时应选择 SandboxAgentAdapter', async () => {
      const runtimeSessionWorker = worker as unknown as {
        prepareRuntimeSession: (
          context: Record<string, unknown>,
          conversationId: string,
          tenantId: string,
          parentAbortSignal: AbortSignal,
          subAgentTracker: { abortControllers: Map<string, AbortController> },
          currentAgentDefinitionId: string,
        ) => Promise<{
          runtime: typeof mockSandboxRuntime;
          session: ReturnType<typeof makeSession>;
        }>;
      };

      mockSandboxRuntime.createSession.mockResolvedValue(
        makeSession({ id: 'sandbox-session-1' }),
      );
      mockLlmService.findById.mockResolvedValue({
        id: 'model-1',
        orgId: 'org-1',
        tenantId: 'tenant-1',
        name: 'CodeHub Claude',
        provider: 'private_cloud',
        modelName: 'claude-opus-4-6',
        parameters: { baseUrl: 'https://models.example.test/v1' },
        apiKeyId: 'api-key-1',
        endpointUrl: 'https://models.example.test/v1',
        authMethod: 'api_key',
        authConfig: null,
        timeoutMs: 120000,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await runtimeSessionWorker.prepareRuntimeSession(
        makeActiveContext({
          runtimeConfig: {
            sandboxConfig: { image: 'agentloom/sandbox:latest' },
            modelConfig: { modelId: 'model-1' },
          },
        }),
        'conversation-1',
        'tenant-1',
        new AbortController().signal,
        { abortControllers: new Map() },
        'agent-1',
      );

      expect(mockAdapterFactory.selectAdapter).toHaveBeenCalledWith(true);
      expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sandboxNodeId: null,
          tenantId: 'tenant-1',
          agentConversationId: 'conversation-1',
          piConfigInput: expect.objectContaining({
            systemPrompt: 'system',
            modelConfig: expect.objectContaining({
              provider: 'private_cloud',
              model: 'claude-opus-4-6',
              apiBaseUrl: 'https://models.example.test/v1',
              apiKeyId: 'api-key-1',
              organizationId: 'org-1',
              tenantId: 'tenant-1',
              authMethod: 'api_key',
            }),
          }),
        }),
      );
      expect(mockSandboxRuntime.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          mode: 'conversation',
          tenantId: 'tenant-1',
        }),
      );
      expect(mockRuntime.createSession).not.toHaveBeenCalled();
      expect(result.runtime).toBe(mockSandboxRuntime);
    });

    it('会把启用的 MCP 绑定编译进 piConfigInput.mcpServers', async () => {
      const runtimeSessionWorker = worker as unknown as {
        prepareRuntimeSession: (
          context: Record<string, unknown>,
          conversationId: string,
          tenantId: string,
          parentAbortSignal: AbortSignal,
          subAgentTracker: { abortControllers: Map<string, AbortController> },
          currentAgentDefinitionId: string,
        ) => Promise<{
          runtime: typeof mockSandboxRuntime;
          session: ReturnType<typeof makeSession>;
        }>;
      };

      mockDbSelectChain.where.mockResolvedValue([
        { id: 'mcp-config-1', name: 'WebSearch' },
      ]);
      mockMcpService.resolveRuntimeConnection.mockResolvedValue({
        transportType: 'sse',
        url: 'https://mcp.example.com/sse',
        headers: { Authorization: 'Bearer test-token' },
      });
      mockSandboxRuntime.createSession.mockResolvedValue(
        makeSession({ id: 'sandbox-session-mcp' }),
      );

      await runtimeSessionWorker.prepareRuntimeSession(
        makeActiveContext({
          runtimeConfig: {
            sandboxConfig: { image: 'agentloom/sandbox:latest' },
            modelConfig: { modelId: 'model-1' },
            tools: [
              {
                toolId: 'tool-1',
                name: 'fast_search',
                enabled: true,
                toolType: 'mcp',
                mcpServerConfigId: 'mcp-config-1',
              },
            ],
          },
        }),
        'conversation-1',
        'tenant-1',
        new AbortController().signal,
        { abortControllers: new Map() },
        'agent-1',
      );

      expect(mockMcpService.resolveRuntimeConnection).toHaveBeenCalledWith(
        'mcp-config-1',
        'tenant-1',
      );
      expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith(
        expect.objectContaining({
          piConfigInput: expect.objectContaining({
            mcpServers: {
              WebSearch: {
                transportType: 'sse',
                url: 'https://mcp.example.com/sse',
                headers: { Authorization: 'Bearer test-token' },
              },
            },
          }),
        }),
      );
    });

    it('llmService 查找失败时应回退到节点快照中的模型配置', async () => {
      const runtimeSessionWorker = worker as unknown as {
        prepareRuntimeSession: (
          context: Record<string, unknown>,
          conversationId: string,
          tenantId: string,
          parentAbortSignal: AbortSignal,
          subAgentTracker: { abortControllers: Map<string, AbortController> },
          currentAgentDefinitionId: string,
        ) => Promise<{
          runtime: typeof mockSandboxRuntime;
          session: ReturnType<typeof makeSession>;
        }>;
      };

      mockLlmService.findById.mockRejectedValueOnce(new Error('not found'));
      mockSandboxRuntime.createSession.mockResolvedValue(
        makeSession({ id: 'sandbox-session-runtime-fallback' }),
      );

      await runtimeSessionWorker.prepareRuntimeSession(
        makeActiveContext({
          runtimeConfig: {
            sandboxConfig: { image: 'agentloom/sandbox:latest' },
            modelConfig: {
              modelId: 'cfg-missing',
              provider: 'private_cloud',
              modelName: 'gpt-4o',
              apiKeyId: 'api-key-inline',
              endpointUrl: 'https://runtime.example.com/v1',
              authMethod: 'api_key',
            },
          },
        }),
        'conversation-1',
        'tenant-1',
        new AbortController().signal,
        { abortControllers: new Map() },
        'agent-1',
      );

      expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith(
        expect.objectContaining({
          piConfigInput: expect.objectContaining({
            modelConfig: expect.objectContaining({
              provider: 'private_cloud',
              model: 'gpt-4o',
              apiBaseUrl: 'https://runtime.example.com/v1',
              apiKeyId: 'api-key-inline',
              authMethod: 'api_key',
            }),
          }),
        }),
      );
    });

    it('runtimeConfig.skillIds 存在时应把 skill 编译进 piConfigInput', async () => {
      const runtimeSessionWorker = worker as unknown as {
        prepareRuntimeSession: (
          context: Record<string, unknown>,
          conversationId: string,
          tenantId: string,
          parentAbortSignal: AbortSignal,
          subAgentTracker: { abortControllers: Map<string, AbortController> },
          currentAgentDefinitionId: string,
        ) => Promise<{
          runtime: typeof mockSandboxRuntime;
          session: ReturnType<typeof makeSession>;
        }>;
      };

      mockSkillResolverService.resolveSkillsForAgent.mockResolvedValue([
        {
          id: 'skill-1',
          name: 'E2E Skill',
          description: '用于验证 skill 文件编译',
          content: '# Skill Body',
        },
      ]);
      mockSandboxRuntime.createSession.mockResolvedValue(
        makeSession({ id: 'sandbox-session-skill' }),
      );

      await runtimeSessionWorker.prepareRuntimeSession(
        makeActiveContext({
          runtimeConfig: {
            sandboxConfig: { image: 'agentloom/sandbox:latest' },
            modelConfig: { modelId: 'model-1' },
            skillIds: ['skill-1'],
          },
          canvasNodes: [
            {
              id: 'legacy-skill',
              type: 'knowledge',
              data: {
                nodeType: 'skill',
                config: { skillId: 'skill-legacy' },
              },
            },
          ],
          canvasEdges: [],
        }),
        'conversation-1',
        'tenant-1',
        new AbortController().signal,
        { abortControllers: new Map() },
        'agent-1',
      );

      expect(
        mockSkillResolverService.resolveSkillsForAgent,
      ).toHaveBeenCalledWith('tenant-1', ['skill-1']);
      expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith(
        expect.objectContaining({
          piConfigInput: expect.objectContaining({
            skills: [
              {
                name: 'E2E Skill',
                description: '用于验证 skill 文件编译',
                files: { 'SKILL.md': '# Skill Body' },
              },
            ],
          }),
        }),
      );
    });

    it('无显式 sandbox 配置时也应默认使用 SandboxAgentAdapter', async () => {
      const runtimeSessionWorker = worker as unknown as {
        prepareRuntimeSession: (
          context: Record<string, unknown>,
          conversationId: string,
          tenantId: string,
          parentAbortSignal: AbortSignal,
          subAgentTracker: { abortControllers: Map<string, AbortController> },
          currentAgentDefinitionId: string,
        ) => Promise<{
          runtime: typeof mockSandboxRuntime;
          session: ReturnType<typeof makeSession>;
        }>;
      };

      mockSandboxRuntime.createSession.mockResolvedValue(
        makeSession({ id: 'sandbox-session-2' }),
      );

      const result = await runtimeSessionWorker.prepareRuntimeSession(
        makeActiveContext({
          hasSandbox: true,
          runtimeConfig: {
            modelConfig: { modelId: 'model-1' },
            sandboxConfig: { cpu: 1, memory: 512, disk: 2, timeout: 2 },
          },
        }),
        'conversation-1',
        'tenant-1',
        new AbortController().signal,
        { abortControllers: new Map() },
        'agent-1',
      );

      expect(mockAdapterFactory.selectAdapter).toHaveBeenCalledWith(true);
      expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sandboxNodeId: null,
          tenantId: 'tenant-1',
          agentConversationId: 'conversation-1',
          config: { cpu: 1, memory: 512, disk: 2, timeout: 2 },
        }),
      );
      expect(mockSandboxRuntime.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          mode: 'conversation',
          tenantId: 'tenant-1',
        }),
      );
      expect(mockRuntime.createSession).not.toHaveBeenCalled();
      expect(result.runtime).toBe(mockSandboxRuntime);
    });
  });

  describe('runConversationTurn() — tool event merge', () => {
    it('后续事件缺失 toolName 时应保留先前的真实工具名', async () => {
      const turnWorker = worker as unknown as {
        runConversationTurn: (
          runtime: typeof mockRuntime,
          session: ReturnType<typeof makeSession>,
          conversationId: string,
          tenantId: string,
          pendingMessages: Array<{
            id: string;
            content: string;
            createdAt: Date;
          }>,
          hasPriorTurns: boolean,
        ) => Promise<{
          assistantText: string;
          stopReason: string;
          toolCalls: Array<{ id: string; tool: string; status: string }>;
          segments: Array<
            | { type: 'text'; content: string }
            | { type: 'tool_call'; toolCallId: string }
          >;
        }>;
      };

      mockRuntime.prompt.mockReturnValueOnce(
        createAsyncIterable([
          { type: 'message_chunk', content: '先整理线索' },
          {
            type: 'tool_call',
            call: {
              id: 'tool-1',
              tool: 'mcp__WebSearch__fast_search',
              args: { query: 'agentloom' },
              status: 'in_progress',
            },
          },
          {
            type: 'tool_call',
            call: {
              id: 'tool-1',
              tool: 'unknown_tool',
              args: {},
              status: 'completed',
              result: { ok: true },
            },
          },
          { type: 'message_chunk', content: 'KB-ALPHA-20260331-FOX' },
          { type: 'done', stopReason: 'end_turn' },
        ]),
      );

      const result = await turnWorker.runConversationTurn(
        mockRuntime as never,
        makeSession(),
        'conversation-1',
        'tenant-1',
        [{ id: 'message-1', content: '请搜索', createdAt: new Date() }],
        false,
      );

      expect(result.assistantText).toBe('先整理线索KB-ALPHA-20260331-FOX');
      expect(result.toolCalls).toEqual([
        expect.objectContaining({
          id: 'tool-1',
          tool: 'mcp__WebSearch__fast_search',
          status: 'completed',
        }),
      ]);
      expect(result.segments).toEqual([
        { type: 'text', content: '先整理线索' },
        { type: 'tool_call', toolCallId: 'tool-1' },
        { type: 'text', content: 'KB-ALPHA-20260331-FOX' },
      ]);
      expect(mockEventBridge.emitToolCallStatus).toHaveBeenLastCalledWith(
        'tenant-1',
        'conversation-1',
        expect.objectContaining({
          toolCallId: 'tool-1',
          tool: 'mcp__WebSearch__fast_search',
          status: 'completed',
        }),
      );
    });

    it('runtime.prompt 中途 terminated 时会把已流出的 partial turn 挂到错误对象上', async () => {
      const turnWorker = worker as unknown as {
        runConversationTurn: (
          runtime: typeof mockRuntime,
          session: ReturnType<typeof makeSession>,
          conversationId: string,
          tenantId: string,
          pendingMessages: Array<{
            id: string;
            content: string;
            createdAt: Date;
          }>,
          hasPriorTurns: boolean,
        ) => Promise<{
          assistantText: string;
          toolCalls: Array<{ id: string; tool: string; status: string }>;
          segments: Array<
            | { type: 'text'; content: string }
            | { type: 'tool_call'; toolCallId: string }
          >;
        }>;
      };

      mockRuntime.prompt.mockReturnValueOnce(
        createFailingAsyncIterable(
          [
            { type: 'message_chunk', content: '已经抓到第一批线索。' },
            {
              type: 'tool_call',
              call: {
                id: 'tool-1',
                tool: 'git.clone',
                args: { repo: 'https://github.com/Dataojitori/nocturne_memory' },
                status: 'in_progress',
              },
            },
          ],
          new Error('terminated'),
        ),
      );

      await expect(
        turnWorker.runConversationTurn(
          mockRuntime as never,
          makeSession(),
          'conversation-1',
          'tenant-1',
          [{ id: 'message-1', content: '继续分析', createdAt: new Date() }],
          true,
        ),
      ).rejects.toMatchObject({
        message: 'terminated',
        turnResult: {
          assistantText: '已经抓到第一批线索。',
          toolCalls: [
            expect.objectContaining({
              id: 'tool-1',
              tool: 'git.clone',
              status: 'in_progress',
            }),
          ],
          segments: [
            { type: 'text', content: '已经抓到第一批线索。' },
            { type: 'tool_call', toolCallId: 'tool-1' },
          ],
        },
      });
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

      expect(mockExecutionService.waitForNotification).toHaveBeenCalledTimes(2);
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
        createAsyncIterable([{ type: 'done', stopReason: 'cancelled' }]),
      );

      await worker.executeAgentLoop('c-1', 't-1');

      expect(mockEventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
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

    workerInternals.loadConversationExecutionContext = vi
      .fn()
      .mockResolvedValue({
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

    workerInternals.loadConversationExecutionContext = vi
      .fn()
      .mockResolvedValue({
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

    workerInternals.loadConversationExecutionContext = vi
      .fn()
      .mockResolvedValue({
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

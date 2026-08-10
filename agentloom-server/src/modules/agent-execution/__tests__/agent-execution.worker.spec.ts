import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { AgentExecutionWorker } from '../agent-execution.worker';
import { AgentSandboxNotConnectedException } from '../../agent-definition/agent-definition.exceptions';
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
  mockSelfEvolutionToolsProvider,
  mockSmartRoutingService,
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
    beginSubAgentConversationCapture: vi.fn(),
    consumeSubAgentConversationCapture: vi.fn(),
    clearSubAgentConversationCapture: vi.fn(),
    completeSubAgentConversationStream: vi.fn(),
  },
  mockSandboxService: {
    findByConversationId: vi.fn(),
    createSandboxSession: vi.fn(),
    endConversationSandbox: vi.fn(),
    scheduleConversationIdleAutoEnd: vi.fn(),
  },
  mockWorkspaceIntegrationService: {
    startFileWatcher: vi.fn(),
    captureConversationWorkspaceTreeSnapshot: vi.fn(),
    stageConversationAttachment: vi.fn(),
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
  mockSelfEvolutionToolsProvider: {
    createSessionToolProvider: vi.fn(),
  },
  mockSmartRoutingService: {
    evaluate: vi.fn(),
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

type PrepareRuntimeSession = (
  context: Record<string, unknown>,
  conversationId: string,
  tenantId: string,
  parentAbortSignal: AbortSignal,
  subAgentTracker: { abortControllers: Map<string, AbortController> },
  currentAgentDefinitionId: string,
  initialPendingMessages?: unknown[],
) => Promise<{
  runtime: typeof mockRuntime;
  session: Record<string, unknown>;
  memorySessionIds?: string[];
  restoredExistingSession?: boolean;
  sandboxReused?: boolean;
  lastPhase?: string;
}>;

type WorkerInternals = {
  loadConversationExecutionContext: ReturnType<typeof vi.fn>;
  prepareRuntimeSession: Mock<PrepareRuntimeSession>;
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
  resolveConversationStartupRuntimeConfig: (
    runtimeConfig: Record<string, unknown>,
    tenantId: string,
    pendingMessages: unknown[],
  ) => Promise<Record<string, unknown>>;
  selectConversationRoutingModelId: (params: {
    tenantId: string;
    routingConfig: Record<string, unknown>;
    candidateModelIds: string[];
    pendingMessages: unknown[];
  }) => Promise<string | undefined>;
  describeConversationExecutionError: (error: unknown) => {
    errorMessage: string;
    errorCode?: string;
    rawErrorMessage?: string;
  };
  materializePendingMessagesForRuntime: (
    pendingMessages: Array<Record<string, unknown>>,
    conversationId: string,
    tenantId: string,
    runtimeMode: string | undefined,
  ) => Promise<Array<Record<string, unknown>>>;
  runSubAgentPrompt: (
    runtime: typeof mockRuntime,
    session: Record<string, unknown>,
    task: string,
    context?: string,
    eventProxy?: { emitEvent: (event: unknown) => void },
  ) => Promise<{
    content: string;
    stopReason: string;
    decision?: Record<string, unknown>;
  }>;
  buildSubAgentPrompt: (task: string, context?: string) => string;
  startConversationWorkspaceWatcher: (
    conversationId: string,
    tenantId: string,
  ) => Promise<void>;
  registerMemoryToolsProvider: (
    runtime: typeof mockRuntime,
    sessionId: string,
    memorySessionIds: string[],
  ) => void;
  cleanupConversationMemorySessions: (
    tenantId: string,
    memorySessionIds: string[] | undefined,
  ) => Promise<void>;
  emitPreparationPhase: (
    tenantId: string,
    conversationId: string,
    phase: string,
    extra?: {
      sandboxReused?: boolean;
      failedPhase?: string;
      error?: string;
    },
  ) => void;
  resolveAgentRuntimeMode: (
    definitionRuntimeMode: unknown,
    snapshotRuntimeMode: unknown,
  ) => string;
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
      providerId: 'provider-1',
      modelId: 'claude-opus-4-6',
      modelType: 'chat',
      isEnabled: true,
      capabilities: {},
      contextWindow: null,
      maxOutputTokens: null,
      pricing: null,
      metadataSource: null,
      embeddingDimensions: null,
      parameters: { baseUrl: 'https://models.example.test/v1' },
      timeoutMs: 120000,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      provider: {
        id: 'provider-1',
        orgId: 'org-1',
        tenantId: 'tenant-1',
        slug: 'private_cloud',
        name: 'Private Cloud',
        iconUrl: null,
        baseUrl: 'https://models.example.test/v1',
        defaultBaseUrl: null,
        isBuiltin: false,
        isEnabled: true,
        apiProtocol: 'openai_chat',
        apiKeyId: 'api-key-1',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    mockDb.select.mockReset().mockReturnValue(mockDbSelectChain);
    mockDbSelectChain.from.mockReset().mockReturnThis();
    mockDbSelectChain.where.mockReset().mockResolvedValue([]);
    mockSandboxService.findByConversationId.mockReset().mockResolvedValue(null);
    mockSandboxService.createSandboxSession.mockReset().mockResolvedValue({
      id: 'sandbox-session-1',
    });
    mockSandboxService.scheduleConversationIdleAutoEnd
      .mockReset()
      .mockResolvedValue(undefined);
    mockWorkspaceIntegrationService.startFileWatcher.mockReset();
    mockWorkspaceIntegrationService.captureConversationWorkspaceTreeSnapshot.mockReset();
    mockWorkspaceIntegrationService.stageConversationAttachment.mockReset();
    mockEventBridge.beginSubAgentConversationCapture
      .mockReset()
      .mockReturnValue('capture-1');
    mockEventBridge.consumeSubAgentConversationCapture
      .mockReset()
      .mockReturnValue({});
    mockEventBridge.clearSubAgentConversationCapture.mockReset();
    mockEventBridge.completeSubAgentConversationStream.mockReset();
    mockMemoryToolsService.createSessionToolProvider.mockReset();
    mockMemoryFusionService.bootAll.mockReset();
    mockMemoryResourceProvider.create.mockReset();
    mockMemoryResourceProvider.destroy.mockReset();
    mockSkillResolverService.resolveSkillsForAgent.mockReset();
    mockSkillResolverService.buildSkillAugmentedPrompt.mockReset();
    mockMcpService.resolveRuntimeConnection.mockReset();
    mockSelfEvolutionToolsProvider.createSessionToolProvider.mockReset();
    mockSmartRoutingService.evaluate.mockReset();

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
      undefined,
      mockSelfEvolutionToolsProvider as never,
      mockSmartRoutingService as never,
    );
    workerInternals = worker as unknown as WorkerInternals;
  });

  describe('buildPromptBlocks()', () => {
    it('重启继承历史的会话应明确要求只执行最新用户消息', () => {
      const blocks = (
        worker as unknown as {
          buildPromptBlocks: (
            pendingMessages: Array<{
              id: string;
              content: string;
              createdAt: Date;
            }>,
            hasPriorTurns: boolean,
            historyMessages: Array<{
              id: string;
              role: 'user' | 'assistant' | 'system' | 'tool';
              content: string;
              toolCalls: Record<string, unknown>[] | null;
              metadata: Record<string, unknown>;
              createdAt: Date;
            }>,
            latestPromptOverride?: string,
            conversationMetadata?: Record<string, unknown>,
          ) => Array<{ type: string; text: string }>;
        }
      ).buildPromptBlocks(
        [
          {
            id: 'message-new',
            content: '只读取 /workspace/qa-selfevo-bind-marker.txt',
            createdAt: new Date('2025-01-01T00:00:02.000Z'),
          },
        ],
        true,
        [
          {
            id: 'message-old',
            role: 'user',
            content: '旧任务：继续调整 sandbox',
            toolCalls: null,
            metadata: {},
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
          },
        ],
        undefined,
        {
          restartFromConversationId: 'conversation-legacy',
          inheritedMessageHistory: true,
        },
      );

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'text',
      });
      expect(blocks[0]?.text).toContain('继承副本');
      expect(blocks[0]?.text).toContain('不要继续执行历史里未完成的编号任务');
      expect(blocks[1]).toMatchObject({
        type: 'text',
      });
      expect(blocks[1]?.text).toContain(
        '只读取 /workspace/qa-selfevo-bind-marker.txt',
      );
    });
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
        expect.objectContaining({
          runningState: 'failed',
          errorMessage: 'Runtime init failed',
          failedPhase: 'sandbox_creating',
        }),
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

    it('sandbox_creating 阶段失败时应释放会话沙箱绑定，避免 persistent sandbox 被旧失败对话卡死', async () => {
      mockExecutionService.registerActiveRun.mockImplementation(
        (_id: string, abort: AbortController) => ({ abort, notify: vi.fn() }),
      );

      workerInternals.loadConversationExecutionContext = vi
        .fn()
        .mockResolvedValue(makeActiveContext({ hasSandbox: true }));
      workerInternals.prepareRuntimeSession = vi
        .fn()
        .mockRejectedValue(new Error('Sandbox boot failed'));
      workerInternals.safeUpdateExecutionMetadata = vi
        .fn()
        .mockResolvedValue({});

      await expect(worker.executeAgentLoop('c-1', 't-1')).rejects.toThrow(
        'Sandbox boot failed',
      );

      expect(mockSandboxService.endConversationSandbox).toHaveBeenCalledWith(
        'c-1',
        't-1',
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
            {
              type: 'message_chunk',
              content: '先整理仓库结构，再回看记忆模块。',
            },
            {
              type: 'tool_call',
              call: {
                id: 'tool-1',
                tool: 'git.clone',
                args: {
                  repo: 'https://github.com/Dataojitori/nocturne_memory',
                },
                status: 'completed',
                result: { ok: true },
              },
            },
          ],
          Object.assign(new Error('terminated'), {
            code: 'MODEL_PROVIDER_ERROR',
            rawMessage: 'terminated',
          }),
        ),
      );

      await expect(
        worker.executeAgentLoop('conversation-1', 'tenant-1'),
      ).rejects.toThrow('terminated');

      expect(persistSpy).toHaveBeenCalledWith(
        'conversation-1',
        'tenant-1',
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
          errorMessage: '上游模型流中断（MODEL_PROVIDER_ERROR: terminated）',
          errorCode: 'MODEL_PROVIDER_ERROR',
          rawErrorMessage: 'terminated',
        }),
      );
      expect(mockEventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
        'tenant-1',
        'conversation-1',
        expect.objectContaining({
          status: 'failed',
          errorMessage: '上游模型流中断（MODEL_PROVIDER_ERROR: terminated）',
          error: '上游模型流中断（MODEL_PROVIDER_ERROR: terminated）',
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
        [],
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
        [],
      );
    });

    it('已加载 session 对应的 publishedVersionId 过期时应刷新当前对话 runtime', async () => {
      mockExecutionService.registerActiveRun.mockImplementation(
        (_id: string, abort: AbortController) => ({ abort, notify: vi.fn() }),
      );
      mockExecutionService.waitForNotification.mockResolvedValue('timeout');

      const staleContext = makeActiveContext({
        hasSandbox: false,
        publishedVersionId: 'version-2',
        executionMetadata: {
          sessionId: 'existing-session',
          memorySessionIds: ['memory-1'],
          loadedPublishedVersionId: 'version-1',
          lastProcessedMessageId: 'message-1',
        },
      });

      setupLoopMocks(workerInternals, {
        context: staleContext,
        pendingMessages: [[]],
      });
      workerInternals.safeUpdateExecutionMetadata = vi.fn().mockResolvedValue({
        loadedPublishedVersionId: 'version-2',
        lastProcessedMessageId: 'message-1',
        lastStopReason: 'end_turn',
        runningState: 'idle',
      });

      await worker.executeAgentLoop('c-1', 't-1');

      expect(mockSandboxService.endConversationSandbox).toHaveBeenCalledWith(
        'c-1',
        't-1',
      );
      expect(workerInternals.safeUpdateExecutionMetadata).toHaveBeenCalledWith(
        't-1',
        'c-1',
        {
          loadedPublishedVersionId: 'version-2',
          lastProcessedMessageId: 'message-1',
          lastStopReason: 'end_turn',
          runningState: 'idle',
        },
      );

      const prepareContext = workerInternals.prepareRuntimeSession.mock
        .calls[0]?.[0] as {
        executionMetadata: Record<string, unknown>;
      };
      expect(prepareContext.executionMetadata).toMatchObject({
        loadedPublishedVersionId: 'version-2',
        lastProcessedMessageId: 'message-1',
        lastStopReason: 'end_turn',
        runningState: 'idle',
      });
      expect(prepareContext.executionMetadata.sessionId).toBeUndefined();
      expect(prepareContext.executionMetadata.memorySessionIds).toBeUndefined();
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
        expect.objectContaining({
          execution: expect.objectContaining({
            lastProcessedMessageId: 'message-0',
            sessionId: 'session-1',
          }),
        }),
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

  describe('loadConversationExecutionContext() — memory source priority', () => {
    it('应优先保留画布编译出的 memoryInstanceIds，仅在缺失时才回退 metadata 默认值', async () => {
      const contextLoader = worker as unknown as {
        loadConversationExecutionContext: (
          conversationId: string,
          tenantId: string,
        ) => Promise<{
          runtimeConfig: {
            memoryInstanceIds?: string[];
          };
          memoryInstanceIds: string[];
        } | null>;
      };

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(),
      };
      mockDb.select.mockReturnValue(selectChain);
      selectChain.limit
        .mockResolvedValueOnce([
          {
            id: 'conversation-1',
            agentDefinitionId: 'agent-1',
            tenantId: 'tenant-1',
            status: 'active',
            metadata: {},
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'agent-1',
            publishedVersionId: null,
            systemPrompt: 'system',
            nodes: [],
            edges: [],
            sandboxConfig: null,
            metadata: {
              memoryInstanceIds: ['legacy-memory-instance'],
            },
          },
        ]);
      mockAgentDefinitionService.compileCanvas.mockResolvedValue({
        modelConfig: { modelId: 'model-1' },
        memoryInstanceIds: ['canvas-memory-instance'],
        sandboxConfig: { cpu: 1, memory: 512, disk: 2, timeout: 2 },
      });

      const context = await contextLoader.loadConversationExecutionContext(
        'conversation-1',
        'tenant-1',
      );

      expect(context).toEqual(
        expect.objectContaining({
          memoryInstanceIds: ['canvas-memory-instance'],
          runtimeConfig: expect.objectContaining({
            memoryInstanceIds: ['canvas-memory-instance'],
          }),
        }),
      );
    });
  });

  describe('loadConversationExecutionContext() — sandbox config priority', () => {
    it('已发布快照存在时应优先使用节点编译出的 sandboxConfig，而不是旧 snapshot.sandboxConfig', async () => {
      const contextLoader = worker as unknown as {
        loadConversationExecutionContext: (
          conversationId: string,
          tenantId: string,
        ) => Promise<{
          runtimeConfig: {
            sandboxConfig?: {
              cpu: number;
              memory: number;
              disk: number;
              timeout: number;
            };
          };
        } | null>;
      };

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(),
      };
      mockDb.select.mockReturnValue(selectChain);
      selectChain.limit
        .mockResolvedValueOnce([
          {
            id: 'conversation-1',
            agentDefinitionId: 'agent-1',
            tenantId: 'tenant-1',
            status: 'active',
            metadata: {},
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'agent-1',
            publishedVersionId: 'version-1',
            systemPrompt: 'system',
            nodes: [],
            edges: [],
            sandboxConfig: { cpu: 1, memory: 512, disk: 2, timeout: 2 },
            metadata: {},
          },
        ])
        .mockResolvedValueOnce([
          {
            snapshot: {
              nodes: [
                {
                  id: 'agent-main',
                  type: 'agent',
                  data: { nodeType: 'agent-main' },
                },
                {
                  id: 'sandbox-node',
                  type: 'tool',
                  data: { nodeType: 'sandbox' },
                },
              ],
              edges: [
                {
                  id: 'edge-sandbox-main',
                  source: 'sandbox-node',
                  target: 'agent-main',
                  sourceHandle: 'sandbox-out',
                  targetHandle: 'sandbox-in',
                },
              ],
              sandboxConfig: { cpu: 1, memory: 512, disk: 2, timeout: 2 },
              metadata: {},
            },
          },
        ]);
      mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
        modelConfig: { modelId: 'model-1' },
        sandboxConfig: { cpu: 2, memory: 1536, disk: 5, timeout: 901 },
      });

      const context = await contextLoader.loadConversationExecutionContext(
        'conversation-1',
        'tenant-1',
      );

      expect(context).toEqual(
        expect.objectContaining({
          runtimeConfig: expect.objectContaining({
            sandboxConfig: {
              cpu: 2,
              memory: 1536,
              disk: 5,
              timeout: 901,
              conversationIdleAutoEndMinutes: 10,
            },
          }),
        }),
      );
    });

    it('快照 persisted sandboxConfig 丢失 timeoutSeconds 时应从画布节点恢复秒级超时', async () => {
      const contextLoader = worker as unknown as {
        loadConversationExecutionContext: (
          conversationId: string,
          tenantId: string,
        ) => Promise<{
          runtimeConfig: {
            sandboxConfig?: {
              cpu: number;
              memory: number;
              disk: number;
              timeout: number;
              timeoutSeconds?: number;
            };
          };
        } | null>;
      };

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(),
      };
      mockDb.select.mockReturnValue(selectChain);
      selectChain.limit
        .mockResolvedValueOnce([
          {
            id: 'conversation-1',
            agentDefinitionId: 'agent-1',
            tenantId: 'tenant-1',
            status: 'active',
            metadata: {},
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'agent-1',
            publishedVersionId: 'version-1',
            systemPrompt: 'system',
            nodes: [],
            edges: [],
            sandboxConfig: { cpu: 3, memory: 1536, disk: 6, timeout: 450 },
            metadata: {},
          },
        ])
        .mockResolvedValueOnce([
          {
            snapshot: {
              nodes: [
                {
                  id: 'agent-main',
                  type: 'agent',
                  data: { nodeType: 'agent-main' },
                },
                {
                  id: 'sandbox-node',
                  type: 'tool',
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
                  id: 'edge-sandbox-main',
                  source: 'sandbox-node',
                  target: 'agent-main',
                  sourceHandle: 'sandbox-out',
                  targetHandle: 'sandbox-in',
                },
              ],
              sandboxConfig: { cpu: 3, memory: 1536, disk: 6, timeout: 450 },
              metadata: {},
            },
          },
        ]);
      mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
        modelConfig: { modelId: 'model-1' },
      });

      const context = await contextLoader.loadConversationExecutionContext(
        'conversation-1',
        'tenant-1',
      );

      expect(context).toEqual(
        expect.objectContaining({
          runtimeConfig: expect.objectContaining({
            sandboxConfig: {
              cpu: 3,
              memory: 1536,
              disk: 6,
              timeout: 1,
              timeoutSeconds: 450,
              conversationIdleAutoEndMinutes: 10,
            },
          }),
        }),
      );
    });

    it('agent-main 存在但没有连接任何 sandbox 时应抛出显式错误', async () => {
      const contextLoader = worker as unknown as {
        loadConversationExecutionContext: (
          conversationId: string,
          tenantId: string,
        ) => Promise<unknown>;
      };

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(),
      };
      mockDb.select.mockReturnValue(selectChain);
      selectChain.limit
        .mockResolvedValueOnce([
          {
            id: 'conversation-1',
            agentDefinitionId: 'agent-1',
            tenantId: 'tenant-1',
            status: 'active',
            metadata: {},
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'agent-1',
            publishedVersionId: null,
            systemPrompt: 'system',
            nodes: [
              {
                id: 'agent-main',
                type: 'agent',
                data: { nodeType: 'agent-main' },
              },
              {
                id: 'sandbox-orphan',
                type: 'tool',
                data: { nodeType: 'sandbox', timeoutSeconds: 300 },
              },
            ],
            edges: [],
            sandboxConfig: { cpu: 1, memory: 512, disk: 2, timeout: 2 },
            metadata: {},
          },
        ]);
      mockAgentDefinitionService.compileCanvas.mockResolvedValue({
        modelConfig: { modelId: 'model-1' },
      });

      await expect(
        contextLoader.loadConversationExecutionContext(
          'conversation-1',
          'tenant-1',
        ),
      ).rejects.toThrow(AgentSandboxNotConnectedException);
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
        providerId: 'provider-1',
        modelId: 'claude-opus-4-6',
        modelType: 'chat',
        isEnabled: true,
        capabilities: {},
        contextWindow: null,
        maxOutputTokens: null,
        pricing: null,
        metadataSource: null,
        embeddingDimensions: null,
        parameters: { baseUrl: 'https://models.example.test/v1' },
        timeoutMs: 120000,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        provider: {
          id: 'provider-1',
          orgId: 'org-1',
          tenantId: 'tenant-1',
          slug: 'private_cloud',
          name: 'Private Cloud',
          iconUrl: null,
          baseUrl: 'https://models.example.test/v1',
          defaultBaseUrl: null,
          isBuiltin: false,
          isEnabled: true,
          apiProtocol: 'openai_chat',
          apiKeyId: 'api-key-1',
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
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
              apiProtocol: 'openai_chat',
              apiBaseUrl: 'https://models.example.test/v1',
              apiKeyId: 'api-key-1',
              organizationId: 'org-1',
              tenantId: 'tenant-1',
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

    it('smart-routing 候选模型存在时应在建会话前选中运行模型', async () => {
      const runtimeSessionWorker = worker as unknown as {
        prepareRuntimeSession: (
          context: Record<string, unknown>,
          conversationId: string,
          tenantId: string,
          parentAbortSignal: AbortSignal,
          subAgentTracker: { abortControllers: Map<string, AbortController> },
          currentAgentDefinitionId: string,
          initialPendingMessages?: Array<{
            id: string;
            content: string;
            createdAt: Date;
          }>,
        ) => Promise<{
          runtime: typeof mockSandboxRuntime;
          session: ReturnType<typeof makeSession>;
        }>;
      };

      mockSmartRoutingService.evaluate.mockResolvedValue({
        selectedModelId: 'model-2',
        strategy: 'FALLBACK_CHAIN',
        reasoning: '优先使用第二个候选模型',
        evaluatedModels: [],
        latencyMs: 7,
      });
      mockLlmService.findById.mockImplementation(async (id: string) => ({
        id,
        orgId: 'org-1',
        tenantId: 'tenant-1',
        name: `Model ${id}`,
        providerId: 'provider-1',
        modelId: id === 'model-2' ? 'claude-sonnet-4-6' : 'claude-opus-4-6',
        modelType: 'chat',
        isEnabled: true,
        capabilities: {},
        contextWindow: null,
        maxOutputTokens: null,
        pricing: null,
        metadataSource: null,
        embeddingDimensions: null,
        parameters: { baseUrl: 'https://models.example.test/v1' },
        timeoutMs: 120000,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        provider: {
          id: 'provider-1',
          orgId: 'org-1',
          tenantId: 'tenant-1',
          slug: 'private_cloud',
          name: 'Private Cloud',
          iconUrl: null,
          baseUrl: 'https://models.example.test/v1',
          defaultBaseUrl: null,
          isBuiltin: false,
          isEnabled: true,
          apiProtocol: 'openai_chat',
          apiKeyId: 'api-key-1',
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }));
      mockSandboxRuntime.createSession.mockResolvedValue(
        makeSession({ id: 'sandbox-session-routing' }),
      );

      await runtimeSessionWorker.prepareRuntimeSession(
        makeActiveContext({
          runtimeConfig: {
            sandboxConfig: { image: 'agentloom/sandbox:latest' },
            routingConfig: {
              strategy: 'FALLBACK_CHAIN',
              candidateModelIds: ['model-1', 'model-2'],
            },
          },
        }),
        'conversation-1',
        'tenant-1',
        new AbortController().signal,
        { abortControllers: new Map() },
        'agent-1',
        [{ id: 'message-1', content: '请总结这个需求', createdAt: new Date() }],
      );

      expect(mockSmartRoutingService.evaluate).toHaveBeenCalledWith(
        ['model-1', 'model-2'],
        expect.objectContaining({
          taskType: 'agent_conversation',
          inputTokenCount: expect.any(Number),
        }),
        'FALLBACK_CHAIN',
        'tenant-1',
      );
      expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith(
        expect.objectContaining({
          piConfigInput: expect.objectContaining({
            modelConfig: expect.objectContaining({
              model: 'claude-sonnet-4-6',
            }),
          }),
        }),
      );
      expect(mockSandboxRuntime.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          llmModelConfigId: 'model-2',
          runtimeConfig: expect.objectContaining({
            modelConfig: expect.objectContaining({
              modelId: 'model-2',
            }),
          }),
        }),
      );
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
              provider: 'openai',
              apiProtocol: 'openai_responses',
              modelName: 'gpt-5.4',
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
              provider: 'openai',
              apiProtocol: 'openai_responses',
              model: 'gpt-5.4',
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
          files: {
            'SKILL.md': '# Skill Body',
            'resource-management.md': '## Resource management',
          },
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
                files: {
                  'SKILL.md': '# Skill Body',
                  'resource-management.md': '## Resource management',
                },
              },
            ],
          }),
        }),
      );
    });

    it('runtimeConfig.skillIds 缺失时不应把未连接到 agent-main 的 skill 兜底注入', () => {
      const skillResolverWorker = worker as unknown as {
        resolveConfiguredSkillIds: (
          runtimeSkillIds: string[] | undefined,
          nodes: Array<Record<string, unknown>>,
          edges: Array<Record<string, unknown>>,
        ) => string[];
      };

      const skillIds = skillResolverWorker.resolveConfiguredSkillIds(
        undefined,
        [
          { id: 'main', type: 'agent', data: { nodeType: 'agent-main' } },
          {
            id: 'model-connected',
            type: 'agent',
            data: { nodeType: 'llm-model', config: { modelId: 'model-1' } },
          },
          {
            id: 'skill-orphan',
            type: 'knowledge',
            data: { nodeType: 'skill', config: { skillId: 'skill-orphan' } },
          },
        ],
        [
          {
            source: 'model-connected',
            target: 'main',
            targetHandle: 'model-in',
          },
        ],
      );

      expect(skillIds).toEqual([]);
    });

    it('无 sandbox 运行时缺少 sandboxConfig 也应直接走 in-process runtime', async () => {
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
      mockAdapterFactory.selectAdapter.mockImplementation((hasSandbox) =>
        hasSandbox ? mockSandboxRuntime : mockRuntime,
      );

      const runtimeSession = await runtimeSessionWorker.prepareRuntimeSession(
        makeActiveContext({
          hasSandbox: false,
          runtimeConfig: {
            runtimeMode: 'no_sandbox',
            modelConfig: { modelId: 'model-1' },
          },
        }),
        'conversation-1',
        'tenant-1',
        new AbortController().signal,
        { abortControllers: new Map() },
        'agent-1',
      );

      expect(mockAdapterFactory.selectAdapter).toHaveBeenCalledWith(false);
      expect(mockSandboxService.createSandboxSession).not.toHaveBeenCalled();
      expect(mockSandboxRuntime.createSession).not.toHaveBeenCalled();
      expect(mockRuntime.createSession).toHaveBeenCalledTimes(1);
      expect(runtimeSession.runtime).toBe(mockRuntime);
    });
  });

  describe('registerSelfEvolutionToolsProvider()', () => {
    it('启用 selfEvolutionPolicy 时应注册 self-evolution tools provider', async () => {
      const runtime = {
        registerSessionToolProvider: vi.fn(),
      };
      const provider = vi.fn();
      mockSelfEvolutionToolsProvider.createSessionToolProvider.mockReturnValue(
        provider,
      );
      mockDb.select
        .mockImplementationOnce(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ createdBy: 'user-1' }]),
            }),
          }),
        }))
        .mockImplementationOnce(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ name: '当前 Agent' }]),
            }),
          }),
        }));

      await (worker as any).registerSelfEvolutionToolsProvider({
        runtime,
        sessionId: 'session-1',
        runtimeConfig: {
          selfEvolutionPolicy: {
            enabled: true,
            resourceManagement: true,
            externalEditing: true,
            sandboxManagement: true,
          },
        },
        conversationId: 'conversation-1',
        tenantId: 'tenant-1',
        currentAgentDefinitionId: 'agent-1',
      });

      expect(
        mockSelfEvolutionToolsProvider.createSessionToolProvider,
      ).toHaveBeenCalledWith({
        sessionId: 'session-1',
        conversationId: 'conversation-1',
        tenantId: 'tenant-1',
        currentAgentDefinitionId: 'agent-1',
        runtimeConfig: {
          selfEvolutionPolicy: {
            enabled: true,
            resourceManagement: true,
            externalEditing: true,
            sandboxManagement: true,
          },
        },
        actorUserId: 'user-1',
        currentAgentName: '当前 Agent',
      });
      expect(runtime.registerSessionToolProvider).toHaveBeenCalledWith(
        'session-1',
        provider,
      );
    });
  });

  describe('runConversationTurn() — tool event merge', () => {
    it('input-preprocessor 存在时应在 runtime.prompt 前改写最新用户输入', async () => {
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
        }>;
      };

      mockRuntime.prompt.mockReturnValueOnce(
        createAsyncIterable([{ type: 'done', stopReason: 'end_turn' }]),
      );

      await turnWorker.runConversationTurn(
        mockRuntime as never,
        makeSession({
          runtimeConfig: {
            inputPreprocessors: [
              {
                type: 'script',
                config: {
                  expression:
                    "({ marker: 'PREPROCESSED', value: input.text.toUpperCase() })",
                },
              },
            ],
          },
        }),
        'conversation-1',
        'tenant-1',
        [{ id: 'message-1', content: 'hello', createdAt: new Date() }],
        false,
      );

      expect(mockRuntime.prompt).toHaveBeenCalledWith('session-1', [
        {
          type: 'text',
          text: '{\n  "marker": "PREPROCESSED",\n  "value": "HELLO"\n}',
        },
      ]);
    });

    it('input-preprocessor 应兼容 template 别名配置', async () => {
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
        }>;
      };

      mockRuntime.prompt.mockReturnValueOnce(
        createAsyncIterable([{ type: 'done', stopReason: 'end_turn' }]),
      );

      await turnWorker.runConversationTurn(
        mockRuntime as never,
        makeSession({
          runtimeConfig: {
            inputPreprocessors: [
              {
                type: 'template',
                config: {
                  template: '预处理={{text}}',
                  output_format: 'text',
                },
              },
            ],
          },
        }),
        'conversation-1',
        'tenant-1',
        [{ id: 'message-1', content: 'hello', createdAt: new Date() }],
        false,
      );

      expect(mockRuntime.prompt).toHaveBeenCalledWith('session-1', [
        {
          type: 'text',
          text: '预处理=hello',
        },
      ]);
    });

    it('有沙箱附件消息应先写入工作区，再把附件 block 传给 runtime', async () => {
      const turnWorker = worker as unknown as {
        runConversationTurn: (
          runtime: typeof mockRuntime,
          session: ReturnType<typeof makeSession>,
          conversationId: string,
          tenantId: string,
          pendingMessages: Array<{
            id: string;
            content: string;
            contentType: string;
            metadata: Record<string, unknown>;
            createdAt: Date;
          }>,
          hasPriorTurns: boolean,
        ) => Promise<{
          assistantText: string;
          stopReason: string;
        }>;
      };

      mockWorkspaceIntegrationService.stageConversationAttachment.mockResolvedValue(
        '/workspace/uploads/design.png',
      );
      mockRuntime.prompt.mockReturnValueOnce(
        createAsyncIterable([{ type: 'done', stopReason: 'end_turn' }]),
      );

      await turnWorker.runConversationTurn(
        mockRuntime as never,
        makeSession({
          runtimeConfig: {
            runtimeMode: 'sandbox',
          },
        }),
        'conversation-1',
        'tenant-1',
        [
          {
            id: 'message-1',
            content: '请分析这张图',
            contentType: 'image',
            metadata: {
              attachment: {
                kind: 'image',
                fileName: 'design.png',
                mimeType: 'image/png',
                sizeBytes: 32,
                dataBase64: 'cG5n',
              },
            },
            createdAt: new Date(),
          },
        ],
        false,
      );

      expect(
        mockWorkspaceIntegrationService.stageConversationAttachment,
      ).toHaveBeenCalledWith('conversation-1', 'tenant-1', {
        attachment: {
          kind: 'image',
          fileName: 'design.png',
          mimeType: 'image/png',
          sizeBytes: 32,
          dataBase64: 'cG5n',
        },
      });
      expect(mockRuntime.prompt).toHaveBeenCalledWith(
        'session-1',
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: '请分析这张图',
          }),
          expect.objectContaining({
            type: 'text',
            text: '该附件已写入工作区：/workspace/uploads/design.png。如需查看原文件，请直接读取该路径。',
          }),
          expect.objectContaining({
            type: 'image',
            data: 'cG5n',
            mimeType: 'image/png',
          }),
        ]),
      );
    });

    it('多附件消息应为每个附件分别写入工作区并传给 runtime', async () => {
      const turnWorker = worker as unknown as {
        runConversationTurn: (
          runtime: typeof mockRuntime,
          session: ReturnType<typeof makeSession>,
          conversationId: string,
          tenantId: string,
          pendingMessages: Array<{
            id: string;
            content: string;
            contentType: string;
            metadata: Record<string, unknown>;
            createdAt: Date;
          }>,
          hasPriorTurns: boolean,
        ) => Promise<{
          assistantText: string;
          stopReason: string;
        }>;
      };

      mockWorkspaceIntegrationService.stageConversationAttachment
        .mockResolvedValueOnce('/workspace/uploads/design.png')
        .mockResolvedValueOnce('/workspace/uploads/notes.txt');
      mockRuntime.prompt.mockReturnValueOnce(
        createAsyncIterable([{ type: 'done', stopReason: 'end_turn' }]),
      );

      await turnWorker.runConversationTurn(
        mockRuntime as never,
        makeSession({
          runtimeConfig: {
            runtimeMode: 'sandbox',
          },
        }),
        'conversation-1',
        'tenant-1',
        [
          {
            id: 'message-2',
            content: '请同时分析这两个附件',
            contentType: 'text',
            metadata: {
              attachments: [
                {
                  kind: 'image',
                  fileName: 'design.png',
                  mimeType: 'image/png',
                  sizeBytes: 32,
                  dataBase64: 'cG5n',
                },
                {
                  kind: 'file',
                  fileName: 'notes.txt',
                  mimeType: 'text/plain',
                  sizeBytes: 24,
                  textContent: 'ATTACH-QA-20260406',
                },
              ],
            },
            createdAt: new Date(),
          },
        ],
        false,
      );

      expect(
        mockWorkspaceIntegrationService.stageConversationAttachment,
      ).toHaveBeenNthCalledWith(1, 'conversation-1', 'tenant-1', {
        attachment: {
          kind: 'image',
          fileName: 'design.png',
          mimeType: 'image/png',
          sizeBytes: 32,
          dataBase64: 'cG5n',
        },
      });
      expect(
        mockWorkspaceIntegrationService.stageConversationAttachment,
      ).toHaveBeenNthCalledWith(2, 'conversation-1', 'tenant-1', {
        attachment: {
          kind: 'file',
          fileName: 'notes.txt',
          mimeType: 'text/plain',
          sizeBytes: 24,
          textContent: 'ATTACH-QA-20260406',
        },
      });
      expect(mockRuntime.prompt).toHaveBeenCalledWith(
        'session-1',
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: '该附件已写入工作区：/workspace/uploads/design.png。如需查看原文件，请直接读取该路径。',
          }),
          expect.objectContaining({
            type: 'text',
            text: '该附件已写入工作区：/workspace/uploads/notes.txt。如需查看原文件，请直接读取该路径。',
          }),
          expect.objectContaining({
            type: 'image',
            data: 'cG5n',
            mimeType: 'image/png',
          }),
          expect.objectContaining({
            type: 'resource',
            uri: 'file:///workspace/uploads/notes.txt',
            text: 'ATTACH-QA-20260406',
            mimeType: 'text/plain',
          }),
        ]),
      );
    });

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

    it('应把本轮子代理实时流打包进 turnResult，供历史瀑布回放', async () => {
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
          subAgentStreams: Record<string, unknown>;
        }>;
      };

      mockEventBridge.beginSubAgentConversationCapture.mockReturnValueOnce(
        'capture-subagent-1',
      );
      mockEventBridge.consumeSubAgentConversationCapture.mockReturnValueOnce({
        sa_hist_1: {
          handle: 'sa_hist_1',
          alias: 'researcher',
          depth: 1,
          parentToolCallId: 'tool-parent',
          status: 'completed',
          startedAt: 1_700_000_000_000,
          completedAt: 1_700_000_001_000,
          events: [
            {
              id: 'evt-1',
              type: 'message_chunk',
              payload: { chunk: '历史子代理输出' },
              timestamp: 1_700_000_000_100,
            },
          ],
        },
      });
      mockRuntime.prompt.mockReturnValueOnce(
        createAsyncIterable([
          { type: 'message_chunk', content: '主 agent 正文' },
          { type: 'done', stopReason: 'end_turn' },
        ]),
      );

      const result = await turnWorker.runConversationTurn(
        mockRuntime as never,
        makeSession(),
        'conversation-1',
        'tenant-1',
        [{ id: 'message-1', content: '继续分析', createdAt: new Date() }],
        true,
      );

      expect(
        mockEventBridge.beginSubAgentConversationCapture,
      ).toHaveBeenCalledWith('conversation-1');
      expect(
        mockEventBridge.consumeSubAgentConversationCapture,
      ).toHaveBeenCalledWith('conversation-1', 'capture-subagent-1');
      expect(
        mockEventBridge.clearSubAgentConversationCapture,
      ).toHaveBeenCalledWith('conversation-1', 'capture-subagent-1');
      expect(result.subAgentStreams).toEqual({
        sa_hist_1: expect.objectContaining({
          handle: 'sa_hist_1',
          alias: 'researcher',
          status: 'completed',
        }),
      });
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

      mockEventBridge.beginSubAgentConversationCapture.mockReturnValueOnce(
        'capture-subagent-error',
      );
      mockEventBridge.consumeSubAgentConversationCapture.mockReturnValueOnce({
        sa_failed_1: {
          handle: 'sa_failed_1',
          alias: 'writer',
          depth: 1,
          parentToolCallId: 'tool-parent',
          status: 'failed',
          startedAt: 1_700_000_000_000,
          completedAt: 1_700_000_001_000,
          error: 'terminated',
          events: [
            {
              id: 'evt-1',
              type: 'status_changed',
              payload: { status: 'failed', error: 'terminated' },
              timestamp: 1_700_000_001_000,
            },
          ],
        },
      });
      mockRuntime.prompt.mockReturnValueOnce(
        createFailingAsyncIterable(
          [
            { type: 'message_chunk', content: '已经抓到第一批线索。' },
            {
              type: 'tool_call',
              call: {
                id: 'tool-1',
                tool: 'git.clone',
                args: {
                  repo: 'https://github.com/Dataojitori/nocturne_memory',
                },
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
          subAgentStreams: {
            sa_failed_1: expect.objectContaining({
              handle: 'sa_failed_1',
              status: 'failed',
            }),
          },
        },
      });
      expect(
        mockEventBridge.clearSubAgentConversationCapture,
      ).toHaveBeenCalledWith('conversation-1', 'capture-subagent-error');
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

  it('有沙箱对话在每轮落库后应刷新工作区目录树快照', async () => {
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
        hasSandbox: true,
        executionMetadata: {},
      });
    workerInternals.prepareRuntimeSession = vi.fn().mockResolvedValue({
      runtime: mockSandboxRuntime,
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
        { id: 'message-1', content: '读取工作区文件', createdAt: new Date() },
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

    mockSandboxRuntime.prompt.mockReturnValueOnce(
      createAsyncIterable([
        { type: 'message_chunk', content: '处理完成' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );

    await worker.executeAgentLoop('conversation-1', 'tenant-1');

    expect(
      mockWorkspaceIntegrationService.captureConversationWorkspaceTreeSnapshot,
    ).toHaveBeenCalledWith('conversation-1', 'tenant-1');
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

  it('有沙箱且对话仍 active 时，完成收口后应调度 idle auto end', async () => {
    setupLoopMocks(workerInternals);
    workerInternals.loadConversationExecutionContext = vi
      .fn()
      .mockResolvedValue(makeActiveContext({ hasSandbox: true }));
    mockExecutionService.waitForNotification.mockResolvedValue('timeout');

    await worker.executeAgentLoop('conversation-1', 'tenant-1');

    expect(
      mockSandboxService.scheduleConversationIdleAutoEnd,
    ).toHaveBeenCalledWith('conversation-1', 'tenant-1');
  });

  it('取消收口时不应调度 idle auto end', async () => {
    setupLoopMocks(workerInternals, {
      context: makeActiveContext({ hasSandbox: true }),
    });
    mockExecutionService.waitForNotification.mockResolvedValueOnce('aborted');

    await worker.executeAgentLoop('conversation-1', 'tenant-1');

    expect(
      mockSandboxService.scheduleConversationIdleAutoEnd,
    ).not.toHaveBeenCalled();
  });

  describe('branch contracts — runtime defaults and failures', () => {
    it('model routing covers absent, single, unsupported, empty-decision and thrown strategies', async () => {
      const unchanged = { modelConfig: { modelId: 'model-original' } };
      await expect(
        workerInternals.resolveConversationStartupRuntimeConfig(
          unchanged,
          'tenant-1',
          [],
        ),
      ).resolves.toBe(unchanged);

      await expect(
        workerInternals.selectConversationRoutingModelId({
          tenantId: 'tenant-1',
          routingConfig: {},
          candidateModelIds: ['model-only'],
          pendingMessages: [],
        }),
      ).resolves.toBe('model-only');
      expect(mockSmartRoutingService.evaluate).not.toHaveBeenCalled();

      await expect(
        workerInternals.selectConversationRoutingModelId({
          tenantId: 'tenant-1',
          routingConfig: { strategy: 'unsupported-strategy' },
          candidateModelIds: ['model-first', 'model-second'],
          pendingMessages: [],
        }),
      ).resolves.toBe('model-first');

      mockSmartRoutingService.evaluate.mockResolvedValueOnce({
        selectedModelId: undefined,
      });
      const noDecisionConfig = {
        routingConfig: {
          strategy: 'FALLBACK_CHAIN',
          candidateModelIds: ['model-first', 'model-second'],
        },
      };
      await expect(
        workerInternals.resolveConversationStartupRuntimeConfig(
          noDecisionConfig,
          'tenant-1',
          [],
        ),
      ).resolves.toBe(noDecisionConfig);

      mockSmartRoutingService.evaluate.mockRejectedValueOnce(
        'routing service unavailable',
      );
      await expect(
        workerInternals.selectConversationRoutingModelId({
          tenantId: 'tenant-1',
          routingConfig: { strategy: 'FALLBACK_CHAIN' },
          candidateModelIds: ['model-first', 'model-second'],
          pendingMessages: [{ content: 'route this request' }],
        }),
      ).resolves.toBe('model-first');
    });

    it('restores an existing sandbox runtime session and reuses its watcher binding', async () => {
      mockAdapterFactory.selectAdapter.mockReturnValue(mockSandboxRuntime);
      mockSandboxService.findByConversationId.mockResolvedValue({
        id: 'sandbox-session-1',
        runtimeHandle: 'runtime-handle-1',
      });
      mockSkillResolverService.resolveSkillsForAgent.mockResolvedValue([]);
      mockSandboxRuntime.loadSession.mockResolvedValue(
        makeSession({ id: 'restored-session-1' }),
      );

      const result = await workerInternals.prepareRuntimeSession(
        makeActiveContext({
          runtimeConfig: {
            runtimeMode: 'sandbox',
            sandboxConfig: { image: 'agentloom/sandbox:latest' },
            modelConfig: { modelId: 'model-1' },
          },
          executionMetadata: { sessionId: 'restored-session-1' },
        }),
        'conversation-1',
        'tenant-1',
        new AbortController().signal,
        { abortControllers: new Map() },
        'agent-1',
      );

      expect(result).toEqual(
        expect.objectContaining({
          session: expect.objectContaining({ id: 'restored-session-1' }),
          restoredExistingSession: true,
          sandboxReused: true,
        }),
      );
      expect(mockSandboxRuntime.createSession).not.toHaveBeenCalled();
      expect(
        mockWorkspaceIntegrationService.startFileWatcher,
      ).toHaveBeenCalledWith('conversation-1', 'tenant-1', 'runtime-handle-1');
    });

    it('workspace watcher ignores a missing handle and starts for a concrete handle', async () => {
      mockSandboxService.findByConversationId
        .mockResolvedValueOnce({ id: 'sandbox-without-handle' })
        .mockResolvedValueOnce({
          id: 'sandbox-with-handle',
          runtimeHandle: 'runtime-handle-2',
        });

      await workerInternals.startConversationWorkspaceWatcher(
        'conversation-1',
        'tenant-1',
      );
      expect(
        mockWorkspaceIntegrationService.startFileWatcher,
      ).not.toHaveBeenCalled();

      await workerInternals.startConversationWorkspaceWatcher(
        'conversation-1',
        'tenant-1',
      );
      expect(
        mockWorkspaceIntegrationService.startFileWatcher,
      ).toHaveBeenCalledWith('conversation-1', 'tenant-1', 'runtime-handle-2');
    });

    it('normalizes definition and snapshot runtime-mode defaults', () => {
      expect(
        workerInternals.resolveAgentRuntimeMode('no_sandbox', 'sandbox'),
      ).toBe('sandbox');
      expect(
        workerInternals.resolveAgentRuntimeMode('sandbox', 'no_sandbox'),
      ).toBe('no_sandbox');
      expect(
        workerInternals.resolveAgentRuntimeMode('no_sandbox', undefined),
      ).toBe('no_sandbox');
      expect(
        workerInternals.resolveAgentRuntimeMode('unexpected', undefined),
      ).toBe('sandbox');
    });
  });

  describe('branch contracts — attachments, memory, loop and retry', () => {
    it('keeps messages unchanged for optional attachment paths and staging failures', async () => {
      const plain = {
        id: 'plain',
        content: 'plain message',
        metadata: {},
        createdAt: new Date(),
      };
      await expect(
        workerInternals.materializePendingMessagesForRuntime(
          [plain],
          'conversation-1',
          'tenant-1',
          'no_sandbox',
        ),
      ).resolves.toEqual([plain]);

      mockWorkspaceIntegrationService.stageConversationAttachment
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce('stage unavailable');
      const attachment = {
        kind: 'file',
        fileName: 'notes.txt',
        mimeType: 'text/plain',
        sizeBytes: 4,
        textContent: 'note',
      };
      const unstaged = {
        id: 'unstaged',
        content: 'first',
        metadata: { attachment },
        createdAt: new Date(),
      };
      const failed = {
        id: 'failed',
        content: 'second',
        metadata: { attachment },
        createdAt: new Date(),
      };

      await expect(
        workerInternals.materializePendingMessagesForRuntime(
          [plain, unstaged, failed],
          'conversation-1',
          'tenant-1',
          'sandbox',
        ),
      ).resolves.toEqual([plain, unstaged, failed]);
    });

    it('sub-agent prompt retries after tool_use, forwards events and preserves decision', async () => {
      const emitEvent = vi.fn();
      mockRuntime.prompt
        .mockReturnValueOnce(
          createAsyncIterable([
            { type: 'message_chunk', content: 'first ' },
            {
              type: 'decision',
              action: 'delegate',
              reasoning: 'need a tool',
            },
            { type: 'done', stopReason: 'tool_use' },
          ]),
        )
        .mockReturnValueOnce(
          createAsyncIterable([
            { type: 'message_chunk', content: 'second' },
            { type: 'done', stopReason: 'end_turn' },
          ]),
        );

      const result = await workerInternals.runSubAgentPrompt(
        mockRuntime,
        makeSession(),
        ' inspect ',
        '  extra context  ',
        { emitEvent },
      );

      expect(mockRuntime.prompt).toHaveBeenNthCalledWith(2, 'session-1', []);
      expect(emitEvent).toHaveBeenCalledTimes(5);
      expect(result).toEqual(
        expect.objectContaining({
          content: 'first second',
          stopReason: 'end_turn',
          decision: expect.objectContaining({ action: 'delegate' }),
        }),
      );
      expect(workerInternals.buildSubAgentPrompt('plain task', '   ')).toBe(
        'plain task',
      );
      expect(
        workerInternals.buildSubAgentPrompt(' inspect ', ' context '),
      ).toContain('额外上下文：\ncontext');
    });

    it('memory tools and cleanup skip absent optional inputs without side effects', async () => {
      workerInternals.registerMemoryToolsProvider(mockRuntime, 'session-1', []);
      await workerInternals.cleanupConversationMemorySessions(
        'tenant-1',
        undefined,
      );

      expect(
        mockMemoryToolsService.createSessionToolProvider,
      ).not.toHaveBeenCalled();
      expect(mockDb.select).not.toHaveBeenCalled();
      expect(mockMemoryResourceProvider.destroy).not.toHaveBeenCalled();
    });
  });

  describe('branch contracts — observable error metadata', () => {
    it('describes unknown, provider and upstream failures without losing raw details', () => {
      expect(
        workerInternals.describeConversationExecutionError('plain failure'),
      ).toEqual({
        errorMessage: 'Agent conversation execution failed',
      });

      const providerError = Object.assign(new Error('provider rejected'), {
        code: 'MODEL_PROVIDER_ERROR',
        rawMessage: 'provider raw detail',
      });
      expect(
        workerInternals.describeConversationExecutionError(providerError),
      ).toEqual({
        errorMessage:
          '模型提供方错误（MODEL_PROVIDER_ERROR: provider raw detail）',
        errorCode: 'MODEL_PROVIDER_ERROR',
        rawErrorMessage: 'provider raw detail',
      });

      expect(
        workerInternals.describeConversationExecutionError(
          new Error('stream terminated unexpectedly'),
        ),
      ).toEqual({
        errorMessage: '上游模型流中断（stream terminated unexpectedly）',
        rawErrorMessage: 'stream terminated unexpectedly',
      });
    });

    it('emits preparation defaults and optional failure metadata', () => {
      workerInternals.emitPreparationPhase(
        'tenant-1',
        'conversation-1',
        'queued',
      );
      workerInternals.emitPreparationPhase(
        'tenant-1',
        'conversation-1',
        'running',
        {
          sandboxReused: false,
          failedPhase: 'sandbox_creating',
          error: 'sandbox unavailable',
        },
      );

      expect(
        mockEventBridge.emitExecutionStatusChanged,
      ).toHaveBeenNthCalledWith(1, 'tenant-1', 'conversation-1', {
        executionId: 'conversation-1',
        status: 'preparing',
        executionType: 'conversation',
        phase: 'queued',
      });
      expect(
        mockEventBridge.emitExecutionStatusChanged,
      ).toHaveBeenNthCalledWith(
        2,
        'tenant-1',
        'conversation-1',
        expect.objectContaining({
          status: 'running',
          sandboxReused: false,
          failedPhase: 'sandbox_creating',
          error: 'sandbox unavailable',
        }),
      );
    });
  });
});

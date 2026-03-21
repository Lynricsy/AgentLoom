import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentDefinitionService } from '../../agent-definition/agent-definition.service';
import { EventBridgeService } from '../../execution/services/event-bridge.service';
import { SandboxService } from '../../sandbox/sandbox.service';
import { AgentExecutionService } from '../agent-execution.service';
import { AgentExecutionWorker } from '../agent-execution.worker';

const {
  mockRuntime,
  mockAdapterFactory,
  mockExecutionService,
  mockEventBridge,
  mockSandboxService,
  mockAgentDefinitionService,
} = vi.hoisted(() => ({
  mockRuntime: {
    prompt: vi.fn(),
    cancel: vi.fn(),
    createSession: vi.fn(),
    loadSession: vi.fn(),
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
};

describe('AgentExecutionWorker', () => {
  let worker: AgentExecutionWorker;
  let workerInternals: WorkerInternals;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAdapterFactory.selectAdapter.mockReturnValue(mockRuntime);

    worker = new AgentExecutionWorker(
      {} as never,
      mockRuntime as never,
      mockAdapterFactory as never,
      mockExecutionService as never,
      mockEventBridge as never,
      mockSandboxService as never,
      mockAgentDefinitionService as never,
    );
    workerInternals = worker as unknown as WorkerInternals;
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

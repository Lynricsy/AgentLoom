import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentExecutionWorker } from '../agent-execution.worker';
import type { AgentSubAgentRef } from '../../agent-definition/agent-runtime-config.interface';
import { MAX_SUB_AGENT_DEPTH } from '../../execution/node-handlers/sub-agent.handler';
import {
  type ExecuteSubAgent,
  SubAgentToolsProvider,
} from './subagent-tools.provider';
import {
  SubAgentRunStatus,
  type SubAgentHandle,
  type SubAgentResult,
} from './subagent-execution.types';

const {
  mockDb,
  mockRuntime,
  mockAdapterFactory,
  mockExecutionService,
  mockEventBridge,
  mockSandboxService,
  mockWorkspaceIntegrationService,
  mockAgentDefinitionService,
  mockSubAgentToolsProvider,
  mockRunInTenantTransaction,
  mockTransactionExit,
} = vi.hoisted(() => ({
  mockDb: {},
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
  mockWorkspaceIntegrationService: {
    startFileWatcher: vi.fn(),
  },
  mockAgentDefinitionService: {
    findDetailById: vi.fn(),
    listVersions: vi.fn(),
    compileCanvas: vi.fn(),
    buildRuntimeConfigFromNodes: vi.fn(),
  },
  mockSubAgentToolsProvider: {
    createSessionToolProvider: vi.fn(),
  },
  mockRunInTenantTransaction: vi.fn(
    async (
      db: unknown,
      _tenantId: string,
      operation: (tenantDb: unknown) => Promise<unknown>,
    ) => operation(db),
  ),
  mockTransactionExit: vi.fn((callback: () => unknown) => callback()),
}));

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: mockRunInTenantTransaction,
  transactionStorage: {
    exit: mockTransactionExit,
  },
}));

const DEFAULT_REFS: AgentSubAgentRef[] = [
  {
    agentDefinitionId: 'agent-writer',
    agentVersionId: 'version-writer',
    alias: 'writer',
    description: '负责写作',
    maxTimeoutMs: 5_000,
  },
  {
    agentDefinitionId: 'agent-researcher',
    agentVersionId: 'version-researcher',
    alias: 'researcher',
    description: '负责调研',
    maxTimeoutMs: 5_000,
  },
];

const DEFAULT_PARENT_CONTEXT = {
  conversationId: 'conversation-int-1',
  depth: 0,
  tenantId: 'tenant-1',
  parentUsesSandboxRuntime: false,
  visitedAgentIds: new Set<string>(['parent-agent']),
};

const AGENT_DETAIL = {
  id: 'agent-writer',
  tenantId: 'tenant-1',
  name: 'Writer Agent',
  slug: 'writer',
  description: null,
  runtimeMode: 'no_sandbox' as const,
  status: 'published' as const,
  version: 1,
  publishedVersionId: 'version-writer',
  createdBy: 'user-1',
  updatedBy: 'user-1',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  systemPrompt: null,
  nodes: [],
  edges: [],
  viewport: null,
  sandboxConfig: null,
  workspaceSnapshotId: null,
};

const VERSION_RESPONSE = {
  id: 'version-writer',
  agentDefinitionId: 'agent-writer',
  versionNumber: 1,
  label: 'v1',
  snapshot: {
    runtimeMode: 'no_sandbox' as const,
    nodes: [],
    edges: [],
    viewport: null,
    metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 },
  },
  publishedAt: '2025-01-01T00:00:00.000Z',
  archivedAt: null,
  createdBy: 'user-1',
  createdAt: '2025-01-01T00:00:00.000Z',
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createRealProvider() {
  return new SubAgentToolsProvider(
    mockDb as never,
    mockAgentDefinitionService as never,
    mockEventBridge as never,
  );
}

async function createToolSet(
  executeSubAgent: ExecuteSubAgent,
  refs: AgentSubAgentRef[] = DEFAULT_REFS,
  parentContext = DEFAULT_PARENT_CONTEXT,
) {
  return createRealProvider().createSessionToolProvider(
    refs,
    parentContext,
    executeSubAgent,
  )();
}

function createExecuteOptions(toolCallId = 'tool-call-1') {
  return {
    toolCallId,
    messages: [],
    abortSignal: undefined,
  } as never;
}

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
    id: 'session-int-1',
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
    runtimeMode: 'no_sandbox',
    nodes: [],
    edges: [],
    sandboxConfig: null,
    ...overrides,
  };
}

function createWorker() {
  return new AgentExecutionWorker(
    {} as never,
    mockRuntime as never,
    mockAdapterFactory as never,
    mockExecutionService as never,
    mockEventBridge as never,
    mockSandboxService as never,
    mockWorkspaceIntegrationService as never,
    mockAgentDefinitionService as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    mockSubAgentToolsProvider as never,
  );
}

describe('Sub-Agent Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentDefinitionService.findDetailById.mockResolvedValue(AGENT_DETAIL);
    mockAgentDefinitionService.listVersions.mockResolvedValue({
      data: [VERSION_RESPONSE],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });
    mockAgentDefinitionService.compileCanvas.mockResolvedValue({});
    mockAdapterFactory.selectAdapter.mockReturnValue(mockRuntime);
    mockRuntime.createSession.mockResolvedValue(makeSession());
    mockRuntime.prompt.mockReturnValue(
      createAsyncIterable([
        { type: 'message_chunk', content: 'sub-agent result text' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );
    mockExecutionService.injectMessage.mockResolvedValue(undefined);
    mockSubAgentToolsProvider.createSessionToolProvider.mockReturnValue(
      () => ({}),
    );
  });

  describe('1. Full chain: canvas → compile → register → call → result', () => {
    it('从画布配置出发，编译子代理引用，调用 call_subagent 并返回 JSON 字符串结果', async () => {
      const canvasSubAgentRefs: AgentSubAgentRef[] = [
        {
          agentDefinitionId: 'agent-writer',
          agentVersionId: 'version-writer',
          alias: 'writer',
          description: '负责写作',
          maxTimeoutMs: 5_000,
        },
      ];

      const executeSubAgent: ExecuteSubAgent = vi.fn().mockResolvedValue({
        content: 'The analysis is complete.',
        stopReason: 'end_turn',
      } satisfies SubAgentResult);

      const tools = await createToolSet(executeSubAgent, canvasSubAgentRefs);

      const result = await tools.call_subagent.execute?.(
        { alias: 'writer', task: '请分析这段文本' },
        createExecuteOptions('call-full-chain'),
      );

      expect(result).toBe(
        JSON.stringify({
          content: 'The analysis is complete.',
          stopReason: 'end_turn',
        }),
      );

      expect(executeSubAgent).toHaveBeenCalledOnce();
      expect(executeSubAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          alias: 'writer',
          task: '请分析这段文本',
          invocationMode: 'call',
          depth: 1,
          parentContext: expect.objectContaining({
            conversationId: 'conversation-int-1',
            tenantId: 'tenant-1',
          }),
        }),
      );

      expect(mockAgentDefinitionService.findDetailById).toHaveBeenCalledWith(
        'agent-writer',
      );
      expect(mockAgentDefinitionService.listVersions).toHaveBeenCalledWith(
        'agent-writer',
        1,
        100,
      );
    });

    it('Worker.registerSubAgentToolsProvider 将 refs + context + callback 完整传递给 provider', () => {
      const worker = createWorker();
      const tracker = { abortControllers: new Map() };
      const runtime = { registerSessionToolProvider: vi.fn() };

      (worker as any).registerSubAgentToolsProvider({
        runtime,
        sessionId: 'session-full-chain',
        runtimeConfig: {
          subAgents: [{ alias: 'writer', agentDefinitionId: 'agent-writer' }],
        },
        conversationId: 'conversation-int-1',
        tenantId: 'tenant-1',
        parentAbortSignal: new AbortController().signal,
        currentAgentDefinitionId: 'agent-parent',
        currentDepth: 0,
        subAgentTracker: tracker,
      });

      expect(
        mockSubAgentToolsProvider.createSessionToolProvider,
      ).toHaveBeenCalledWith(
        [{ alias: 'writer', agentDefinitionId: 'agent-writer' }],
        expect.objectContaining({
          conversationId: 'conversation-int-1',
          tenantId: 'tenant-1',
          depth: 0,
          visitedAgentIds: expect.any(Set),
        }),
        expect.any(Function),
      );
      expect(runtime.registerSessionToolProvider).toHaveBeenCalledWith(
        'session-full-chain',
        expect.any(Function),
      );
    });
  });

  describe('2. Spawn + Wait async flow', () => {
    it('spawn 立即返回句柄 → get_status 查询 RUNNING → resolve 后 wait 返回 COMPLETED', async () => {
      const deferred = createDeferred<SubAgentResult>();
      const tools = await createToolSet(() => deferred.promise);

      // Given: spawn a sub-agent
      const spawned = (await tools.spawn_subagent.execute?.(
        { alias: 'writer', task: '后台撰写文档' },
        createExecuteOptions('spawn-async-1'),
      )) as { handle: string; alias: string; status: string };

      expect(spawned.handle).toMatch(/^sa_/);
      expect(spawned.alias).toBe('writer');
      expect(spawned.status).toBe(SubAgentRunStatus.RUNNING);

      // When: query status while running
      const statusWhileRunning = await tools.get_subagent_status.execute?.(
        { handle: spawned.handle },
        createExecuteOptions('status-async-1'),
      );
      expect(statusWhileRunning).toMatchObject({
        handle: spawned.handle,
        status: SubAgentRunStatus.RUNNING,
      });

      // When: sub-agent completes
      deferred.resolve({
        content: 'Document draft v1',
        stopReason: 'end_turn',
      });

      // Then: wait returns completed result
      const waited = await tools.wait_for_subagents.execute?.(
        { handles: [spawned.handle] },
        createExecuteOptions('wait-async-1'),
      );

      expect(waited).toEqual([
        expect.objectContaining({
          handle: spawned.handle,
          alias: 'writer',
          status: SubAgentRunStatus.COMPLETED,
          result: { content: 'Document draft v1', stopReason: 'end_turn' },
        }),
      ]);

      // Then: status after completion is COMPLETED
      const statusAfterDone = await tools.get_subagent_status.execute?.(
        { handle: spawned.handle },
        createExecuteOptions('status-async-2'),
      );
      expect(statusAfterDone).toMatchObject({
        handle: spawned.handle,
        status: SubAgentRunStatus.COMPLETED,
        result: { content: 'Document draft v1', stopReason: 'end_turn' },
      });
    });
  });

  describe('3. Completion notice injection', () => {
    it('spawn 模式完成后 Worker 调用 injectMessage 注入 SubAgentCompletionNotice', async () => {
      const worker = createWorker();
      const tracker = { abortControllers: new Map() };
      const handle = 'sa_int_notice_1' as SubAgentHandle;

      await (worker as any).executeSubAgent(
        {
          handle,
          invocationMode: 'spawn',
          alias: 'researcher',
          task: '请做调研',
          parentContext: {
            conversationId: 'conversation-int-1',
            depth: 0,
            tenantId: 'tenant-1',
            parentUsesSandboxRuntime: false,
            parentAbortSignal: new AbortController().signal,
            visitedAgentIds: new Set(['agent-parent']),
          },
          parentToolCallId: 'tool-call-notice',
          depth: 1,
          agentDefinition: makeAgentDefinition({ name: 'Researcher Agent' }),
          versionSnapshot: null,
          abortSignal: new AbortController().signal,
        },
        tracker,
      );

      expect(mockExecutionService.injectMessage).toHaveBeenCalledOnce();
      expect(mockExecutionService.injectMessage).toHaveBeenCalledWith(
        'conversation-int-1',
        expect.objectContaining({
          role: 'user',
          contentType: 'text',
          content: expect.stringContaining(
            '[Sub-Agent: Researcher Agent] Completed:',
          ),
          metadata: expect.objectContaining({
            type: 'subagent_completion_notice',
            handle,
            alias: 'researcher',
            status: SubAgentRunStatus.COMPLETED,
          }),
        }),
      );
    });

    it('call 模式不注入完成通知', async () => {
      const worker = createWorker();
      const tracker = { abortControllers: new Map() };
      const handle = 'sa_int_call_1' as SubAgentHandle;

      await (worker as any).executeSubAgent(
        {
          handle,
          invocationMode: 'call',
          alias: 'researcher',
          task: '请做调研',
          parentContext: {
            conversationId: 'conversation-int-1',
            depth: 0,
            tenantId: 'tenant-1',
            parentUsesSandboxRuntime: false,
            parentAbortSignal: new AbortController().signal,
            visitedAgentIds: new Set(['agent-parent']),
          },
          parentToolCallId: 'tool-call-no-notice',
          depth: 1,
          agentDefinition: makeAgentDefinition(),
          versionSnapshot: null,
          abortSignal: new AbortController().signal,
        },
        tracker,
      );

      expect(mockExecutionService.injectMessage).not.toHaveBeenCalled();
    });
  });

  describe('4. Cascade cancel: parent abort → all child AbortControllers abort', () => {
    it('父级 abort 触发后级联取消所有子代理', () => {
      const worker = createWorker();

      const child1Abort = new AbortController();
      const child2Abort = new AbortController();
      const child3Abort = new AbortController();

      const tracker = {
        abortControllers: new Map<SubAgentHandle, AbortController>([
          ['sa_cascade_1' as SubAgentHandle, child1Abort],
          ['sa_cascade_2' as SubAgentHandle, child2Abort],
          ['sa_cascade_3' as SubAgentHandle, child3Abort],
        ]),
      };

      expect(child1Abort.signal.aborted).toBe(false);
      expect(child2Abort.signal.aborted).toBe(false);
      expect(child3Abort.signal.aborted).toBe(false);

      (worker as any).abortTrackedSubAgents(
        tracker,
        'parent conversation cancelled',
      );

      expect(child1Abort.signal.aborted).toBe(true);
      expect(child2Abort.signal.aborted).toBe(true);
      expect(child3Abort.signal.aborted).toBe(true);

      expect(child1Abort.signal.reason).toBe('parent conversation cancelled');
      expect(child2Abort.signal.reason).toBe('parent conversation cancelled');
      expect(child3Abort.signal.reason).toBe('parent conversation cancelled');
    });

    it('已经 abort 的子代理保持原有 reason，不会被覆盖', () => {
      const worker = createWorker();

      const alreadyAborted = new AbortController();
      alreadyAborted.abort('previously cancelled');

      const fresh = new AbortController();

      const tracker = {
        abortControllers: new Map<SubAgentHandle, AbortController>([
          ['sa_already_1' as SubAgentHandle, alreadyAborted],
          ['sa_fresh_1' as SubAgentHandle, fresh],
        ]),
      };

      (worker as any).abortTrackedSubAgents(tracker, 'parent abort');

      expect(alreadyAborted.signal.reason).toBe('previously cancelled');
      expect(fresh.signal.aborted).toBe(true);
      expect(fresh.signal.reason).toBe('parent abort');
    });
  });

  describe('5. Orphan cleanup: parent completes → children terminated', () => {
    it('executeSubAgent 完成后 tracker 中该 handle 被清理', async () => {
      const worker = createWorker();
      const tracker = {
        abortControllers: new Map<SubAgentHandle, AbortController>(),
      };
      const handle = 'sa_orphan_1' as SubAgentHandle;

      expect(tracker.abortControllers.size).toBe(0);

      await (worker as any).executeSubAgent(
        {
          handle,
          invocationMode: 'call',
          alias: 'writer',
          task: '写完即清理',
          parentContext: {
            conversationId: 'conversation-int-1',
            depth: 0,
            tenantId: 'tenant-1',
            parentUsesSandboxRuntime: false,
            parentAbortSignal: new AbortController().signal,
            visitedAgentIds: new Set(['agent-parent']),
          },
          parentToolCallId: 'tool-orphan',
          depth: 1,
          agentDefinition: makeAgentDefinition(),
          versionSnapshot: null,
          abortSignal: new AbortController().signal,
        },
        tracker,
      );

      expect(tracker.abortControllers.has(handle)).toBe(false);
      expect(tracker.abortControllers.size).toBe(0);
    });

    it('executeSubAgent 失败后 tracker 记录也被清理', async () => {
      const worker = createWorker();
      const tracker = {
        abortControllers: new Map<SubAgentHandle, AbortController>(),
      };
      const handle = 'sa_orphan_fail_1' as SubAgentHandle;

      mockAgentDefinitionService.compileCanvas.mockRejectedValue(
        new Error('Canvas compilation failed'),
      );

      try {
        await (worker as any).executeSubAgent(
          {
            handle,
            invocationMode: 'call',
            alias: 'writer',
            task: '这个会失败',
            parentContext: {
              conversationId: 'conversation-int-1',
              depth: 0,
              tenantId: 'tenant-1',
              parentUsesSandboxRuntime: false,
              parentAbortSignal: new AbortController().signal,
              visitedAgentIds: new Set(['agent-parent']),
            },
            parentToolCallId: 'tool-orphan-fail',
            depth: 1,
            agentDefinition: makeAgentDefinition(),
            versionSnapshot: null,
            abortSignal: new AbortController().signal,
          },
          tracker,
        );
      } catch {
        // expected
      }

      expect(tracker.abortControllers.has(handle)).toBe(false);
    });
  });

  describe('6. Depth limit: nesting depth=5 → 6th layer throws error', () => {
    it(`depth 达到 MAX_SUB_AGENT_DEPTH(${MAX_SUB_AGENT_DEPTH}) 时 call_subagent 返回深度限制错误`, async () => {
      const tools = await createToolSet(
        async () => ({ content: 'never reached', stopReason: 'end_turn' }),
        [DEFAULT_REFS[0]],
        {
          ...DEFAULT_PARENT_CONTEXT,
          depth: MAX_SUB_AGENT_DEPTH - 1,
        },
      );

      const result = await tools.call_subagent.execute?.(
        { alias: 'writer', task: 'too deep' },
        createExecuteOptions('call-depth-limit'),
      );

      expect(result).toContain('depth limit exceeded');
      expect(result).toContain(`${MAX_SUB_AGENT_DEPTH}`);
    });

    it('spawn_subagent 同样受深度限制约束 — wait 返回 FAILED 状态', async () => {
      const tools = await createToolSet(
        async () => ({ content: 'never', stopReason: 'end_turn' }),
        [DEFAULT_REFS[0]],
        {
          ...DEFAULT_PARENT_CONTEXT,
          depth: MAX_SUB_AGENT_DEPTH - 1,
        },
      );

      // spawn 本身成功返回 handle（深度检查在异步 runSubAgent 中进行）
      const spawned = (await tools.spawn_subagent.execute?.(
        { alias: 'writer', task: 'too deep spawn' },
        createExecuteOptions('spawn-depth-limit'),
      )) as { handle: string; status: string };

      expect(spawned.handle).toMatch(/^sa_/);

      // 等待子代理完成（异步深度检查会导致失败）
      const results = await tools.wait_for_subagents.execute?.(
        { handles: [spawned.handle], timeoutMs: 500 },
        createExecuteOptions('wait-depth-limit'),
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        handle: spawned.handle,
        status: SubAgentRunStatus.FAILED,
      });
      expect(results[0].error).toContain('depth limit exceeded');
    });

    it('resolveSubAgent 在精确边界 currentDepth === maxDepth 时抛出', async () => {
      const { resolveSubAgent } = await import('./resolve-subagent.js');

      await expect(
        resolveSubAgent({
          agentDefinitionId: 'agent-writer',
          tenantId: 'tenant-1',
          currentDepth: MAX_SUB_AGENT_DEPTH,
          maxDepth: MAX_SUB_AGENT_DEPTH,
          visitedIds: new Set(),
          agentDefinitionService: mockAgentDefinitionService as never,
        }),
      ).rejects.toThrow(
        `Sub-agent depth limit exceeded: maximum nesting depth of ${MAX_SUB_AGENT_DEPTH} has been reached`,
      );
    });
  });

  describe('7. Concurrency limit: 10 concurrent sub-agents → 11th returns error', () => {
    it('第 11 个并发 spawn 请求返回 concurrent limit exceeded 错误', async () => {
      const deferred = createDeferred<SubAgentResult>();
      const tools = await createToolSet(() => deferred.promise);

      const handles: string[] = [];
      for (let i = 0; i < 10; i += 1) {
        const spawned = (await tools.spawn_subagent.execute?.(
          { alias: 'writer', task: `concurrent-job-${i}` },
          createExecuteOptions(`spawn-conc-${i}`),
        )) as { handle: string; status: string };

        expect(spawned.handle).toMatch(/^sa_/);
        expect(spawned.status).toBe(SubAgentRunStatus.RUNNING);
        handles.push(spawned.handle);
      }

      const rejected = await tools.spawn_subagent.execute?.(
        { alias: 'writer', task: 'concurrent-job-overflow' },
        createExecuteOptions('spawn-conc-overflow'),
      );

      expect(rejected).toContain('concurrent limit exceeded');
      expect(rejected).toContain('10');

      const callRejected = await tools.call_subagent.execute?.(
        { alias: 'writer', task: 'call-overflow' },
        createExecuteOptions('call-conc-overflow'),
      );

      expect(callRejected).toContain('concurrent limit exceeded');

      deferred.resolve({ content: 'done', stopReason: 'end_turn' });
    });

    it('子代理完成后释放并发位，新请求可以成功', async () => {
      const mainDeferred = createDeferred<SubAgentResult>();
      const tools = await createToolSet(() => mainDeferred.promise);

      for (let i = 0; i < 10; i += 1) {
        await tools.spawn_subagent.execute?.(
          { alias: 'writer', task: `fill-${i}` },
          createExecuteOptions(`spawn-fill-${i}`),
        );
      }

      const rejected = await tools.spawn_subagent.execute?.(
        { alias: 'writer', task: 'overflow-before-free' },
        createExecuteOptions('spawn-pre-free'),
      );
      expect(rejected).toContain('concurrent limit exceeded');

      mainDeferred.resolve({ content: 'freed', stopReason: 'end_turn' });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const newSpawn = (await tools.spawn_subagent.execute?.(
        { alias: 'writer', task: 'after-free' },
        createExecuteOptions('spawn-after-free'),
      )) as { handle: string; status: string };

      expect(newSpawn.handle).toMatch(/^sa_/);
      expect(newSpawn.status).toBe(SubAgentRunStatus.RUNNING);
    });
  });

  describe('8. Timeout handling: maxTimeoutMs expires → TIMEOUT status', () => {
    it('子代理超时后 wait_for_subagents 返回 TIMEOUT 状态', async () => {
      const shortTimeoutRefs: AgentSubAgentRef[] = [
        {
          agentDefinitionId: 'agent-writer',
          agentVersionId: 'version-writer',
          alias: 'writer',
          description: '负责写作',
          maxTimeoutMs: 5,
        },
      ];

      const tools = await createToolSet(
        async ({ abortSignal }) =>
          new Promise<SubAgentResult>((_resolve, reject) => {
            abortSignal.addEventListener(
              'abort',
              () => reject(abortSignal.reason),
              { once: true },
            );
          }),
        shortTimeoutRefs,
      );

      const spawned = (await tools.spawn_subagent.execute?.(
        { alias: 'writer', task: 'will timeout' },
        createExecuteOptions('spawn-timeout-1'),
      )) as { handle: string };

      const results = await tools.wait_for_subagents.execute?.(
        { handles: [spawned.handle], timeoutMs: 50 },
        createExecuteOptions('wait-timeout-1'),
      );

      expect(results).toEqual([
        expect.objectContaining({
          handle: spawned.handle,
          status: SubAgentRunStatus.TIMEOUT,
          error: expect.any(String),
        }),
      ]);
    });

    it('wait_for_subagents 的 timeoutMs 参数可以覆盖画布默认超时', async () => {
      const tools = await createToolSet(
        async ({ abortSignal }) =>
          new Promise<SubAgentResult>((_resolve, reject) => {
            abortSignal.addEventListener(
              'abort',
              () => reject(abortSignal.reason),
              { once: true },
            );
          }),
        DEFAULT_REFS,
      );

      const spawned = (await tools.spawn_subagent.execute?.(
        { alias: 'writer', task: 'wait will override timeout' },
        createExecuteOptions('spawn-wait-override'),
      )) as { handle: string };

      const results = await tools.wait_for_subagents.execute?.(
        { handles: [spawned.handle], timeoutMs: 5 },
        createExecuteOptions('wait-override-1'),
      );

      expect(results).toEqual([
        expect.objectContaining({
          handle: spawned.handle,
          status: SubAgentRunStatus.TIMEOUT,
          error: expect.any(String),
        }),
      ]);
    });

    it('combineAbortSignals 在输入中有已 abort 的信号时立即触发', () => {
      const worker = createWorker();
      const preAborted = new AbortController();
      preAborted.abort('already dead');

      const fresh = new AbortController();

      const result = (worker as any).combineAbortSignals([
        preAborted.signal,
        fresh.signal,
      ]);

      expect(result.signal.aborted).toBe(true);
      expect(result.signal.reason).toBe('already dead');
      result.cleanup();
    });
  });
});

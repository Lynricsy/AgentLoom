import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_SUB_AGENT_DEPTH } from '../../execution/node-handlers/sub-agent.handler';
import type { AgentSubAgentRef } from '../../agent-definition/agent-runtime-config.interface';
import {
  type ExecuteSubAgent,
  SubAgentToolsProvider,
} from './subagent-tools.provider';
import {
  SubAgentRunStatus,
  type SubAgentResult,
} from './subagent-execution.types';

const {
  mockAgentDefinitionService,
  mockEventBridge,
  mockDb,
  mockRunInTenantTransaction,
  mockTransactionExit,
} = vi.hoisted(() => ({
  mockAgentDefinitionService: {
    findDetailById: vi.fn(),
    listVersions: vi.fn(),
  },
  mockEventBridge: {
    emitSubAgentConversationEvent: vi.fn(),
    completeSubAgentConversationStream: vi.fn(),
  },
  mockDb: {},
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
    maxTimeoutMs: 50,
  },
];

const DEFAULT_PARENT_CONTEXT = {
  conversationId: 'conversation-1',
  depth: 0,
  tenantId: 'tenant-1',
  parentUsesSandboxRuntime: false,
  visitedAgentIds: new Set<string>(['parent-agent']),
};

const AGENT_DETAIL = {
  id: 'agent-writer',
  tenantId: 'tenant-1',
  name: 'Writer',
  slug: 'writer',
  description: null,
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

function createProvider() {
  return new SubAgentToolsProvider(
    mockDb as never,
    mockAgentDefinitionService as never,
    mockEventBridge as never,
  );
}

async function createTools(
  executeSubAgent: ExecuteSubAgent,
  refs: AgentSubAgentRef[] = DEFAULT_REFS,
  parentContext = DEFAULT_PARENT_CONTEXT,
) {
  return createProvider().createSessionToolProvider(
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

describe('SubAgentToolsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentDefinitionService.findDetailById.mockResolvedValue(AGENT_DETAIL);
    mockAgentDefinitionService.listVersions.mockResolvedValue({
      data: [VERSION_RESPONSE],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });
  });

  it('使用 alias enum 约束输入，非法 alias 会被 Zod 拒绝', async () => {
    const tools = await createTools(async () => ({
      content: 'ok',
      stopReason: 'end_turn',
    }));

    const result = (
      (tools.call_subagent as any).inputSchema as {
        safeParse: (value: unknown) => { success: boolean };
      }
    ).safeParse({
      alias: 'invalid-alias',
      task: 'write',
    });

    expect(result.success).toBe(false);
  });

  it('call_subagent 正常返回字符串化的 SubAgentResult', async () => {
    const tools = await createTools(async (params) => {
      params.eventProxy?.emitEvent({
        type: 'message_chunk',
        content: 'child-chunk',
      });

      return {
        content: 'child-result',
        stopReason: 'end_turn',
        decision: { selected: true },
      } satisfies SubAgentResult;
    });

    const result = await tools.call_subagent.execute?.(
      { alias: 'writer', task: '写一段摘要' },
      createExecuteOptions('call-1'),
    );

    expect(result).toBe(
      JSON.stringify({
        content: 'child-result',
        stopReason: 'end_turn',
        decision: { selected: true },
      }),
    );
    expect(mockEventBridge.emitSubAgentConversationEvent).toHaveBeenCalledWith(
      'conversation-1',
      'tenant-1',
      { type: 'message_chunk', content: 'child-chunk' },
      expect.objectContaining({ alias: 'writer', parentToolCallId: 'call-1' }),
    );
    expect(
      mockEventBridge.completeSubAgentConversationStream,
    ).toHaveBeenCalledWith(
      'conversation-1',
      'tenant-1',
      expect.objectContaining({ alias: 'writer', parentToolCallId: 'call-1' }),
      SubAgentRunStatus.COMPLETED,
      undefined,
    );
  });

  it('spawn_subagent 立即返回 handle 且状态为 running', async () => {
    const deferred = createDeferred<SubAgentResult>();
    const tools = await createTools(() => deferred.promise);

    const spawned = await tools.spawn_subagent.execute?.(
      { alias: 'writer', task: '后台写作' },
      createExecuteOptions('spawn-1'),
    );

    expect(spawned).toMatchObject({
      alias: 'writer',
      status: SubAgentRunStatus.RUNNING,
    });
    expect((spawned as { handle: string }).handle).toMatch(/^sa_/);
    expect(mockTransactionExit).toHaveBeenCalledTimes(1);
    expect(mockRunInTenantTransaction).toHaveBeenCalledWith(
      mockDb,
      'tenant-1',
      expect.any(Function),
    );

    deferred.resolve({ content: 'done', stopReason: 'end_turn' });
  });

  it('call_subagent 直接沿用当前链路，不会额外脱离事务上下文', async () => {
    const tools = await createTools(async () => ({
      content: 'done',
      stopReason: 'end_turn',
    }));

    const result = await tools.call_subagent.execute?.(
      { alias: 'writer', task: '同步写作' },
      createExecuteOptions('call-no-detach'),
    );

    expect(result).toContain('"content":"done"');
    expect(mockTransactionExit).not.toHaveBeenCalled();
    expect(mockRunInTenantTransaction).not.toHaveBeenCalled();
  });

  it('wait_for_subagents 会等待完成并返回结果快照', async () => {
    const deferred = createDeferred<SubAgentResult>();
    const tools = await createTools(() => deferred.promise);

    const spawned = (await tools.spawn_subagent.execute?.(
      { alias: 'writer', task: '生成内容' },
      createExecuteOptions('spawn-2'),
    )) as { handle: string };

    const waitingPromise = tools.wait_for_subagents.execute?.(
      { handles: [spawned.handle] },
      createExecuteOptions('wait-1'),
    );

    deferred.resolve({ content: 'resolved', stopReason: 'end_turn' });

    await expect(waitingPromise).resolves.toEqual([
      expect.objectContaining({
        handle: spawned.handle,
        alias: 'writer',
        status: SubAgentRunStatus.COMPLETED,
        result: { content: 'resolved', stopReason: 'end_turn' },
      }),
    ]);
  });

  it('get_subagent_status 返回当前运行状态', async () => {
    const deferred = createDeferred<SubAgentResult>();
    const tools = await createTools(() => deferred.promise);

    const spawned = (await tools.spawn_subagent.execute?.(
      { alias: 'writer', task: '查询状态' },
      createExecuteOptions('spawn-3'),
    )) as { handle: string };

    const status = await tools.get_subagent_status.execute?.(
      { handle: spawned.handle },
      createExecuteOptions('status-1'),
    );

    expect(status).toMatchObject({
      handle: spawned.handle,
      alias: 'writer',
      status: SubAgentRunStatus.RUNNING,
    });

    deferred.resolve({ content: 'later', stopReason: 'end_turn' });
  });

  it('超出最大深度时返回错误消息', async () => {
    const tools = await createTools(
      async () => ({ content: 'never', stopReason: 'end_turn' }),
      DEFAULT_REFS,
      {
        ...DEFAULT_PARENT_CONTEXT,
        depth: MAX_SUB_AGENT_DEPTH - 1,
      },
    );

    const result = await tools.call_subagent.execute?.(
      { alias: 'writer', task: 'too deep' },
      createExecuteOptions('call-depth'),
    );

    expect(result).toContain('depth limit exceeded');
  });

  it('检测循环引用时返回错误消息', async () => {
    const tools = await createTools(
      async () => ({ content: 'never', stopReason: 'end_turn' }),
      DEFAULT_REFS,
      {
        ...DEFAULT_PARENT_CONTEXT,
        visitedAgentIds: new Set(['parent-agent', 'agent-writer']),
      },
    );

    const result = await tools.call_subagent.execute?.(
      { alias: 'writer', task: 'circular' },
      createExecuteOptions('call-circular'),
    );

    expect(result).toContain('Circular sub-agent reference detected');
  });

  it('等待超时时会触发 AbortSignal 并将状态标记为 timeout', async () => {
    const tools = await createTools(
      async ({ abortSignal }) =>
        new Promise<SubAgentResult>((_resolve, reject) => {
          abortSignal.addEventListener(
            'abort',
            () => reject(abortSignal.reason),
            { once: true },
          );
        }),
      [
        {
          ...DEFAULT_REFS[0],
          maxTimeoutMs: 5,
        },
      ],
    );

    const spawned = (await tools.spawn_subagent.execute?.(
      { alias: 'writer', task: 'timeout' },
      createExecuteOptions('spawn-timeout'),
    )) as { handle: string };

    const waited = await tools.wait_for_subagents.execute?.(
      { handles: [spawned.handle], timeoutMs: 10 },
      createExecuteOptions('wait-timeout'),
    );

    expect(waited).toEqual([
      expect.objectContaining({
        handle: spawned.handle,
        status: SubAgentRunStatus.TIMEOUT,
        error: expect.any(String),
      }),
    ]);
  });

  it('并发运行超过 10 个子代理时拒绝新请求', async () => {
    const deferred = createDeferred<SubAgentResult>();
    const tools = await createTools(() => deferred.promise);

    for (let index = 0; index < 10; index += 1) {
      await tools.spawn_subagent.execute?.(
        { alias: 'writer', task: `job-${index}` },
        createExecuteOptions(`spawn-limit-${index}`),
      );
    }

    const rejected = await tools.spawn_subagent.execute?.(
      { alias: 'writer', task: 'job-overflow' },
      createExecuteOptions('spawn-limit-overflow'),
    );

    expect(rejected).toContain('concurrent limit exceeded');

    deferred.resolve({ content: 'done', stopReason: 'end_turn' });
  });
});

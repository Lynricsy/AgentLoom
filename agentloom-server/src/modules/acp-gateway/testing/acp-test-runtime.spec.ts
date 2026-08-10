import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '../../agent/types/agent-session.types';
import { ACP_AGENT_RUNTIME_OVERRIDE } from '../acp-runtime.tokens';
import { ACP_TEST_RUNTIME_PROVIDER, AcpTestRuntime } from './acp-test-runtime';

function createPersistence() {
  return {
    saveConversationSession: vi.fn().mockResolvedValue(undefined),
    loadConversationSession: vi.fn().mockResolvedValue(null),
    appendConversationReplayEntry: vi.fn().mockResolvedValue(undefined),
  };
}

function createRuntime() {
  const persistence = createPersistence();
  return {
    persistence,
    runtime: new AcpTestRuntime(persistence as never),
  };
}

async function finish<T>(iterator: AsyncIterator<T>, events: T[]) {
  for (;;) {
    const next = await iterator.next();
    if (next.done) return;
    events.push(next.value);
  }
}

async function nextAfter<T>(iterator: AsyncIterator<T>, milliseconds: number) {
  const pending = iterator.next();
  await vi.advanceTimersByTimeAsync(milliseconds);
  return pending;
}

describe('AcpTestRuntime', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('按会话模式保存完整可选上下文，并让 workflow 保持纯内存状态', async () => {
    const { runtime, persistence } = createRuntime();
    const conversation = await runtime.createSession({
      agentId: 'agent-1',
      mode: 'conversation',
      tenantId: 'tenant-1',
      llmModelConfigId: 'model-1',
      systemPrompt: 'system',
      autonomyMode: 'ask',
      cwd: '/workspace/demo',
      mcpServers: {
        local: { transportType: 'stdio', command: 'node' },
      },
      serverSandbox: { executionId: 'execution-1' },
      context: { attempt: 2 },
    });
    const workflow = await runtime.createSession({
      agentId: 'agent-2',
      mode: 'workflow',
    });

    expect(conversation).toMatchObject({
      agentId: 'agent-1',
      mode: 'conversation',
      status: 'active',
      tenantId: 'tenant-1',
      llmModelConfigId: 'model-1',
      systemPrompt: 'system',
      autonomyMode: 'ask',
      context: {
        history: [],
        cwd: '/workspace/demo',
        mcpServers: { local: { transportType: 'stdio', command: 'node' } },
        serverSandbox: { executionId: 'execution-1' },
        workflowState: { attempt: 2 },
      },
    });
    expect(conversation.id).toEqual(expect.any(String));
    expect(conversation.createdAt).toBeInstanceOf(Date);
    expect(workflow.context).toEqual({ history: [] });
    expect(persistence.saveConversationSession).toHaveBeenCalledOnce();
    expect(persistence.saveConversationSession).toHaveBeenCalledWith(
      conversation,
    );
  });

  it('从内存命中会话，未命中时回载持久会话并缓存，缺失时返回稳定错误', async () => {
    const { runtime, persistence } = createRuntime();
    const memory = await runtime.createSession({
      agentId: 'agent-1',
      mode: 'workflow',
    });
    expect(await runtime.loadSession(memory.id)).toBe(memory);
    expect(persistence.loadConversationSession).not.toHaveBeenCalled();

    const durable: AgentSession = {
      id: 'durable-1',
      agentId: 'agent-2',
      mode: 'conversation',
      status: 'active',
      context: { history: [] },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    persistence.loadConversationSession.mockResolvedValueOnce(durable);
    expect(await runtime.loadSession('durable-1')).toBe(durable);
    persistence.loadConversationSession.mockClear();
    expect(await runtime.loadSession('durable-1')).toBe(durable);
    expect(persistence.loadConversationSession).not.toHaveBeenCalled();

    await expect(runtime.loadSession('missing')).rejects.toThrow(
      'Session not found: missing',
    );
  });

  it('批准权限后按协议发布计划、工具状态、增量回复和完成原因并持久化 replay', async () => {
    const { runtime, persistence } = createRuntime();
    const session = await runtime.createSession({
      agentId: 'agent-1',
      mode: 'conversation',
    });
    persistence.saveConversationSession.mockClear();
    const iterator = runtime
      .prompt(session.id, [{ type: 'text', text: '请读取' }])
      [Symbol.asyncIterator]();
    const events = [
      (await iterator.next()).value,
      (await iterator.next()).value,
    ];
    await runtime.resolveToolPermission(
      session.id,
      `tool-${session.id}`,
      'approve',
    );
    events.push((await iterator.next()).value);
    events.push((await nextAfter(iterator, 30)).value);
    events.push((await iterator.next()).value);
    events.push((await nextAfter(iterator, 60)).value);
    await finish(iterator, events);

    expect(events).toEqual([
      {
        type: 'plan',
        title: '测试计划',
        content: '先发出计划，再请求工具权限，最后生成回复。',
      },
      expect.objectContaining({
        type: 'tool_call',
        call: expect.objectContaining({
          id: `tool-${session.id}`,
          status: 'awaiting_permission',
        }),
      }),
      expect.objectContaining({
        type: 'tool_call',
        call: expect.objectContaining({ status: 'in_progress' }),
      }),
      expect.objectContaining({
        type: 'tool_call',
        call: expect.objectContaining({
          status: 'completed',
          result: { content: '示例文件内容' },
        }),
      }),
      { type: 'message_chunk', content: '你好' },
      { type: 'message_chunk', content: '，主人' },
      { type: 'done', stopReason: 'end_turn' },
    ]);
    expect(session.context.history).toEqual([
      { type: 'text', text: '请读取' },
      { type: 'text', text: '你好，主人' },
    ]);
    expect(persistence.appendConversationReplayEntry).toHaveBeenNthCalledWith(
      1,
      session,
      {
        kind: 'user_message',
        content: [{ type: 'text', text: '请读取' }],
      },
    );
    expect(persistence.appendConversationReplayEntry).toHaveBeenCalledTimes(7);
    expect(persistence.saveConversationSession).toHaveBeenCalledWith(session);
  });

  it('拒绝权限后发布 denied 工具事件和解释消息，错误 id 不会误解锁等待', async () => {
    const { runtime } = createRuntime();
    const session = await runtime.createSession({
      agentId: 'agent-1',
      mode: 'conversation',
    });
    const iterator = runtime
      .prompt(session.id, [{ type: 'text', text: '读取' }])
      [Symbol.asyncIterator]();
    const events = [
      (await iterator.next()).value,
      (await iterator.next()).value,
    ];

    await expect(
      runtime.resolveToolPermission(session.id, 'wrong', 'approve'),
    ).rejects.toThrow(`Pending tool permission not found: ${session.id}/wrong`);
    await runtime.resolveToolPermission(
      session.id,
      `tool-${session.id}`,
      'deny',
    );
    await finish(iterator, events);

    expect(events.slice(2)).toEqual([
      expect.objectContaining({
        type: 'tool_call',
        call: expect.objectContaining({ status: 'denied' }),
      }),
      { type: 'message_chunk', content: '主人拒绝了此次工具调用。' },
      { type: 'done', stopReason: 'end_turn' },
    ]);
    await expect(
      runtime.resolveToolPermission(session.id, `tool-${session.id}`, 'deny'),
    ).rejects.toThrow('Pending tool permission not found');
  });

  it('等待权限时取消会话会结束 prompt、清理工具 provider 并完成持久会话', async () => {
    const { runtime, persistence } = createRuntime();
    const session = await runtime.createSession({
      agentId: 'agent-1',
      mode: 'conversation',
    });
    const provider = vi.fn().mockResolvedValue({});
    runtime.registerSessionToolProvider(session.id, provider);
    const iterator = runtime
      .prompt(session.id, [{ type: 'text', text: '读取' }])
      [Symbol.asyncIterator]();
    await iterator.next();
    await iterator.next();

    await runtime.cancel(session.id);
    expect((await iterator.next()).value).toEqual({
      type: 'done',
      stopReason: 'cancelled',
    });
    expect((await iterator.next()).done).toBe(true);
    expect(session.status).toBe('completed');
    expect(persistence.saveConversationSession).toHaveBeenCalledWith(session);

    const next = await runtime.createSession({
      agentId: 'agent-2',
      mode: 'workflow',
      mcpServers: { local: { transportType: 'stdio', command: 'node' } },
    });
    const nextIterator = runtime
      .prompt(next.id, [{ type: 'text', text: 'x' }])
      [Symbol.asyncIterator]();
    expect((await nextIterator.next()).value).toMatchObject({ type: 'plan' });
    expect(provider).not.toHaveBeenCalled();
    await runtime.cancel(next.id);
    await nextIterator.return?.(undefined);
  });

  it('MCP provider 成功时使用首个可执行工具、拼接文本查询并序列化文本内容', async () => {
    const { runtime } = createRuntime();
    const session = await runtime.createSession({
      agentId: 'agent-1',
      mode: 'conversation',
      mcpServers: { local: { transportType: 'stdio', command: 'node' } },
    });
    const execute = vi.fn().mockResolvedValue({
      content: [
        null,
        'not-a-block',
        { type: 'image', data: 'x' },
        { type: 'text', text: '工具文本' },
      ],
    });
    runtime.registerSessionToolProvider(
      session.id,
      () => ({ search: { execute } }) as never,
    );
    const iterator = runtime
      .prompt(session.id, [
        { type: 'text', text: '  第一段 ' },
        { type: 'text', text: '' },
        { type: 'text', text: '第二段' },
        {
          type: 'resource',
          uri: 'file:///workspace/context.txt',
          text: 'ignored',
        },
      ])
      [Symbol.asyncIterator]();
    const events = [(await iterator.next()).value];
    events.push((await nextAfter(iterator, 40)).value);
    events.push((await nextAfter(iterator, 20)).value);
    await finish(iterator, events);

    expect(execute).toHaveBeenCalledWith({ query: '第一段 第二段' });
    expect(events).toEqual([
      expect.objectContaining({
        type: 'tool_call',
        call: expect.objectContaining({
          tool: 'search',
          status: 'in_progress',
        }),
      }),
      expect.objectContaining({
        type: 'tool_call',
        call: expect.objectContaining({ status: 'completed' }),
      }),
      { type: 'message_chunk', content: '已通过 search 获取：工具文本' },
      { type: 'done', stopReason: 'end_turn' },
    ]);
  });

  it.each([
    ['string', '原始结果', '原始结果'],
    ['object', { value: 3 }, '{"value":3}'],
    ['primitive', 7, '7'],
  ])('MCP %s 结果产生稳定可见消息', async (_label, result, expected) => {
    const { runtime } = createRuntime();
    const session = await runtime.createSession({
      agentId: 'agent-1',
      mode: 'workflow',
      mcpServers: { local: { transportType: 'stdio', command: 'node' } },
    });
    runtime.registerSessionToolProvider(
      session.id,
      () => ({ tool: { execute: vi.fn().mockResolvedValue(result) } }) as never,
    );
    const iterator = runtime.prompt(session.id, [])[Symbol.asyncIterator]();
    await iterator.next();
    await nextAfter(iterator, 40);
    const message = await nextAfter(iterator, 20);
    expect(message.value).toEqual({
      type: 'message_chunk',
      content: `已通过 tool 获取：${expected}`,
    });
    await finish(iterator, []);
  });

  it.each([
    [new Error('remote failed'), 'remote failed'],
    [new Error(''), 'Error'],
    ['bad value', 'bad value'],
  ])('MCP 失败映射为 failed 工具状态和可见回复', async (failure, expected) => {
    const { runtime } = createRuntime();
    const session = await runtime.createSession({
      agentId: 'agent-1',
      mode: 'conversation',
      mcpServers: { local: { transportType: 'stdio', command: 'node' } },
    });
    runtime.registerSessionToolProvider(
      session.id,
      () =>
        ({ tool: { execute: vi.fn().mockRejectedValue(failure) } }) as never,
    );
    const iterator = runtime.prompt(session.id, [])[Symbol.asyncIterator]();
    const events = [(await iterator.next()).value];
    events.push((await nextAfter(iterator, 40)).value);
    await finish(iterator, events);
    const message = `MCP 工具调用失败：${expected}`;
    expect(events).toEqual([
      expect.objectContaining({
        type: 'tool_call',
        call: expect.objectContaining({ status: 'in_progress' }),
      }),
      expect.objectContaining({
        type: 'tool_call',
        call: expect.objectContaining({ status: 'failed', error: message }),
      }),
      { type: 'message_chunk', content: message },
      { type: 'done', stopReason: 'end_turn' },
    ]);
  });

  it.each([
    ['no servers', undefined, undefined],
    [
      'no provider',
      { local: { transportType: 'stdio', command: 'node' } },
      undefined,
    ],
    ['empty tools', { local: { transportType: 'stdio', command: 'node' } }, {}],
    [
      'non-object tool',
      { local: { transportType: 'stdio', command: 'node' } },
      { bad: null },
    ],
    [
      'missing execute',
      { local: { transportType: 'stdio', command: 'node' } },
      { bad: {} },
    ],
  ] as const)(
    '无可执行 MCP 工具时回退权限协议: %s',
    async (_label, mcpServers, tools) => {
      const { runtime } = createRuntime();
      const session = await runtime.createSession({
        agentId: 'agent-1',
        mode: 'workflow',
        ...(mcpServers ? { mcpServers } : {}),
      });
      if (tools !== undefined)
        runtime.registerSessionToolProvider(session.id, () => tools as never);
      const iterator = runtime.prompt(session.id, [])[Symbol.asyncIterator]();
      expect((await iterator.next()).value).toMatchObject({ type: 'plan' });
      expect((await iterator.next()).value).toMatchObject({
        type: 'tool_call',
        call: { status: 'awaiting_permission' },
      });
      await runtime.cancel(session.id);
      await finish(iterator, []);
    },
  );

  it('MCP 执行前和执行后取消分别只发布 cancelled 完成原因', async () => {
    for (const cancelAfterExecution of [false, true]) {
      const { runtime } = createRuntime();
      const session = await runtime.createSession({
        agentId: 'agent-1',
        mode: 'workflow',
        mcpServers: { local: { transportType: 'stdio', command: 'node' } },
      });
      const execute = vi.fn().mockResolvedValue('ok');
      runtime.registerSessionToolProvider(
        session.id,
        () => ({ tool: { execute } }) as never,
      );
      const iterator = runtime.prompt(session.id, [])[Symbol.asyncIterator]();
      await iterator.next();
      if (cancelAfterExecution) {
        expect((await nextAfter(iterator, 40)).value).toMatchObject({
          call: { status: 'completed' },
        });
      }
      await runtime.cancel(session.id);
      expect(
        (await nextAfter(iterator, cancelAfterExecution ? 20 : 40)).value,
      ).toEqual({ type: 'done', stopReason: 'cancelled' });
      await iterator.next();
      expect(execute).toHaveBeenCalledTimes(cancelAfterExecution ? 1 : 0);
    }
  });

  it('普通工具执行和回复延迟期间取消均停止后续协议事件', async () => {
    for (const phase of ['tool', 'message'] as const) {
      const { runtime } = createRuntime();
      const session = await runtime.createSession({
        agentId: 'agent-1',
        mode: 'workflow',
      });
      const iterator = runtime.prompt(session.id, [])[Symbol.asyncIterator]();
      await iterator.next();
      await iterator.next();
      await runtime.resolveToolPermission(
        session.id,
        `tool-${session.id}`,
        'approve',
      );
      await iterator.next();
      if (phase === 'message') {
        await nextAfter(iterator, 30);
        await iterator.next();
      }
      await runtime.cancel(session.id);
      expect(
        (await nextAfter(iterator, phase === 'tool' ? 30 : 60)).value,
      ).toEqual({ type: 'done', stopReason: 'cancelled' });
      expect((await iterator.next()).done).toBe(true);
    }
  });

  it('保留 error 会话状态且不会重复追加与最终回复相同的历史文本', async () => {
    const { runtime } = createRuntime();
    const session = await runtime.createSession({
      agentId: 'agent-1',
      mode: 'conversation',
    });
    session.status = 'error';
    const iterator = runtime
      .prompt(session.id, [{ type: 'text', text: '你好，主人' }])
      [Symbol.asyncIterator]();
    await iterator.next();
    await iterator.next();
    await runtime.resolveToolPermission(
      session.id,
      `tool-${session.id}`,
      'approve',
    );
    await iterator.next();
    await nextAfter(iterator, 30);
    await iterator.next();
    await nextAfter(iterator, 60);
    await finish(iterator, []);

    expect(session.status).toBe('error');
    expect(session.context.history).toEqual([
      { type: 'text', text: '你好，主人' },
    ]);
  });

  it('显式 unregister 后不再使用会话 MCP provider', async () => {
    const { runtime } = createRuntime();
    const session = await runtime.createSession({
      agentId: 'agent-1',
      mode: 'workflow',
      mcpServers: {
        local: { transportType: 'stdio', command: 'node' },
      },
    });
    const provider = vi.fn().mockReturnValue({
      tool: { execute: vi.fn() },
    });
    runtime.registerSessionToolProvider(session.id, provider as never);
    runtime.unregisterSessionToolProvider(session.id);
    const iterator = runtime.prompt(session.id, [])[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toMatchObject({ type: 'plan' });
    expect(provider).not.toHaveBeenCalled();
    await runtime.cancel(session.id);
    await finish(iterator, []);
  });

  it('provider 工厂始终构造协议 runtime 并暴露正确注入契约', () => {
    const persistence = createPersistence();
    expect(ACP_TEST_RUNTIME_PROVIDER.provide).toBe(ACP_AGENT_RUNTIME_OVERRIDE);
    expect(ACP_TEST_RUNTIME_PROVIDER.inject).toEqual([expect.any(Function)]);
    expect(
      ACP_TEST_RUNTIME_PROVIDER.useFactory(persistence as never),
    ).toBeInstanceOf(AcpTestRuntime);
  });
});

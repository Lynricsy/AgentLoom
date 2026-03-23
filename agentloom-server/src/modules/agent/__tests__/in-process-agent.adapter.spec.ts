import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { InProcessAgentAdapter } from '../in-process-agent.adapter';
import type {
  AgentSession,
  CreateSessionParams,
} from '../types/agent-session.types';
import type { AgentEvent } from '../types/agent-event.types';
import type { ConversationReplayEntry } from '../types/conversation-history.types';
import type { ContentBlock } from '../types/content-block.types';

const hoisted = vi.hoisted(() => {
  let sessionCounter = 0;
  const runtimeSessions = new Map<string, AgentSession>();
  const promptBehaviors: Array<{
    events?: AgentEvent[];
    error?: Error;
  }> = [];

  const constructorSpy = vi.fn();
  const createSession = vi.fn(async (params: CreateSessionParams) => {
    const id = `runtime-session-${++sessionCounter}`;
    const now = new Date();
    const session: AgentSession = {
      id,
      agentId: params.agentId,
      mode: params.mode,
      context: {
        history: [],
        ...(params.cwd === undefined ? {} : { cwd: params.cwd }),
        ...(params.mcpServers === undefined
          ? {}
          : { mcpServers: params.mcpServers }),
        ...(params.serverSandbox === undefined
          ? {}
          : { serverSandbox: params.serverSandbox }),
        ...(params.mode === 'workflow' && params.context !== undefined
          ? { workflowState: params.context }
          : {}),
      },
      status: 'active',
      ...(params.tenantId === undefined ? {} : { tenantId: params.tenantId }),
      ...(params.llmModelConfigId === undefined
        ? {}
        : { llmModelConfigId: params.llmModelConfigId }),
      ...(params.systemPrompt === undefined
        ? {}
        : { systemPrompt: params.systemPrompt }),
      ...(params.autonomyMode === undefined
        ? {}
        : { autonomyMode: params.autonomyMode }),
      createdAt: now,
      updatedAt: now,
    };
    runtimeSessions.set(id, session);
    return session;
  });
  const loadSession = vi.fn(async (sessionId: string) => {
    const session = runtimeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  });
  const prompt = vi.fn((sessionId: string, content: ContentBlock[]) =>
    (async function* () {
      const session = runtimeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      session.context.history.push(...content);
      const behavior: { events?: AgentEvent[]; error?: Error } =
        promptBehaviors.shift() ?? {
        events: [{ type: 'done', stopReason: 'end_turn' } satisfies AgentEvent],
      };

      if (behavior.error) {
        session.status = 'error';
        session.updatedAt = new Date();
        throw behavior.error;
      }

      let assistantText = '';
      for (const event of behavior.events ?? []) {
        if (event.type === 'message_chunk') {
          assistantText += event.content;
        }
        if (event.type === 'done' && event.stopReason === 'cancelled') {
          session.status = 'completed';
        }
        yield event;
      }

      if (assistantText.length > 0) {
        session.context.history.push({ type: 'text', text: assistantText });
      }

      session.updatedAt = new Date();
    })(),
  );
  const cancel = vi.fn(async (sessionId: string) => {
    const session = runtimeSessions.get(sessionId);
    if (!session) {
      return;
    }
    session.status = 'completed';
    session.updatedAt = new Date();
  });
  const resolveToolPermission = vi.fn(async () => undefined);
  const registerSessionToolProvider = vi.fn();
  const unregisterSessionToolProvider = vi.fn();

  class MockPiAgentCoreAdapter {
    constructor(...args: unknown[]) {
      constructorSpy(...args);
    }

    createSession = createSession;
    loadSession = loadSession;
    prompt = prompt;
    cancel = cancel;
    resolveToolPermission = resolveToolPermission;
    registerSessionToolProvider = registerSessionToolProvider;
    unregisterSessionToolProvider = unregisterSessionToolProvider;
  }

  return {
    MockPiAgentCoreAdapter,
    constructorSpy,
    createSession,
    loadSession,
    prompt,
    cancel,
    resolveToolPermission,
    registerSessionToolProvider,
    unregisterSessionToolProvider,
    queuePromptBehavior: (behavior: { events?: AgentEvent[]; error?: Error }) => {
      promptBehaviors.push(behavior);
    },
    clearRuntimeSessions: () => {
      runtimeSessions.clear();
    },
    setRuntimeSession: (session: AgentSession) => {
      runtimeSessions.set(session.id, session);
    },
    reset: () => {
      sessionCounter = 0;
      runtimeSessions.clear();
      promptBehaviors.length = 0;
      constructorSpy.mockClear();
      createSession.mockClear();
      loadSession.mockClear();
      prompt.mockClear();
      cancel.mockClear();
      resolveToolPermission.mockClear();
      registerSessionToolProvider.mockClear();
      unregisterSessionToolProvider.mockClear();
    },
  };
});

vi.mock('../pi-agent-core.adapter', () => ({
  PiAgentCoreAdapter: hoisted.MockPiAgentCoreAdapter,
}));

async function collectEvents(
  iterable: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

  describe('InProcessAgentAdapter', () => {
  let adapter: InProcessAgentAdapter;
  let mockDb: unknown;
  let mockPiAiAdapter: unknown;
  let mockAgentSessionFactory: unknown;
  let mockSessionPersistence: {
    saveToCheckpoint: ReturnType<typeof vi.fn>;
    loadFromCheckpoint: ReturnType<typeof vi.fn>;
    saveConversationSession: ReturnType<typeof vi.fn>;
    loadConversationSession: ReturnType<typeof vi.fn>;
    appendConversationReplayEntry: ReturnType<typeof vi.fn>;
  };

  const NOW = new Date('2026-03-24T10:00:00.000Z');
  const textBlock: ContentBlock = { type: 'text', text: 'Hello, agent!' };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    hoisted.reset();

    mockDb = {};
    mockPiAiAdapter = { getModel: vi.fn() };
    mockAgentSessionFactory = { createWorkflowSession: vi.fn() };
    mockSessionPersistence = {
      saveToCheckpoint: vi.fn().mockResolvedValue(undefined),
      loadFromCheckpoint: vi.fn().mockResolvedValue(null),
      saveConversationSession: vi.fn().mockResolvedValue(undefined),
      loadConversationSession: vi.fn().mockResolvedValue(null),
      appendConversationReplayEntry: vi.fn().mockResolvedValue(undefined),
    };

    type AdapterArgs = ConstructorParameters<typeof InProcessAgentAdapter>;
    adapter = new InProcessAgentAdapter(
      mockDb as unknown as AdapterArgs[0],
      mockPiAiAdapter as unknown as AdapterArgs[1],
      mockAgentSessionFactory as unknown as AdapterArgs[2],
      mockSessionPersistence as unknown as AdapterArgs[3],
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createSession', () => {
    it('会委托 PiAgentCoreAdapter 创建 workflow session，并写入 checkpoint', async () => {
      const params: CreateSessionParams = {
        agentId: 'agent-001',
        mode: 'workflow',
        tenantId: 'tenant-001',
        llmModelConfigId: 'model-config-001',
        systemPrompt: '你是一个专业翻译',
        autonomyMode: 'LLM_SUGGEST',
        context: {
          executionId: 'exec-001',
          stepId: 'step-001',
          nodeId: 'node-001',
        },
      };

      const session = await adapter.createSession(params);

      expect(hoisted.createSession).toHaveBeenCalledWith(params);
      expect(mockSessionPersistence.saveToCheckpoint).toHaveBeenCalledWith(
        'tenant-001',
        'step-001',
        session,
      );
      expect(session).toMatchObject({
        agentId: 'agent-001',
        mode: 'workflow',
        llmModelConfigId: 'model-config-001',
        systemPrompt: '你是一个专业翻译',
        autonomyMode: 'LLM_SUGGEST',
        context: {
          workflowState: {
            executionId: 'exec-001',
            stepId: 'step-001',
            nodeId: 'node-001',
          },
        },
      });
    });

    it('conversation session 创建后会写入 durable store', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'conversation',
        tenantId: 'tenant-001',
        cwd: '/workspace/demo',
        serverSandbox: {
          executionId: '019391d4-e000-7000-0000-000000000005',
        },
      });

      expect(mockSessionPersistence.saveConversationSession).toHaveBeenCalledWith(
        expect.objectContaining({
          id: session.id,
          mode: 'conversation',
          tenantId: 'tenant-001',
          context: expect.objectContaining({
            cwd: '/workspace/demo',
            serverSandbox: {
              executionId: '019391d4-e000-7000-0000-000000000005',
            },
          }),
        }),
      );
    });
  });

  describe('loadSession', () => {
    it('会在会话不存在时抛错', async () => {
      await expect(adapter.loadSession('missing-session')).rejects.toThrow(
        /not found/i,
      );
    });

    it('会在 runtime 缺失时回退到 durable conversation store', async () => {
      const persisted: AgentSession = {
        id: 'conversation-001',
        agentId: 'agent-001',
        mode: 'conversation',
        context: {
          history: [{ type: 'text', text: '历史消息' }],
          cwd: '/workspace/demo',
        },
        status: 'active',
        tenantId: 'tenant-001',
        createdAt: NOW,
        updatedAt: NOW,
      };
      mockSessionPersistence.loadConversationSession.mockResolvedValue(persisted);

      await expect(adapter.loadSession('conversation-001')).resolves.toEqual(
        persisted,
      );
    });

    it('会在 workflow runtime 缺失时回退到 checkpoint', async () => {
      const persisted: AgentSession = {
        id: 'workflow-001',
        agentId: 'agent-001',
        mode: 'workflow',
        context: {
          history: [{ type: 'text', text: '历史消息' }],
          workflowState: {
            executionId: 'exec-001',
            stepId: 'step-001',
            nodeId: 'node-001',
          },
        },
        status: 'active',
        tenantId: 'tenant-001',
        createdAt: NOW,
        updatedAt: NOW,
      };
      adapter.registerSessionMetadata('workflow-001', 'tenant-001', 'step-001');
      mockSessionPersistence.loadFromCheckpoint.mockResolvedValue(persisted);

      await expect(adapter.loadSession('workflow-001')).resolves.toEqual(
        persisted,
      );
    });
  });

  describe('prompt', () => {
    it('conversation 会把用户输入与运行时事件追加到 durable replay ledger，并保存新 history', async () => {
      hoisted.queuePromptBehavior({
        events: [
          { type: 'message_chunk', content: '你好，主人' },
          { type: 'done', stopReason: 'end_turn' },
        ],
      });
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'conversation',
        tenantId: 'tenant-001',
        systemPrompt: '你是一个聊天助手',
      });

      await expect(collectEvents(adapter.prompt(session.id, [textBlock]))).resolves.toEqual(
        [
          { type: 'message_chunk', content: '你好，主人' },
          { type: 'done', stopReason: 'end_turn' },
        ],
      );

      expect(mockSessionPersistence.appendConversationReplayEntry).toHaveBeenCalledWith(
        expect.objectContaining({ id: session.id, mode: 'conversation' }),
        {
          kind: 'user_message',
          content: [textBlock],
        } satisfies ConversationReplayEntry,
      );
      expect(mockSessionPersistence.appendConversationReplayEntry).toHaveBeenCalledWith(
        expect.objectContaining({ id: session.id, mode: 'conversation' }),
        {
          kind: 'agent_event',
          event: {
            type: 'message_chunk',
            content: '你好，主人',
          },
        } satisfies ConversationReplayEntry,
      );
      expect(mockSessionPersistence.saveConversationSession).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: session.id,
          context: {
            history: [textBlock, { type: 'text', text: '你好，主人' }],
          },
        }),
      );
    });

    it('恢复持久化 session 时会创建新的 runtime，并把完整历史作为首轮 prompt 输入', async () => {
      const persisted: AgentSession = {
        id: 'persisted-session',
        agentId: 'agent-001',
        mode: 'conversation',
        context: {
          history: [{ type: 'text', text: '上一轮消息' }],
          cwd: '/workspace/demo',
        },
        status: 'active',
        tenantId: 'tenant-001',
        systemPrompt: '你是一个聊天助手',
        createdAt: NOW,
        updatedAt: NOW,
      };
      mockSessionPersistence.loadConversationSession.mockResolvedValue(persisted);
      hoisted.queuePromptBehavior({
        events: [{ type: 'done', stopReason: 'end_turn' }],
      });

      await collectEvents(
        adapter.prompt('persisted-session', [{ type: 'text', text: '新的输入' }]),
      );

      expect(hoisted.createSession).toHaveBeenCalledWith({
        agentId: 'agent-001',
        mode: 'conversation',
        tenantId: 'tenant-001',
        systemPrompt: '你是一个聊天助手',
        cwd: '/workspace/demo',
      });
      expect(hoisted.prompt).toHaveBeenCalledWith('runtime-session-1', [
        { type: 'text', text: '上一轮消息' },
        { type: 'text', text: '新的输入' },
      ]);
    });

    it('已注册的 session-local tool provider 会在恢复 runtime 后重新绑定', async () => {
      const provider = vi.fn().mockResolvedValue({});
      adapter.registerSessionToolProvider('persisted-session', provider);
      mockSessionPersistence.loadConversationSession.mockResolvedValue({
        id: 'persisted-session',
        agentId: 'agent-001',
        mode: 'conversation',
        context: { history: [] },
        status: 'active',
        tenantId: 'tenant-001',
        createdAt: NOW,
        updatedAt: NOW,
      } satisfies AgentSession);
      hoisted.queuePromptBehavior({
        events: [{ type: 'done', stopReason: 'end_turn' }],
      });

      await collectEvents(adapter.prompt('persisted-session', [textBlock]));

      expect(hoisted.registerSessionToolProvider).toHaveBeenCalledWith(
        'runtime-session-1',
        provider,
      );
    });

    it('stream error 会向外抛出并把 session 标记为 error 后持久化', async () => {
      hoisted.queuePromptBehavior({ error: new Error('模型流失败') });
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'conversation',
        tenantId: 'tenant-001',
      });

      await expect(collectEvents(adapter.prompt(session.id, [textBlock]))).rejects.toThrow(
        '模型流失败',
      );

      expect(mockSessionPersistence.saveConversationSession).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: session.id,
          status: 'error',
        }),
      );
    });

    it('已完成 session 再次 prompt 时会直接返回 cancelled', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'conversation',
        tenantId: 'tenant-001',
      });
      hoisted.setRuntimeSession({
        ...(await adapter.loadSession(session.id)),
        status: 'completed',
      });

      await expect(collectEvents(adapter.prompt(session.id, [textBlock]))).resolves.toEqual([
        { type: 'done', stopReason: 'cancelled' },
      ]);
    });
  });

  describe('tool provider / permission delegation', () => {
    it('runtime 已存在时 register/unregister 会直接委托给 PiAgentCoreAdapter', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'conversation',
        tenantId: 'tenant-001',
      });
      const provider = vi.fn().mockResolvedValue({});

      adapter.registerSessionToolProvider(session.id, provider);
      adapter.unregisterSessionToolProvider(session.id);

      expect(hoisted.registerSessionToolProvider).toHaveBeenCalledWith(
        session.id,
        provider,
      );
      expect(hoisted.unregisterSessionToolProvider).toHaveBeenCalledWith(
        session.id,
      );
    });

    it('resolveToolPermission 会把外层 sessionId 映射到恢复后的 runtime sessionId', async () => {
      mockSessionPersistence.loadConversationSession.mockResolvedValue({
        id: 'persisted-session',
        agentId: 'agent-001',
        mode: 'conversation',
        context: { history: [] },
        status: 'active',
        tenantId: 'tenant-001',
        createdAt: NOW,
        updatedAt: NOW,
      } satisfies AgentSession);
      hoisted.queuePromptBehavior({
        events: [{ type: 'done', stopReason: 'end_turn' }],
      });

      await collectEvents(adapter.prompt('persisted-session', [textBlock]));
      await adapter.resolveToolPermission('persisted-session', 'tool-1', 'approve');

      expect(hoisted.resolveToolPermission).toHaveBeenCalledWith(
        'runtime-session-1',
        'tool-1',
        'approve',
      );
    });
  });

  describe('cancel', () => {
    it('conversation cancel 后会把 completed 状态写回 durable store', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'conversation',
        tenantId: 'tenant-001',
      });

      await adapter.cancel(session.id);

      expect(hoisted.cancel).toHaveBeenCalledWith(session.id);
      expect(mockSessionPersistence.saveConversationSession).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: session.id,
          status: 'completed',
        }),
      );
    });

    it('workflow cancel 后会把 completed 状态写回 checkpoint', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'workflow',
        tenantId: 'tenant-001',
        context: {
          executionId: 'exec-001',
          stepId: 'step-001',
          nodeId: 'node-001',
        },
      });
      adapter.registerSessionMetadata(session.id, 'tenant-001', 'step-001');
      mockSessionPersistence.loadFromCheckpoint.mockResolvedValue(session);

      await adapter.cancel(session.id);

      expect(mockSessionPersistence.saveToCheckpoint).toHaveBeenLastCalledWith(
        'tenant-001',
        'step-001',
        expect.objectContaining({
          id: session.id,
          status: 'completed',
        }),
      );
    });

    it('取消不存在的会话也不会抛错', async () => {
      hoisted.clearRuntimeSessions();

      await expect(adapter.cancel('missing-session')).resolves.not.toThrow();
    });
  });
});

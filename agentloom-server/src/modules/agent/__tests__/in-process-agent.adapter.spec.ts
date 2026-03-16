import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { streamText } from 'ai';
import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import { InProcessAgentAdapter } from '../in-process-agent.adapter';
import type {
  AgentSession,
  CreateSessionParams,
} from '../types/agent-session.types';
import type { AgentEvent } from '../types/agent-event.types';
import type { ContentBlock } from '../types/content-block.types';

vi.mock('ai', () => ({
  streamText: vi.fn(),
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn((db: unknown) => db),
}));

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: vi.fn(
    async (
      db: unknown,
      _tenantId: string,
      operation: (tenantDb: unknown) => Promise<unknown>,
    ) => operation(db),
  ),
}));

const mockedStreamText = vi.mocked(streamText);

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi
        .fn()
        .mockResolvedValue(Array.isArray(result) ? result : [result]),
    }),
  };
}

async function* createFullStream(
  parts: Array<Record<string, unknown>>,
): AsyncIterable<Record<string, unknown>> {
  for (const part of parts) {
    yield part;
  }
}

describe('InProcessAgentAdapter', () => {
  let adapter: InProcessAgentAdapter;
  let mockDb: { select: ReturnType<typeof vi.fn> };
  let mockPiAiAdapter: { getModel: ReturnType<typeof vi.fn> };
  let mockAgentSessionFactory: {
    createWorkflowSession: ReturnType<typeof vi.fn>;
  };
  let mockSessionPersistence: {
    saveToCheckpoint: ReturnType<typeof vi.fn>;
    loadFromCheckpoint: ReturnType<typeof vi.fn>;
    serializeSession: ReturnType<typeof vi.fn>;
    deserializeSession: ReturnType<typeof vi.fn>;
  };
  const NOW = new Date('2025-01-01T00:00:00.000Z');
  const defaultModelConfig = {
    id: 'model-config-001',
    tenantId: 'tenant-001',
    provider: 'openai',
    modelName: 'gpt-4.1-mini',
    apiKeyId: 'api-key-001',
    isDefault: true,
  };
  const textBlock: ContentBlock = { type: 'text', text: 'Hello, agent!' };
  const STEP_ID = 'step-001';
  const EXECUTION_ID = 'exec-001';
  const NODE_ID = 'node-001';

  function makeWorkflowSession(
    overrides: Partial<AgentSession> = {},
  ): AgentSession {
    return {
      id: 'session-uuid',
      agentId: 'agent-001',
      mode: 'workflow',
      context: {
        history: [],
        workflowState: {
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          nodeId: NODE_ID,
        },
      },
      status: 'active',
      tenantId: 'tenant-001',
      llmModelConfigId: undefined,
      systemPrompt: undefined,
      autonomyMode: undefined,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  function workflowCreateParams(
    overrides: Partial<CreateSessionParams> = {},
  ): CreateSessionParams {
    return {
      agentId: 'agent-001',
      mode: 'workflow',
      tenantId: 'tenant-001',
      context: { executionId: EXECUTION_ID, stepId: STEP_ID, nodeId: NODE_ID },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    mockDb = { select: vi.fn() };
    mockPiAiAdapter = { getModel: vi.fn().mockReturnValue('mock-model') };
    mockAgentSessionFactory = {
      createWorkflowSession: vi.fn().mockImplementation((params) =>
        makeWorkflowSession({
          llmModelConfigId: params.llmModelConfigId,
          systemPrompt: params.systemPrompt,
          autonomyMode: params.autonomyMode,
        }),
      ),
    };
    mockSessionPersistence = {
      saveToCheckpoint: vi.fn().mockResolvedValue(undefined),
      loadFromCheckpoint: vi.fn().mockResolvedValue(null),
      serializeSession: vi.fn().mockReturnValue({}),
      deserializeSession: vi.fn(),
    };
    mockedStreamText.mockReset();

    type AdapterConstructorArgs = ConstructorParameters<
      typeof InProcessAgentAdapter
    >;
    adapter = new InProcessAgentAdapter(
      mockDb as unknown as AdapterConstructorArgs[0],
      mockPiAiAdapter as unknown as AdapterConstructorArgs[1],
      mockAgentSessionFactory as unknown as AdapterConstructorArgs[2],
      mockSessionPersistence as unknown as AdapterConstructorArgs[3],
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createSession', () => {
    it('会保留 workflow 上下文和 runtime 元信息', async () => {
      const mcpServers = {
        filesystem: {
          transportType: 'stdio' as const,
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        },
      } as NonNullable<CreateSessionParams['mcpServers']>;
      const params = workflowCreateParams({
        llmModelConfigId: 'model-config-001',
        systemPrompt: '你是一个专业翻译',
        autonomyMode: 'LLM_SUGGEST',
        mcpServers,
      });

      const session = await adapter.createSession(params);

      expect(
        mockAgentSessionFactory.createWorkflowSession,
      ).toHaveBeenCalledWith({
        agentId: 'agent-001',
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        nodeId: NODE_ID,
        tenantId: 'tenant-001',
        llmModelConfigId: 'model-config-001',
        systemPrompt: '你是一个专业翻译',
        autonomyMode: 'LLM_SUGGEST',
        mcpServers,
      });
      expect(session).toMatchObject({
        agentId: 'agent-001',
        mode: 'workflow',
        llmModelConfigId: 'model-config-001',
        systemPrompt: '你是一个专业翻译',
        autonomyMode: 'LLM_SUGGEST',
        status: 'active',
      });
      expect(mockSessionPersistence.saveToCheckpoint).toHaveBeenCalledWith(
        'tenant-001',
        STEP_ID,
        session,
      );
    });
  });

  describe('loadSession', () => {
    it('会在会话不存在时抛错', async () => {
      await expect(adapter.loadSession('missing-session')).rejects.toThrow(
        /not found/i,
      );
    });
  });

  describe('prompt', () => {
    async function createAndSetupSession(
      overrides: Partial<CreateSessionParams> = {},
    ): Promise<AgentSession> {
      const session = await adapter.createSession(
        workflowCreateParams(overrides),
      );
      mockSessionPersistence.loadFromCheckpoint.mockResolvedValue(
        makeWorkflowSession({
          ...session,
          context: { ...session.context, history: [] },
        }),
      );
      return session;
    }

    it('会解析默认模型配置、流式输出 message_chunk，并在 stop finishReason 时结束', async () => {
      await createAndSetupSession({ systemPrompt: '你是一个总结助手' });
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      mockedStreamText.mockReturnValue({
        fullStream: createFullStream([
          { type: 'text-delta', text: 'Hello ' },
          { type: 'text-delta', text: 'world' },
          { type: 'finish', finishReason: 'stop' },
        ]),
      } as unknown as ReturnType<typeof streamText>);

      const events: AgentEvent[] = [];
      for await (const event of adapter.prompt('session-uuid', [textBlock])) {
        events.push(event);
      }

      expect(mockPiAiAdapter.getModel).toHaveBeenCalledWith(defaultModelConfig);
      expect(mockedStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'mock-model',
          system: '你是一个总结助手',
          prompt: 'Hello, agent!',
        }),
      );
      expect(runInTenantTransaction).toHaveBeenCalledWith(
        mockDb,
        'tenant-001',
        expect.any(Function),
      );
      expect(events).toEqual([
        { type: 'message_chunk', content: 'Hello ' },
        { type: 'message_chunk', content: 'world' },
        { type: 'done', stopReason: 'end_turn' },
      ]);
    });

    it('在 LLM_SUGGEST 模式下会产出 decision 与 intervention_required', async () => {
      await createAndSetupSession({ autonomyMode: 'LLM_SUGGEST' });
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      mockedStreamText.mockReturnValue({
        fullStream: createFullStream([
          { type: 'text-delta', text: '建议稿' },
          { type: 'finish', finishReason: 'stop' },
        ]),
      } as unknown as ReturnType<typeof streamText>);

      const events: AgentEvent[] = [];
      for await (const event of adapter.prompt('session-uuid', [textBlock])) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: 'message_chunk', content: '建议稿' },
        {
          type: 'decision',
          suggestedContent: '建议稿',
          autonomyMode: 'LLM_SUGGEST',
          selectedAction: 'request_intervention',
          alternatives: ['approve', 'modify', 'reject'],
          confidence: 0.5,
        },
        { type: 'done', stopReason: 'intervention_required' },
      ]);
    });

    it('会把 length finishReason 映射为 max_tokens', async () => {
      await createAndSetupSession();
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      mockedStreamText.mockReturnValue({
        fullStream: createFullStream([
          { type: 'finish', finishReason: 'length' },
        ]),
      } as unknown as ReturnType<typeof streamText>);

      const events: AgentEvent[] = [];
      for await (const event of adapter.prompt('session-uuid', [textBlock])) {
        events.push(event);
      }

      expect(events).toEqual([{ type: 'done', stopReason: 'max_tokens' }]);
    });

    it('会把 tool-call 与 finish-step(tool-calls) 映射为 tool_use', async () => {
      await createAndSetupSession();
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      mockedStreamText.mockReturnValue({
        fullStream: createFullStream([
          {
            type: 'tool-call',
            toolCallId: 'tc-1',
            toolName: 'search',
            input: { q: 'test' },
          },
          { type: 'finish-step', finishReason: 'tool-calls' },
        ]),
      } as unknown as ReturnType<typeof streamText>);

      const events: AgentEvent[] = [];
      for await (const event of adapter.prompt('session-uuid', [textBlock])) {
        events.push(event);
      }

      expect(events).toEqual([
        {
          type: 'tool_call',
          call: {
            id: 'tc-1',
            tool: 'search',
            args: { q: 'test' },
            status: 'pending',
          },
        },
        { type: 'done', stopReason: 'tool_use' },
      ]);
    });

    it('会把 tool-result 与 tool-error 映射为 completed/failed', async () => {
      await createAndSetupSession();
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      mockedStreamText.mockReturnValue({
        fullStream: createFullStream([
          {
            type: 'tool-result',
            toolCallId: 'tc-1',
            toolName: 'search',
            input: { q: 'test' },
            output: { items: ['result'] },
          },
          {
            type: 'tool-error',
            toolCallId: 'tc-2',
            toolName: 'lookup',
            input: { id: 'doc-1' },
            error: new Error('工具失败'),
          },
          { type: 'finish', finishReason: 'stop' },
        ]),
      } as unknown as ReturnType<typeof streamText>);

      const events: AgentEvent[] = [];
      for await (const event of adapter.prompt('session-uuid', [textBlock])) {
        events.push(event);
      }

      expect(events).toEqual([
        {
          type: 'tool_call',
          call: {
            id: 'tc-1',
            tool: 'search',
            args: { q: 'test' },
            status: 'completed',
            result: { items: ['result'] },
          },
        },
        {
          type: 'tool_call',
          call: {
            id: 'tc-2',
            tool: 'lookup',
            args: { id: 'doc-1' },
            status: 'failed',
            error: '工具失败',
          },
        },
        { type: 'done', stopReason: 'end_turn' },
      ]);
    });

    it('缺少 tenantId 时会抛错并将 session 标记为 error', async () => {
      const conversationSession: AgentSession = {
        id: 'conv-session',
        agentId: 'agent-001',
        mode: 'conversation',
        context: { history: [] },
        status: 'active',
        createdAt: NOW,
        updatedAt: NOW,
      };

      adapter.registerSessionMetadata('conv-session', '', 'step-conv');
      mockSessionPersistence.loadFromCheckpoint.mockResolvedValue(
        conversationSession,
      );

      const collectEvents = async () => {
        for await (const _event of adapter.prompt('conv-session', [
          textBlock,
        ])) {
          continue;
        }
      };

      await expect(collectEvents()).rejects.toThrow(/缺少 tenantId/i);
    });

    it('流式 error 事件会抛错', async () => {
      await createAndSetupSession();
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      mockedStreamText.mockReturnValue({
        fullStream: createFullStream([
          { type: 'error', error: new Error('模型流失败') },
        ]),
      } as unknown as ReturnType<typeof streamText>);

      const collectEvents = async () => {
        for await (const _event of adapter.prompt('session-uuid', [
          textBlock,
        ])) {
          continue;
        }
      };

      await expect(collectEvents()).rejects.toThrow('模型流失败');
    });
  });

  describe('cancel', () => {
    it('取消后会产出 cancelled done 事件，并把 session 标记为 completed', async () => {
      const session = await adapter.createSession(workflowCreateParams());
      mockSessionPersistence.loadFromCheckpoint.mockResolvedValue(
        makeWorkflowSession({
          ...session,
          context: { ...session.context, history: [] },
        }),
      );
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      mockedStreamText.mockImplementation(
        ({ abortSignal }) =>
          ({
            fullStream: (async function* () {
              await Promise.resolve();
              if (abortSignal?.aborted) {
                yield { type: 'abort' };
                return;
              }
              yield { type: 'finish', finishReason: 'stop' };
            })(),
          }) as unknown as ReturnType<typeof streamText>,
      );

      const iterator = adapter.prompt('session-uuid', [textBlock]);
      await adapter.cancel('session-uuid');

      const events: AgentEvent[] = [];
      for await (const event of iterator) {
        events.push(event);
      }

      expect(events).toContainEqual({ type: 'done', stopReason: 'cancelled' });
    });

    it('取消不存在的会话也不会抛错', async () => {
      await expect(adapter.cancel('missing-session')).resolves.not.toThrow();
    });
  });
});

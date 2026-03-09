import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { streamText } from 'ai';
import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import { InProcessAgentAdapter } from '../in-process-agent.adapter';
import type { CreateSessionParams } from '../types/agent-session.types';
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
      where: vi.fn().mockResolvedValue(Array.isArray(result) ? result : [result]),
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

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    mockDb = { select: vi.fn() };
    mockPiAiAdapter = { getModel: vi.fn().mockReturnValue('mock-model') };
    mockedStreamText.mockReset();

    type AdapterConstructorArgs = ConstructorParameters<typeof InProcessAgentAdapter>;
    adapter = new InProcessAgentAdapter(
      mockDb as unknown as AdapterConstructorArgs[0],
      mockPiAiAdapter as unknown as AdapterConstructorArgs[1],
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createSession', () => {
    it('会保留 workflow 上下文和 runtime 元信息', async () => {
      const params: CreateSessionParams = {
        agentId: 'agent-001',
        mode: 'workflow',
        tenantId: 'tenant-001',
        llmModelConfigId: 'model-config-001',
        systemPrompt: '你是一个专业翻译',
        autonomyMode: 'LLM_SUGGEST',
        context: { task: 'translate' },
      };

      const session = await adapter.createSession(params);

      expect(session).toMatchObject({
        agentId: 'agent-001',
        mode: 'workflow',
        tenantId: 'tenant-001',
        llmModelConfigId: 'model-config-001',
        systemPrompt: '你是一个专业翻译',
        autonomyMode: 'LLM_SUGGEST',
        status: 'active',
        context: {
          history: [],
          workflowState: { task: 'translate' },
        },
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
  });

  describe('loadSession', () => {
    it('会在会话不存在时抛错', async () => {
      await expect(adapter.loadSession('missing-session')).rejects.toThrow(/not found/i);
    });
  });

  describe('prompt', () => {
    it('会解析默认模型配置、流式输出 message_chunk，并在 stop finishReason 时结束', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'workflow',
        tenantId: 'tenant-001',
        systemPrompt: '你是一个总结助手',
      });
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      mockedStreamText.mockReturnValue({
        fullStream: createFullStream([
          { type: 'text-delta', text: 'Hello ' },
          { type: 'text-delta', text: 'world' },
          { type: 'finish', finishReason: 'stop' },
        ]),
      } as unknown as ReturnType<typeof streamText>);

      const events: AgentEvent[] = [];
      for await (const event of adapter.prompt(session.id, [textBlock])) {
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

      const loaded = await adapter.loadSession(session.id);
      expect(loaded.context.history).toEqual([textBlock]);
      expect(loaded.llmModelConfigId).toBe('model-config-001');
      expect(loaded.status).toBe('active');
    });

    it('在 LLM_SUGGEST 模式下会产出 decision 与 intervention_required', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'workflow',
        tenantId: 'tenant-001',
        autonomyMode: 'LLM_SUGGEST',
      });
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      mockedStreamText.mockReturnValue({
        fullStream: createFullStream([
          { type: 'text-delta', text: '建议稿' },
          { type: 'finish', finishReason: 'stop' },
        ]),
      } as unknown as ReturnType<typeof streamText>);

      const events: AgentEvent[] = [];
      for await (const event of adapter.prompt(session.id, [textBlock])) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: 'message_chunk', content: '建议稿' },
        {
          type: 'decision',
          suggestedContent: '建议稿',
          confidence: 0.5,
        },
        { type: 'done', stopReason: 'intervention_required' },
      ]);
    });

    it('会把 length finishReason 映射为 max_tokens', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'workflow',
        tenantId: 'tenant-001',
      });
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      mockedStreamText.mockReturnValue({
        fullStream: createFullStream([{ type: 'finish', finishReason: 'length' }]),
      } as unknown as ReturnType<typeof streamText>);

      const events: AgentEvent[] = [];
      for await (const event of adapter.prompt(session.id, [textBlock])) {
        events.push(event);
      }

      expect(events).toEqual([{ type: 'done', stopReason: 'max_tokens' }]);
    });

    it('缺少 tenantId 时会抛错并将 session 标记为 error', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'conversation',
      });

      const collectEvents = async () => {
        for await (const _event of adapter.prompt(session.id, [textBlock])) {
          continue;
        }
      };

      await expect(collectEvents()).rejects.toThrow(/缺少 tenantId/i);

      const loaded = await adapter.loadSession(session.id);
      expect(loaded.status).toBe('error');
    });

    it('流式 error 事件会抛错并将 session 标记为 error', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'workflow',
        tenantId: 'tenant-001',
      });
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      mockedStreamText.mockReturnValue({
        fullStream: createFullStream([
          { type: 'error', error: new Error('模型流失败') },
        ]),
      } as unknown as ReturnType<typeof streamText>);

      const collectEvents = async () => {
        for await (const _event of adapter.prompt(session.id, [textBlock])) {
          continue;
        }
      };

      await expect(collectEvents()).rejects.toThrow('模型流失败');

      const loaded = await adapter.loadSession(session.id);
      expect(loaded.status).toBe('error');
    });
  });

  describe('cancel', () => {
    it('取消后会产出 cancelled done 事件，并把 session 标记为 completed', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'workflow',
        tenantId: 'tenant-001',
      });
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      mockedStreamText.mockImplementation(
        ({ abortSignal }) =>
          ({
            fullStream: (async function* () {
              await Promise.resolve();
              if (abortSignal.aborted) {
                yield { type: 'abort' };
                return;
              }
              yield { type: 'finish', finishReason: 'stop' };
            })(),
          }) as unknown as ReturnType<typeof streamText>,
      );

      const iterator = adapter.prompt(session.id, [textBlock]);
      await adapter.cancel(session.id);

      const events: AgentEvent[] = [];
      for await (const event of iterator) {
        events.push(event);
      }

      expect(events).toContainEqual({ type: 'done', stopReason: 'cancelled' });
      const loaded = await adapter.loadSession(session.id);
      expect(loaded.status).toBe('completed');
    });

    it('取消不存在的会话也不会抛错', async () => {
      await expect(adapter.cancel('missing-session')).resolves.not.toThrow();
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  ConversationSessionDataIntegrityError,
  SessionPersistenceService,
} from '../services/session-persistence.service';
import { DRIZZLE } from '../../../database/database.module';
import type { AgentSession } from '../../agent/types/agent-session.types';
import type { ConversationReplayEntry } from '../../agent/types/conversation-history.types';

const STEP_ID = '019391d4-a000-7000-0000-000000000001';
const TENANT_ID = '019391d4-c000-7000-0000-000000000003';
const NOW = new Date('2025-01-01T00:00:00Z');

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'session-001',
    agentId: 'agent-001',
    mode: 'workflow',
    context: {
      history: [{ type: 'text', text: 'hello' }],
      workflowState: { executionId: 'exec-1', stepId: STEP_ID, nodeId: 'n1' },
    },
    status: 'active',
    tenantId: TENANT_ID,
    llmModelConfigId: 'llm-cfg-001',
    systemPrompt: 'You are helpful.',
    autonomyMode: 'FULL_AUTO',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createUpdateChainVoid() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

describe('SessionPersistenceService', () => {
  let service: SessionPersistenceService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        SessionPersistenceService,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    service = module.get(SessionPersistenceService);
  });

  describe('serializeSession()', () => {
    it('应将 AgentSession 序列化为 JSON-safe 对象', () => {
      const session = makeSession();
      (session.context as Record<string, unknown>).serverSandbox = {
        executionId: '019391d4-e000-7000-0000-000000000005',
      };
      const result = service.serializeSession(session);

      expect(result.id).toBe('session-001');
      expect(result.agentId).toBe('agent-001');
      expect(result.mode).toBe('workflow');
      expect(result.status).toBe('active');
      expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z');
      expect(result.updatedAt).toBe('2025-01-01T00:00:00.000Z');
      expect(result.context.history).toEqual([
        { type: 'text', text: 'hello' },
      ]);
      expect(result.context.workflowState).toEqual({
        executionId: 'exec-1',
        stepId: STEP_ID,
        nodeId: 'n1',
      });
      expect((result.context as Record<string, unknown>).serverSandbox).toEqual({
        executionId: '019391d4-e000-7000-0000-000000000005',
      });
    });
  });

  describe('deserializeSession()', () => {
    it('应将序列化数据还原为 AgentSession', () => {
      const session = makeSession();
      (session.context as Record<string, unknown>).serverSandbox = {
        executionId: '019391d4-e000-7000-0000-000000000005',
      };
      const serialized = service.serializeSession(session);
      const result = service.deserializeSession(
        serialized as unknown as Record<string, unknown>,
      );

      expect(result.id).toBe(session.id);
      expect(result.mode).toBe('workflow');
      expect(result.createdAt).toEqual(NOW);
      expect(result.updatedAt).toEqual(NOW);
      expect(result.context.history).toEqual(session.context.history);
      expect((result.context as Record<string, unknown>).serverSandbox).toEqual({
        executionId: '019391d4-e000-7000-0000-000000000005',
      });
    });

    it('缺少 history 时应默认为空数组', () => {
      const result = service.deserializeSession({
        id: 's1',
        agentId: 'a1',
        mode: 'conversation',
        context: {},
        status: 'active',
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      });

      expect(result.context.history).toEqual([]);
    });
  });

  describe('saveToCheckpoint()', () => {
    it('应合并 session 数据到现有 checkpointData', async () => {
      const existingCheckpoint = { output: 'some output', dagState: {} };
      mockDb.select.mockReturnValue(
        createSelectChain([{ checkpointData: existingCheckpoint }]),
      );
      mockDb.update.mockReturnValue(createUpdateChainVoid());

      await service.saveToCheckpoint(TENANT_ID, STEP_ID, makeSession());

      const setArg = mockDb.update.mock.results[0].value.set.mock.calls[0][0];
      expect(setArg.checkpointData).toMatchObject({
        output: 'some output',
        dagState: {},
        session: expect.objectContaining({ id: 'session-001' }),
      });
    });

    it('checkpointData 为 null 时应创建新的', async () => {
      mockDb.select.mockReturnValue(
        createSelectChain([{ checkpointData: null }]),
      );
      mockDb.update.mockReturnValue(createUpdateChainVoid());

      await service.saveToCheckpoint(TENANT_ID, STEP_ID, makeSession());

      const setArg = mockDb.update.mock.results[0].value.set.mock.calls[0][0];
      expect(setArg.checkpointData).toMatchObject({
        session: expect.objectContaining({ id: 'session-001' }),
      });
    });
  });

  describe('loadFromCheckpoint()', () => {
    it('无 session 数据时应返回 null', async () => {
      mockDb.select.mockReturnValue(
        createSelectChain([{ checkpointData: {} }]),
      );

      const result = await service.loadFromCheckpoint(TENANT_ID, STEP_ID);
      expect(result).toBeNull();
    });

    it('step 不存在时应返回 null', async () => {
      mockDb.select.mockReturnValue(createSelectChain([]));

      const result = await service.loadFromCheckpoint(TENANT_ID, STEP_ID);
      expect(result).toBeNull();
    });

    it('有 session 数据时应反序列化返回', async () => {
      const serialized = service.serializeSession(makeSession());
      mockDb.select.mockReturnValue(
        createSelectChain([{ checkpointData: { session: serialized } }]),
      );

      const result = await service.loadFromCheckpoint(TENANT_ID, STEP_ID);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('session-001');
      expect(result!.mode).toBe('workflow');
      expect(result!.createdAt).toEqual(NOW);
    });
  });

  describe('conversation persistence', () => {
    const replayEntry: ConversationReplayEntry = {
      kind: 'user_message',
      content: [{ type: 'text', text: '继续' }],
    };

    it('应保存 conversation session 到独立 durable store', async () => {
      mockDb.select.mockReturnValue(createSelectChain([]));
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      await service.saveConversationSession(
        (() => {
          const session = makeSession({
            id: 'conversation-001',
            mode: 'conversation',
            context: {
              history: [{ type: 'text', text: 'hello' }],
              cwd: '/workspace/demo',
              mcpServers: {
                docs: {
                  transportType: 'stdio',
                  command: 'node',
                  args: ['mcp.js'],
                },
              },
            },
          });
          (session.context as Record<string, unknown>).serverSandbox = {
            executionId: '019391d4-e000-7000-0000-000000000005',
          };
          return session;
        })(),
      );

      const valuesArg = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(valuesArg).toMatchObject({
        sessionId: 'conversation-001',
        tenantId: TENANT_ID,
        agentId: 'agent-001',
        sessionSnapshot: expect.objectContaining({
          id: 'conversation-001',
          mode: 'conversation',
          context: expect.objectContaining({
            serverSandbox: {
              executionId: '019391d4-e000-7000-0000-000000000005',
            },
          }),
        }),
        replayEntries: [],
      });
    });

    it('应从独立 durable store 加载 conversation session', async () => {
      const session = makeSession({
        id: 'conversation-001',
        mode: 'conversation',
      });
      (session.context as Record<string, unknown>).serverSandbox = {
        executionId: '019391d4-e000-7000-0000-000000000005',
      };
      const serialized = service.serializeSession(session);
      mockDb.select.mockReturnValue(
        createSelectChain([
          {
            sessionSnapshot: serialized,
          },
        ]),
      );

      const result = await service.loadConversationSession('conversation-001');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('conversation-001');
      expect(result?.mode).toBe('conversation');
      expect((result?.context as Record<string, unknown>).serverSandbox).toEqual({
        executionId: '019391d4-e000-7000-0000-000000000005',
      });
    });

    it('应在 conversation session snapshot 损坏时抛出数据完整性错误', async () => {
      mockDb.select.mockReturnValue(
        createSelectChain([
          {
            sessionSnapshot: {
              id: 'conversation-001',
              agentId: 'agent-001',
              mode: 'broken-mode',
              context: { history: [] },
              status: 'active',
              createdAt: NOW.toISOString(),
              updatedAt: NOW.toISOString(),
            },
          },
        ]),
      );

      await expect(
        service.loadConversationSession('conversation-001'),
      ).rejects.toBeInstanceOf(ConversationSessionDataIntegrityError);
      await expect(
        service.loadConversationSession('conversation-001'),
      ).rejects.toMatchObject({
        message: expect.stringContaining('session snapshot'),
      });
    });

    it('应为 conversation session 追加 replay ledger 并同步保存快照', async () => {
      const session = makeSession({
        id: 'conversation-001',
        mode: 'conversation',
      });
      (session.context as Record<string, unknown>).serverSandbox = {
        executionId: '019391d4-e000-7000-0000-000000000005',
      };
      const serialized = service.serializeSession(session);
      mockDb.select.mockReturnValue(
        createSelectChain([
          {
            replayEntries: [],
            sessionSnapshot: serialized,
          },
        ]),
      );
      mockDb.update.mockReturnValue(createUpdateChainVoid());

      await service.appendConversationReplayEntry(
        session,
        replayEntry,
      );

      const setArg = mockDb.update.mock.results[0].value.set.mock.calls[0][0];
      expect(setArg).toMatchObject({
        replayEntries: [replayEntry],
        sessionSnapshot: expect.objectContaining({
          id: 'conversation-001',
          mode: 'conversation',
          context: expect.objectContaining({
            serverSandbox: {
              executionId: '019391d4-e000-7000-0000-000000000005',
            },
          }),
        }),
      });
    });

    it('应读取 conversation replay ledger', async () => {
      mockDb.select.mockReturnValue(
        createSelectChain([
          {
            replayEntries: [replayEntry],
          },
        ]),
      );

      await expect(
        service.loadConversationReplay('conversation-001'),
      ).resolves.toEqual([replayEntry]);
    });

    it('应在 replay ledger 损坏时拒绝静默降级为空历史', async () => {
      mockDb.select.mockReturnValue(
        createSelectChain([
          {
            replayEntries: { kind: 'user_message' },
          },
        ]),
      );

      await expect(
        service.loadConversationReplay('conversation-001'),
      ).rejects.toBeInstanceOf(ConversationSessionDataIntegrityError);
      await expect(
        service.loadConversationReplay('conversation-001'),
      ).rejects.toMatchObject({
        message: expect.stringContaining('replay entries'),
      });
    });

    it('应在追加 replay 前拒绝损坏的历史 ledger', async () => {
      mockDb.select.mockReturnValue(
        createSelectChain([
          {
            replayEntries: { invalid: true },
            sessionSnapshot: service.serializeSession(
              makeSession({
                id: 'conversation-001',
                mode: 'conversation',
              }),
            ),
          },
        ]),
      );

      await expect(
        service.appendConversationReplayEntry(
          makeSession({
            id: 'conversation-001',
            mode: 'conversation',
          }),
          replayEntry,
        ),
      ).rejects.toBeInstanceOf(ConversationSessionDataIntegrityError);
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });
});

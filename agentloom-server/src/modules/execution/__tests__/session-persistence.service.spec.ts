import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { SessionPersistenceService } from '../services/session-persistence.service';
import { DRIZZLE } from '../../../database/database.module';
import type { AgentSession } from '../../agent/types/agent-session.types';

const STEP_ID = '019391d4-a000-7000-0000-000000000001';
const TENANT_ID = '019391d4-c000-7000-0000-000000000003';
const NOW = new Date('2025-01-01T00:00:00Z');

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'session-001',
    agentId: 'agent-001',
    mode: 'workflow',
    context: {
      history: [{ role: 'user', content: 'hello' }],
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
      const result = service.serializeSession(session);

      expect(result.id).toBe('session-001');
      expect(result.agentId).toBe('agent-001');
      expect(result.mode).toBe('workflow');
      expect(result.status).toBe('active');
      expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z');
      expect(result.updatedAt).toBe('2025-01-01T00:00:00.000Z');
      expect(result.context.history).toEqual([
        { role: 'user', content: 'hello' },
      ]);
      expect(result.context.workflowState).toEqual({
        executionId: 'exec-1',
        stepId: STEP_ID,
        nodeId: 'n1',
      });
    });
  });

  describe('deserializeSession()', () => {
    it('应将序列化数据还原为 AgentSession', () => {
      const session = makeSession();
      const serialized = service.serializeSession(session);
      const result = service.deserializeSession(
        serialized as unknown as Record<string, unknown>,
      );

      expect(result.id).toBe(session.id);
      expect(result.mode).toBe('workflow');
      expect(result.createdAt).toEqual(NOW);
      expect(result.updatedAt).toEqual(NOW);
      expect(result.context.history).toEqual(session.context.history);
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
});

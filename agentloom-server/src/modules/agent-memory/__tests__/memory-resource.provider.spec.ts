import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMockDb: () => ({
    insert: vi.fn(),
    update: vi.fn(),
  }),
  getTenantDb: vi.fn(),
  operators: {
    and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
  },
}));

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');

  return {
    ...actual,
    and: mocks.operators.and,
    eq: mocks.operators.eq,
  };
});

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

import type { DrizzleDB } from '../../../database/database.module';
import {
  memorySessions,
  type MemorySession,
  type MemorySessionConfig,
} from '../../../database/schema';
import {
  MEMORY_RESOURCE_TYPE,
  MemoryResourceProvider,
} from '../memory-resource.provider';
import { AgentMemoryModule } from '../agent-memory.module';

type MockDb = ReturnType<typeof mocks.createMockDb>;

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const INSTANCE_ID = '33333333-3333-4333-8333-333333333333';
const EXECUTION_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2025-02-01T08:00:00.000Z');

function createInsertChain<TResult>(result: TResult[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });

  return {
    chain: { values },
    values,
    returning,
  };
}

function createUpdateChain<TResult>(result: TResult[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });

  return {
    chain: { set },
    set,
    where,
    returning,
  };
}

function createMemorySessionConfig(
  overrides: Partial<MemorySessionConfig> = {},
): MemorySessionConfig {
  return {
    bootUris: ['memory://core/agent'],
    fusionPriority: 3,
    ...overrides,
  };
}

function createSession(overrides: Partial<MemorySession> = {}): MemorySession {
  return {
    id: SESSION_ID,
    tenantId: TENANT_ID,
    memoryInstanceId: INSTANCE_ID,
    executionId: EXECUTION_ID,
    agentConversationId: null,
    role: 'primary',
    status: 'active',
    config: createMemorySessionConfig(),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('MemoryResourceProvider', () => {
  let provider: MemoryResourceProvider;
  let rawDb: MockDb;
  let tenantDb: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();

    rawDb = mocks.createMockDb();
    tenantDb = mocks.createMockDb();
    mocks.getTenantDb.mockReturnValue(tenantDb as unknown as DrizzleDB);

    provider = new MemoryResourceProvider(rawDb as unknown as DrizzleDB);
  });

  it('should expose memory resource type constant', () => {
    expect(MEMORY_RESOURCE_TYPE).toBe('memory');
    expect(provider.type).toBe('memory');
  });

  describe('create', () => {
    it('should insert an active memory session and return the resource instance', async () => {
      const session = createSession();
      const insertQuery = createInsertChain([session]);

      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        provider.create({
          memoryInstanceId: INSTANCE_ID,
          role: 'readonly',
          bootUris: ['memory://core/agent', 'memory://notes/context'],
          fusionPriority: 9,
          tenantId: TENANT_ID,
          executionId: EXECUTION_ID,
        }),
      ).resolves.toEqual({
        sessionId: session.id,
        session,
        memoryInstanceId: INSTANCE_ID,
        tenantId: TENANT_ID,
      });

      expect(mocks.getTenantDb).toHaveBeenCalledWith(rawDb);
      expect(tenantDb.insert).toHaveBeenCalledWith(memorySessions);
      expect(insertQuery.values).toHaveBeenCalledWith({
        memoryInstanceId: INSTANCE_ID,
        executionId: EXECUTION_ID,
        agentConversationId: undefined,
        tenantId: TENANT_ID,
        role: 'readonly',
        status: 'active',
        config: {
          bootUris: ['memory://core/agent', 'memory://notes/context'],
          fusionPriority: 9,
        },
      });
    });

    it('should throw when the insert does not return a created session', async () => {
      const insertQuery = createInsertChain([]);

      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        provider.create({
          memoryInstanceId: INSTANCE_ID,
          role: 'primary',
          bootUris: [],
          fusionPriority: 0,
          tenantId: TENANT_ID,
          executionId: EXECUTION_ID,
        }),
      ).rejects.toThrow('Failed to create memory session resource');
    });
  });

  describe('destroy', () => {
    it('should soft disconnect the session instead of deleting it', async () => {
      const session = createSession();
      const updateQuery = createUpdateChain([{ id: session.id }]);

      tenantDb.update.mockReturnValueOnce(updateQuery.chain);

      await expect(
        provider.destroy({
          sessionId: session.id,
          session,
          memoryInstanceId: session.memoryInstanceId,
          tenantId: TENANT_ID,
        }),
      ).resolves.toBeUndefined();

      expect(mocks.getTenantDb).toHaveBeenCalledWith(rawDb);
      expect(tenantDb.update).toHaveBeenCalledWith(memorySessions);
      expect(updateQuery.set).toHaveBeenCalledWith({ status: 'disconnected' });
      expect(updateQuery.where).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'and' }),
      );
    });
  });

  describe('share', () => {
    it('should record shared consumer metadata without throwing', async () => {
      const session = createSession({
        config: createMemorySessionConfig({
          bootUris: ['memory://core/agent'],
          fusionPriority: 5,
        }),
      });
      const updateQuery = createUpdateChain([{ id: session.id }]);

      tenantDb.update.mockReturnValueOnce(updateQuery.chain);

      await expect(
        provider.share(
          {
            sessionId: session.id,
            session,
            memoryInstanceId: session.memoryInstanceId,
            tenantId: TENANT_ID,
          },
          'consumer-1',
        ),
      ).resolves.toBeUndefined();

      expect(mocks.getTenantDb).toHaveBeenCalledWith(rawDb);
      expect(tenantDb.update).toHaveBeenCalledWith(memorySessions);
      expect(updateQuery.set).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            bootUris: ['memory://core/agent'],
            fusionPriority: 5,
            sharedConsumers: ['consumer-1'],
            shareCount: 1,
            shareLog: [
              expect.objectContaining({
                consumerId: 'consumer-1',
                sharedAt: expect.any(String),
              }),
            ],
          }),
        }),
      );
      expect(updateQuery.where).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'and' }),
      );
    });

    it('should rebuild default share config when the current config is null', async () => {
      const session = createSession({ config: null });
      const updateQuery = createUpdateChain([{ id: session.id }]);
      const instance = {
        sessionId: session.id,
        session,
        memoryInstanceId: session.memoryInstanceId,
        tenantId: TENANT_ID,
      };

      tenantDb.update.mockReturnValueOnce(updateQuery.chain);

      await expect(provider.share(instance, 'consumer-fallback')).resolves.toBeUndefined();

      const updatePayload = updateQuery.set.mock.calls[0]?.[0] as {
        config: Record<string, unknown>;
      };
      expect(updatePayload.config).toEqual(
        expect.objectContaining({
          bootUris: [],
          fusionPriority: 0,
          sharedConsumers: ['consumer-fallback'],
          shareCount: 1,
          shareLog: [
            expect.objectContaining({
              consumerId: 'consumer-fallback',
            }),
          ],
        }),
      );
      expect(instance.session.config).toEqual(updatePayload.config);
    });
  });

  describe('AgentMemoryModule', () => {
    it('should pass module init when the memory resource provider is already registered', () => {
      const registry = {
        getProvider: vi.fn().mockReturnValue({ type: MEMORY_RESOURCE_TYPE }),
      };
      const memoryProvider = { type: MEMORY_RESOURCE_TYPE } as MemoryResourceProvider;
      const module = new AgentMemoryModule(
        registry as never,
        memoryProvider as never,
      );

      expect(() => module.onModuleInit()).not.toThrow();
      expect(registry.getProvider).toHaveBeenCalledWith(MEMORY_RESOURCE_TYPE);
    });

    it('should fail module init when the provider is missing from the registry', () => {
      const registry = {
        getProvider: vi.fn().mockReturnValue(undefined),
      };
      const memoryProvider = { type: MEMORY_RESOURCE_TYPE } as MemoryResourceProvider;
      const module = new AgentMemoryModule(
        registry as never,
        memoryProvider as never,
      );

      expect(() => module.onModuleInit()).toThrow(
        /MemoryResourceProvider \('memory'\) not found in SharedResourceRegistry/,
      );
    });
  });
});

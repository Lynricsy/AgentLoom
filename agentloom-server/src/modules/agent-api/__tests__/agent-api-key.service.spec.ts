import { createHash } from 'node:crypto';

import { HttpStatus } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import type { AgentApiKey } from '../../../database/schema';
import { AgentNotFoundException } from '../../agent-definition/agent-definition.exceptions';
import {
  AgentApiKeyInvalidException,
  AgentApiKeyLimitExceededException,
  AgentApiKeyNotFoundException,
} from '../agent-api.exceptions';
import { AgentApiKeyService } from '../agent-api-key.service';
import { CreateAgentApiKeySchema } from '../dto/create-agent-api-key.dto';
import { QueryAgentApiKeySchema } from '../dto/query-agent-api-key.dto';

const TENANT_ID = '019391d4-a000-7000-8000-000000000001';
const USER_ID = '019391d4-b000-7000-8000-000000000002';
const AGENT_ID = '019391d4-c000-7000-8000-000000000003';
const KEY_ID = '019391d4-d000-7000-8000-000000000004';
const NOW = new Date('2026-10-01T08:00:00.000Z');
const VALID_RAW_KEY = `alak_${'ab'.repeat(32)}`;

type Operation = {
  kind: 'select' | 'insert' | 'update';
  values?: Record<string, unknown>;
  set?: Record<string, unknown>;
};

type QueryResult = unknown[] | ((operation: Operation) => unknown[]);

/**
 * 链式 Drizzle 查询替身：每条查询被 await 时按顺序消费一份预置结果
 * （函数形式可基于本次写入内容构造返回行），并记录 insert/update 写入的内容供断言。
 */
function createDbMock(results: QueryResult[]) {
  const operations: Operation[] = [];

  function chain(operation: Operation) {
    operations.push(operation);
    const builder: Record<string, unknown> = {};
    for (const method of [
      'from',
      'where',
      'limit',
      'offset',
      'orderBy',
      'for',
      'returning',
    ]) {
      builder[method] = () => builder;
    }
    builder.values = (values: Record<string, unknown>) => {
      operation.values = values;
      return builder;
    };
    builder.set = (set: Record<string, unknown>) => {
      operation.set = set;
      return builder;
    };
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => {
      const next = results.shift() ?? [];
      return Promise.resolve(
        typeof next === 'function' ? next(operation) : next,
      ).then(resolve, reject);
    };
    return builder;
  }

  const db = {
    select: vi.fn(() => chain({ kind: 'select' })),
    insert: vi.fn(() => chain({ kind: 'insert' })),
    update: vi.fn(() => chain({ kind: 'update' })),
  };

  return { db: db as unknown as DrizzleDB, operations };
}

function createKeyRecord(overrides: Partial<AgentApiKey> = {}): AgentApiKey {
  return {
    id: KEY_ID,
    tenantId: TENANT_ID,
    agentDefinitionId: AGENT_ID,
    name: 'crm-integration',
    keyHash: createHash('sha256').update(VALID_RAW_KEY).digest('hex'),
    keyPrefix: VALID_RAW_KEY.slice(0, 13),
    rateLimitPerMinute: 60,
    maxConcurrentRuns: 5,
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    createdBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('AgentApiKeyService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create', () => {
    it('返回一次性明文 alak_ Key，库里只存 SHA-256 与前缀', async () => {
      const { db, operations } = createDbMock([
        [{ id: AGENT_ID }],
        [{ count: 19 }],
        (op) => [createKeyRecord({ ...op.values, id: KEY_ID })],
      ]);
      const service = new AgentApiKeyService(db);

      const dto = CreateAgentApiKeySchema.parse({
        name: 'crm-integration',
        rate_limit_per_minute: 60,
        expires_at: '2027-01-01T00:00:00Z',
      });
      const created = await service.create(TENANT_ID, AGENT_ID, USER_ID, dto);

      expect(created.key).toMatch(/^alak_[0-9a-f]{64}$/);
      expect(created.keyPrefix).toBe(created.key.slice(0, 13));
      expect(created.maxConcurrentRuns).toBe(5);
      expect(created.expiresAt).toBe('2027-01-01T00:00:00.000Z');
      const inserted = operations.find((op) => op.kind === 'insert')?.values;
      expect(inserted).toMatchObject({
        tenantId: TENANT_ID,
        agentDefinitionId: AGENT_ID,
        createdBy: USER_ID,
        keyHash: createHash('sha256').update(created.key).digest('hex'),
        keyPrefix: created.key.slice(0, 13),
      });
      expect(Object.values(inserted ?? {})).not.toContain(created.key);
      expect(operations.some((op) => op.kind === 'update')).toBe(false);
    });

    it('未吊销 Key 达到 20 个时返回 409 且不写库', async () => {
      const { db, operations } = createDbMock([
        [{ id: AGENT_ID }],
        [{ count: 20 }],
      ]);
      const service = new AgentApiKeyService(db);

      const error = await service
        .create(
          TENANT_ID,
          AGENT_ID,
          USER_ID,
          CreateAgentApiKeySchema.parse({ name: 'k' }),
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AgentApiKeyLimitExceededException);
      expect((error as AgentApiKeyLimitExceededException).getStatus()).toBe(
        HttpStatus.CONFLICT,
      );
      expect(operations.some((op) => op.kind === 'insert')).toBe(false);
    });

    it('Agent 不在当前租户时返回 404', async () => {
      const { db } = createDbMock([[]]);
      const service = new AgentApiKeyService(db);

      await expect(
        service.create(
          TENANT_ID,
          AGENT_ID,
          USER_ID,
          CreateAgentApiKeySchema.parse({ name: 'k' }),
        ),
      ).rejects.toBeInstanceOf(AgentNotFoundException);
    });
  });

  describe('请求参数', () => {
    it('max_concurrent_runs 默认 5，越界值被拒绝', () => {
      expect(
        CreateAgentApiKeySchema.parse({ name: 'k' }).max_concurrent_runs,
      ).toBe(5);
      expect(
        CreateAgentApiKeySchema.safeParse({
          name: 'k',
          max_concurrent_runs: 51,
        }).success,
      ).toBe(false);
      expect(
        CreateAgentApiKeySchema.safeParse({
          name: 'k',
          rate_limit_per_minute: 6001,
        }).success,
      ).toBe(false);
    });

    it('page_size 超过 100 时按 100 处理', () => {
      expect(QueryAgentApiKeySchema.parse({ page_size: '500' })).toEqual({
        page: 1,
        page_size: 100,
        status: 'active',
      });
    });
  });

  describe('list', () => {
    it('返回 camelCase 分页结果', async () => {
      const { db } = createDbMock([
        [{ id: AGENT_ID }],
        [createKeyRecord({ revokedAt: NOW })],
        [{ count: 21 }],
      ]);
      const service = new AgentApiKeyService(db);

      const result = await service.list(
        AGENT_ID,
        QueryAgentApiKeySchema.parse({ page: 2, page_size: 1, status: 'all' }),
      );

      expect(result.meta).toEqual({ page: 2, pageSize: 1, total: 21 });
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: KEY_ID,
          revokedAt: NOW.toISOString(),
          createdAt: NOW.toISOString(),
        }),
      );
      expect(result.data[0]).not.toHaveProperty('keyHash');
    });
  });

  describe('revoke', () => {
    it('首次吊销写入 revokedAt', async () => {
      const { db, operations } = createDbMock([
        [{ id: KEY_ID, revokedAt: null }],
        [],
      ]);
      const service = new AgentApiKeyService(db);

      await service.revoke(AGENT_ID, KEY_ID);

      expect(operations.find((op) => op.kind === 'update')?.set).toEqual({
        revokedAt: NOW,
        updatedAt: NOW,
      });
    });

    it('重复吊销幂等成功，不改写原吊销时间', async () => {
      const { db, operations } = createDbMock([
        [{ id: KEY_ID, revokedAt: new Date('2026-09-01T00:00:00Z') }],
      ]);
      const service = new AgentApiKeyService(db);

      await expect(service.revoke(AGENT_ID, KEY_ID)).resolves.toBeUndefined();
      expect(operations.some((op) => op.kind === 'update')).toBe(false);
    });

    it('Key 不属于该 Agent 时返回 404', async () => {
      const { db } = createDbMock([[]]);
      const service = new AgentApiKeyService(db);

      await expect(service.revoke(AGENT_ID, KEY_ID)).rejects.toBeInstanceOf(
        AgentApiKeyNotFoundException,
      );
    });
  });

  describe('validate', () => {
    it('有效 Key 返回调用方上下文，并异步刷新 last_used_at', async () => {
      const { db, operations } = createDbMock([[createKeyRecord()], []]);
      const service = new AgentApiKeyService(db);

      await expect(service.validate(VALID_RAW_KEY)).resolves.toEqual({
        keyId: KEY_ID,
        tenantId: TENANT_ID,
        agentDefinitionId: AGENT_ID,
        keyPrefix: VALID_RAW_KEY.slice(0, 13),
        maxConcurrentRuns: 5,
        rateLimitPerMinute: 60,
      });
      expect(operations.find((op) => op.kind === 'update')?.set).toEqual({
        lastUsedAt: NOW,
      });
    });

    it('last_used_at 一分钟内已刷新过时不再写库', async () => {
      const { db, operations } = createDbMock([
        [createKeyRecord({ lastUsedAt: new Date(NOW.getTime() - 30_000) })],
      ]);
      const service = new AgentApiKeyService(db);

      await service.validate(VALID_RAW_KEY);

      expect(operations.some((op) => op.kind === 'update')).toBe(false);
    });

    it.each([
      ['平台 Token 前缀', `al_${'ab'.repeat(32)}`],
      ['长度不符', 'alak_abcdef'],
      ['非 hex 字符', `alak_${'zz'.repeat(32)}`],
    ])('格式不合法（%s）时直接 401，不查库', async (_label, rawKey) => {
      const { db } = createDbMock([]);
      const service = new AgentApiKeyService(db);

      await expect(service.validate(rawKey)).rejects.toBeInstanceOf(
        AgentApiKeyInvalidException,
      );
      expect(db.select).not.toHaveBeenCalled();
    });

    it.each([
      ['未知 Key', []],
      ['已吊销', [createKeyRecord({ revokedAt: new Date('2026-09-30') })]],
      ['已过期', [createKeyRecord({ expiresAt: NOW })]],
    ])('%s 返回 401 agent-api-key-invalid', async (_label, rows) => {
      const { db } = createDbMock([rows]);
      const service = new AgentApiKeyService(db);

      const error = await service
        .validate(VALID_RAW_KEY)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AgentApiKeyInvalidException);
      expect((error as AgentApiKeyInvalidException).type).toBe(
        'https://agentloom.dev/errors/agent-api-key-invalid',
      );
      expect((error as AgentApiKeyInvalidException).getStatus()).toBe(
        HttpStatus.UNAUTHORIZED,
      );
    });
  });
});

import * as crypto from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentApiRuns } from '../src/database/schema/agent-api-runs.schema';
import { AgentApiEventStreamService } from '../src/modules/agent-api-runtime/agent-api-event-stream.service';
import { AgentApiRunService } from '../src/modules/agent-api-runtime/agent-api-run.service';
import type { AgentApiKeyContext } from '../src/modules/agent-api/agent-api.types';
import {
  AgentApiService,
  type CreateAgentApiRunResult,
} from '../src/modules/agent-api/agent-api.service';
import { AgentConversationService } from '../src/modules/agent-conversation/agent-conversation.service';
import {
  createRlsTestContext,
  seedAppUser,
  withTenantContext,
  type RlsTestContext,
} from './rls/rls-test-utils';

const ERROR_TYPE_BASE = 'https://agentloom.dev/errors/';

type Fixture = {
  tenantId: string;
  userId: string;
  agentId: string;
  key: AgentApiKeyContext;
};

/**
 * 在真实 Postgres 上验证建 run 的并发控制（设计文档 7.3）：
 * Key 行 `FOR UPDATE` 串行化同一 Key 的建 run 请求，计数不会被并发插队；
 * 同一对话的部分唯一索引保证至多一个活跃 run。
 */
describe('Agent API run concurrency (testcontainers)', () => {
  let context: RlsTestContext;
  let fixture: Fixture;
  let service: AgentApiService;
  let runService: AgentApiRunService;

  beforeAll(async () => {
    context = await createRlsTestContext();
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.adminSql`DELETE FROM agent_api_runs`;
    await context.adminSql`DELETE FROM agent_messages`;
    await context.adminSql`DELETE FROM agent_conversations`;
    await context.adminSql`DELETE FROM agent_api_keys`;
    await context.adminSql`DELETE FROM agent_definitions`;
    await context.reset();

    fixture = await seedFixture(context, { maxConcurrentRuns: 2 });

    // 事件流与派发是旁路，替身即可；数据库全部走真实连接与 RLS
    const eventStream = {
      append: vi.fn(async () => '1-0'),
      expire: vi.fn(async () => undefined),
    } as unknown as AgentApiEventStreamService;
    runService = new AgentApiRunService(context.db, eventStream);
    const eventEmitter = { emit: vi.fn() };
    const conversationService = new AgentConversationService(
      context.db,
      eventEmitter as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const executionService = {
      dispatchExecution: vi.fn(async () => undefined),
      abortExecution: vi.fn(async () => undefined),
    };

    service = new AgentApiService(
      context.db,
      runService,
      eventStream,
      conversationService,
      executionService as never,
      eventEmitter as never,
    );
  });

  async function createConversations(count: number): Promise<string[]> {
    const conversations = [];
    for (let index = 0; index < count; index += 1) {
      conversations.push(
        await service.createConversation(fixture.key, {
          externalUserId: `user-${index}`,
        }),
      );
    }
    return conversations.map((conversation) => conversation.id);
  }

  async function countActiveRuns(): Promise<number> {
    const rows = await withTenantContext(context.db, fixture.tenantId, (tx) =>
      tx
        .select({ id: agentApiRuns.id })
        .from(agentApiRuns)
        .where(
          and(
            eq(agentApiRuns.apiKeyId, fixture.key.keyId),
            inArray(agentApiRuns.status, ['queued', 'running']),
          ),
        ),
    );
    return rows.length;
  }

  it('同一 Key 在 6 个对话上并行建 run：恰好 2 个成功，4 个 concurrency-limit-exceeded', async () => {
    const conversationIds = await createConversations(6);

    const results = await Promise.allSettled(
      conversationIds.map((conversationId) =>
        service.createRun(fixture.key, conversationId, {
          body: { input: { content: `并发消息 ${conversationId}` } },
        }),
      ),
    );

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(4);
    for (const result of rejected) {
      expect(result.reason).toMatchObject({
        type: `${ERROR_TYPE_BASE}concurrency-limit-exceeded`,
        status: 429,
        headers: { 'Retry-After': '5' },
      });
    }
    expect(await countActiveRuns()).toBe(2);
  });

  it('同一对话并行建 2 个 run：恰好 1 个成功，1 个 conversation-busy', async () => {
    const [conversationId] = await createConversations(1);

    const results = await Promise.allSettled([
      service.createRun(fixture.key, conversationId, {
        body: { input: { content: '第一条' } },
      }),
      service.createRun(fixture.key, conversationId, {
        body: { input: { content: '第二条' } },
      }),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<CreateAgentApiRunResult> =>
        result.status === 'fulfilled',
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      type: `${ERROR_TYPE_BASE}conversation-busy`,
      status: 409,
      extensions: { activeRunId: fulfilled[0].value.run.id },
    });
    expect(await countActiveRuns()).toBe(1);
  });

  it('并行重放同一 Idempotency-Key 只创建一个 run', async () => {
    const [conversationId] = await createConversations(1);
    const request = {
      body: { input: { content: '幂等消息' } },
      idempotencyKey: 'order-1024-msg-1',
    };

    const [first, second] = await Promise.all([
      service.createRun(fixture.key, conversationId, request),
      service.createRun(fixture.key, conversationId, request),
    ]);

    expect(first.run.id).toBe(second.run.id);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(await countActiveRuns()).toBe(1);
  });

  it('取消 queued run 释放并发名额，对话仍可继续建 run', async () => {
    const [conversationId] = await createConversations(1);
    const { run } = await service.createRun(fixture.key, conversationId, {
      body: { input: { content: '准备取消' } },
    });

    const cancelled = await service.cancelRun(
      fixture.key,
      conversationId,
      run.id,
    );
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      stopReason: 'cancelled',
    });
    await expect(
      service.cancelRun(fixture.key, conversationId, run.id),
    ).resolves.toMatchObject({ status: 'cancelled' });
    expect(await countActiveRuns()).toBe(0);

    const next = await service.createRun(fixture.key, conversationId, {
      body: { input: { content: '继续' } },
    });
    expect(next.run.status).toBe('queued');
  });

  it('其他 Key 创建的对话对当前 Key 不可见', async () => {
    const [conversationId] = await createConversations(1);
    const otherKey = await seedKey(context, fixture, { maxConcurrentRuns: 5 });

    await expect(
      service.createRun(otherKey, conversationId, {
        body: { input: { content: '越权' } },
      }),
    ).rejects.toMatchObject({
      type: `${ERROR_TYPE_BASE}agent-api-conversation-not-found`,
      status: 404,
    });
  });
});

async function seedFixture(
  context: RlsTestContext,
  options: { maxConcurrentRuns: number },
): Promise<Fixture> {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  const versionId = crypto.randomUUID();

  await seedAppUser(
    context.adminSql,
    userId,
    `owner-${crypto.randomUUID().slice(0, 8)}@example.com`,
  );
  await context.adminSql`
    INSERT INTO agent_definitions (
      id, tenant_id, name, slug, status, published_version_id, created_by, updated_by
    )
    VALUES (
      ${agentId}::uuid, ${tenantId}::uuid, 'Support Agent', ${`support-${agentId.slice(0, 8)}`},
      'published', ${versionId}::uuid, ${userId}::uuid, ${userId}::uuid
    )
  `;
  await context.adminSql`
    INSERT INTO agent_versions (
      id, agent_definition_id, tenant_id, version_number, label, snapshot, published_at, created_by
    )
    VALUES (
      ${versionId}::uuid, ${agentId}::uuid, ${tenantId}::uuid, 1, 'v1',
      ${context.adminSql.json({
        nodes: [],
        edges: [],
        viewport: null,
        metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 },
      })},
      now(), ${userId}::uuid
    )
  `;

  const partial = { tenantId, userId, agentId };
  return { ...partial, key: await seedKey(context, partial, options) };
}

async function seedKey(
  context: RlsTestContext,
  fixture: { tenantId: string; userId: string; agentId: string },
  options: { maxConcurrentRuns: number },
): Promise<AgentApiKeyContext> {
  const keyId = crypto.randomUUID();
  const rawKey = `alak_${crypto.randomBytes(32).toString('hex')}`;
  const keyPrefix = rawKey.slice(0, 13);

  await context.adminSql`
    INSERT INTO agent_api_keys (
      id, tenant_id, agent_definition_id, name, key_hash, key_prefix, max_concurrent_runs, created_by
    )
    VALUES (
      ${keyId}::uuid, ${fixture.tenantId}::uuid, ${fixture.agentId}::uuid, 'crm',
      ${crypto.createHash('sha256').update(rawKey).digest('hex')}, ${keyPrefix},
      ${options.maxConcurrentRuns}, ${fixture.userId}::uuid
    )
  `;

  return {
    keyId,
    tenantId: fixture.tenantId,
    agentDefinitionId: fixture.agentId,
    keyPrefix,
    maxConcurrentRuns: options.maxConcurrentRuns,
    rateLimitPerMinute: null,
  };
}

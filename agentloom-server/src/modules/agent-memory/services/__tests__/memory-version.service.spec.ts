import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMockDb: () => ({
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  }),
  getTenantDb: vi.fn(),
  operators: {
    and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    desc: vi.fn((value: unknown) => ({ type: 'desc', value })),
    eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
  },
}));

vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');

  return {
    ...actual,
    and: mocks.operators.and,
    desc: mocks.operators.desc,
    eq: mocks.operators.eq,
  };
});

vi.mock('../../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

import type { DrizzleDB } from '../../../../database/database.module';
import {
  getTenantId,
  memoryVersions,
  type MemoryNode,
  type MemoryVersion,
} from '../../../../database/schema';
import type { MemoryGateway } from '../../memory.gateway';
import { MemoryVersionService } from '../memory-version.service';

type MockDb = ReturnType<typeof mocks.createMockDb>;

type SelectChain<TResult> = Promise<TResult[]> & {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const NODE_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_ID = '33333333-3333-4333-8333-333333333333';
const INSTANCE_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2025-02-01T08:00:00.000Z');

function createSelectChain<TResult>(result: TResult[]): SelectChain<TResult> {
  const chain = Promise.resolve(result) as SelectChain<TResult>;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  return chain;
}

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

function createNode(overrides: Partial<MemoryNode> = {}): MemoryNode {
  return {
    id: NODE_ID,
    instanceId: INSTANCE_ID,
    tenantId: TENANT_ID,
    contentType: 'text',
    metadata: { topic: 'agent-memory' },
    disclosureLevel: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function createVersion(overrides: Partial<MemoryVersion> = {}): MemoryVersion {
  return {
    id: VERSION_ID,
    nodeId: NODE_ID,
    tenantId: TENANT_ID,
    content: '初始记忆内容',
    version: 1,
    deprecated: false,
    migratedTo: null,
    reviewStatus: 'pending',
    patchSummary: null,
    createdBy: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe('MemoryVersionService', () => {
  let service: MemoryVersionService;
  let rawDb: MockDb;
  let tenantDb: MockDb;
  let txDb: MockDb;
  let gateway: { emitVersionCreated: Mock; emitVersionRollback: Mock };

  beforeEach(() => {
    vi.clearAllMocks();

    rawDb = mocks.createMockDb();
    tenantDb = mocks.createMockDb();
    txDb = mocks.createMockDb();

    tenantDb.transaction.mockImplementation(async (callback) =>
      callback(txDb as unknown as DrizzleDB),
    );

    mocks.getTenantDb.mockReturnValue(tenantDb as unknown as DrizzleDB);

    gateway = {
      emitVersionCreated: vi.fn(),
      emitVersionRollback: vi.fn(),
    };

    service = new MemoryVersionService(
      rawDb as unknown as DrizzleDB,
      gateway as unknown as MemoryGateway,
    );
  });

  describe('createVersion', () => {
    it('应创建首个版本并默认进入 pending review', async () => {
      const nodeQuery = createSelectChain([createNode()]);
      const latestQuery = createSelectChain([]);
      const created = createVersion({ createdBy: 'user-1' });
      const insertQuery = createInsertChain([created]);

      tenantDb.select
        .mockReturnValueOnce(nodeQuery)
        .mockReturnValueOnce(latestQuery);
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        service.createVersion(NODE_ID, '初始记忆内容', 'user-1'),
      ).resolves.toEqual(created);

      expect(mocks.getTenantDb).toHaveBeenCalledWith(rawDb);
      expect(tenantDb.insert).toHaveBeenCalledWith(memoryVersions);
      expect(insertQuery.values).toHaveBeenCalledWith({
        nodeId: NODE_ID,
        tenantId: getTenantId,
        content: '初始记忆内容',
        version: 1,
        reviewStatus: 'pending',
        createdBy: 'user-1',
      });
    });

    it('节点不存在时应抛出异常', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.createVersion(NODE_ID, '初始记忆内容'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tenantDb.insert).not.toHaveBeenCalled();
    });

    it('已有版本链时应拒绝再次创建初始版本', async () => {
      tenantDb.select
        .mockReturnValueOnce(createSelectChain([createNode()]))
        .mockReturnValueOnce(createSelectChain([createVersion()]));

      await expect(
        service.createVersion(NODE_ID, '重复初始内容'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tenantDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('patchVersion', () => {
    it('应基于最新版本执行 patch 并废弃旧版本', async () => {
      const latest = createVersion({ content: 'hello old world', version: 3 });
      const latestQuery = createSelectChain([latest]);
      const created = createVersion({
        id: '55555555-5555-4555-8555-555555555555',
        content: 'hello new world',
        version: 4,
        createdBy: 'user-2',
        patchSummary: 'patch: oldString -> newString',
      });
      const insertQuery = createInsertChain([created]);
      const updateQuery = createUpdateChain([{ id: latest.id }]);

      // patch/append/rollback 现在会先读节点以取得 instanceId（用于事件广播）。
      tenantDb.select.mockReturnValueOnce(createSelectChain([createNode()]));
      txDb.select.mockReturnValueOnce(latestQuery);
      txDb.insert.mockReturnValueOnce(insertQuery.chain);
      txDb.update.mockReturnValueOnce(updateQuery.chain);

      await expect(
        service.patchVersion(
          NODE_ID,
          { oldString: 'old', newString: 'new' },
          'user-2',
        ),
      ).resolves.toEqual(created);

      expect(insertQuery.values).toHaveBeenCalledWith({
        nodeId: NODE_ID,
        tenantId: getTenantId,
        content: 'hello new world',
        version: 4,
        reviewStatus: 'pending',
        patchSummary: 'patch: oldString -> newString',
        createdBy: 'user-2',
      });
      expect(updateQuery.set).toHaveBeenCalledWith({
        deprecated: true,
        migratedTo: created.id,
      });
    });

    it('oldString 不存在时应抛出 409', async () => {
      // patch/append/rollback 现在会先读节点以取得 instanceId（用于事件广播）。
      tenantDb.select.mockReturnValueOnce(createSelectChain([createNode()]));
      txDb.select.mockReturnValueOnce(
        createSelectChain([
          createVersion({ content: 'hello world', version: 2 }),
        ]),
      );

      await expect(
        service.patchVersion(NODE_ID, {
          oldString: 'missing',
          newString: 'new',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(txDb.insert).not.toHaveBeenCalled();
      expect(txDb.update).not.toHaveBeenCalled();
    });

    it('最新版本在写入前发生变化时应触发 OCC 冲突', async () => {
      // patch/append/rollback 现在会先读节点以取得 instanceId（用于事件广播）。
      tenantDb.select.mockReturnValueOnce(createSelectChain([createNode()]));
      txDb.select.mockReturnValueOnce(
        createSelectChain([
          createVersion({ content: 'hello old world', version: 2 }),
        ]),
      );
      txDb.insert.mockReturnValueOnce(
        createInsertChain([
          createVersion({
            id: '66666666-6666-4666-8666-666666666666',
            content: 'hello new world',
            version: 3,
          }),
        ]).chain,
      );
      txDb.update.mockReturnValueOnce(createUpdateChain([]).chain);

      await expect(
        service.patchVersion(NODE_ID, { oldString: 'old', newString: 'new' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('appendVersion', () => {
    it('应在最新版本末尾追加内容并废弃旧版本', async () => {
      const latest = createVersion({ content: 'line1', version: 1 });
      const created = createVersion({
        id: '77777777-7777-4777-8777-777777777777',
        content: 'line1\nline2',
        version: 2,
        patchSummary: 'append: add content to tail',
      });
      const insertQuery = createInsertChain([created]);
      const updateQuery = createUpdateChain([{ id: latest.id }]);

      // patch/append/rollback 现在会先读节点以取得 instanceId（用于事件广播）。
      tenantDb.select.mockReturnValueOnce(createSelectChain([createNode()]));
      txDb.select.mockReturnValueOnce(createSelectChain([latest]));
      txDb.insert.mockReturnValueOnce(insertQuery.chain);
      txDb.update.mockReturnValueOnce(updateQuery.chain);

      await expect(service.appendVersion(NODE_ID, 'line2')).resolves.toEqual(
        created,
      );

      expect(insertQuery.values).toHaveBeenCalledWith({
        nodeId: NODE_ID,
        tenantId: getTenantId,
        content: 'line1\nline2',
        version: 2,
        reviewStatus: 'pending',
        patchSummary: 'append: add content to tail',
        createdBy: null,
      });
      expect(updateQuery.set).toHaveBeenCalledWith({
        deprecated: true,
        migratedTo: created.id,
      });
    });
  });

  describe('getLatestVersion', () => {
    it('应返回未废弃的最新版本', async () => {
      const latest = createVersion({ version: 5 });
      const query = createSelectChain([latest]);

      tenantDb.select.mockReturnValueOnce(query);

      await expect(service.getLatestVersion(NODE_ID)).resolves.toEqual(latest);
      expect(query.orderBy).toHaveBeenCalledWith(
        mocks.operators.desc(memoryVersions.version),
      );
      expect(query.limit).toHaveBeenCalledWith(1);
    });
  });

  describe('getVersionHistory', () => {
    it('应按版本号倒序返回完整版本链', async () => {
      const history = [
        createVersion({ id: 'v3', version: 3 }),
        createVersion({
          id: 'v2',
          version: 2,
          deprecated: true,
          migratedTo: 'v3',
        }),
        createVersion({
          id: 'v1',
          version: 1,
          deprecated: true,
          migratedTo: 'v2',
        }),
      ];
      const query = createSelectChain(history);

      tenantDb.select.mockReturnValueOnce(query);

      await expect(service.getVersionHistory(NODE_ID)).resolves.toEqual(
        history,
      );
      expect(query.orderBy).toHaveBeenCalledWith(
        mocks.operators.desc(memoryVersions.version),
      );
    });
  });

  describe('rollbackToVersion', () => {
    it('应复制目标版本内容为新版本并废弃当前版本', async () => {
      const target = createVersion({
        id: 'v2',
        version: 2,
        content: 'stable content',
      });
      const latest = createVersion({
        id: 'v5',
        version: 5,
        content: 'broken content',
      });
      const created = createVersion({
        id: 'v6',
        version: 6,
        content: 'stable content',
        patchSummary: 'rollback: restore version 2',
        createdBy: 'user-3',
      });
      const insertQuery = createInsertChain([created]);
      const updateQuery = createUpdateChain([{ id: latest.id }]);

      tenantDb.select.mockReturnValueOnce(createSelectChain([createNode()]));
      txDb.select
        .mockReturnValueOnce(createSelectChain([target]))
        .mockReturnValueOnce(createSelectChain([latest]));
      txDb.insert.mockReturnValueOnce(insertQuery.chain);
      txDb.update.mockReturnValueOnce(updateQuery.chain);

      await expect(
        service.rollbackToVersion(NODE_ID, target.id, 'user-3'),
      ).resolves.toEqual(created);

      expect(insertQuery.values).toHaveBeenCalledWith({
        nodeId: NODE_ID,
        tenantId: getTenantId,
        content: 'stable content',
        version: 6,
        reviewStatus: 'pending',
        patchSummary: 'rollback: restore version 2',
        createdBy: 'user-3',
      });
      expect(updateQuery.set).toHaveBeenCalledWith({
        deprecated: true,
        migratedTo: created.id,
      });
      expect(gateway.emitVersionRollback).toHaveBeenCalledWith(
        TENANT_ID,
        INSTANCE_ID,
        expect.objectContaining({
          nodeId: NODE_ID,
          versionId: created.id,
          targetVersionId: target.id,
        }),
      );
    });

    it('回滚失败时不广播事件', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([createNode()]));
      txDb.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.rollbackToVersion(NODE_ID, 'missing-version'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(gateway.emitVersionRollback).not.toHaveBeenCalled();
    });
  });

  describe('updateReviewStatus', () => {
    it('应更新 review status', async () => {
      const updated = createVersion({ reviewStatus: 'approved' });
      const updateQuery = createUpdateChain([updated]);

      tenantDb.update.mockReturnValueOnce(updateQuery.chain);

      await expect(
        service.updateReviewStatus(VERSION_ID, 'approved'),
      ).resolves.toEqual(updated);

      expect(updateQuery.set).toHaveBeenCalledWith({
        reviewStatus: 'approved',
      });
    });

    it('版本不存在时应抛出异常', async () => {
      tenantDb.update.mockReturnValueOnce(createUpdateChain([]).chain);

      await expect(
        service.updateReviewStatus(VERSION_ID, 'rejected'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

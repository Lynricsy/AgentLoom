import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMockDb: () => ({
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }),
  getTenantDb: vi.fn(),
  operators: {
    and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    count: vi.fn(() => ({ type: 'count' })),
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
    count: mocks.operators.count,
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
  memoryNodes,
  type MemoryInstance,
  type MemoryNode,
  type MemoryNodeMetadata,
} from '../../../../database/schema';
import { MemoryNodeService } from '../memory-node.service';

type MockDb = ReturnType<typeof mocks.createMockDb>;

type SelectChain<TResult> = Promise<TResult[]> & {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
};

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INSTANCE_ID = '22222222-2222-4222-8222-222222222222';
const NODE_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2025-02-01T08:00:00.000Z');

function createSelectChain<TResult>(result: TResult[]): SelectChain<TResult> {
  const chain = Promise.resolve(result) as SelectChain<TResult>;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
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

function createDeleteChain<TResult>(result: TResult[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });

  return {
    chain: { where },
    where,
    returning,
  };
}

function createInstance(
  overrides: Partial<MemoryInstance> = {},
): MemoryInstance {
  return {
    id: INSTANCE_ID,
    tenantId: TENANT_ID,
    name: '长期记忆实例',
    description: '用于单测',
    config: { fusionPriority: 0.8 },
    systemPromptOverride: null,
    validDomains: ['core', 'notes'],
    coreMemoryUris: ['core://agent'],
    status: 'active',
    occVersion: 1,
    createdBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
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

describe('MemoryNodeService', () => {
  let service: MemoryNodeService;
  let rawDb: MockDb;
  let tenantDb: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();

    rawDb = mocks.createMockDb();
    tenantDb = mocks.createMockDb();
    mocks.getTenantDb.mockReturnValue(tenantDb as unknown as DrizzleDB);

    service = new MemoryNodeService(rawDb as unknown as DrizzleDB);
  });

  describe('createNode', () => {
    it('应在租户作用域内校验实例并创建节点', async () => {
      const metadata: MemoryNodeMetadata = { topic: 'anchor' };
      const instanceQuery = createSelectChain([createInstance()]);
      const createdNode = createNode({ metadata, contentType: 'markdown' });
      const insertQuery = createInsertChain([createdNode]);

      tenantDb.select.mockReturnValueOnce(instanceQuery);
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        service.createNode(INSTANCE_ID, {
          metadata,
          contentType: 'markdown',
          disclosureLevel: 2,
        }),
      ).resolves.toEqual(createdNode);

      expect(mocks.getTenantDb).toHaveBeenCalledWith(rawDb);
      expect(rawDb.select).not.toHaveBeenCalled();
      expect(tenantDb.insert).toHaveBeenCalledWith(memoryNodes);
      expect(insertQuery.values).toHaveBeenCalledWith({
        instanceId: INSTANCE_ID,
        tenantId: getTenantId,
        metadata,
        contentType: 'markdown',
        disclosureLevel: 2,
      });
    });

    it('实例不存在时应抛出异常', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([]));

      await expect(service.createNode(INSTANCE_ID, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tenantDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('getNode', () => {
    it('应返回指定主键的节点', async () => {
      const node = createNode();
      const selectQuery = createSelectChain([node]);

      tenantDb.select.mockReturnValueOnce(selectQuery);

      await expect(service.getNode(NODE_ID)).resolves.toEqual(node);
      expect(selectQuery.limit).toHaveBeenCalledWith(1);
      expect(mocks.getTenantDb).toHaveBeenCalledWith(rawDb);
    });

    it('节点不存在时应抛出异常', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([]));

      await expect(service.getNode(NODE_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getNodeByUuid', () => {
    it('应通过永久 UUID 锚点查找节点', async () => {
      const node = createNode();
      tenantDb.select.mockReturnValueOnce(createSelectChain([node]));

      await expect(service.getNodeByUuid(NODE_ID)).resolves.toEqual(node);
      expect(mocks.operators.eq).toHaveBeenCalledWith(memoryNodes.id, NODE_ID);
    });
  });

  describe('updateNodeMetadata', () => {
    it('应仅更新 metadata 与节点描述字段并保持 UUID 不变', async () => {
      const existing = createNode();
      const updated = createNode({
        metadata: { topic: 'updated' },
        contentType: 'summary',
        disclosureLevel: 3,
      });
      const selectQuery = createSelectChain([existing]);
      const updateQuery = createUpdateChain([updated]);

      tenantDb.select.mockReturnValueOnce(selectQuery);
      tenantDb.update.mockReturnValueOnce(updateQuery.chain);

      await expect(
        service.updateNodeMetadata(NODE_ID, {
          metadata: { topic: 'updated' },
          contentType: 'summary',
          disclosureLevel: 3,
        }),
      ).resolves.toEqual(updated);

      expect(updateQuery.set).toHaveBeenCalledWith({
        metadata: { topic: 'updated' },
        contentType: 'summary',
        disclosureLevel: 3,
      });
      expect(updated.id).toBe(existing.id);
    });
  });

  describe('deleteNode', () => {
    it('应删除节点并返回确认结果', async () => {
      const existing = createNode();
      const selectQuery = createSelectChain([existing]);
      const deleteQuery = createDeleteChain([{ id: existing.id }]);

      tenantDb.select.mockReturnValueOnce(selectQuery);
      tenantDb.delete.mockReturnValueOnce(deleteQuery.chain);

      await expect(service.deleteNode(existing.id)).resolves.toEqual({
        id: existing.id,
        deleted: true,
      });
      expect(tenantDb.delete).toHaveBeenCalledWith(memoryNodes);
      expect(deleteQuery.returning).toHaveBeenCalledTimes(1);
    });
  });

  describe('listNodes', () => {
    it('应支持分页���内容类型过滤与倒序排序', async () => {
      const instanceQuery = createSelectChain([createInstance()]);
      const data = [
        createNode(),
        createNode({ id: '44444444-4444-4444-8444-444444444444' }),
      ];
      const dataQuery = createSelectChain(data);
      const countQuery = createSelectChain([{ total: 6 }]);

      tenantDb.select
        .mockReturnValueOnce(instanceQuery)
        .mockReturnValueOnce(dataQuery)
        .mockReturnValueOnce(countQuery);

      await expect(
        service.listNodes(INSTANCE_ID, {
          page: 2,
          limit: 2,
          contentType: 'text',
        }),
      ).resolves.toEqual({
        data,
        total: 6,
      });

      expect(mocks.operators.eq).toHaveBeenCalledWith(
        memoryNodes.contentType,
        'text',
      );
      expect(mocks.operators.desc).toHaveBeenCalledWith(memoryNodes.createdAt);
      expect(dataQuery.limit).toHaveBeenCalledWith(2);
      expect(dataQuery.offset).toHaveBeenCalledWith(2);
    });
  });

  describe('tenant isolation', () => {
    it('所有查询都应通过 getTenantDb 获取租户作用域数据库', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([createNode()]));

      await service.getNode(NODE_ID);

      expect(mocks.getTenantDb).toHaveBeenCalledTimes(1);
      expect(mocks.getTenantDb).toHaveBeenCalledWith(rawDb);
    });
  });

  describe('error cases', () => {
    it('删除不存在的节点时应抛出异常', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([]));

      await expect(service.deleteNode(NODE_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tenantDb.delete).not.toHaveBeenCalled();
    });
  });
});

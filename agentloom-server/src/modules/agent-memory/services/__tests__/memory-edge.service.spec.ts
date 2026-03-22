import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
    desc: vi.fn((value: unknown) => ({ type: 'desc', value })),
    eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
  },
}));

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>(
    'drizzle-orm',
  );

  return {
    ...actual,
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
  memoryEdges,
  type MemoryEdge,
  type MemoryNode,
} from '../../../../database/schema';
import { MemoryEdgeService } from '../memory-edge.service';

type MockDb = ReturnType<typeof mocks.createMockDb>;

type SelectChain<TResult> = Promise<TResult[]> & {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INSTANCE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_INSTANCE_ID = '99999999-9999-4999-8999-999999999999';
const PARENT_NODE_ID = '33333333-3333-4333-8333-333333333333';
const CHILD_NODE_ID = '44444444-4444-4444-8444-444444444444';
const EDGE_ID = '55555555-5555-4555-8555-555555555555';
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

function createDeleteChain<TResult>(result: TResult[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });

  return {
    chain: { where },
    where,
    returning,
  };
}

function createNode(overrides: Partial<MemoryNode> = {}): MemoryNode {
  return {
    id: PARENT_NODE_ID,
    instanceId: INSTANCE_ID,
    tenantId: TENANT_ID,
    contentType: 'text',
    metadata: { topic: 'agent-memory' },
    disclosureLevel: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function createEdge(overrides: Partial<MemoryEdge> = {}): MemoryEdge {
  return {
    id: EDGE_ID,
    instanceId: INSTANCE_ID,
    tenantId: TENANT_ID,
    parentNodeId: PARENT_NODE_ID,
    childNodeId: CHILD_NODE_ID,
    name: 'contains',
    priority: 0,
    disclosure: 0,
    createdAt: NOW,
    ...overrides,
  };
}

describe('MemoryEdgeService', () => {
  let service: MemoryEdgeService;
  let rawDb: MockDb;
  let tenantDb: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();

    rawDb = mocks.createMockDb();
    tenantDb = mocks.createMockDb();
    mocks.getTenantDb.mockReturnValue(tenantDb as unknown as DrizzleDB);

    service = new MemoryEdgeService(rawDb as unknown as DrizzleDB);
  });

  describe('createEdge', () => {
    it('应校验节点实例、检查环并创建边', async () => {
      const parentQuery = createSelectChain([
        createNode({ id: PARENT_NODE_ID, instanceId: INSTANCE_ID }),
      ]);
      const childQuery = createSelectChain([
        createNode({ id: CHILD_NODE_ID, instanceId: INSTANCE_ID }),
      ]);
      const cycleQuery = createSelectChain([]);
      const createdEdge = createEdge({
        name: 'summarizes',
        priority: 8,
        disclosure: 2,
      });
      const insertQuery = createInsertChain([createdEdge]);

      tenantDb.select
        .mockReturnValueOnce(parentQuery)
        .mockReturnValueOnce(childQuery)
        .mockReturnValueOnce(cycleQuery);
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        service.createEdge(INSTANCE_ID, {
          parentNodeId: PARENT_NODE_ID,
          childNodeId: CHILD_NODE_ID,
          name: 'summarizes',
          priority: 8,
          disclosure: 2,
        }),
      ).resolves.toEqual(createdEdge);

      expect(mocks.getTenantDb).toHaveBeenCalledWith(rawDb);
      expect(rawDb.select).not.toHaveBeenCalled();
      expect(tenantDb.insert).toHaveBeenCalledWith(memoryEdges);
      expect(insertQuery.values).toHaveBeenCalledWith({
        instanceId: INSTANCE_ID,
        tenantId: getTenantId,
        parentNodeId: PARENT_NODE_ID,
        childNodeId: CHILD_NODE_ID,
        name: 'summarizes',
        priority: 8,
        disclosure: 2,
      });
    });

    it('跨实例创建边时应抛出 BadRequestException', async () => {
      tenantDb.select
        .mockReturnValueOnce(
          createSelectChain([
            createNode({ id: PARENT_NODE_ID, instanceId: INSTANCE_ID }),
          ]),
        )
        .mockReturnValueOnce(
          createSelectChain([
            createNode({ id: CHILD_NODE_ID, instanceId: OTHER_INSTANCE_ID }),
          ]),
        );

      await expect(
        service.createEdge(INSTANCE_ID, {
          parentNodeId: PARENT_NODE_ID,
          childNodeId: CHILD_NODE_ID,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tenantDb.insert).not.toHaveBeenCalled();
    });

    it('创建会形成 A→B→C→A 环时应抛出 ConflictException', async () => {
      const nodeA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const nodeB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      const nodeC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

      tenantDb.select
        .mockReturnValueOnce(
          createSelectChain([createNode({ id: nodeC, instanceId: INSTANCE_ID })]),
        )
        .mockReturnValueOnce(
          createSelectChain([createNode({ id: nodeA, instanceId: INSTANCE_ID })]),
        )
        .mockReturnValueOnce(
          createSelectChain([
            createEdge({ parentNodeId: nodeA, childNodeId: nodeB }),
          ]),
        )
        .mockReturnValueOnce(
          createSelectChain([
            createEdge({ parentNodeId: nodeB, childNodeId: nodeC }),
          ]),
        );

      await expect(
        service.createEdge(INSTANCE_ID, {
          parentNodeId: nodeC,
          childNodeId: nodeA,
          name: 'cycle',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tenantDb.insert).not.toHaveBeenCalled();
    });

    it('自环创建应抛出 ConflictException', async () => {
      tenantDb.select
        .mockReturnValueOnce(
          createSelectChain([
            createNode({ id: PARENT_NODE_ID, instanceId: INSTANCE_ID }),
          ]),
        )
        .mockReturnValueOnce(
          createSelectChain([
            createNode({ id: PARENT_NODE_ID, instanceId: INSTANCE_ID }),
          ]),
        );

      await expect(
        service.createEdge(INSTANCE_ID, {
          parentNodeId: PARENT_NODE_ID,
          childNodeId: PARENT_NODE_ID,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tenantDb.insert).not.toHaveBeenCalled();
    });

    it('节点不存在时应抛出 NotFoundException', async () => {
      tenantDb.select
        .mockReturnValueOnce(
          createSelectChain([
            createNode({ id: PARENT_NODE_ID, instanceId: INSTANCE_ID }),
          ]),
        )
        .mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.createEdge(INSTANCE_ID, {
          parentNodeId: PARENT_NODE_ID,
          childNodeId: CHILD_NODE_ID,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tenantDb.insert).not.toHaveBeenCalled();
    });

    it('环检测超过 10 层后应停止继续遍历', async () => {
      const ids = Array.from({ length: 12 }, (_, index) => {
        const suffix = index.toString().padStart(12, '0');
        return `77777777-7777-4777-8777-${suffix}`;
      });
      const cycleQueries = ids.slice(0, 10).map((nodeId, index) =>
        createSelectChain([
          createEdge({
            parentNodeId: nodeId,
            childNodeId: ids[index + 1],
          }),
        ]),
      );
      const createdEdge = createEdge({
        parentNodeId: ids[11],
        childNodeId: ids[0],
      });
      const insertQuery = createInsertChain([createdEdge]);

      tenantDb.select
        .mockReturnValueOnce(
          createSelectChain([createNode({ id: ids[11], instanceId: INSTANCE_ID })]),
        )
        .mockReturnValueOnce(
          createSelectChain([createNode({ id: ids[0], instanceId: INSTANCE_ID })]),
        );
      for (const query of cycleQueries) {
        tenantDb.select.mockReturnValueOnce(query);
      }
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        service.createEdge(INSTANCE_ID, {
          parentNodeId: ids[11],
          childNodeId: ids[0],
        }),
      ).resolves.toEqual(createdEdge);

      expect(tenantDb.select).toHaveBeenCalledTimes(12);
      expect(tenantDb.insert).toHaveBeenCalledTimes(1);
    });

    it('重复边冲突时应透传为 ConflictException', async () => {
      const uniqueViolation = Object.assign(new Error('duplicate key'), {
        code: '23505',
      });
      const insertQuery = createInsertChain<MemoryEdge>([]);
      insertQuery.returning.mockRejectedValueOnce(uniqueViolation);

      tenantDb.select
        .mockReturnValueOnce(
          createSelectChain([
            createNode({ id: PARENT_NODE_ID, instanceId: INSTANCE_ID }),
          ]),
        )
        .mockReturnValueOnce(
          createSelectChain([
            createNode({ id: CHILD_NODE_ID, instanceId: INSTANCE_ID }),
          ]),
        )
        .mockReturnValueOnce(createSelectChain([]));
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        service.createEdge(INSTANCE_ID, {
          parentNodeId: PARENT_NODE_ID,
          childNodeId: CHILD_NODE_ID,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('非唯一约束错误时应原样抛出', async () => {
      const databaseError = new Error('database offline');
      const insertQuery = createInsertChain<MemoryEdge>([]);
      insertQuery.returning.mockRejectedValueOnce(databaseError);

      tenantDb.select
        .mockReturnValueOnce(
          createSelectChain([
            createNode({ id: PARENT_NODE_ID, instanceId: INSTANCE_ID }),
          ]),
        )
        .mockReturnValueOnce(
          createSelectChain([
            createNode({ id: CHILD_NODE_ID, instanceId: INSTANCE_ID }),
          ]),
        )
        .mockReturnValueOnce(createSelectChain([]));
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        service.createEdge(INSTANCE_ID, {
          parentNodeId: PARENT_NODE_ID,
          childNodeId: CHILD_NODE_ID,
        }),
      ).rejects.toBe(databaseError);
    });
  });

  describe('deleteEdge', () => {
    it('应删除边并返回确认结果', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([createEdge()]));
      const deleteQuery = createDeleteChain([{ id: EDGE_ID }]);
      tenantDb.delete.mockReturnValueOnce(deleteQuery.chain);

      await expect(service.deleteEdge(EDGE_ID)).resolves.toEqual({
        id: EDGE_ID,
        deleted: true,
      });
      expect(tenantDb.delete).toHaveBeenCalledWith(memoryEdges);
      expect(deleteQuery.returning).toHaveBeenCalledTimes(1);
    });

    it('删除返回空结果时应抛出 NotFoundException', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([createEdge()]));
      tenantDb.delete.mockReturnValueOnce(createDeleteChain([]).chain);

      await expect(service.deleteEdge(EDGE_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getChildEdges', () => {
    it('应按 priority 倒序返回子边', async () => {
      const childEdges = [
        createEdge({ id: 'edge-1', priority: 9 }),
        createEdge({ id: 'edge-2', priority: 1 }),
      ];
      const query = createSelectChain(childEdges);

      tenantDb.select.mockReturnValueOnce(query);

      await expect(service.getChildEdges(PARENT_NODE_ID)).resolves.toEqual(
        childEdges,
      );

      expect(mocks.operators.eq).toHaveBeenCalledWith(
        memoryEdges.parentNodeId,
        PARENT_NODE_ID,
      );
      expect(mocks.operators.desc).toHaveBeenCalledWith(memoryEdges.priority);
    });
  });

  describe('getParentEdges', () => {
    it('应按 priority 倒序返回父边', async () => {
      const parentEdges = [
        createEdge({ id: 'edge-1', priority: 7 }),
        createEdge({ id: 'edge-2', priority: 3 }),
      ];
      const query = createSelectChain(parentEdges);

      tenantDb.select.mockReturnValueOnce(query);

      await expect(service.getParentEdges(CHILD_NODE_ID)).resolves.toEqual(
        parentEdges,
      );

      expect(mocks.operators.eq).toHaveBeenCalledWith(
        memoryEdges.childNodeId,
        CHILD_NODE_ID,
      );
      expect(mocks.operators.desc).toHaveBeenCalledWith(memoryEdges.priority);
    });
  });

  describe('updateEdgePriority', () => {
    it('应仅更新 priority', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([createEdge()]));
      const updatedEdge = createEdge({ priority: 11 });
      const updateQuery = createUpdateChain([updatedEdge]);
      tenantDb.update.mockReturnValueOnce(updateQuery.chain);

      await expect(service.updateEdgePriority(EDGE_ID, 11)).resolves.toEqual(
        updatedEdge,
      );

      expect(updateQuery.set).toHaveBeenCalledWith({ priority: 11 });
    });

    it('更新后未返回边时应抛出 NotFoundException', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([createEdge()]));
      tenantDb.update.mockReturnValueOnce(createUpdateChain([]).chain);

      await expect(service.updateEdgePriority(EDGE_ID, 11)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateEdgeDisclosure', () => {
    it('应仅更新 disclosure', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([createEdge()]));
      const updatedEdge = createEdge({ disclosure: 4 });
      const updateQuery = createUpdateChain([updatedEdge]);
      tenantDb.update.mockReturnValueOnce(updateQuery.chain);

      await expect(service.updateEdgeDisclosure(EDGE_ID, 4)).resolves.toEqual(
        updatedEdge,
      );

      expect(updateQuery.set).toHaveBeenCalledWith({ disclosure: 4 });
    });

    it('更新后未返回边时应抛出 NotFoundException', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([createEdge()]));
      tenantDb.update.mockReturnValueOnce(createUpdateChain([]).chain);

      await expect(service.updateEdgeDisclosure(EDGE_ID, 4)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('error cases', () => {
    it('不存在的边应抛出 NotFoundException', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([]));

      await expect(service.deleteEdge(EDGE_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tenantDb.delete).not.toHaveBeenCalled();
    });
  });
});

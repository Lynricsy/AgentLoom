import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMockDb: () => ({
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
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
  memoryEdges,
  memoryPaths,
  type MemoryEdge,
  type MemoryNode,
  type MemoryPath,
} from '../../../../database/schema';
import { PathResolverService } from '../path-resolver.service';

type MockDb = ReturnType<typeof mocks.createMockDb>;

type SelectChain<TResult> = Promise<TResult[]> & {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INSTANCE_ID = '22222222-2222-4222-8222-222222222222';
const ROOT_NODE_ID = '33333333-3333-4333-8333-333333333333';
const CHILD_NODE_ID = '44444444-4444-4444-8444-444444444444';
const EDGE_ID = '55555555-5555-4555-8555-555555555555';
const PATH_ID = '66666666-6666-4666-8666-666666666666';
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
    id: CHILD_NODE_ID,
    instanceId: INSTANCE_ID,
    tenantId: TENANT_ID,
    contentType: 'text',
    metadata: { label: 'path-target' },
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
    parentNodeId: ROOT_NODE_ID,
    childNodeId: CHILD_NODE_ID,
    name: 'identity',
    priority: 3,
    disclosure: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function createPath(overrides: Partial<MemoryPath> = {}): MemoryPath {
  return {
    id: PATH_ID,
    instanceId: INSTANCE_ID,
    tenantId: TENANT_ID,
    domain: 'core',
    pathString: 'agent/identity',
    edgeId: EDGE_ID,
    nodeId: CHILD_NODE_ID,
    createdAt: NOW,
    ...overrides,
  };
}

describe('PathResolverService', () => {
  let service: PathResolverService;
  let rawDb: MockDb;
  let tenantDb: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();

    rawDb = mocks.createMockDb();
    tenantDb = mocks.createMockDb();
    mocks.getTenantDb.mockReturnValue(tenantDb as unknown as DrizzleDB);

    service = new PathResolverService(rawDb as unknown as DrizzleDB);
  });

  describe('resolveUri', () => {
    it('缓存命中时应直接返回节点', async () => {
      const cachedPath = createPath();
      const node = createNode();

      tenantDb.select
        .mockReturnValueOnce(createSelectChain([cachedPath]))
        .mockReturnValueOnce(createSelectChain([node]));

      await expect(
        service.resolveUri(INSTANCE_ID, 'core://agent/identity'),
      ).resolves.toEqual(node);

      expect(mocks.getTenantDb).toHaveBeenCalledWith(rawDb);
      expect(tenantDb.insert).not.toHaveBeenCalled();
    });

    it('缓存未命中时应遍历边并写回路径缓存', async () => {
      const rootPath = createPath({
        id: 'path-root',
        pathString: 'agent',
        nodeId: ROOT_NODE_ID,
        edgeId: null,
      });
      const traversedEdge = createEdge({
        parentNodeId: ROOT_NODE_ID,
        childNodeId: CHILD_NODE_ID,
        name: 'identity',
        priority: 9,
      });
      const node = createNode({ id: CHILD_NODE_ID });
      const insertQuery = createInsertChain([
        createPath({
          pathString: 'agent/identity',
          nodeId: CHILD_NODE_ID,
          edgeId: EDGE_ID,
        }),
      ]);

      tenantDb.select
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([rootPath]))
        .mockReturnValueOnce(createSelectChain([traversedEdge]))
        .mockReturnValueOnce(createSelectChain([node]))
        .mockReturnValueOnce(createSelectChain([node]));
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        service.resolveUri(INSTANCE_ID, 'core://agent/identity'),
      ).resolves.toEqual(node);

      expect(tenantDb.insert).toHaveBeenCalledWith(memoryPaths);
      expect(insertQuery.values).toHaveBeenCalledWith({
        instanceId: INSTANCE_ID,
        tenantId: getTenantId,
        domain: 'core',
        pathString: 'agent/identity',
        nodeId: CHILD_NODE_ID,
        edgeId: EDGE_ID,
      });
      expect(mocks.operators.eq).toHaveBeenCalledWith(
        memoryEdges.name,
        'identity',
      );
      expect(mocks.operators.desc).toHaveBeenCalledWith(memoryEdges.priority);
    });

    it('路径深度超过 10 层时应抛出 BadRequestException', async () => {
      await expect(
        service.resolveUri(INSTANCE_ID, 'core://a/b/c/d/e/f/g/h/i/j/k'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(tenantDb.select).not.toHaveBeenCalled();
    });

    it('URI 格式非法时应抛出 BadRequestException', async () => {
      await expect(
        service.resolveUri(INSTANCE_ID, 'core:/broken'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(tenantDb.select).not.toHaveBeenCalled();
    });

    it('路径包含空 segment 时应抛出 BadRequestException', async () => {
      await expect(
        service.resolveUri(INSTANCE_ID, 'core://agent//identity'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('找不到根路径时应抛出 NotFoundException', async () => {
      tenantDb.select
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.resolveUri(INSTANCE_ID, 'core://agent/identity'),
      ).rejects.toThrowError('Memory path core://agent/identity not found');
    });

    it('遍历到中间段缺失边时应抛出 NotFoundException', async () => {
      const rootPath = createPath({
        pathString: 'agent',
        nodeId: ROOT_NODE_ID,
        edgeId: null,
      });

      tenantDb.select
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([rootPath]))
        .mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.resolveUri(INSTANCE_ID, 'core://agent/identity'),
      ).rejects.toThrowError('Memory path core://agent/identity not found');
    });

    it('缓存写回遇到重复路径时应忽略冲突并继续返回节点', async () => {
      const rootPath = createPath({
        id: 'path-root',
        pathString: 'agent',
        nodeId: ROOT_NODE_ID,
        edgeId: null,
      });
      const traversedEdge = createEdge({
        parentNodeId: ROOT_NODE_ID,
        childNodeId: CHILD_NODE_ID,
        name: 'identity',
      });
      const node = createNode({ id: CHILD_NODE_ID });
      const duplicateError = Object.assign(new Error('duplicate key'), {
        cause: { code: '23505' },
      });
      const insertQuery = createInsertChain<MemoryPath>([]);
      insertQuery.returning.mockRejectedValueOnce(duplicateError);

      tenantDb.select
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([rootPath]))
        .mockReturnValueOnce(createSelectChain([traversedEdge]))
        .mockReturnValueOnce(createSelectChain([node]))
        .mockReturnValueOnce(createSelectChain([node]));
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        service.resolveUri(INSTANCE_ID, 'core://agent/identity'),
      ).resolves.toEqual(node);
    });
  });

  describe('createPath', () => {
    it('应创建 memory_paths 记录', async () => {
      const node = createNode({ id: CHILD_NODE_ID, instanceId: INSTANCE_ID });
      const createdPath = createPath();
      const insertQuery = createInsertChain([createdPath]);

      tenantDb.select.mockReturnValueOnce(createSelectChain([node]));
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        service.createPath(
          INSTANCE_ID,
          'core',
          'agent/identity',
          CHILD_NODE_ID,
          EDGE_ID,
        ),
      ).resolves.toEqual(createdPath);

      expect(insertQuery.values).toHaveBeenCalledWith({
        instanceId: INSTANCE_ID,
        tenantId: getTenantId,
        domain: 'core',
        pathString: 'agent/identity',
        nodeId: CHILD_NODE_ID,
        edgeId: EDGE_ID,
      });
    });

    it('节点属于其他实例时应抛出 BadRequestException', async () => {
      tenantDb.select.mockReturnValueOnce(
        createSelectChain([
          createNode({ id: CHILD_NODE_ID, instanceId: 'other-instance' }),
        ]),
      );

      await expect(
        service.createPath(
          INSTANCE_ID,
          'core',
          'agent/identity',
          CHILD_NODE_ID,
          EDGE_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(tenantDb.insert).not.toHaveBeenCalled();
    });

    it('重复路径冲突时应抛出 ConflictException', async () => {
      const duplicateError = Object.assign(new Error('duplicate key'), {
        code: '23505',
      });
      const insertQuery = createInsertChain<MemoryPath>([]);
      insertQuery.returning.mockRejectedValueOnce(duplicateError);

      tenantDb.select.mockReturnValueOnce(
        createSelectChain([
          createNode({ id: CHILD_NODE_ID, instanceId: INSTANCE_ID }),
        ]),
      );
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        service.createPath(
          INSTANCE_ID,
          'core',
          'agent/identity',
          CHILD_NODE_ID,
          EDGE_ID,
        ),
      ).rejects.toThrowError(
        'Memory path core://agent/identity already exists',
      );
    });

    it('非唯一约束错误时应原样抛出', async () => {
      const databaseError = new Error('database offline');
      const insertQuery = createInsertChain<MemoryPath>([]);
      insertQuery.returning.mockRejectedValueOnce(databaseError);

      tenantDb.select.mockReturnValueOnce(
        createSelectChain([
          createNode({ id: CHILD_NODE_ID, instanceId: INSTANCE_ID }),
        ]),
      );
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        service.createPath(
          INSTANCE_ID,
          'core',
          'agent/identity',
          CHILD_NODE_ID,
          EDGE_ID,
        ),
      ).rejects.toBe(databaseError);
    });
  });

  describe('addAlias', () => {
    it('应为已有 URI 创建跨域别名', async () => {
      const existingPath = createPath({
        domain: 'core',
        pathString: 'agent/identity',
        nodeId: CHILD_NODE_ID,
        edgeId: EDGE_ID,
      });
      const existingNode = createNode({ id: CHILD_NODE_ID });
      const aliasPath = createPath({
        domain: 'writer',
        pathString: 'chapter_1',
        nodeId: CHILD_NODE_ID,
        edgeId: EDGE_ID,
      });
      const insertQuery = createInsertChain([aliasPath]);

      tenantDb.select
        .mockReturnValueOnce(createSelectChain([existingPath]))
        .mockReturnValueOnce(createSelectChain([existingNode]))
        .mockReturnValueOnce(createSelectChain([existingNode]));
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        service.addAlias(
          INSTANCE_ID,
          'core://agent/identity',
          'writer://chapter_1',
        ),
      ).resolves.toEqual(aliasPath);

      expect(insertQuery.values).toHaveBeenCalledWith({
        instanceId: INSTANCE_ID,
        tenantId: getTenantId,
        domain: 'writer',
        pathString: 'chapter_1',
        nodeId: CHILD_NODE_ID,
        edgeId: EDGE_ID,
      });
    });
  });

  describe('deletePath', () => {
    it('应仅删除路径缓存记录', async () => {
      const deleteQuery = createDeleteChain([{ id: PATH_ID }]);
      tenantDb.delete.mockReturnValueOnce(deleteQuery.chain);

      await expect(
        service.deletePath(INSTANCE_ID, 'core://agent/identity'),
      ).resolves.toEqual({
        id: PATH_ID,
        deleted: true,
      });

      expect(tenantDb.delete).toHaveBeenCalledWith(memoryPaths);
    });

    it('删除不存在的路径时应抛出 NotFoundException', async () => {
      tenantDb.delete.mockReturnValueOnce(createDeleteChain([]).chain);

      await expect(
        service.deletePath(INSTANCE_ID, 'core://agent/identity'),
      ).rejects.toThrowError('Memory path core://agent/identity not found');
    });
  });

  describe('listChildren', () => {
    it('应仅返回直接子路径', async () => {
      const rows = [
        createPath({ id: 'path-1', pathString: 'agent/identity' }),
        createPath({ id: 'path-2', pathString: 'agent/identity/details' }),
        createPath({ id: 'path-3', pathString: 'agent/preferences' }),
        createPath({ id: 'path-4', pathString: 'other/root' }),
      ];

      tenantDb.select.mockReturnValueOnce(createSelectChain(rows));

      await expect(
        service.listChildren(INSTANCE_ID, 'core://agent'),
      ).resolves.toEqual([rows[0], rows[2]]);
    });

    it('父 URI 为 domain 根时应返回顶层路径', async () => {
      const rows = [
        createPath({ id: 'path-1', pathString: 'agent' }),
        createPath({ id: 'path-2', pathString: 'agent/identity' }),
        createPath({ id: 'path-3', pathString: 'notes' }),
      ];

      tenantDb.select.mockReturnValueOnce(createSelectChain(rows));

      await expect(
        service.listChildren(INSTANCE_ID, 'core://'),
      ).resolves.toEqual([rows[0], rows[2]]);
    });
  });

  describe('getPathsByNode', () => {
    it('应返回指向同一节点的全部路径', async () => {
      const paths = [
        createPath({ domain: 'core', pathString: 'agent/identity' }),
        createPath({ id: 'alias', domain: 'writer', pathString: 'chapter_1' }),
      ];

      tenantDb.select.mockReturnValueOnce(createSelectChain(paths));

      await expect(service.getPathsByNode(CHILD_NODE_ID)).resolves.toEqual(
        paths,
      );
      expect(mocks.operators.eq).toHaveBeenCalledWith(
        memoryPaths.nodeId,
        CHILD_NODE_ID,
      );
    });
  });
});

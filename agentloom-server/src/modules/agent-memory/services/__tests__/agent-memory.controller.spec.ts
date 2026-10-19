import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  MemoryEdgeCycleException,
  MemoryEdgeNotFoundException,
  MemoryInstanceNotFoundException,
  MemoryNodeNotFoundException,
  MemoryPathNotFoundException,
  MemoryVersionNotFoundException,
} from '../../agent-memory.exceptions';

// ─── Mock Factories ────────────────────────────────────────────────────

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
  agentMemoryInstances,
  getTenantId,
  memoryEdges,
  memoryNodes,
  memoryPaths,
  memoryVersions,
} from '../../../../database/schema';
import { ResourceSourceService } from '../../../resource-source/resource-source.service';
import { AgentMemoryController } from '../../agent-memory.controller';
import type {
  CreateMemoryAliasDto,
  CreateMemoryEdgeDto,
  CreateMemoryInstanceDto,
  CreateMemoryNodeDto,
  CreateMemoryPathDto,
  CreateMemoryVersionInput,
  ListAuditLogQueryDto,
  ListMemoryEdgesQueryDto,
  ListMemoryInstancesQueryDto,
  ListMemoryNodesQueryDto,
  ListMemoryPathsQueryDto,
  ListMemoryVersionsQueryDto,
  ListPendingReviewsQueryDto,
  MemorySearchQueryDto,
  ResolveUriQueryDto,
  ReviewVersionDto,
  RollbackVersionDto,
  UpdateMemoryInstanceDto,
  BrowseQueryDto,
  AddGlossaryKeywordDto,
  RemoveGlossaryKeywordDto,
} from '../../dto';

// ─── Types & Helpers ───────────────────────────────────────────────────

type MockDb = ReturnType<typeof mocks.createMockDb>;

/** 子路由的实例/节点归属校验（private），单独在 route scope 用例中覆盖。 */
interface RouteScopeGuards {
  assertInstanceExists(instanceId: string): Promise<void>;
  assertNodeInInstance(instanceId: string, nodeId: string): Promise<void>;
}

type ScopedRouteCall = (controller: AgentMemoryController) => Promise<unknown>;

type SelectChain<TResult> = Promise<TResult[]> & {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  innerJoin: Mock;
  leftJoin: Mock;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
};

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '99999999-9999-4999-9999-999999999999';
const INSTANCE_ID = '22222222-2222-4222-8222-222222222222';
const NODE_ID = '33333333-3333-4333-8333-333333333333';
const CHILD_NODE_ID = '77777777-7777-4777-8777-777777777777';
const EDGE_ID = '44444444-4444-4444-8444-444444444444';
const PATH_ID = '55555555-5555-4555-8555-555555555555';
const VERSION_ID = '66666666-6666-4666-8666-666666666666';
const NOW = new Date('2025-02-01T08:00:00.000Z');

function createSelectChain<TResult>(result: TResult[]): SelectChain<TResult> {
  const chain = Promise.resolve(result) as SelectChain<TResult>;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
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

// ─── Service Mock Factories ────────────────────────────────────────────

function createMockMemoryNodeService() {
  return {
    createNode: vi.fn(),
    getNode: vi.fn(),
    updateNodeMetadata: vi.fn(),
    deleteNode: vi.fn(),
    listNodes: vi.fn(),
  };
}

function createMockMemoryEdgeService() {
  return {
    createEdge: vi.fn(),
    deleteEdge: vi.fn(),
    getChildEdges: vi.fn(),
    getParentEdges: vi.fn(),
    updateEdgePriority: vi.fn(),
    updateEdgeDisclosure: vi.fn(),
  };
}

function createMockMemoryVersionService() {
  return {
    createVersion: vi.fn(),
    patchVersion: vi.fn(),
    appendVersion: vi.fn(),
    getLatestVersion: vi.fn(),
    getVersionHistory: vi.fn(),
    rollbackToVersion: vi.fn(),
    updateReviewStatus: vi.fn(),
  };
}

function createMockPathResolverService() {
  return {
    resolveUri: vi.fn(),
    createPath: vi.fn(),
    addAlias: vi.fn(),
    deletePath: vi.fn(),
    listChildren: vi.fn(),
    getPathsByNode: vi.fn(),
  };
}

function createMockGlossaryService() {
  return {
    addKeyword: vi.fn(),
    removeKeyword: vi.fn(),
    scanText: vi.fn(),
    getKeywordsForNode: vi.fn(),
    rebuildAutomaton: vi.fn(),
  };
}

function createMockMemorySearchService() {
  return {
    search: vi.fn(),
  };
}

function createMockBootProtocolService() {
  return {
    boot: vi.fn(),
    getIndex: vi.fn(),
    getRecent: vi.fn(),
    getGlossary: vi.fn(),
    getMemorySystemPrompt: vi.fn(),
    executeBootSequence: vi.fn(),
  };
}

function createMockMemoryFusionService() {
  return {
    readFromAll: vi.fn(),
    searchAll: vi.fn(),
    writeToTarget: vi.fn(),
    bootAll: vi.fn(),
    getWriteTarget: vi.fn(),
  };
}

function createMockAuditLogService() {
  return {
    record: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  };
}

function createMockResourceSourceService() {
  return {
    mapCurrentKinds: vi.fn().mockResolvedValue(new Map()),
    buildShareImportedExistsCondition: vi.fn(() => ({
      type: 'share-imported',
    })),
  };
}

// ─── Fixture Factories ─────────────────────────────────────────────────

function createInstance(overrides: Record<string, unknown> = {}) {
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
    createdBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    sourceKind: 'manual',
    ...overrides,
  };
}

function createNode(overrides: Record<string, unknown> = {}) {
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

function createEdge(overrides: Record<string, unknown> = {}) {
  return {
    id: EDGE_ID,
    instanceId: INSTANCE_ID,
    tenantId: TENANT_ID,
    parentNodeId: NODE_ID,
    childNodeId: CHILD_NODE_ID,
    name: 'contains',
    priority: 1,
    disclosure: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function createVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: VERSION_ID,
    tenantId: TENANT_ID,
    nodeId: NODE_ID,
    content: '# 记忆节点内容',
    version: 1,
    changeType: 'create',
    changeSummary: '初始创建',
    reviewStatus: 'pending',
    authorId: USER_ID,
    predecessorId: null,
    deprecated: false,
    createdAt: NOW,
    ...overrides,
  };
}

function createPath(overrides: Record<string, unknown> = {}) {
  return {
    id: PATH_ID,
    instanceId: INSTANCE_ID,
    tenantId: TENANT_ID,
    domain: 'core',
    pathString: '/agent/preferences',
    nodeId: NODE_ID,
    edgeId: null,
    isAlias: false,
    aliasOf: null,
    createdAt: NOW,
    ...overrides,
  };
}

// ─── DTO Helper — 模拟 Zod transform 后的完整输出 ─────────────────────

function d<T>(data: Partial<T>): T {
  return data as T;
}

// ─── Test Suite ────────────────────────────────────────────────────────

describe('AgentMemoryController', () => {
  let controller: AgentMemoryController;
  let rawDb: MockDb;
  let tenantDb: MockDb;
  let mockNodeService: ReturnType<typeof createMockMemoryNodeService>;
  let mockEdgeService: ReturnType<typeof createMockMemoryEdgeService>;
  let mockVersionService: ReturnType<typeof createMockMemoryVersionService>;
  let mockPathResolver: ReturnType<typeof createMockPathResolverService>;
  let mockGlossaryService: ReturnType<typeof createMockGlossaryService>;
  let mockSearchService: ReturnType<typeof createMockMemorySearchService>;
  let mockBootService: ReturnType<typeof createMockBootProtocolService>;
  let mockFusionService: ReturnType<typeof createMockMemoryFusionService>;
  let mockAuditService: ReturnType<typeof createMockAuditLogService>;
  let mockResourceSourceService: ReturnType<
    typeof createMockResourceSourceService
  >;
  let scopeGuards: {
    assertInstanceExists: Mock;
    assertNodeInInstance: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    rawDb = mocks.createMockDb();
    tenantDb = mocks.createMockDb();
    mocks.getTenantDb.mockReturnValue(tenantDb as unknown as DrizzleDB);

    mockNodeService = createMockMemoryNodeService();
    mockEdgeService = createMockMemoryEdgeService();
    mockVersionService = createMockMemoryVersionService();
    mockPathResolver = createMockPathResolverService();
    mockGlossaryService = createMockGlossaryService();
    mockSearchService = createMockMemorySearchService();
    mockBootService = createMockBootProtocolService();
    mockFusionService = createMockMemoryFusionService();
    mockAuditService = createMockAuditLogService();
    mockResourceSourceService = createMockResourceSourceService();

    controller = new AgentMemoryController(
      rawDb as unknown as DrizzleDB,
      mockNodeService as never,
      mockEdgeService as never,
      mockVersionService as never,
      mockPathResolver as never,
      mockGlossaryService as never,
      mockSearchService as never,
      mockBootService as never,
      mockFusionService as never,
      mockAuditService as never,
      mockResourceSourceService as never,
    );

    // 其余用例只关心各自的委托逻辑；归属校验的真实查询在 route scope 中验证。
    const guards = controller as unknown as RouteScopeGuards;
    scopeGuards = {
      assertInstanceExists: vi
        .spyOn(guards, 'assertInstanceExists')
        .mockResolvedValue(undefined),
      assertNodeInInstance: vi
        .spyOn(guards, 'assertNodeInInstance')
        .mockResolvedValue(undefined),
    };
  });

  // ─── Memory Instance CRUD ──────────────────────────────────────────

  describe('createInstance', () => {
    it('应创建记忆实例并返回 data 信封', async () => {
      const instance = createInstance();
      const insertQuery = createInsertChain([instance]);
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      const result = await controller.createInstance(
        TENANT_ID,
        USER_ID,
        d<CreateMemoryInstanceDto>({
          name: '长期记忆实例',
          description: '用于单测',
          config: { fusionPriority: 0.8 },
          systemPromptOverride: undefined,
          validDomains: undefined,
          coreMemoryUris: undefined,
        }),
      );

      expect(result).toEqual({ data: instance });
      expect(tenantDb.insert).toHaveBeenCalledWith(agentMemoryInstances);
      expect(insertQuery.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: getTenantId,
          name: '长期记忆实例',
          description: '用于单测',
          config: { fusionPriority: 0.8 },
          createdBy: USER_ID,
        }),
      );
    });

    it('可选字段缺省时应使用默认值', async () => {
      const instance = createInstance();
      const insertQuery = createInsertChain([instance]);
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await controller.createInstance(
        TENANT_ID,
        USER_ID,
        d<CreateMemoryInstanceDto>({
          name: '最简实例',
          description: undefined,
          config: undefined,
          systemPromptOverride: undefined,
          validDomains: undefined,
          coreMemoryUris: undefined,
        }),
      );

      expect(insertQuery.values).toHaveBeenCalledWith(
        expect.objectContaining({
          description: null,
          config: {},
          systemPromptOverride: null,
          validDomains: [],
          coreMemoryUris: [],
        }),
      );
    });
  });

  describe('listInstances', () => {
    it('应返回分页列表与 meta', async () => {
      const instances = [createInstance(), createInstance({ id: 'inst-2' })];
      const dataQuery = createSelectChain(instances);
      const countQuery = createSelectChain([{ total: 10 }]);
      const nodeCountQuery = createSelectChain([
        { instanceId: instances[0].id, total: 3 },
        { instanceId: instances[1].id, total: 5 },
      ]);

      tenantDb.select
        .mockReturnValueOnce(dataQuery)
        .mockReturnValueOnce(countQuery)
        .mockReturnValueOnce(nodeCountQuery);

      const result = await controller.listInstances(
        TENANT_ID,
        d<ListMemoryInstancesQueryDto>({
          page: 1,
          pageSize: 20,
          search: undefined,
          status: undefined,
        }),
      );

      expect(result.data).toEqual(
        instances.map((inst, i) => ({
          ...inst,
          nodeCount: [3, 5][i],
        })),
      );
      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 10,
        totalPages: 1,
      });
    });

    it('分页参数缺省时应回退到默认值', async () => {
      const instances = [createInstance()];
      const dataQuery = createSelectChain(instances);
      const countQuery = createSelectChain([{ total: 1 }]);
      const nodeCountQuery = createSelectChain([]);

      tenantDb.select
        .mockReturnValueOnce(dataQuery)
        .mockReturnValueOnce(countQuery)
        .mockReturnValueOnce(nodeCountQuery);

      const result = await controller.listInstances(
        TENANT_ID,
        d<ListMemoryInstancesQueryDto>({
          search: undefined,
          status: undefined,
        }),
      );

      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
      expect(dataQuery.limit).toHaveBeenCalledWith(20);
      expect(dataQuery.offset).toHaveBeenCalledWith(0);
    });

    it('应支持 search 和 status 过滤', async () => {
      const dataQuery = createSelectChain([]);
      const countQuery = createSelectChain([{ total: 0 }]);
      const nodeCountQuery = createSelectChain([]);

      tenantDb.select
        .mockReturnValueOnce(dataQuery)
        .mockReturnValueOnce(countQuery)
        .mockReturnValueOnce(nodeCountQuery);

      const result = await controller.listInstances(
        TENANT_ID,
        d<ListMemoryInstancesQueryDto>({
          page: 1,
          pageSize: 10,
          search: '长期',
          status: 'active',
        }),
      );

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(mocks.operators.eq).toHaveBeenCalledWith(
        agentMemoryInstances.status,
        'active',
      );
    });

    it('count 为空时 total 应回退为 0', async () => {
      const dataQuery = createSelectChain([]);
      const countQuery = createSelectChain([undefined] as unknown[]);
      const nodeCountQuery = createSelectChain([]);

      tenantDb.select
        .mockReturnValueOnce(dataQuery)
        .mockReturnValueOnce(countQuery)
        .mockReturnValueOnce(nodeCountQuery);

      const result = await controller.listInstances(
        TENANT_ID,
        d<ListMemoryInstancesQueryDto>({
          page: 1,
          pageSize: 20,
          search: undefined,
          status: undefined,
        }),
      );

      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  describe('getInstance', () => {
    it('应返回实例详情与统计信息', async () => {
      const instance = createInstance();
      const instanceQuery = createSelectChain([instance]);
      const nodeCountQuery = createSelectChain([{ total: 5 }]);
      const edgeCountQuery = createSelectChain([{ total: 3 }]);
      const latestActivityQuery = createSelectChain([
        { latestAt: '2025-02-01T10:00:00Z' },
      ]);

      tenantDb.select
        .mockReturnValueOnce(instanceQuery)
        .mockReturnValueOnce(nodeCountQuery)
        .mockReturnValueOnce(edgeCountQuery)
        .mockReturnValueOnce(latestActivityQuery);

      const result = await controller.getInstance(TENANT_ID, INSTANCE_ID);

      expect(result.data.stats).toEqual({
        nodeCount: 5,
        edgeCount: 3,
        latestActivity: '2025-02-01T10:00:00Z',
      });
      expect(result.data.name).toBe('长期记忆实例');
    });

    it('实例不存在时应抛出 404 memory-instance-not-found', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        controller.getInstance(TENANT_ID, INSTANCE_ID),
      ).rejects.toMatchObject({
        status: 404,
        type: expect.stringContaining('memory-instance-not-found'),
      });
    });

    it('无节点时统计应为零值', async () => {
      const instance = createInstance();
      tenantDb.select
        .mockReturnValueOnce(createSelectChain([instance]))
        .mockReturnValueOnce(createSelectChain([undefined] as unknown[]))
        .mockReturnValueOnce(createSelectChain([undefined] as unknown[]))
        .mockReturnValueOnce(createSelectChain([undefined] as unknown[]));

      const result = await controller.getInstance(TENANT_ID, INSTANCE_ID);

      expect(result.data.stats).toEqual({
        nodeCount: 0,
        edgeCount: 0,
        latestActivity: null,
      });
    });
  });

  describe('updateInstance', () => {
    it('应更新实例并返回更新后数据', async () => {
      const updated = createInstance({ name: '更新后名称' });
      const updateQuery = createUpdateChain([updated]);
      tenantDb.update.mockReturnValueOnce(updateQuery.chain);

      const result = await controller.updateInstance(
        TENANT_ID,
        INSTANCE_ID,
        d<UpdateMemoryInstanceDto>({
          name: '更新后名称',
          description: undefined,
          config: undefined,
          systemPromptOverride: undefined,
          validDomains: undefined,
          coreMemoryUris: undefined,
          status: undefined,
        }),
      );

      expect(result).toEqual({ data: updated });
      expect(tenantDb.update).toHaveBeenCalledWith(agentMemoryInstances);
    });

    it('应仅写入已提供的可选字段', async () => {
      const updated = createInstance({
        description: '新的实例描述',
        config: { fusionPriority: 4 },
        systemPromptOverride: 'custom prompt',
        validDomains: ['notes'],
        coreMemoryUris: ['core://updated'],
        status: 'archived',
      });
      const updateQuery = createUpdateChain([updated]);
      tenantDb.update.mockReturnValueOnce(updateQuery.chain);

      const result = await controller.updateInstance(
        TENANT_ID,
        INSTANCE_ID,
        d<UpdateMemoryInstanceDto>({
          name: undefined,
          description: '新的实例描述',
          config: { fusionPriority: 4 },
          systemPromptOverride: 'custom prompt',
          validDomains: ['notes'],
          coreMemoryUris: ['core://updated'],
          status: 'archived',
        }),
      );

      const updates = updateQuery.set.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(result).toEqual({ data: updated });
      expect(updates).toMatchObject({
        description: '新的实例描述',
        config: { fusionPriority: 4 },
        systemPromptOverride: 'custom prompt',
        validDomains: ['notes'],
        coreMemoryUris: ['core://updated'],
        status: 'archived',
      });
      expect(updates).not.toHaveProperty('name');
    });

    it('实例不存在时应抛出 404 memory-instance-not-found', async () => {
      const updateQuery = createUpdateChain([]);
      tenantDb.update.mockReturnValueOnce(updateQuery.chain);

      await expect(
        controller.updateInstance(
          TENANT_ID,
          INSTANCE_ID,
          d<UpdateMemoryInstanceDto>({
            name: '不存在',
            description: undefined,
            config: undefined,
            systemPromptOverride: undefined,
            validDomains: undefined,
            coreMemoryUris: undefined,
            status: undefined,
          }),
        ),
      ).rejects.toBeInstanceOf(MemoryInstanceNotFoundException);
    });
  });

  describe('deleteInstance', () => {
    it('应成功删除实例并返回 void', async () => {
      const deleteQuery = createDeleteChain([{ id: INSTANCE_ID }]);
      tenantDb.delete.mockReturnValueOnce(deleteQuery.chain);

      const result = await controller.deleteInstance(TENANT_ID, INSTANCE_ID);

      expect(result).toBeUndefined();
      expect(tenantDb.delete).toHaveBeenCalledWith(agentMemoryInstances);
    });

    it('实例不存在时应抛出 404 memory-instance-not-found', async () => {
      const deleteQuery = createDeleteChain([]);
      tenantDb.delete.mockReturnValueOnce(deleteQuery.chain);

      await expect(
        controller.deleteInstance(TENANT_ID, INSTANCE_ID),
      ).rejects.toBeInstanceOf(MemoryInstanceNotFoundException);
    });
  });

  // ─── Graph Operations ──────────────────────────────────────────────

  describe('listNodes', () => {
    it('应委托 MemoryNodeService 并返回分页结果', async () => {
      const nodes = [createNode()];
      mockNodeService.listNodes.mockResolvedValueOnce({
        data: nodes,
        total: 1,
      });

      const result = await controller.listNodes(
        TENANT_ID,
        INSTANCE_ID,
        d<ListMemoryNodesQueryDto>({
          page: 1,
          pageSize: 20,
          contentType: undefined,
        }),
      );

      expect(result.data).toEqual(nodes);
      expect(result.meta.total).toBe(1);
      expect(mockNodeService.listNodes).toHaveBeenCalledWith(INSTANCE_ID, {
        page: 1,
        limit: 20,
        contentType: undefined,
      });
    });

    it('应传递 contentType 过滤', async () => {
      mockNodeService.listNodes.mockResolvedValueOnce({
        data: [],
        total: 0,
      });

      await controller.listNodes(
        TENANT_ID,
        INSTANCE_ID,
        d<ListMemoryNodesQueryDto>({
          page: 1,
          pageSize: 10,
          contentType: 'markdown',
        }),
      );

      expect(mockNodeService.listNodes).toHaveBeenCalledWith(INSTANCE_ID, {
        page: 1,
        limit: 10,
        contentType: 'markdown',
      });
    });

    it('未传分页参数时应使用默认分页', async () => {
      const nodes = [createNode()];
      mockNodeService.listNodes.mockResolvedValueOnce({
        data: nodes,
        total: 1,
      });

      const result = await controller.listNodes(
        TENANT_ID,
        INSTANCE_ID,
        d<ListMemoryNodesQueryDto>({ contentType: undefined }),
      );

      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
      expect(mockNodeService.listNodes).toHaveBeenCalledWith(INSTANCE_ID, {
        page: undefined,
        limit: undefined,
        contentType: undefined,
      });
    });
  });

  describe('getNode', () => {
    it('应返回节点详情（含版本历史和边）', async () => {
      const node = createNode();
      const versions = [createVersion()];
      const childEdges = [createEdge()];
      const parentEdges = [createEdge({ id: 'edge-parent' })];

      mockNodeService.getNode.mockResolvedValueOnce(node);
      mockVersionService.getVersionHistory.mockResolvedValueOnce(versions);
      mockEdgeService.getChildEdges.mockResolvedValueOnce(childEdges);
      mockEdgeService.getParentEdges.mockResolvedValueOnce(parentEdges);

      const result = await controller.getNode(TENANT_ID, INSTANCE_ID, NODE_ID);

      expect(result.data.id).toBe(NODE_ID);
      expect(result.data.versions).toEqual(versions);
      expect(result.data.edges.children).toEqual(childEdges);
      expect(result.data.edges.parents).toEqual(parentEdges);
    });

    it('节点不存在时应传播 404 memory-node-not-found', async () => {
      mockNodeService.getNode.mockRejectedValueOnce(
        new MemoryNodeNotFoundException(NODE_ID),
      );

      await expect(
        controller.getNode(TENANT_ID, INSTANCE_ID, NODE_ID),
      ).rejects.toBeInstanceOf(MemoryNodeNotFoundException);
    });
  });

  describe('createNode', () => {
    it('应委托 MemoryNodeService 创建节点', async () => {
      const node = createNode();
      mockNodeService.createNode.mockResolvedValueOnce(node);

      const result = await controller.createNode(
        TENANT_ID,
        INSTANCE_ID,
        d<CreateMemoryNodeDto>({
          contentType: 'text',
          metadata: { topic: 'agent-memory' },
          disclosureLevel: 0,
        }),
      );

      expect(result).toEqual({ data: node });
      expect(mockNodeService.createNode).toHaveBeenCalledWith(INSTANCE_ID, {
        contentType: 'text',
        metadata: { topic: 'agent-memory' },
        disclosureLevel: 0,
      });
    });
  });

  describe('listChildNodes', () => {
    it('应返回子节点列表（通过边）', async () => {
      const edges = [createEdge()];
      mockEdgeService.getChildEdges.mockResolvedValueOnce(edges);

      const result = await controller.listChildNodes(
        TENANT_ID,
        INSTANCE_ID,
        NODE_ID,
      );

      expect(result).toEqual({ data: edges });
      expect(mockEdgeService.getChildEdges).toHaveBeenCalledWith(NODE_ID);
    });
  });

  describe('resolveUri', () => {
    it('应委托 PathResolverService 解析 URI', async () => {
      const resolved = { node: createNode(), path: createPath() };
      mockPathResolver.resolveUri.mockResolvedValueOnce(resolved);

      const result = await controller.resolveUri(
        TENANT_ID,
        INSTANCE_ID,
        d<ResolveUriQueryDto>({ uri: 'core:///agent/preferences' }),
      );

      expect(result).toEqual({ data: resolved });
      expect(mockPathResolver.resolveUri).toHaveBeenCalledWith(
        INSTANCE_ID,
        'core:///agent/preferences',
      );
    });
  });

  describe('search', () => {
    it('应委托 MemorySearchService 执行全文搜索', async () => {
      const searchResults = [
        { nodeId: NODE_ID, score: 0.95, content: '测试结果' },
      ];
      mockSearchService.search.mockResolvedValueOnce(searchResults);

      const result = await controller.search(
        TENANT_ID,
        INSTANCE_ID,
        d<MemorySearchQueryDto>({
          q: '测试',
          limit: 10,
          offset: 0,
          minDisclosure: undefined,
        }),
      );

      expect(result).toEqual({ data: searchResults });
      expect(mockSearchService.search).toHaveBeenCalledWith(INSTANCE_ID, {
        query: '测试',
        limit: 10,
        offset: 0,
        minDisclosure: undefined,
      });
    });

    it('应传递 minDisclosure 参数', async () => {
      mockSearchService.search.mockResolvedValueOnce([]);

      await controller.search(
        TENANT_ID,
        INSTANCE_ID,
        d<MemorySearchQueryDto>({
          q: '测试',
          limit: 20,
          offset: 0,
          minDisclosure: 2,
        }),
      );

      expect(mockSearchService.search).toHaveBeenCalledWith(INSTANCE_ID, {
        query: '测试',
        limit: 20,
        offset: 0,
        minDisclosure: 2,
      });
    });
  });

  describe('getGraph', () => {
    it('应返回完整图数据（nodes + edges）', async () => {
      const nodes = [createNode()];
      const edges = [createEdge()];

      const nodesQuery = createSelectChain(nodes);
      const edgesQuery = createSelectChain(edges);

      tenantDb.select
        .mockReturnValueOnce(nodesQuery)
        .mockReturnValueOnce(edgesQuery);

      const result = await controller.getGraph(TENANT_ID, INSTANCE_ID);

      expect(result).toEqual({ data: { nodes, edges } });
      expect(nodesQuery.from).toHaveBeenCalledWith(memoryNodes);
      expect(edgesQuery.from).toHaveBeenCalledWith(memoryEdges);
    });
  });

  // ─── Path/Alias Operations ─────────────────────────────────────────

  describe('createPath', () => {
    it('应委托 PathResolverService 创建路径', async () => {
      const path = createPath();
      mockPathResolver.createPath.mockResolvedValueOnce(path);

      const result = await controller.createPath(
        TENANT_ID,
        INSTANCE_ID,
        d<CreateMemoryPathDto>({
          domain: 'core',
          pathString: '/agent/preferences',
          nodeId: NODE_ID,
        }),
      );

      expect(result).toEqual({ data: path });
      expect(mockPathResolver.createPath).toHaveBeenCalledWith(
        INSTANCE_ID,
        'core',
        '/agent/preferences',
        NODE_ID,
      );
    });
  });

  describe('createAlias', () => {
    it('应委托 PathResolverService 添加别名', async () => {
      const alias = createPath({ isAlias: true, aliasOf: PATH_ID });
      mockPathResolver.addAlias.mockResolvedValueOnce(alias);

      const result = await controller.createAlias(
        TENANT_ID,
        INSTANCE_ID,
        d<CreateMemoryAliasDto>({
          sourceUri: 'core:///agent/preferences',
          aliasUri: 'core:///agent/prefs',
        }),
      );

      expect(result).toEqual({ data: alias });
      expect(mockPathResolver.addAlias).toHaveBeenCalledWith(
        INSTANCE_ID,
        'core:///agent/preferences',
        'core:///agent/prefs',
      );
    });
  });

  describe('deletePath', () => {
    it('应按路径 ID 直接删除路径绑定', async () => {
      const deleteQuery = createDeleteChain([{ id: PATH_ID }]);
      tenantDb.delete.mockReturnValueOnce(deleteQuery.chain);

      const result = await controller.deletePath(
        TENANT_ID,
        INSTANCE_ID,
        PATH_ID,
      );

      expect(result).toBeUndefined();
      expect(tenantDb.delete).toHaveBeenCalledWith(memoryPaths);
    });

    it('路径不存在时应抛出 404 memory-path-not-found', async () => {
      const deleteQuery = createDeleteChain([]);
      tenantDb.delete.mockReturnValueOnce(deleteQuery.chain);

      await expect(
        controller.deletePath(TENANT_ID, INSTANCE_ID, PATH_ID),
      ).rejects.toBeInstanceOf(MemoryPathNotFoundException);
    });
  });

  describe('listPaths', () => {
    it('应返回路径分页列表', async () => {
      const paths = [createPath()];
      const dataQuery = createSelectChain(paths);
      const countQuery = createSelectChain([{ total: 1 }]);

      tenantDb.select
        .mockReturnValueOnce(dataQuery)
        .mockReturnValueOnce(countQuery);

      const result = await controller.listPaths(
        TENANT_ID,
        INSTANCE_ID,
        d<ListMemoryPathsQueryDto>({
          page: 1,
          pageSize: 20,
          domain: undefined,
        }),
      );

      expect(result.data).toEqual(paths);
      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
      expect(dataQuery.from).toHaveBeenCalledWith(memoryPaths);
    });

    it('应支持 domain 过滤', async () => {
      tenantDb.select
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([{ total: 0 }]));

      await controller.listPaths(
        TENANT_ID,
        INSTANCE_ID,
        d<ListMemoryPathsQueryDto>({
          page: 1,
          pageSize: 20,
          domain: 'core',
        }),
      );

      expect(mocks.operators.eq).toHaveBeenCalledWith(
        memoryPaths.domain,
        'core',
      );
    });

    it('分页参数缺省时应使用路径列表默认值', async () => {
      tenantDb.select
        .mockReturnValueOnce(createSelectChain([createPath()]))
        .mockReturnValueOnce(createSelectChain([{ total: 1 }]));

      const result = await controller.listPaths(
        TENANT_ID,
        INSTANCE_ID,
        d<ListMemoryPathsQueryDto>({ domain: undefined }),
      );

      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
    });
  });

  // ─── Edge Operations ───────────────────────────────────────────────

  describe('listEdges', () => {
    it('应返回边的分页列表', async () => {
      const edges = [createEdge()];
      const dataQuery = createSelectChain(edges);
      const countQuery = createSelectChain([{ total: 5 }]);

      tenantDb.select
        .mockReturnValueOnce(dataQuery)
        .mockReturnValueOnce(countQuery);

      const result = await controller.listEdges(
        TENANT_ID,
        INSTANCE_ID,
        d<ListMemoryEdgesQueryDto>({
          page: 1,
          pageSize: 20,
          parentNodeId: undefined,
          childNodeId: undefined,
        }),
      );

      expect(result.data).toEqual(edges);
      expect(result.meta.total).toBe(5);
      expect(dataQuery.from).toHaveBeenCalledWith(memoryEdges);
    });

    it('应支持 parentNodeId 和 childNodeId 过滤', async () => {
      tenantDb.select
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([{ total: 0 }]));

      await controller.listEdges(
        TENANT_ID,
        INSTANCE_ID,
        d<ListMemoryEdgesQueryDto>({
          page: 1,
          pageSize: 20,
          parentNodeId: NODE_ID,
          childNodeId: CHILD_NODE_ID,
        }),
      );

      expect(mocks.operators.eq).toHaveBeenCalledWith(
        memoryEdges.parentNodeId,
        NODE_ID,
      );
      expect(mocks.operators.eq).toHaveBeenCalledWith(
        memoryEdges.childNodeId,
        CHILD_NODE_ID,
      );
    });

    it('分页参数缺省时应使用边列表默认值', async () => {
      tenantDb.select
        .mockReturnValueOnce(createSelectChain([createEdge()]))
        .mockReturnValueOnce(createSelectChain([{ total: 1 }]));

      const result = await controller.listEdges(
        TENANT_ID,
        INSTANCE_ID,
        d<ListMemoryEdgesQueryDto>({
          parentNodeId: undefined,
          childNodeId: undefined,
        }),
      );

      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
    });
  });

  describe('createEdge', () => {
    it('应委托 MemoryEdgeService 创建边', async () => {
      const edge = createEdge();
      mockEdgeService.createEdge.mockResolvedValueOnce(edge);

      const result = await controller.createEdge(
        TENANT_ID,
        INSTANCE_ID,
        d<CreateMemoryEdgeDto>({
          parentNodeId: NODE_ID,
          childNodeId: CHILD_NODE_ID,
          name: 'contains',
          priority: 0,
          disclosure: 0,
        }),
      );

      expect(result).toEqual({ data: edge });
      expect(mockEdgeService.createEdge).toHaveBeenCalledWith(INSTANCE_ID, {
        parentNodeId: NODE_ID,
        childNodeId: CHILD_NODE_ID,
        name: 'contains',
        priority: 0,
        disclosure: 0,
      });
    });

    it('循环检测应传播 409 memory-edge-cycle', async () => {
      mockEdgeService.createEdge.mockRejectedValueOnce(
        new MemoryEdgeCycleException(),
      );

      await expect(
        controller.createEdge(
          TENANT_ID,
          INSTANCE_ID,
          d<CreateMemoryEdgeDto>({
            parentNodeId: NODE_ID,
            childNodeId: NODE_ID,
            priority: 0,
            disclosure: 0,
          }),
        ),
      ).rejects.toBeInstanceOf(MemoryEdgeCycleException);
    });
  });

  describe('deleteEdge', () => {
    it('应校验边属于实例后委托 MemoryEdgeService 删除边', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([{ id: EDGE_ID }]));
      mockEdgeService.deleteEdge.mockResolvedValueOnce(undefined);

      const result = await controller.deleteEdge(
        TENANT_ID,
        INSTANCE_ID,
        EDGE_ID,
      );

      expect(result).toBeUndefined();
      expect(scopeGuards.assertInstanceExists).toHaveBeenCalledWith(
        INSTANCE_ID,
      );
      expect(mockEdgeService.deleteEdge).toHaveBeenCalledWith(EDGE_ID);
    });

    it('边不属于路由实例时应返回 404 且不删除', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        controller.deleteEdge(TENANT_ID, INSTANCE_ID, EDGE_ID),
      ).rejects.toBeInstanceOf(MemoryEdgeNotFoundException);
      expect(mockEdgeService.deleteEdge).not.toHaveBeenCalled();
    });
  });

  // ─── Version Operations ────────────────────────────────────────────

  describe('listVersions', () => {
    it('应返回版本的内存分页列表', async () => {
      const versions = Array.from({ length: 25 }, (_, i) =>
        createVersion({ id: `ver-${i}`, version: i + 1 }),
      );
      mockVersionService.getVersionHistory.mockResolvedValueOnce(versions);

      const result = await controller.listVersions(
        TENANT_ID,
        INSTANCE_ID,
        NODE_ID,
        d<ListMemoryVersionsQueryDto>({ page: 2, pageSize: 10 }),
      );

      expect(result.data).toHaveLength(10);
      expect(result.data[0]).toEqual(versions[10]);
      expect(result.meta).toEqual({
        page: 2,
        pageSize: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it('默认分页参数应为 page=1, pageSize=20', async () => {
      mockVersionService.getVersionHistory.mockResolvedValueOnce([]);

      const result = await controller.listVersions(
        TENANT_ID,
        INSTANCE_ID,
        NODE_ID,
        d<ListMemoryVersionsQueryDto>({ page: 1, pageSize: 20 }),
      );

      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(20);
    });
  });

  describe('createVersion', () => {
    it('mode=create 时应调用 createVersion', async () => {
      const version = createVersion();
      mockVersionService.createVersion.mockResolvedValueOnce(version);

      const result = await controller.createVersion(
        TENANT_ID,
        USER_ID,
        INSTANCE_ID,
        NODE_ID,
        d<CreateMemoryVersionInput>({
          mode: 'create',
          content: '# 内容',
        }),
      );

      expect(result).toEqual({ data: version });
      expect(mockVersionService.createVersion).toHaveBeenCalledWith(
        NODE_ID,
        '# 内容',
        USER_ID,
      );
    });

    it('mode=patch 时应调用 patchVersion', async () => {
      const version = createVersion({ changeType: 'patch' });
      mockVersionService.patchVersion.mockResolvedValueOnce(version);

      const result = await controller.createVersion(
        TENANT_ID,
        USER_ID,
        INSTANCE_ID,
        NODE_ID,
        d<CreateMemoryVersionInput>({
          mode: 'patch',
          oldString: '旧文本',
          newString: '新文本',
        }),
      );

      expect(result).toEqual({ data: version });
      expect(mockVersionService.patchVersion).toHaveBeenCalledWith(
        NODE_ID,
        { oldString: '旧文本', newString: '新文本' },
        USER_ID,
      );
    });

    it('mode=append 时应调用 appendVersion', async () => {
      const version = createVersion({ changeType: 'append' });
      mockVersionService.appendVersion.mockResolvedValueOnce(version);

      const result = await controller.createVersion(
        TENANT_ID,
        USER_ID,
        INSTANCE_ID,
        NODE_ID,
        d<CreateMemoryVersionInput>({
          mode: 'append',
          content: '追加内容',
        }),
      );

      expect(result).toEqual({ data: version });
      expect(mockVersionService.appendVersion).toHaveBeenCalledWith(
        NODE_ID,
        '追加内容',
        USER_ID,
      );
    });

    it('应先校验节点属于实例再写版本', async () => {
      scopeGuards.assertNodeInInstance.mockRejectedValueOnce(
        new MemoryNodeNotFoundException(NODE_ID, INSTANCE_ID),
      );

      await expect(
        controller.createVersion(
          TENANT_ID,
          USER_ID,
          INSTANCE_ID,
          NODE_ID,
          d<CreateMemoryVersionInput>({ mode: 'create', content: 'x' }),
        ),
      ).rejects.toBeInstanceOf(MemoryNodeNotFoundException);
      expect(mockVersionService.createVersion).not.toHaveBeenCalled();
    });
  });

  describe('rollbackVersion', () => {
    it('应委托 MemoryVersionService 回滚到指定版本', async () => {
      const version = createVersion({ version: 3 });
      mockVersionService.rollbackToVersion.mockResolvedValueOnce(version);

      const result = await controller.rollbackVersion(
        TENANT_ID,
        USER_ID,
        INSTANCE_ID,
        NODE_ID,
        d<RollbackVersionDto>({ targetVersionId: VERSION_ID }),
      );

      expect(result).toEqual({ data: version });
      expect(mockVersionService.rollbackToVersion).toHaveBeenCalledWith(
        NODE_ID,
        VERSION_ID,
        USER_ID,
      );
    });
  });

  describe('非创建型 POST 的状态码', () => {
    it('rollback 与 review 不创建资源，应返回 200 而非 201', () => {
      const prototype = AgentMemoryController.prototype;

      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, prototype.rollbackVersion),
      ).toBe(HttpStatus.OK);
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, prototype.reviewVersion),
      ).toBe(HttpStatus.OK);
    });
  });

  // ─── Audit/Review ──────────────────────────────────────────────────

  describe('listAuditLogs', () => {
    it('应联结节点与用户并序列化为 Studio 审计字段', async () => {
      const auditRow = {
        id: VERSION_ID,
        instanceId: INSTANCE_ID,
        nodeId: NODE_ID,
        nodeName: '核心记忆',
        version: 2,
        content: '新内容',
        reviewStatus: 'pending' as const,
        patchSummary: 'patch: oldString -> newString',
        createdBy: USER_ID,
        createdAt: NOW,
        actor: '测试用户',
        previousValue: '旧内容',
      };
      const dataQuery = createSelectChain([auditRow]);
      const countQuery = createSelectChain([{ total: 1 }]);

      tenantDb.select
        .mockReturnValueOnce(dataQuery)
        .mockReturnValueOnce(countQuery);

      const result = await controller.listAuditLogs(
        TENANT_ID,
        INSTANCE_ID,
        d<ListAuditLogQueryDto>({ page: 1, pageSize: 20 }),
      );

      expect(result.data).toEqual([
        {
          id: VERSION_ID,
          instanceId: INSTANCE_ID,
          nodeId: NODE_ID,
          nodeName: '核心记忆',
          versionId: VERSION_ID,
          operationType: 'update',
          actor: '测试用户',
          actorId: USER_ID,
          timestamp: NOW.toISOString(),
          changeSummary: 'patch: oldString -> newString',
          previousValue: '旧内容',
          currentValue: '新内容',
          reviewStatus: 'pending',
          metadata: {},
        },
      ]);
      expect(result.meta.total).toBe(1);
      expect(dataQuery.innerJoin).toHaveBeenCalledWith(
        memoryNodes,
        expect.anything(),
      );
    });

    it('分页参数缺省时应使用审计日志默认分页', async () => {
      tenantDb.select
        .mockReturnValueOnce(createSelectChain([createVersion()]))
        .mockReturnValueOnce(createSelectChain([{ total: 1 }]));

      const result = await controller.listAuditLogs(
        TENANT_ID,
        INSTANCE_ID,
        d<ListAuditLogQueryDto>({}),
      );

      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
    });
  });

  describe('reviewVersion', () => {
    it('approve 应映射为 approved 并记录审计', async () => {
      const version = createVersion({ reviewStatus: 'approved' });
      mockVersionService.updateReviewStatus.mockResolvedValueOnce(version);

      const result = await controller.reviewVersion(
        TENANT_ID,
        USER_ID,
        INSTANCE_ID,
        NODE_ID,
        VERSION_ID,
        d<ReviewVersionDto>({ action: 'approve' }),
      );

      expect(result).toEqual({ data: version });
      expect(scopeGuards.assertNodeInInstance).toHaveBeenCalledWith(
        INSTANCE_ID,
        NODE_ID,
      );
      expect(mockVersionService.updateReviewStatus).toHaveBeenCalledWith({
        nodeId: NODE_ID,
        versionId: VERSION_ID,
        action: 'approve',
        reviewer: USER_ID,
      });
      expect(mockAuditService.record).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorId: USER_ID,
        actorType: 'user',
        eventType: 'memory.version.approve',
        resourceType: 'memory_version',
        resourceId: VERSION_ID,
        summary: `Version ${VERSION_ID} of node ${NODE_ID} approve`,
        metadata: {
          instanceId: INSTANCE_ID,
          nodeId: NODE_ID,
          action: 'approve',
        },
      });
    });

    it('reject 应映射为 rejected 并记录审计', async () => {
      const version = createVersion({ reviewStatus: 'rejected' });
      mockVersionService.updateReviewStatus.mockResolvedValueOnce(version);

      const result = await controller.reviewVersion(
        TENANT_ID,
        USER_ID,
        INSTANCE_ID,
        NODE_ID,
        VERSION_ID,
        d<ReviewVersionDto>({ action: 'reject' }),
      );

      expect(result).toEqual({ data: version });
      expect(mockVersionService.updateReviewStatus).toHaveBeenCalledWith({
        nodeId: NODE_ID,
        versionId: VERSION_ID,
        action: 'reject',
        reviewer: USER_ID,
      });
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'memory.version.reject',
          metadata: expect.objectContaining({ action: 'reject' }),
        }),
      );
    });

    it('版本不属于路由节点时应传播 404 且不写审计', async () => {
      mockVersionService.updateReviewStatus.mockRejectedValueOnce(
        new MemoryVersionNotFoundException(NODE_ID, VERSION_ID),
      );

      await expect(
        controller.reviewVersion(
          TENANT_ID,
          USER_ID,
          INSTANCE_ID,
          NODE_ID,
          VERSION_ID,
          d<ReviewVersionDto>({ action: 'approve' }),
        ),
      ).rejects.toBeInstanceOf(MemoryVersionNotFoundException);
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });
  });

  describe('listPendingReviews', () => {
    it('应查询 reviewStatus=pending 的版本', async () => {
      const pendingVersions = [createVersion({ reviewStatus: 'pending' })];
      const dataQuery = createSelectChain(pendingVersions);
      const countQuery = createSelectChain([{ total: 1 }]);

      tenantDb.select
        .mockReturnValueOnce(dataQuery)
        .mockReturnValueOnce(countQuery);

      const result = await controller.listPendingReviews(
        TENANT_ID,
        INSTANCE_ID,
        d<ListPendingReviewsQueryDto>({ page: 1, pageSize: 20 }),
      );

      expect(result.data).toEqual(pendingVersions);
      expect(result.meta.total).toBe(1);
      expect(mocks.operators.eq).toHaveBeenCalledWith(
        memoryVersions.reviewStatus,
        'pending',
      );
    });

    it('分页参数缺省时应使用待审核列表默认值', async () => {
      tenantDb.select
        .mockReturnValueOnce(
          createSelectChain([createVersion({ reviewStatus: 'pending' })]),
        )
        .mockReturnValueOnce(createSelectChain([{ total: 1 }]));

      const result = await controller.listPendingReviews(
        TENANT_ID,
        INSTANCE_ID,
        d<ListPendingReviewsQueryDto>({}),
      );

      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
    });
  });

  // ─── Browse & Domains ───────────────────────────────────────────────

  describe('browse', () => {
    it('应浏览域根并返回子路径列表', async () => {
      const childPath = createPath({
        pathString: 'preferences',
        nodeId: NODE_ID,
      });
      mockPathResolver.listChildren.mockResolvedValue([childPath]);

      // navOnly=true: 每个子节点需查询 memoryEdges count
      tenantDb.select.mockReturnValueOnce(createSelectChain([{ total: 2 }]));

      const result = await controller.browse(
        TENANT_ID,
        INSTANCE_ID,
        d<BrowseQueryDto>({ uri: 'core://', navOnly: true }),
      );

      expect(result.data.node).toBeNull();
      expect(result.data.children).toHaveLength(1);
      expect(result.data.children[0].name).toBe('preferences');
      expect(result.data.breadcrumbs).toEqual([]);
      expect(mockPathResolver.listChildren).toHaveBeenCalledWith(
        INSTANCE_ID,
        'core://',
      );
    });

    it('应解析具体路径并返回富化节点', async () => {
      const node = createNode();
      const version = createVersion({ content: '测试内容', version: 3 });
      const path = createPath({
        domain: 'core',
        pathString: 'agent/preferences',
      });

      mockPathResolver.resolveUri.mockResolvedValue(node);
      // enrichNodeForBrowse 内部 Promise.all 调用:
      mockPathResolver.getPathsByNode.mockResolvedValue([path]);
      mockVersionService.getVersionHistory.mockResolvedValue([version]);
      tenantDb.select.mockReturnValueOnce(createSelectChain([{ total: 1 }])); // child count
      mockGlossaryService.getKeywordsForNode.mockResolvedValue([]);

      // 无子节点
      mockPathResolver.listChildren.mockResolvedValue([]);

      const result = await controller.browse(
        TENANT_ID,
        INSTANCE_ID,
        d<BrowseQueryDto>({ uri: 'core://agent/preferences', navOnly: false }),
      );

      expect(result.data.node).not.toBeNull();
      expect(result.data.node!.name).toBe('preferences');
      expect(result.data.node!.content).toBe('测试内容');
      expect(result.data.node!.versionCount).toBe(1);
      expect(result.data.breadcrumbs).toEqual([
        { path: 'agent', label: 'agent' },
        { path: 'agent/preferences', label: 'preferences' },
      ]);
    });

    it('URI 解析失败时 node 应为 null', async () => {
      mockPathResolver.resolveUri.mockRejectedValue(
        new MemoryPathNotFoundException('core://missing'),
      );
      mockPathResolver.listChildren.mockResolvedValue([]);

      const result = await controller.browse(
        TENANT_ID,
        INSTANCE_ID,
        d<BrowseQueryDto>({ uri: 'core://nonexistent', navOnly: false }),
      );

      expect(result.data.node).toBeNull();
      expect(result.data.children).toEqual([]);
    });
  });

  describe('listDomains', () => {
    it('应返回域列表及根节点计数', async () => {
      const rows = [
        { domain: 'core', rootCount: 3 },
        { domain: 'notes', rootCount: 5 },
      ];
      tenantDb.select.mockReturnValueOnce(createSelectChain(rows));

      const result = await controller.listDomains(TENANT_ID, INSTANCE_ID);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({ domain: 'core', rootCount: 3 });
    });

    it('无域时应返回空数组', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([]));

      const result = await controller.listDomains(TENANT_ID, INSTANCE_ID);

      expect(result.data).toEqual([]);
    });
  });

  // ─── Glossary Operations ────────────────────────────────────────────

  describe('addGlossaryKeyword', () => {
    it('应通过 GlossaryService 添加关键词', async () => {
      const keyword = {
        id: 'kw-1',
        instanceId: INSTANCE_ID,
        keyword: 'Agent',
        nodeId: NODE_ID,
        createdAt: NOW,
      };
      mockGlossaryService.addKeyword.mockResolvedValue(keyword);

      const result = await controller.addGlossaryKeyword(
        TENANT_ID,
        INSTANCE_ID,
        NODE_ID,
        d<AddGlossaryKeywordDto>({ keyword: 'Agent' }),
      );

      expect(result).toEqual({ data: keyword });
      expect(mockGlossaryService.addKeyword).toHaveBeenCalledWith(
        INSTANCE_ID,
        'Agent',
        NODE_ID,
      );
    });
  });

  describe('removeGlossaryKeyword', () => {
    it('应通过 GlossaryService 移除关键词', async () => {
      mockGlossaryService.removeKeyword.mockResolvedValue(undefined);

      await controller.removeGlossaryKeyword(
        TENANT_ID,
        INSTANCE_ID,
        NODE_ID,
        d<RemoveGlossaryKeywordDto>({ keyword: 'Agent' }),
      );

      expect(mockGlossaryService.removeKeyword).toHaveBeenCalledWith(
        INSTANCE_ID,
        'Agent',
        NODE_ID,
      );
    });
  });

  // ─── Tenant Isolation ──────────────────────────────────────────────

  describe('tenant isolation', () => {
    it('所有直接 DB 操作都应通过 getTenantDb 获取租户作用域', async () => {
      const instance = createInstance();
      const insertQuery = createInsertChain([instance]);
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await controller.createInstance(
        TENANT_ID,
        USER_ID,
        d<CreateMemoryInstanceDto>({
          name: '测试租户隔离',
          description: undefined,
          config: undefined,
          systemPromptOverride: undefined,
          validDomains: undefined,
          coreMemoryUris: undefined,
        }),
      );

      expect(mocks.getTenantDb).toHaveBeenCalledWith(rawDb);
    });
  });

  // ─── Route Scope (D-074) ───────────────────────────────────────────

  describe('route scope', () => {
    beforeEach(() => {
      scopeGuards.assertInstanceExists.mockRestore();
      scopeGuards.assertNodeInInstance.mockRestore();
    });

    const instanceRoutes: Array<[string, ScopedRouteCall]> = [
      [
        'listChildNodes',
        (c) => c.listChildNodes(TENANT_ID, INSTANCE_ID, NODE_ID),
      ],
      ['listDomains', (c) => c.listDomains(TENANT_ID, INSTANCE_ID)],
      [
        'search',
        (c) =>
          c.search(
            TENANT_ID,
            INSTANCE_ID,
            d<MemorySearchQueryDto>({ q: 'x', limit: 20, offset: 0 }),
          ),
      ],
      ['getGraph', (c) => c.getGraph(TENANT_ID, INSTANCE_ID)],
      [
        'listPaths',
        (c) =>
          c.listPaths(TENANT_ID, INSTANCE_ID, d<ListMemoryPathsQueryDto>({})),
      ],
      [
        'listEdges',
        (c) =>
          c.listEdges(TENANT_ID, INSTANCE_ID, d<ListMemoryEdgesQueryDto>({})),
      ],
      [
        'listVersions',
        (c) =>
          c.listVersions(
            TENANT_ID,
            INSTANCE_ID,
            NODE_ID,
            d<ListMemoryVersionsQueryDto>({}),
          ),
      ],
      [
        'listAuditLogs',
        (c) =>
          c.listAuditLogs(TENANT_ID, INSTANCE_ID, d<ListAuditLogQueryDto>({})),
      ],
      [
        'listPendingReviews',
        (c) =>
          c.listPendingReviews(
            TENANT_ID,
            INSTANCE_ID,
            d<ListPendingReviewsQueryDto>({}),
          ),
      ],
      [
        'removeGlossaryKeyword',
        (c) =>
          c.removeGlossaryKeyword(
            TENANT_ID,
            INSTANCE_ID,
            NODE_ID,
            d<RemoveGlossaryKeywordDto>({ keyword: 'kw' }),
          ),
      ],
      ['deleteEdge', (c) => c.deleteEdge(TENANT_ID, INSTANCE_ID, EDGE_ID)],
    ];

    it.each(instanceRoutes)(
      '%s：实例不存在时应返回 404 memory-instance-not-found 而不是空集合',
      async (_name, call) => {
        tenantDb.select.mockReturnValueOnce(createSelectChain([]));

        await expect(call(controller)).rejects.toBeInstanceOf(
          MemoryInstanceNotFoundException,
        );
        expect(mockEdgeService.deleteEdge).not.toHaveBeenCalled();
        expect(mockGlossaryService.removeKeyword).not.toHaveBeenCalled();
        expect(mockSearchService.search).not.toHaveBeenCalled();
      },
    );

    it('节点不属于路由实例时审核应返回 404 且不更新版本', async () => {
      const nodeQuery = createSelectChain([]);
      tenantDb.select
        .mockReturnValueOnce(createSelectChain([{ id: INSTANCE_ID }]))
        .mockReturnValueOnce(nodeQuery);

      await expect(
        controller.reviewVersion(
          TENANT_ID,
          USER_ID,
          INSTANCE_ID,
          NODE_ID,
          VERSION_ID,
          d<ReviewVersionDto>({ action: 'approve' }),
        ),
      ).rejects.toBeInstanceOf(MemoryNodeNotFoundException);
      expect(nodeQuery.where).toHaveBeenCalledWith(
        mocks.operators.and(
          mocks.operators.eq(memoryNodes.id, NODE_ID),
          mocks.operators.eq(memoryNodes.instanceId, INSTANCE_ID),
        ),
      );
      expect(mockVersionService.updateReviewStatus).not.toHaveBeenCalled();
    });

    it('实例与节点归属正确时才继续执行', async () => {
      tenantDb.select
        .mockReturnValueOnce(createSelectChain([{ id: INSTANCE_ID }]))
        .mockReturnValueOnce(createSelectChain([{ id: NODE_ID }]));
      mockEdgeService.getChildEdges.mockResolvedValueOnce([]);

      await expect(
        controller.listChildNodes(TENANT_ID, INSTANCE_ID, NODE_ID),
      ).resolves.toEqual({ data: [] });
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { AgentDefinitionService } from './agent-definition.service';
import type {
  CreateAgentDefinitionDto,
  CreateAgentVersionDto,
  ListAgentDefinitionsQueryDto,
  PublishAgentDto,
} from './dto';
import {
  AgentNotFoundException,
  AgentArchivedException,
  AgentCanvasInvalidMcpToolBindingException,
  AgentCanvasUnknownNodeTypeException,
  AgentVersionConflictException,
  AgentVersionNotFoundException,
  AgentPublishValidationException,
} from './agent-definition.exceptions';

const { mockTenantDb, mockTransactionStorage, mockResourceSourceService } =
  vi.hoisted(() => {
    const selectResult: unknown[] = [];
    const insertResult: unknown[] = [];
    const updateResult: unknown[] = [];

    const createChain = (resultRef: { current: unknown[] }) => {
      const chain: Record<string, any> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.offset = vi.fn().mockImplementation(() => {
        return resultRef.current;
      });
      return chain;
    };

    const selectChain = createChain({
      get current() {
        return selectResult;
      },
    });
    // Make select chain resolve as a promise when accessed directly (no offset)
    selectChain.limit = vi.fn().mockReturnValue(selectResult);
    selectChain.where = vi.fn().mockReturnValue({
      ...selectChain,
      orderBy: vi.fn().mockReturnValue({
        ...selectChain,
        limit: vi.fn().mockReturnValue({
          ...selectChain,
          offset: vi.fn().mockResolvedValue(selectResult),
        }),
      }),
      limit: vi.fn().mockResolvedValue(selectResult),
    });

    const insertChain: Record<string, any> = {};
    insertChain.values = vi.fn().mockReturnValue(insertChain);
    insertChain.returning = vi.fn().mockImplementation(() => insertResult);

    const updateChain: Record<string, any> = {};
    updateChain.set = vi.fn().mockReturnValue(updateChain);
    updateChain.where = vi.fn().mockReturnValue(updateChain);
    updateChain.returning = vi.fn().mockImplementation(() => updateResult);

    const mockTenantDb = {
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn().mockReturnValue(insertChain),
      update: vi.fn().mockReturnValue(updateChain),
      execute: vi.fn(),
      transaction: vi.fn(),
      _selectResult: selectResult,
      _insertResult: insertResult,
      _updateResult: updateResult,
    };

    return {
      mockTenantDb,
      mockTransactionStorage: {
        getStore: vi.fn(),
      },
      mockResourceSourceService: {
        mapCurrentKinds: vi.fn().mockResolvedValue(new Map()),
        buildShareImportedExistsCondition: vi.fn(() => ({
          type: 'share-imported',
        })),
      },
    };
  });

vi.mock('../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn(() => mockTenantDb),
}));

vi.mock('../../common/interceptors/tenant-transaction.interceptor', () => ({
  transactionStorage: mockTransactionStorage,
}));

vi.mock('../../database/schema', () => ({
  agentDefinitions: {
    id: 'id',
    tenantId: 'tenantId',
    name: 'name',
    slug: 'slug',
    description: 'description',
    status: 'status',
    version: 'version',
    publishedVersionId: 'publishedVersionId',
    createdBy: 'createdBy',
    updatedBy: 'updatedBy',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    systemPrompt: 'systemPrompt',
    nodes: 'nodes',
    edges: 'edges',
    viewport: 'viewport',
    sandboxConfig: 'sandboxConfig',
    workspaceSnapshotId: 'workspaceSnapshotId',
    metadata: 'metadata',
  },
  agentVersions: {
    id: 'id',
    agentDefinitionId: 'agentDefinitionId',
    tenantId: 'tenantId',
    versionNumber: 'versionNumber',
    label: 'label',
    snapshot: 'snapshot',
    publishedAt: 'publishedAt',
    archivedAt: 'archivedAt',
    createdBy: 'createdBy',
    createdAt: 'createdAt',
  },
  mcpServerConfigs: {
    id: 'mcpServerConfigId',
    name: 'mcpServerConfigName',
    transportType: 'mcpServerConfigTransportType',
  },
  workflowDefinitions: { id: 'workflowDefinitionId', tenantId: 'tenantId' },
  knowledgeBases: { id: 'knowledgeBaseId', tenantId: 'tenantId' },
  agentMemoryInstances: { id: 'memoryInstanceId', tenantId: 'tenantId' },
  skills: { id: 'skillId', tenantId: 'tenantId' },
  resourceSourceRecords: {
    id: 'resourceSourceRecordId',
    tenantId: 'tenantId',
    resourceType: 'resourceType',
    resourceId: 'resourceId',
    currentKind: 'currentKind',
  },
}));

vi.mock('../organization/slug.utils', () => ({
  generateSlug: vi.fn((name: string) =>
    name.toLowerCase().replace(/\s+/g, '-'),
  ),
  appendSlugSuffix: vi.fn((slug: string) => `${slug}-1`),
}));

vi.mock('./dto/agent-definition-response.dto', () => ({
  serializeAgentDefinition: vi.fn(
    (row: Record<string, any>, options?: Record<string, any>) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      version: row.version,
      resourceSourceKind: options?.resourceSourceKind,
    }),
  ),
  serializeAgentDefinitionDetail: vi.fn(
    (row: Record<string, any>, options?: Record<string, any>) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      version: row.version,
      publishedVersionId: row.publishedVersionId ?? null,
      runtimeMode: row.runtimeMode ?? 'sandbox',
      nodes: row.nodes ?? [],
      edges: row.edges ?? [],
      systemPrompt: row.systemPrompt ?? null,
      sandboxConfig: row.sandboxConfig ?? null,
      resourceSourceKind: options?.resourceSourceKind,
    }),
  ),
}));

// 由于 drizzle-orm 操作符在 mock DB 中不会真正执行，直接 mock 避免导入问题
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((col: unknown) => col),
  desc: vi.fn((col: unknown) => col),
  eq: vi.fn((a: unknown, b: unknown) => [a, b]),
  ilike: vi.fn((a: unknown, b: unknown) => [a, b]),
  inArray: vi.fn((column: unknown, values: unknown[]) => [column, values]),
  max: vi.fn((col: unknown) => col),
  or: vi.fn((...args: unknown[]) => args),
  not: vi.fn((value: unknown) => ['not', value]),
  sql: Object.assign(
    vi.fn((...args: unknown[]) => args),
    {
      raw: vi.fn((value: string) => value),
    },
  ),
}));

function makeAgent(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'agent-1',
    tenantId: 'tenant-1',
    name: 'Test Agent',
    slug: 'test-agent',
    description: 'A test agent',
    status: 'draft',
    version: 1,
    publishedVersionId: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    systemPrompt: 'You are a helpful assistant',
    nodes: [{ id: 'node-1', type: 'llm-model', data: { modelId: 'gpt-4' } }],
    edges: [],
    viewport: null,
    sandboxConfig: null,
    workspaceSnapshotId: null,
    metadata: {},
    ...overrides,
  };
}

function makeVersion(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'version-1',
    agentDefinitionId: 'agent-1',
    tenantId: 'tenant-1',
    versionNumber: 1,
    label: 'v1',
    snapshot: {
      nodes: [],
      edges: [],
      viewport: null,
      metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 },
    },
    publishedAt: null,
    archivedAt: null,
    createdBy: 'user-1',
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeCreateAgentDefinitionDto(
  overrides: Partial<CreateAgentDefinitionDto>,
): CreateAgentDefinitionDto {
  return {
    name: 'Test Agent',
    description: undefined,
    icon: undefined,
    runtimeMode: 'sandbox',
    globalSandboxConfig: undefined,
    ...overrides,
  };
}

function makeListAgentDefinitionsQueryDto(
  overrides: Partial<ListAgentDefinitionsQueryDto>,
): ListAgentDefinitionsQueryDto {
  return {
    page: 1,
    pageSize: 20,
    status: undefined,
    search: undefined,
    sourceKind: undefined,
    sort: 'updatedAt',
    order: 'desc',
    ...overrides,
  };
}

function makeCreateAgentVersionDto(
  overrides: Partial<CreateAgentVersionDto> = {},
): CreateAgentVersionDto {
  return {
    label: undefined,
    releaseNotes: undefined,
    ...overrides,
  };
}

function makePublishAgentDto(
  overrides: Partial<PublishAgentDto> = {},
): PublishAgentDto {
  return {
    label: undefined,
    releaseNotes: undefined,
    versionId: undefined,
    ...overrides,
  };
}

/**
 * 为了精确控制 Drizzle chain 结果，我们需要直接操作底层 mock 返回值
 * 这个 service 只有一个依赖: @Inject(DRIZZLE) db
 */
describe('AgentDefinitionService', () => {
  let service: AgentDefinitionService;

  // 用于控制 withAgentWriteLock 中 transaction 路径的 mock tx client
  const mockTxClient = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // 默认: 无 transaction context → 走 db.transaction 路径
    mockTransactionStorage.getStore.mockReturnValue(undefined);

    // 设置 db.transaction mock：执行 callback 并传入 txClient
    (mockTenantDb as any).transaction = vi.fn(async (cb: any) =>
      cb(mockTxClient),
    );

    // txClient chain helpers
    const makeTxSelectChain = (result: unknown[]) => {
      const chain: Record<string, any> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(result);
      return chain;
    };

    // 默认 tx behavior
    const agent = makeAgent();
    mockTxClient.select.mockReturnValue(
      makeTxSelectChain([agent]).from(undefined),
    );
    mockTxClient.execute.mockResolvedValue(undefined);

    // Fix: 让 select().from() chain 正确
    mockTxClient.select.mockImplementation(() => {
      const chain: Record<string, any> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue([agent]);
      return chain;
    });

    mockTxClient.insert.mockImplementation(() => {
      const chain: Record<string, any> = {};
      chain.values = vi.fn().mockReturnValue(chain);
      chain.returning = vi.fn().mockResolvedValue([agent]);
      return chain;
    });

    mockTxClient.update.mockImplementation(() => {
      const chain: Record<string, any> = {};
      chain.set = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.returning = vi.fn().mockResolvedValue([agent]);
      return chain;
    });

    service = new AgentDefinitionService(
      mockTenantDb as never,
      mockResourceSourceService as never,
    );
  });

  // ─── create ───────────────────────────────────────────────
  describe('create', () => {
    it('应成功创建 Agent 并返回 detail', async () => {
      const created = makeAgent({ id: 'new-agent' });
      const insertChain: Record<string, any> = {};
      insertChain.values = vi.fn().mockReturnValue(insertChain);
      insertChain.returning = vi.fn().mockResolvedValue([created]);
      mockTxClient.insert.mockReturnValue(insertChain);

      const result = await service.create(
        makeCreateAgentDefinitionDto({
          name: 'Test Agent',
          description: 'desc',
        }),
        'user-1',
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('new-agent');
      expect(mockTxClient.insert).toHaveBeenCalledTimes(1);
    });

    it('slug 冲突时自动重试生成新 slug', async () => {
      const uniqueViolation = Object.assign(new Error('unique violation'), {
        code: '23505',
      });
      const created = makeAgent({ slug: 'test-agent-1' });

      const insertChain: Record<string, any> = {};
      insertChain.values = vi.fn().mockReturnValue(insertChain);
      insertChain.returning = vi
        .fn()
        .mockRejectedValueOnce(uniqueViolation)
        .mockResolvedValueOnce([created]);
      mockTxClient.insert.mockReturnValue(insertChain);

      const result = await service.create(
        makeCreateAgentDefinitionDto({ name: 'Test Agent' }),
        'user-1',
      );

      expect(result).toBeDefined();
      // insert 被调用 1 次（chain 复用），但 returning 被调用 2 次
      expect(insertChain.returning).toHaveBeenCalledTimes(2);
    });

    it('非唯一约束错误直接抛出', async () => {
      const otherError = new Error('connection error');
      const insertChain: Record<string, any> = {};
      insertChain.values = vi.fn().mockReturnValue(insertChain);
      insertChain.returning = vi.fn().mockRejectedValue(otherError);
      mockTxClient.insert.mockReturnValue(insertChain);

      await expect(
        service.create(
          makeCreateAgentDefinitionDto({ name: 'Test Agent' }),
          'user-1',
        ),
      ).rejects.toThrow('connection error');
    });

    it('重试次数用尽后仍冲突应抛出原始错误', async () => {
      const uniqueViolation = Object.assign(new Error('unique violation'), {
        code: '23505',
      });
      const insertChain: Record<string, any> = {};
      insertChain.values = vi.fn().mockReturnValue(insertChain);
      insertChain.returning = vi.fn().mockRejectedValue(uniqueViolation);
      mockTxClient.insert.mockReturnValue(insertChain);

      await expect(
        service.create(
          makeCreateAgentDefinitionDto({ name: 'Test Agent' }),
          'user-1',
        ),
      ).rejects.toThrow('unique violation');
    });
  });

  // ─── findAll ──────────────────────────────────────────────
  describe('findAll', () => {
    it('应返回分页列表和 meta', async () => {
      const rows = [makeAgent({ id: 'a-1' }), makeAgent({ id: 'a-2' })];

      // 构建两个 chain: select rows + select count
      const rowsChain: Record<string, any> = {};
      rowsChain.from = vi.fn().mockReturnValue(rowsChain);
      rowsChain.where = vi.fn().mockReturnValue(rowsChain);
      rowsChain.orderBy = vi.fn().mockReturnValue(rowsChain);
      rowsChain.limit = vi.fn().mockReturnValue(rowsChain);
      rowsChain.offset = vi.fn().mockResolvedValue(rows);

      const countChain: Record<string, any> = {};
      countChain.from = vi.fn().mockReturnValue(countChain);
      countChain.where = vi.fn().mockResolvedValue([{ total: 2 }]);

      mockTenantDb.select
        .mockReturnValueOnce(rowsChain)
        .mockReturnValueOnce(countChain);

      const result = await service.findAll(
        makeListAgentDefinitionsQueryDto({
          page: 1,
          pageSize: 20,
          sort: 'updatedAt',
          order: 'desc',
        }),
      );

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });

    it('status 和 search 同时传入时应构建组合条件', async () => {
      const rowsChain: Record<string, any> = {};
      rowsChain.from = vi.fn().mockReturnValue(rowsChain);
      rowsChain.where = vi.fn().mockReturnValue(rowsChain);
      rowsChain.orderBy = vi.fn().mockReturnValue(rowsChain);
      rowsChain.limit = vi.fn().mockReturnValue(rowsChain);
      rowsChain.offset = vi.fn().mockResolvedValue([]);

      const countChain: Record<string, any> = {};
      countChain.from = vi.fn().mockReturnValue(countChain);
      countChain.where = vi.fn().mockResolvedValue([{ total: 0 }]);

      mockTenantDb.select
        .mockReturnValueOnce(rowsChain)
        .mockReturnValueOnce(countChain);

      const result = await service.findAll(
        makeListAgentDefinitionsQueryDto({
          page: 1,
          pageSize: 10,
          status: 'draft',
          search: 'test',
          sort: 'name',
          order: 'asc',
        }),
      );

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('countResult 为空时 total 默认为 0', async () => {
      const rowsChain: Record<string, any> = {};
      rowsChain.from = vi.fn().mockReturnValue(rowsChain);
      rowsChain.where = vi.fn().mockReturnValue(rowsChain);
      rowsChain.orderBy = vi.fn().mockReturnValue(rowsChain);
      rowsChain.limit = vi.fn().mockReturnValue(rowsChain);
      rowsChain.offset = vi.fn().mockResolvedValue([]);

      const countChain: Record<string, any> = {};
      countChain.from = vi.fn().mockReturnValue(countChain);
      countChain.where = vi.fn().mockResolvedValue([]);

      mockTenantDb.select
        .mockReturnValueOnce(rowsChain)
        .mockReturnValueOnce(countChain);

      const result = await service.findAll(
        makeListAgentDefinitionsQueryDto({
          page: 1,
          pageSize: 10,
          sort: 'updatedAt',
          order: 'desc',
        }),
      );

      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  // ─── findById ─────────────────────────────────────────────
  describe('findById', () => {
    it('应返回序列化的 Agent', async () => {
      const agent = makeAgent();
      const chain: Record<string, any> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockResolvedValue([agent]);
      mockTenantDb.select.mockReturnValue(chain);

      const result = await service.findById('agent-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('agent-1');
    });

    it('Agent 不存在时应抛出 AgentNotFoundException', async () => {
      const chain: Record<string, any> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockResolvedValue([]);
      mockTenantDb.select.mockReturnValue(chain);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        AgentNotFoundException,
      );
    });
  });

  // ─── findDetailById ───────────────────────────────────────
  describe('findDetailById', () => {
    it('应返回完整详情', async () => {
      const agent = makeAgent();
      const chain: Record<string, any> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockResolvedValue([agent]);
      mockTenantDb.select.mockReturnValue(chain);

      const result = await service.findDetailById('agent-1');

      expect(result).toBeDefined();
      expect(result.nodes).toBeDefined();
    });

    it('Agent 不存在时应抛出 AgentNotFoundException', async () => {
      const chain: Record<string, any> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockResolvedValue([]);
      mockTenantDb.select.mockReturnValue(chain);

      await expect(service.findDetailById('nonexistent')).rejects.toThrow(
        AgentNotFoundException,
      );
    });
  });

  // ─── update ───────────────────────────────────────────────
  describe('update', () => {
    it('应成功更新 Agent 并返回 detail（走 db.transaction 路径）', async () => {
      const agent = makeAgent();
      const updated = makeAgent({ version: 2, name: 'Updated Agent' });

      // select → 找到 agent
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([agent]);
        return c;
      });

      // update → 成功更新
      mockTxClient.update.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.set = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        c.returning = vi.fn().mockResolvedValue([updated]);
        return c;
      });

      const result = await service.update(
        'agent-1',
        { name: 'Updated Agent', version: 1 },
        'user-1',
      );

      expect(result).toBeDefined();
      expect(mockTxClient.execute).toHaveBeenCalled(); // advisory lock
    });

    it('Agent 不存在时应抛出 AgentNotFoundException', async () => {
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([]);
        return c;
      });

      await expect(
        service.update('nonexistent', { version: 1 }, 'user-1'),
      ).rejects.toThrow(AgentNotFoundException);
    });

    it('Agent 已归档时应抛出 AgentArchivedException', async () => {
      const archived = makeAgent({ status: 'archived' });
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([archived]);
        return c;
      });

      await expect(
        service.update('agent-1', { version: 1 }, 'user-1'),
      ).rejects.toThrow(AgentArchivedException);
    });

    it('OCC 版本冲突时应抛出 AgentVersionConflictException', async () => {
      const agent = makeAgent({ version: 2 });
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([agent]);
        return c;
      });
      mockTxClient.update.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.set = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        c.returning = vi.fn().mockResolvedValue([]); // 0 rows updated = conflict
        return c;
      });

      await expect(
        service.update('agent-1', { version: 1 }, 'user-1'),
      ).rejects.toThrow(AgentVersionConflictException);
    });

    it('withAgentWriteLock 在已有 transaction context 时使用现有 tx', async () => {
      const txDb = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        execute: vi.fn(),
      } as any;

      mockTransactionStorage.getStore.mockReturnValue({ db: txDb });

      const agent = makeAgent();
      const updated = makeAgent({ version: 2 });

      txDb.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([agent]);
        return c;
      });
      txDb.execute.mockResolvedValue(undefined);
      txDb.update.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.set = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        c.returning = vi.fn().mockResolvedValue([updated]);
        return c;
      });

      const result = await service.update(
        'agent-1',
        { name: 'Updated', version: 1 },
        'user-1',
      );

      expect(result).toBeDefined();
      expect(txDb.execute).toHaveBeenCalled(); // advisory lock on existing tx
      // db.transaction should NOT have been called
      expect(mockTenantDb.transaction).not.toHaveBeenCalled();
    });
  });

  // ─── archive ──────────────────────────────────────────────
  describe('archive', () => {
    it('应成功归档 Agent（更新版本 + 定义状态）', async () => {
      const agent = makeAgent();

      let updateCallCount = 0;
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([agent]);
        return c;
      });
      mockTxClient.update.mockImplementation(() => {
        updateCallCount += 1;
        const c: Record<string, any> = {};
        c.set = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue(undefined);
        return c;
      });

      await service.archive('agent-1', 'user-1');

      // 应调用两次 update：一次归档版本，一次更新定义状态
      expect(updateCallCount).toBe(2);
    });

    it('Agent 不存在时应抛出 AgentNotFoundException', async () => {
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([]);
        return c;
      });

      await expect(service.archive('nonexistent', 'user-1')).rejects.toThrow(
        AgentNotFoundException,
      );
    });

    it('Agent 已归档时应抛出 AgentArchivedException', async () => {
      const archived = makeAgent({ status: 'archived' });
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([archived]);
        return c;
      });

      await expect(service.archive('agent-1', 'user-1')).rejects.toThrow(
        AgentArchivedException,
      );
    });
  });

  // ─── saveCanvas ───────────────────────────────────────────
  describe('saveCanvas', () => {
    it('应成功保存画布节点/边', async () => {
      const agent = makeAgent();
      const updated = makeAgent({ version: 2 });

      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([agent]);
        return c;
      });
      mockTxClient.update.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.set = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        c.returning = vi.fn().mockResolvedValue([updated]);
        return c;
      });

      const result = await service.saveCanvas(
        'agent-1',
        {
          canvasNodes: [{ id: 'n1', type: 'llm-model', data: {} }],
          canvasEdges: [],
        },
        'user-1',
      );

      expect(result).toBeDefined();
    });

    it('包含 viewport、globalSandboxConfig、metadata fields 与 workspaceSnapshotId 时也应成功保存', async () => {
      const agent = makeAgent();
      const updated = makeAgent({ version: 2 });

      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([agent]);
        return c;
      });

      let capturedSetClause: Record<string, any> | null = null;
      mockTxClient.update.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.set = vi.fn().mockImplementation((clause: Record<string, any>) => {
          capturedSetClause = clause;
          return c;
        });
        c.where = vi.fn().mockReturnValue(c);
        c.returning = vi.fn().mockResolvedValue([updated]);
        return c;
      });

      await service.saveCanvas(
        'agent-1',
        {
          canvasNodes: [],
          canvasEdges: [],
          canvasViewport: { x: 0, y: 0, zoom: 1 },
          workspaceSnapshotId: '019d2a7c-c19c-7a9c-8233-db2b87a23de4',
          globalSandboxConfig: { cpu: 2, memory: 512, disk: 1, timeout: 60 },
          inputSchema: { version: 1, collectionMode: 'form', fields: [] },
          memoryInstanceIds: ['019d2a7c-c19c-7a9c-8233-db2b87a23de5'],
          sandboxLifecycle: 'persistent',
        },
        'user-1',
      );

      expect(capturedSetClause).toBeDefined();
      expect(capturedSetClause!.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
      expect(capturedSetClause!.workspaceSnapshotId).toBe(
        '019d2a7c-c19c-7a9c-8233-db2b87a23de4',
      );
      expect(capturedSetClause!.sandboxConfig).toEqual({
        cpu: 2,
        memory: 512,
        disk: 1,
        timeout: 60,
        conversationIdleAutoEndMinutes: 10,
      });
      // metadata 应包含 inputSchema (via SQL jsonb_set)
      expect(capturedSetClause!.metadata).toBeDefined();
    });

    it('未显式传 globalSandboxConfig 时应从 sandbox 节点派生并同步顶层 sandboxConfig', async () => {
      const agent = makeAgent({
        sandboxConfig: { cpu: 1, memory: 512, disk: 2, timeout: 2 },
      });
      const updated = makeAgent({ version: 2 });

      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([agent]);
        return c;
      });

      let capturedSetClause: Record<string, any> | null = null;
      mockTxClient.update.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.set = vi.fn().mockImplementation((clause: Record<string, any>) => {
          capturedSetClause = clause;
          return c;
        });
        c.where = vi.fn().mockReturnValue(c);
        c.returning = vi.fn().mockResolvedValue([updated]);
        return c;
      });

      await service.saveCanvas(
        'agent-1',
        {
          canvasNodes: [
            {
              id: 'workspace-1',
              type: 'tool',
              data: {
                nodeType: 'workspace',
                workspaceId: 'workspace-1',
              },
            },
            {
              id: 'sandbox-1',
              type: 'tool',
              data: {
                nodeType: 'sandbox',
                enabled: true,
                cpuLimit: 2,
                memoryLimitMb: 1536,
                diskLimitGb: 5,
                timeoutSeconds: 901,
              },
            },
          ] as never,
          canvasEdges: [
            {
              id: 'edge-workspace-sandbox',
              source: 'workspace-1',
              target: 'sandbox-1',
            },
          ] as never,
        },
        'user-1',
      );

      expect(capturedSetClause).not.toBeNull();
      expect(
        (capturedSetClause as unknown as Record<string, any>).sandboxConfig,
      ).toEqual({
        cpu: 2,
        memory: 1536,
        disk: 5,
        timeout: 1,
        timeoutSeconds: 901,
        conversationIdleAutoEndMinutes: 10,
        lifecycleMode: undefined,
        persistencePath: undefined,
        restoreWorkspaceId: 'workspace-1',
        persistenceExpiryHours: undefined,
        persistentSandboxId: undefined,
      });
    });

    it('Agent 不存在时应抛出 AgentNotFoundException', async () => {
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([]);
        return c;
      });

      await expect(
        service.saveCanvas(
          'nonexistent',
          { canvasNodes: [], canvasEdges: [] },
          'user-1',
        ),
      ).rejects.toThrow(AgentNotFoundException);
    });

    it('Agent 已归档时应抛出 AgentArchivedException', async () => {
      const archived = makeAgent({ status: 'archived' });
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([archived]);
        return c;
      });

      await expect(
        service.saveCanvas(
          'agent-1',
          { canvasNodes: [], canvasEdges: [] },
          'user-1',
        ),
      ).rejects.toThrow(AgentArchivedException);
    });

    it('包含未知 nodeType 时应拒绝保存画布', async () => {
      const agent = makeAgent();

      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([agent]);
        return c;
      });

      await expect(
        service.saveCanvas(
          'agent-1',
          {
            canvasNodes: [
              {
                id: 'legacy-node',
                type: 'tool',
                position: { x: 0, y: 0 },
                data: { nodeType: 'legacy-node' },
              },
            ] as never,
            canvasEdges: [],
          },
          'user-1',
        ),
      ).rejects.toThrow(AgentCanvasUnknownNodeTypeException);
    });

    it('mcp-tool 已选择 server 但未选择具体工具时应拒绝保存画布', async () => {
      const agent = makeAgent();

      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([agent]);
        return c;
      });

      await expect(
        service.saveCanvas(
          'agent-1',
          {
            canvasNodes: [
              {
                id: 'mcp-bad',
                type: 'tool',
                position: { x: 0, y: 0 },
                data: {
                  nodeType: 'mcp-tool',
                  config: {
                    mcpServerConfigId: 'cfg-websearch',
                  },
                },
              },
            ] as never,
            canvasEdges: [],
          },
          'user-1',
        ),
      ).rejects.toThrow(AgentCanvasInvalidMcpToolBindingException);
    });
  });

  // ─── buildRuntimeConfigFromNodes ──────────────────────────
  describe('buildRuntimeConfigFromNodes', () => {
    it('应正确编译各种节点类型', () => {
      const nodes = [
        {
          id: 'n1',
          type: 'llm-model',
          data: { modelId: 'gpt-4', temperature: 0.7 },
        },
        {
          id: 'n2',
          type: 'http-tool',
          data: { name: 'search', description: 'Search API' },
        },
        {
          id: 'n3',
          type: 'code-tool',
          data: { toolId: 'code-1', name: 'calculator' },
        },
        { id: 'n4', type: 'mcp-tool', data: { name: 'mcp-tool-1' } },
        {
          id: 'n5',
          type: 'knowledge-base',
          data: { knowledgeBaseId: 'kb-1', topK: 5 },
        },
        {
          id: 'n6',
          type: 'sub-agent',
          data: { agentDefinitionId: 'child-1', alias: 'writer' },
        },
        {
          id: 'n7',
          type: 'input-preprocessor',
          data: { preprocessorType: 'jmespath', config: {} },
        },
        {
          id: 'n8',
          type: 'smart-routing',
          data: { strategy: 'COST_OPTIMIZED' },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.modelConfig).toBeDefined();
      expect(config.modelConfig!.modelId).toBe('gpt-4');
      expect(config.modelConfig!.temperature).toBe(0.7);

      expect(config.tools).toHaveLength(3);
      expect(config.tools![0].name).toBe('search');
      expect(config.tools![1].toolId).toBe('code-1');

      expect(config.knowledgeBindings).toHaveLength(1);
      expect(config.knowledgeBindings![0].knowledgeBaseId).toBe('kb-1');
      expect(config.knowledgeBindings![0].topK).toBe(5);

      expect(config.subAgents).toHaveLength(1);
      expect(config.subAgents![0].agentDefinitionId).toBe('child-1');
      expect(config.subAgents![0].alias).toBe('writer');

      expect(config.inputPreprocessors).toHaveLength(1);
      expect(config.inputPreprocessors![0].type).toBe('jmespath');

      expect(config.routingConfig).toBeDefined();
      expect(config.routingConfig!.strategy).toBe('COST_OPTIMIZED');
    });

    it('未知节点类型应在编译前 fail-closed', () => {
      expect(() =>
        service.buildRuntimeConfigFromNodes(
          [
            {
              id: 'legacy-node',
              type: 'tool',
              position: { x: 0, y: 0 },
              data: { nodeType: 'legacy-node' },
            },
          ] as never,
          [],
        ),
      ).toThrow(AgentCanvasUnknownNodeTypeException);
    });

    it('空节点数组返回空配置', () => {
      const config = service.buildRuntimeConfigFromNodes([], []);

      expect(config.modelConfig).toBeUndefined();
      expect(config.tools).toBeUndefined();
      expect(config.knowledgeBindings).toBeUndefined();
      expect(config.subAgents).toBeUndefined();
      expect(config.inputPreprocessors).toBeUndefined();
    });

    it('agent-main 的原生工具与自进化策略应编译进 runtimeConfig', () => {
      const config = service.buildRuntimeConfigFromNodes(
        [
          {
            id: 'main',
            type: 'agent',
            data: {
              nodeType: 'agent-main',
              config: {
                nativeToolPolicy: {
                  readEnabled: true,
                  writeEnabled: false,
                  editEnabled: true,
                  terminalEnabled: false,
                },
                selfEvolutionPolicy: {
                  enabled: true,
                  resourceManagement: true,
                  externalEditing: false,
                  sandboxManagement: true,
                },
              },
            },
          },
        ],
        [],
      );

      expect(config.nativeToolPolicy).toEqual({
        readEnabled: true,
        writeEnabled: false,
        editEnabled: true,
        terminalEnabled: false,
      });
      expect(config.selfEvolutionPolicy).toEqual({
        enabled: true,
        resourceManagement: true,
        externalEditing: false,
        sandboxManagement: true,
      });
    });

    it('应仅编译通过 agent-main 连接的节点', () => {
      const nodes = [
        { id: 'main', type: 'agent', data: { nodeType: 'agent-main' } },
        {
          id: 'model-connected',
          type: 'agent',
          data: {
            nodeType: 'llm-model',
            config: { modelId: 'gpt-4.1', temperature: 0.2 },
          },
        },
        {
          id: 'tool-connected',
          type: 'tool',
          data: {
            nodeType: 'http-tool',
            label: 'HTTP 请求',
            config: { name: 'search' },
          },
        },
        {
          id: 'tool-orphan',
          type: 'tool',
          data: {
            nodeType: 'code-tool',
            config: { toolId: 'code-orphan', name: 'orphan' },
          },
        },
        {
          id: 'tool-wrong-handle',
          type: 'tool',
          data: {
            nodeType: 'mcp-tool',
            config: { toolId: 'mcp-wrong', name: 'wrong-handle' },
          },
        },
        {
          id: 'kb-connected',
          type: 'knowledge',
          data: {
            nodeType: 'knowledge-base',
            config: { knowledgeBaseId: 'kb-1', topK: 5 },
          },
        },
        {
          id: 'sub-connected',
          type: 'agent',
          data: {
            nodeType: 'sub-agent',
            config: { agentDefinitionId: 'child-1', alias: 'writer' },
          },
        },
        {
          id: 'pre-connected',
          type: 'tool',
          data: {
            nodeType: 'input-preprocessor',
            config: { preprocessorType: 'jmespath', config: { foo: 'bar' } },
          },
        },
        {
          id: 'routing-connected',
          type: 'agent',
          data: {
            nodeType: 'smart-routing',
            config: { strategy: 'QUALITY_FIRST' },
          },
        },
        {
          id: 'sandbox-connected',
          type: 'tool',
          data: {
            nodeType: 'sandbox',
            config: {
              enabled: true,
              cpuLimit: 2,
              memoryLimitMb: 1024,
              diskLimitGb: 4,
              timeoutSeconds: 600,
            },
          },
        },
      ];

      const edges = [
        {
          id: 'e1',
          source: 'model-connected',
          target: 'main',
          targetHandle: 'model-in',
        },
        {
          id: 'e2',
          source: 'tool-connected',
          target: 'main',
          targetHandle: 'tools-in',
        },
        {
          id: 'e3',
          source: 'tool-wrong-handle',
          target: 'main',
          targetHandle: 'knowledge-in',
        },
        {
          id: 'e4',
          source: 'kb-connected',
          target: 'main',
          targetHandle: 'knowledge-in',
        },
        {
          id: 'e5',
          source: 'sub-connected',
          target: 'main',
          targetHandle: 'sub-agents-in',
        },
        {
          id: 'e6',
          source: 'pre-connected',
          target: 'main',
          targetHandle: 'input-preprocessor-in',
        },
        {
          id: 'e7',
          source: 'routing-connected',
          target: 'main',
          targetHandle: 'model-in',
        },
        {
          id: 'e8',
          source: 'sandbox-connected',
          target: 'main',
          targetHandle: 'sandbox-in',
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes as any[], edges);

      expect(config.modelConfig).toMatchObject({
        modelId: 'gpt-4.1',
        temperature: 0.2,
      });
      expect(config.tools).toEqual([
        expect.objectContaining({ name: 'search' }),
      ]);
      expect(config.knowledgeBindings).toEqual([
        expect.objectContaining({ knowledgeBaseId: 'kb-1', topK: 5 }),
      ]);
      expect(config.subAgents).toEqual([
        expect.objectContaining({
          agentDefinitionId: 'child-1',
          alias: 'writer',
        }),
      ]);
      expect(config.inputPreprocessors).toEqual([
        expect.objectContaining({
          type: 'jmespath',
          config: expect.objectContaining({ foo: 'bar' }),
        }),
      ]);
      expect(config.routingConfig).toEqual(
        expect.objectContaining({ strategy: 'QUALITY_FIRST' }),
      );
      expect(config.sandboxConfig).toEqual({
        cpu: 2,
        memory: 1024,
        disk: 4,
        timeout: 1,
        timeoutSeconds: 600,
        conversationIdleAutoEndMinutes: 10,
        lifecycleMode: undefined,
        persistencePath: undefined,
        restoreWorkspaceId: undefined,
        persistenceExpiryHours: undefined,
        persistentSandboxId: undefined,
      });
    });

    it('应从 text -> system-prompt-in 解析显式系统提示词', () => {
      const nodes = [
        { id: 'main', type: 'agent', data: { nodeType: 'agent-main' } },
        {
          id: 'prompt-node',
          type: 'output',
          data: {
            nodeType: 'text',
            config: {
              text: '你是一个严谨的代码审查助手',
            },
          },
        },
      ];

      const prompt = service.resolveSystemPromptFromNodes(nodes as any[], [
        {
          source: 'prompt-node',
          target: 'main',
          targetHandle: 'system-prompt-in',
        },
      ]);

      expect(prompt).toBe('你是一个严谨的代码审查助手');
    });

    it('sub-agent 应编译局部 override 与 extension 端口', () => {
      const nodes = [
        { id: 'main', type: 'agent', data: { nodeType: 'agent-main' } },
        {
          id: 'sub-main',
          type: 'agent',
          data: {
            nodeType: 'sub-agent',
            config: { agentDefinitionId: 'child-agent', alias: 'writer' },
          },
        },
        {
          id: 'prompt-node',
          type: 'output',
          data: {
            nodeType: 'text',
            config: { text: '你只输出结构化审查结论' },
          },
        },
        {
          id: 'schema-node',
          type: 'output',
          data: {
            nodeType: 'text',
            config: {
              text: '{"type":"object","properties":{"ok":{"type":"boolean"}}}',
            },
          },
        },
        {
          id: 'model-node',
          type: 'agent',
          data: {
            nodeType: 'llm-model',
            config: { modelId: 'gpt-4.1-mini', temperature: 0.1 },
          },
        },
        {
          id: 'tool-node',
          type: 'tool',
          data: {
            nodeType: 'mcp-tool',
            config: { toolId: 'search-news', name: 'search_news' },
          },
        },
        {
          id: 'kb-node',
          type: 'knowledge',
          data: {
            nodeType: 'knowledge-base',
            config: { knowledgeBaseId: 'kb-1', topK: 3 },
          },
        },
        {
          id: 'skill-node',
          type: 'knowledge',
          data: {
            nodeType: 'skill',
            config: { skillId: 'skill-review' },
          },
        },
        {
          id: 'memory-node',
          type: 'memory',
          data: {
            nodeType: 'memory',
            config: { memoryInstanceId: 'memory-1' },
          },
        },
        {
          id: 'nested-sub',
          type: 'agent',
          data: {
            nodeType: 'sub-agent',
            config: { agentDefinitionId: 'critic-agent', alias: 'critic' },
          },
        },
      ];

      const edges = [
        {
          source: 'sub-main',
          target: 'main',
          targetHandle: 'sub-agents-in',
        },
        {
          source: 'prompt-node',
          target: 'sub-main',
          targetHandle: 'system-prompt-in',
        },
        {
          source: 'schema-node',
          target: 'sub-main',
          targetHandle: 'schema-in',
        },
        {
          source: 'model-node',
          target: 'sub-main',
          targetHandle: 'model-in',
        },
        {
          source: 'tool-node',
          target: 'sub-main',
          targetHandle: 'tools-in',
        },
        {
          source: 'kb-node',
          target: 'sub-main',
          targetHandle: 'knowledge-in',
        },
        {
          source: 'skill-node',
          target: 'sub-main',
          targetHandle: 'skills-in',
        },
        {
          source: 'memory-node',
          target: 'sub-main',
          targetHandle: 'memory-in',
        },
        {
          source: 'nested-sub',
          target: 'sub-main',
          targetHandle: 'sub-agents-in',
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(
        nodes as any[],
        edges,
        'current-agent',
      );

      expect(config.subAgents).toEqual([
        expect.objectContaining({
          agentDefinitionId: 'child-agent',
          alias: 'writer',
          overrides: {
            systemPrompt: '你只输出结构化审查结论',
            modelConfig: expect.objectContaining({
              modelId: 'gpt-4.1-mini',
              temperature: 0.1,
            }),
            outputSchema: {
              type: 'object',
              properties: {
                ok: { type: 'boolean' },
              },
            },
          },
          extensions: {
            tools: [expect.objectContaining({ name: 'search_news' })],
            knowledgeBindings: [
              expect.objectContaining({ knowledgeBaseId: 'kb-1', topK: 3 }),
            ],
            subAgents: [
              expect.objectContaining({
                agentDefinitionId: 'critic-agent',
                alias: 'critic',
              }),
            ],
            memoryInstanceIds: ['memory-1'],
            skillIds: ['skill-review'],
          },
        }),
      ]);
    });

    it('旧画布缺少 agent-main 时应回退为全量节点编译', () => {
      const nodes = [
        {
          id: 'model-legacy',
          type: 'agent',
          data: {
            nodeType: 'llm-model',
            config: { modelId: 'claude-3-7-sonnet' },
          },
        },
        {
          id: 'tool-legacy',
          type: 'tool',
          data: { nodeType: 'http-tool', config: { name: 'legacy-search' } },
        },
        {
          id: 'sandbox-legacy',
          type: 'tool',
          data: {
            nodeType: 'sandbox',
            config: {
              enabled: true,
              cpuLimit: 1.5,
              memoryLimitMb: 768,
              diskLimitGb: 3,
              timeoutSeconds: 120,
            },
          },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes as any[], []);

      expect(config.modelConfig).toMatchObject({
        modelId: 'claude-3-7-sonnet',
      });
      expect(config.tools).toEqual([
        expect.objectContaining({ name: 'legacy-search' }),
      ]);
      expect(config.sandboxConfig).toEqual(
        expect.objectContaining({
          cpu: 1.5,
          memory: 768,
          disk: 3,
          timeout: 1,
          timeoutSeconds: 120,
        }),
      );
    });

    it('llm-model 节点存在 llmConfigId 时应优先编译为配置 id 并保留模型元数据', () => {
      const nodes = [
        {
          id: 'model-1',
          type: 'llm-model',
          data: {
            llmConfigId: 'cfg-1',
            modelId: 'gpt-4o',
            modelName: 'gpt-4o',
            provider: 'openai',
            api_protocol: 'openai_responses',
            apiKeyId: 'key-1',
            endpointUrl: 'https://vllm.example.com/v1',
            authMethod: 'api_key',
          },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.modelConfig).toMatchObject({
        modelId: 'cfg-1',
        modelName: 'gpt-4o',
        provider: 'openai',
        apiProtocol: 'openai_responses',
        apiKeyId: 'key-1',
        endpointUrl: 'https://vllm.example.com/v1',
        authMethod: 'api_key',
      });
    });

    it('extractConversationSkillIds 应仅返回连接到 agent-main 的 skill', () => {
      const nodes = [
        { id: 'main', type: 'agent', data: { nodeType: 'agent-main' } },
        {
          id: 'skill-connected',
          type: 'knowledge',
          data: { nodeType: 'skill', config: { skillId: 'skill-1' } },
        },
        {
          id: 'skill-orphan',
          type: 'knowledge',
          data: { nodeType: 'skill', config: { skillId: 'skill-2' } },
        },
      ];

      const skillIds = (service as any).extractConversationSkillIds(nodes, [
        {
          source: 'skill-connected',
          target: 'main',
          targetHandle: 'skills-in',
        },
      ]);

      expect(skillIds).toEqual(['skill-1']);
    });

    it('存在 agent-main 但 skill 未接到 skills-in 时不应回退编译孤儿 skill', () => {
      const nodes = [
        { id: 'main', type: 'agent', data: { nodeType: 'agent-main' } },
        {
          id: 'model-connected',
          type: 'agent',
          data: {
            nodeType: 'llm-model',
            config: { modelId: 'gpt-4.1' },
          },
        },
        {
          id: 'skill-orphan',
          type: 'knowledge',
          data: { nodeType: 'skill', config: { skillId: 'skill-orphan' } },
        },
      ];
      const edges = [
        {
          source: 'model-connected',
          target: 'main',
          targetHandle: 'model-in',
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes as any[], edges);

      expect(config.skillIds).toBeUndefined();
    });

    it('knowledge-base 无 knowledgeBaseId 时应被忽略', () => {
      const nodes = [{ id: 'n1', type: 'knowledge-base', data: {} }];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.knowledgeBindings).toBeUndefined();
    });

    it('sub-agent 无 agentDefinitionId 时应被忽略', () => {
      const nodes = [{ id: 'n1', type: 'sub-agent', data: {} }];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.subAgents).toBeUndefined();
    });

    it('input-preprocessor 无 type 时应被忽略', () => {
      const nodes = [{ id: 'n1', type: 'input-preprocessor', data: {} }];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.inputPreprocessors).toBeUndefined();
    });

    it('input-preprocessor 应保留现代 config 中的表达式配置', () => {
      const nodes = [
        {
          id: 'n1',
          type: 'tool',
          data: {
            nodeType: 'input-preprocessor',
            config: {
              transformType: 'script',
              expression: '({ value: input.toUpperCase() })',
              outputFormat: 'json',
            },
          },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.inputPreprocessors).toEqual([
        {
          type: 'script',
          config: {
            transformType: 'script',
            expression: '({ value: input.toUpperCase() })',
            outputFormat: 'json',
          },
        },
      ]);
    });

    it('应支持 snake_case 字段别名', () => {
      const nodes = [
        {
          id: 'n1',
          type: 'llm-model',
          data: {
            model_id: 'claude-3',
            max_tokens: 4096,
            top_p: 0.9,
            frequency_penalty: 0.5,
            presence_penalty: 0.3,
          },
        },
        {
          id: 'n2',
          type: 'knowledge-base',
          data: {
            knowledge_base_id: 'kb-2',
            top_k: 10,
            similarity_threshold: 0.8,
          },
        },
        {
          id: 'n3',
          type: 'sub-agent',
          data: {
            agent_definition_id: 'child-2',
            agent_version_id: 'v-2',
          },
        },
        {
          id: 'n4',
          type: 'smart-routing',
          data: {
            candidate_model_ids: ['m1', 'm2'],
            fallback_model_id: 'fallback-1',
          },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.modelConfig!.modelId).toBe('claude-3');
      expect(config.modelConfig!.maxTokens).toBe(4096);
      expect(config.modelConfig!.topP).toBe(0.9);

      expect(config.knowledgeBindings![0].knowledgeBaseId).toBe('kb-2');
      expect(config.knowledgeBindings![0].topK).toBe(10);

      expect(config.subAgents![0].agentDefinitionId).toBe('child-2');
      expect(config.subAgents![0].agentVersionId).toBe('v-2');

      expect(config.routingConfig!.candidateModelIds).toEqual(['m1', 'm2']);
      expect(config.routingConfig!.fallbackModelId).toBe('fallback-1');
    });

    it('工具节点 enabled=false 时应 enabled 为 false', () => {
      const nodes = [
        {
          id: 'n1',
          type: 'http-tool',
          data: { name: 'disabled-tool', enabled: false },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.tools![0].enabled).toBe(false);
    });

    it('节点 data 为 undefined/null 时应安全处理', () => {
      const nodes = [
        { id: 'n1', type: 'llm-model', data: undefined },
        { id: 'n2', type: 'http-tool', data: null },
      ];

      // 不应抛错
      const config = service.buildRuntimeConfigFromNodes(nodes as any, []);

      expect(config.modelConfig).toBeDefined();
      expect(config.modelConfig!.modelId).toBe('');
      expect(config.tools).toHaveLength(1);
    });

    it('smart-routing 无 strategy 时应默认 FALLBACK_CHAIN', () => {
      const nodes = [{ id: 'n1', type: 'smart-routing', data: {} }];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.routingConfig!.strategy).toBe('FALLBACK_CHAIN');
    });

    it('smart-routing 接到 agent-main 时应按候选模型连线推导 candidateModelIds', () => {
      const nodes = [
        {
          id: 'main',
          type: 'agent',
          data: { nodeType: 'agent-main' },
        },
        {
          id: 'router',
          type: 'agent',
          data: {
            nodeType: 'smart-routing',
            strategy: 'FALLBACK_CHAIN',
            fallbackPriority: ['model-in-1', 'model-in-0'],
            inputPorts: [{ id: 'model-in-0' }, { id: 'model-in-1' }],
          },
        },
        {
          id: 'model-a',
          type: 'agent',
          data: {
            nodeType: 'llm-model',
            config: { modelId: 'model-a' },
          },
        },
        {
          id: 'model-b',
          type: 'agent',
          data: {
            nodeType: 'llm-model',
            config: { modelId: 'model-b' },
          },
        },
      ];
      const edges = [
        {
          id: 'e-main-router',
          source: 'router',
          target: 'main',
          targetHandle: 'model-in',
        },
        {
          id: 'e-model-a',
          source: 'model-a',
          target: 'router',
          targetHandle: 'model-in-0',
        },
        {
          id: 'e-model-b',
          source: 'model-b',
          target: 'router',
          targetHandle: 'model-in-1',
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, edges);

      expect(config.routingConfig).toEqual({
        strategy: 'FALLBACK_CHAIN',
        candidateModelIds: ['model-b', 'model-a'],
        fallbackModelId: undefined,
      });
      expect(config.modelConfig).toBeUndefined();
    });

    it('子代理别名重复时应抛出错误', () => {
      const nodes = [
        {
          id: 'n1',
          type: 'sub-agent',
          data: { agentDefinitionId: 'agent-a', alias: 'helper' },
        },
        {
          id: 'n2',
          type: 'sub-agent',
          data: { agentDefinitionId: 'agent-b', alias: 'helper' },
        },
      ];

      expect(() =>
        service.buildRuntimeConfigFromNodes(nodes, [], 'current-agent'),
      ).toThrow('子代理别名重复: helper');
    });

    it('子代理别名格式非法（数字开头）时应抛出错误', () => {
      const nodes = [
        {
          id: 'n1',
          type: 'sub-agent',
          data: { agentDefinitionId: 'agent-a', alias: '123abc' },
        },
      ];

      expect(() =>
        service.buildRuntimeConfigFromNodes(nodes, [], 'current-agent'),
      ).toThrow('子代理别名格式非法: 123abc');
    });

    it('子代理别名格式合法时不应抛出错误', () => {
      const nodes = [
        {
          id: 'n1',
          type: 'sub-agent',
          data: { agentDefinitionId: 'agent-a', alias: 'my-agent_1' },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(
        nodes,
        [],
        'current-agent',
      );

      expect(config.subAgents![0].alias).toBe('my-agent_1');
    });

    it('子代理引用自身时应抛出错误', () => {
      const nodes = [
        {
          id: 'n1',
          type: 'sub-agent',
          data: { agentDefinitionId: 'current-agent', alias: 'self' },
        },
      ];

      expect(() =>
        service.buildRuntimeConfigFromNodes(nodes, [], 'current-agent'),
      ).toThrow('不能将自身作为子代理引用');
    });

    it('子代理引用合法且别名唯一时应正常编译', () => {
      const nodes = [
        {
          id: 'n1',
          type: 'sub-agent',
          data: { agentDefinitionId: 'agent-a', alias: 'workerA' },
        },
        {
          id: 'n2',
          type: 'sub-agent',
          data: { agentDefinitionId: 'agent-b', alias: 'workerB' },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(
        nodes,
        [],
        'current-agent',
      );

      expect(config.subAgents).toHaveLength(2);
      expect(config.subAgents![0].alias).toBe('workerA');
      expect(config.subAgents![1].alias).toBe('workerB');
    });

    it('相同节点通过相同 targetHandle 重复连接到 agent-main 时只编译一次（compiledNodeIds 去重）', () => {
      const nodes = [
        { id: 'main', type: 'agent-main', data: {} },
        {
          id: 'tool-1',
          type: 'http-tool',
          data: { url: 'https://api.example.com', method: 'GET' },
        },
      ];
      const edges = [
        { source: 'tool-1', target: 'main', targetHandle: 'tools-in' },
        { source: 'tool-1', target: 'main', targetHandle: 'tools-in' },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, edges);

      expect(config.tools).toHaveLength(1);
      expect(config.tools![0].toolId).toBe('tool-1');
    });

    it('agent-main 存在但无任何连接边时应返回空配置（不触发 legacy fallback）', () => {
      const nodes = [
        { id: 'main', type: 'agent-main', data: {} },
        { id: 'orphan', type: 'llm-model', data: { modelId: 'gpt-4' } },
      ];
      const edges: any[] = [];

      const config = service.buildRuntimeConfigFromNodes(nodes, edges);

      expect(config.modelConfig).toBeUndefined();
      expect(config.tools).toBeUndefined();
      expect(config.knowledgeBindings).toBeUndefined();
      expect(config.subAgents).toBeUndefined();
    });

    it('MCP 工具提供 mcpToolDefinitionId 时应生成 toolType: mcp 判别联合', () => {
      const nodes = [
        {
          id: 'mcp-1',
          type: 'mcp-tool',
          data: {
            mcpToolDefinitionId: 'def-123',
            mcpServerConfigId: 'cfg-456',
            toolName: 'search',
            inputSchema: { type: 'object', properties: {} },
          },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.tools).toHaveLength(1);
      const tool = config.tools![0] as any;
      expect(tool.toolType).toBe('mcp');
      expect(tool.mcpToolDefinitionId).toBe('def-123');
      expect(tool.mcpServerConfigId).toBe('cfg-456');
      expect(tool.toolName).toBe('search');
      expect(tool.inputSchema).toEqual({ type: 'object', properties: {} });
    });

    it('legacy mcp 节点别名也应按 mcp-tool 编译为 MCP tool binding', () => {
      const nodes = [
        {
          id: 'main-agent',
          type: 'agent',
          data: { nodeType: 'agent-main' },
        },
        {
          id: 'mcp-legacy',
          type: 'tool',
          data: {
            nodeType: 'mcp',
            mcpServerConfigId: 'cfg-legacy',
            toolName: 'web_search',
          },
        },
      ];
      const edges = [
        {
          id: 'edge-mcp-legacy',
          source: 'mcp-legacy',
          target: 'main-agent',
          sourceHandle: 'tools-out',
          targetHandle: 'tools-in',
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, edges);

      expect(config.tools).toHaveLength(1);
      const tool = config.tools![0] as any;
      expect(tool.toolType).toBe('mcp');
      expect(tool.mcpServerConfigId).toBe('cfg-legacy');
      expect(tool.toolName).toBe('web_search');
    });

    it('MCP 工具仅提供 mcpServerConfigId + toolName 也应生成 toolType: mcp', () => {
      const nodes = [
        {
          id: 'mcp-2',
          type: 'mcp-tool',
          data: { mcpServerConfigId: 'cfg-789', toolName: 'execute' },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.tools).toHaveLength(1);
      const tool = config.tools![0] as any;
      expect(tool.toolType).toBe('mcp');
      expect(tool.mcpServerConfigId).toBe('cfg-789');
      expect(tool.toolName).toBe('execute');
    });

    it('应把 Studio 的 enabledToolIds + tools[] 展开为可执行的 MCP tool bindings', () => {
      const nodes = [
        {
          id: 'mcp-studio',
          type: 'mcp-tool',
          data: {
            label: 'WebSearch',
            config: {
              mcpServerConfigId: 'cfg-websearch',
              enabledToolIds: ['tool-fast'],
              tools: [
                {
                  id: 'tool-fast',
                  name: 'fast_search',
                  mcpServerConfigId: 'cfg-websearch',
                  inputSchema: { type: 'object' },
                  portMappingMetadata: {
                    inputs: [{ name: 'query', dataType: 'text' }],
                    outputs: [{ name: 'result', dataType: 'json' }],
                  },
                },
                {
                  id: 'tool-deep',
                  name: 'deep_search',
                  mcpServerConfigId: 'cfg-websearch',
                },
              ],
            },
          },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.tools).toHaveLength(1);
      const tool = config.tools![0] as any;
      expect(tool.toolType).toBe('mcp');
      expect(tool.mcpToolDefinitionId).toBe('tool-fast');
      expect(tool.mcpServerConfigId).toBe('cfg-websearch');
      expect(tool.toolName).toBe('fast_search');
      expect(tool.inputSchema).toEqual({ type: 'object' });
      expect(tool.portMapping).toEqual({
        inputs: [{ name: 'query', dataType: 'text' }],
        outputs: [{ name: 'result', dataType: 'json' }],
      });
    });

    it('MCP 工具已选择 server 但未选择具体工具时应直接拒绝编译', () => {
      const nodes = [
        {
          id: 'mcp-3',
          type: 'mcp-tool',
          data: { mcpServerConfigId: 'cfg-only' },
        },
      ];

      expect(() => service.buildRuntimeConfigFromNodes(nodes, [])).toThrow(
        AgentCanvasInvalidMcpToolBindingException,
      );
    });

    it('HTTP 工具提供 url + method 时应生成 toolType: http 判别联合', () => {
      const nodes = [
        {
          id: 'http-1',
          type: 'http-tool',
          data: { url: 'https://api.example.com/users', method: 'POST' },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.tools).toHaveLength(1);
      const tool = config.tools![0] as any;
      expect(tool.toolType).toBe('http');
      expect(tool.url).toBe('https://api.example.com/users');
      expect(tool.method).toBe('POST');
    });

    it('HTTP 工具 url 为空字符串时不应设置 toolType', () => {
      const nodes = [
        { id: 'http-2', type: 'http-tool', data: { url: '', method: 'GET' } },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.tools).toHaveLength(1);
      const tool = config.tools![0] as any;
      expect(tool.toolType).toBeUndefined();
    });

    it('代码工具提供 language + code 时应生成 toolType: code 判别联合', () => {
      const nodes = [
        {
          id: 'code-1',
          type: 'code-tool',
          data: { language: 'javascript', code: 'return 42;' },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.tools).toHaveLength(1);
      const tool = config.tools![0] as any;
      expect(tool.toolType).toBe('code');
      expect(tool.language).toBe('javascript');
      expect(tool.code).toBe('return 42;');
    });

    it('代码工具 language 为空字符串时不应设置 toolType', () => {
      const nodes = [
        { id: 'code-2', type: 'code-tool', data: { language: '', code: 'x' } },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.tools).toHaveLength(1);
      const tool = config.tools![0] as any;
      expect(tool.toolType).toBeUndefined();
    });

    it('子代理无 alias 时应使用 defId 前 8 字符作为默认别名', () => {
      const nodes = [
        {
          id: 'n1',
          type: 'sub-agent',
          data: { agentDefinitionId: 'abcdefgh-1234-5678-9abc-def012345678' },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(
        nodes,
        [],
        'current-agent',
      );

      expect(config.subAgents).toHaveLength(1);
      expect(config.subAgents![0].alias).toBe('abcdefgh');
      expect(config.subAgents![0].agentDefinitionId).toBe(
        'abcdefgh-1234-5678-9abc-def012345678',
      );
    });

    it('沙箱 enabled=false 时不应设置 sandboxConfig', () => {
      const nodes = [
        {
          id: 'sb-1',
          type: 'sandbox',
          data: { enabled: false, cpu: 4, memory: 2048 },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.sandboxConfig).toBeUndefined();
    });

    it('沙箱 enabled 未设置时应使用默认值编译', () => {
      const nodes = [{ id: 'sb-2', type: 'sandbox', data: {} }];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.sandboxConfig).toBeDefined();
      expect(config.sandboxConfig!.cpu).toBe(1);
      expect(config.sandboxConfig!.memory).toBe(512);
      expect(config.sandboxConfig!.disk).toBe(1);
      expect(config.sandboxConfig!.timeout).toBe(0);
      expect(config.sandboxConfig!.timeoutSeconds).toBeUndefined();
    });

    it('skill 节点通过 skills-in 连接到 agent-main 时应被编译', () => {
      const nodes = [
        { id: 'main', type: 'agent-main', data: {} },
        { id: 'sk-1', type: 'skill', data: { skillId: 'skill-abc' } },
        { id: 'orphan-sk', type: 'skill', data: { skillId: 'skill-orphan' } },
      ];
      const edges = [
        { source: 'sk-1', target: 'main', targetHandle: 'skills-in' },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, edges);

      expect(config.skillIds).toEqual(['skill-abc']);
      expect(config.tools).toBeUndefined();
      expect(config.modelConfig).toBeUndefined();
    });

    it('同一节点通过不同 targetHandle 连接到 agent-main 时应各自编译', () => {
      const nodes = [
        { id: 'main', type: 'agent-main', data: {} },
        { id: 'model-1', type: 'llm-model', data: { modelId: 'gpt-4' } },
        {
          id: 'routing-1',
          type: 'smart-routing',
          data: { strategy: 'QUALITY_FIRST' },
        },
      ];
      const edges = [
        { source: 'model-1', target: 'main', targetHandle: 'model-in' },
        { source: 'routing-1', target: 'main', targetHandle: 'model-in' },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, edges);

      expect(config.modelConfig).toBeDefined();
      expect(config.modelConfig!.modelId).toBe('gpt-4');
      expect(config.routingConfig).toBeDefined();
      expect(config.routingConfig!.strategy).toBe('QUALITY_FIRST');
    });

    it('MCP 工具支持 portMapping 对象', () => {
      const nodes = [
        {
          id: 'mcp-pm',
          type: 'mcp-tool',
          data: {
            mcpServerConfigId: 'cfg-websearch',
            toolName: 'fast_search',
            mcpToolDefinitionId: 'def-pm',
            portMapping: { input: 'text', output: 'json' },
          },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.tools).toHaveLength(1);
      const tool = config.tools![0] as any;
      expect(tool.toolType).toBe('mcp');
      expect(tool.portMapping).toEqual({ input: 'text', output: 'json' });
    });

    it('MCP 工具 portMapping 为数组时应被忽略', () => {
      const nodes = [
        {
          id: 'mcp-arr',
          type: 'mcp-tool',
          data: {
            mcpServerConfigId: 'cfg-websearch',
            toolName: 'fast_search',
            mcpToolDefinitionId: 'def-arr',
            portMapping: ['not', 'valid'],
          },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.tools).toHaveLength(1);
      const tool = config.tools![0] as any;
      expect(tool.toolType).toBe('mcp');
      expect(tool.portMapping).toBeUndefined();
    });

    it('MCP 工具 inputSchema 为数组时应被忽略', () => {
      const nodes = [
        {
          id: 'mcp-is',
          type: 'mcp-tool',
          data: {
            mcpServerConfigId: 'cfg-websearch',
            toolName: 'fast_search',
            mcpToolDefinitionId: 'def-is',
            inputSchema: [1, 2, 3],
          },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.tools).toHaveLength(1);
      const tool = config.tools![0] as any;
      expect(tool.toolType).toBe('mcp');
      expect(tool.inputSchema).toBeUndefined();
    });

    it('通过 data.config 嵌套配置应被正确解析（resolveNodeData 合并）', () => {
      const nodes = [
        {
          id: 'n1',
          type: 'llm-model',
          data: {
            config: { modelId: 'inner-model', temperature: 0.5 },
            label: 'outer-label',
          },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.modelConfig).toBeDefined();
      expect(config.modelConfig!.modelId).toBe('inner-model');
    });

    it('sandbox 节点应优先使用 data.config 中的持久化生命周期配置', () => {
      const nodes = [
        {
          id: 'main',
          type: 'agent',
          data: {
            nodeType: 'agent-main',
          },
        },
        {
          id: 'sandbox-1',
          type: 'tool',
          data: {
            nodeType: 'sandbox',
            lifecycleMode: 'session',
            timeoutSeconds: 600,
            memoryLimitMb: 1024,
            config: {
              cpu: 1,
              memory: 512,
              disk: 2,
              timeout: 2,
              lifecycleMode: 'persistent',
              persistentSandboxId: 'persistent-sandbox-1',
            },
          },
        },
      ];
      const edges = [
        {
          source: 'sandbox-1',
          target: 'main',
          targetHandle: 'sandbox-in',
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, edges);

      expect(config.sandboxConfig).toEqual({
        cpu: 1,
        memory: 512,
        disk: 2,
        timeout: 1,
        timeoutSeconds: 600,
        conversationIdleAutoEndMinutes: 10,
        lifecycleMode: 'persistent',
        persistentSandboxId: 'persistent-sandbox-1',
      });
    });

    it('data.nodeType 优先于 node.type 作为节点类型', () => {
      const nodes = [
        {
          id: 'n1',
          type: 'unknown-type',
          data: { nodeType: 'llm-model', modelId: 'gpt-4-turbo' },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.modelConfig).toBeDefined();
      expect(config.modelConfig!.modelId).toBe('gpt-4-turbo');
    });
  });

  // ─── compileCanvas ────────────────────────────────────────
  describe('compileCanvas', () => {
    it('应调用 findDetailById 并编译节点', async () => {
      const agent = makeAgent({
        nodes: [{ id: 'n1', type: 'llm-model', data: { modelId: 'gpt-4' } }],
        edges: [],
      });
      const chain: Record<string, any> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockResolvedValue([agent]);
      mockTenantDb.select.mockReturnValue(chain);

      const config = await service.compileCanvas('agent-1');

      expect(config.modelConfig).toBeDefined();
      expect(config.modelConfig!.modelId).toBe('gpt-4');
    });
  });

  // ─── createVersion ────────────────────────────────────────
  describe('applyCanvasSnapshot', () => {
    it('应更新草稿画布并返回新的 detail', async () => {
      const agent = makeAgent({
        version: 4,
        publishedVersionId: null,
      });
      const updatedDraft = makeAgent({
        version: 5,
        nodes: [
          {
            id: 'node-2',
            type: 'skill',
            position: { x: 0, y: 0 },
            data: { skillId: 'skill-1' },
          },
        ],
      });

      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([agent]);
        return c;
      });

      mockTxClient.update.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.set = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        c.returning = vi.fn().mockResolvedValue([updatedDraft]);
        return c;
      });

      const result = await service.applyCanvasSnapshot(
        'agent-1',
        {
          canvasNodes: updatedDraft.nodes as never,
          canvasEdges: [],
          expectedVersion: 4,
        },
        'user-1',
      );

      expect(result).toEqual({
        detail: expect.objectContaining({
          id: 'agent-1',
          version: 5,
          nodes: updatedDraft.nodes,
        }),
      });
      expect(mockTxClient.insert).not.toHaveBeenCalled();
    });

    it('mcp-tool 已选择 server 但未选择具体工具时应拒绝 applyCanvasSnapshot', async () => {
      const agent = makeAgent({
        version: 4,
        publishedVersionId: null,
      });

      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([agent]);
        return c;
      });

      await expect(
        service.applyCanvasSnapshot(
          'agent-1',
          {
            canvasNodes: [
              {
                id: 'mcp-bad',
                type: 'tool',
                position: { x: 0, y: 0 },
                data: {
                  nodeType: 'mcp-tool',
                  config: {
                    mcpServerConfigId: 'cfg-websearch',
                  },
                },
              },
            ] as never,
            canvasEdges: [],
            expectedVersion: 4,
          },
          'user-1',
        ),
      ).rejects.toThrow(AgentCanvasInvalidMcpToolBindingException);
    });

    it('已发布 Agent 且 publishIfCurrentlyPublished=true 时应原子生成新发布版本', async () => {
      const agent = makeAgent({
        status: 'published',
        version: 2,
        publishedVersionId: 'version-old',
        nodes: [
          { id: 'node-1', type: 'llm-model', data: { modelId: 'gpt-4' } },
        ],
      });
      const updatedDraft = makeAgent({
        status: 'published',
        version: 3,
        publishedVersionId: 'version-old',
        nodes: [
          {
            id: 'node-2',
            type: 'skill',
            position: { x: 0, y: 0 },
            data: { skillId: 'skill-1' },
          },
        ],
      });
      const publishedDetail = makeAgent({
        status: 'published',
        version: 3,
        publishedVersionId: 'version-3',
        nodes: updatedDraft.nodes,
      });
      const version = makeVersion({
        id: 'version-3',
        versionNumber: 3,
        publishedAt: new Date('2025-01-01'),
      });

      let selectCallCount = 0;
      mockTxClient.select.mockImplementation(() => {
        selectCallCount += 1;
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi
          .fn()
          .mockResolvedValue(
            selectCallCount === 1 ? [agent] : [{ maxVersion: 2 }],
          );
        return c;
      });

      let updateCallCount = 0;
      mockTxClient.update.mockImplementation(() => {
        updateCallCount += 1;
        const c: Record<string, any> = {};
        c.set = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        c.returning = vi
          .fn()
          .mockResolvedValue(
            updateCallCount === 1 ? [updatedDraft] : [publishedDetail],
          );
        return c;
      });

      mockTxClient.insert.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.values = vi.fn().mockReturnValue(c);
        c.returning = vi.fn().mockResolvedValue([version]);
        return c;
      });

      const result = await service.applyCanvasSnapshot(
        'agent-1',
        {
          canvasNodes: updatedDraft.nodes as never,
          canvasEdges: [],
          expectedVersion: 2,
          publishIfCurrentlyPublished: true,
        },
        'user-1',
      );

      expect(mockTxClient.insert).toHaveBeenCalledTimes(1);
      expect(result.detail).toMatchObject({
        id: 'agent-1',
        status: 'published',
        version: 3,
        nodes: updatedDraft.nodes,
      });
      expect(result.publishedVersionId).toBe('version-3');
      expect(result.publishedVersionNumber).toBe(3);
    });

    it('草稿 Agent 且 publishAfterSave=true 时应在同一写锁中直接发布', async () => {
      const agent = makeAgent({
        status: 'draft',
        version: 2,
        publishedVersionId: null,
        nodes: [],
      });
      const updatedDraft = makeAgent({
        status: 'draft',
        version: 3,
        publishedVersionId: null,
        nodes: [
          {
            id: 'model-node-1',
            type: 'agent',
            position: { x: 0, y: 0 },
            data: { nodeType: 'llm-model', modelId: 'model-1' },
          },
          {
            id: 'agent-main-1',
            type: 'agent',
            position: { x: 240, y: 0 },
            data: { nodeType: 'agent-main' },
          },
        ],
      });
      const publishedDetail = makeAgent({
        status: 'published',
        version: 3,
        publishedVersionId: 'version-1',
        nodes: updatedDraft.nodes,
      });
      const version = makeVersion({
        id: 'version-1',
        versionNumber: 1,
        publishedAt: new Date('2025-01-01'),
      });

      let selectCallCount = 0;
      mockTxClient.select.mockImplementation(() => {
        selectCallCount += 1;
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi
          .fn()
          .mockResolvedValue(
            selectCallCount === 1 ? [agent] : [{ maxVersion: 0 }],
          );
        return c;
      });

      let updateCallCount = 0;
      mockTxClient.update.mockImplementation(() => {
        updateCallCount += 1;
        const c: Record<string, any> = {};
        c.set = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        c.returning = vi
          .fn()
          .mockResolvedValue(
            updateCallCount === 1 ? [updatedDraft] : [publishedDetail],
          );
        return c;
      });

      mockTxClient.insert.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.values = vi.fn().mockReturnValue(c);
        c.returning = vi.fn().mockResolvedValue([version]);
        return c;
      });

      const result = await service.applyCanvasSnapshot(
        'agent-1',
        {
          canvasNodes: updatedDraft.nodes as never,
          canvasEdges: [],
          expectedVersion: 2,
          publishAfterSave: true,
        },
        'user-1',
      );

      expect(mockTxClient.insert).toHaveBeenCalledTimes(1);
      expect(result.detail).toMatchObject({
        id: 'agent-1',
        status: 'published',
        version: 3,
        nodes: updatedDraft.nodes,
      });
      expect(result.publishedVersionId).toBe('version-1');
      expect(result.publishedVersionNumber).toBe(1);
    });

    it('发布时应把节点派生的 sandboxConfig 同步到草稿与版本快照', async () => {
      const agent = makeAgent({
        status: 'published',
        version: 2,
        publishedVersionId: 'version-old',
        sandboxConfig: { cpu: 1, memory: 512, disk: 2, timeout: 2 },
      });
      const canvasNodes = [
        {
          id: 'workspace-1',
          type: 'tool',
          data: {
            nodeType: 'workspace',
            workspaceId: 'workspace-1',
          },
        },
        {
          id: 'sandbox-1',
          type: 'tool',
          data: {
            nodeType: 'sandbox',
            enabled: true,
            cpuLimit: 2,
            memoryLimitMb: 1536,
            diskLimitGb: 5,
            timeoutSeconds: 901,
          },
        },
      ];
      const canvasEdges = [
        {
          id: 'edge-workspace-sandbox',
          source: 'workspace-1',
          target: 'sandbox-1',
        },
      ];
      const updatedDraft = makeAgent({
        status: 'published',
        version: 3,
        publishedVersionId: 'version-old',
        nodes: canvasNodes,
        edges: canvasEdges,
        sandboxConfig: agent.sandboxConfig,
      });
      const publishedDetail = makeAgent({
        status: 'published',
        version: 3,
        publishedVersionId: 'version-3',
        nodes: canvasNodes,
        edges: canvasEdges,
        sandboxConfig: {
          cpu: 2,
          memory: 1536,
          disk: 5,
          timeout: 901,
          restoreWorkspaceId: 'workspace-1',
        },
      });
      const version = makeVersion({
        id: 'version-3',
        versionNumber: 3,
        publishedAt: new Date('2025-01-01'),
      });

      let selectCallCount = 0;
      mockTxClient.select.mockImplementation(() => {
        selectCallCount += 1;
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi
          .fn()
          .mockResolvedValue(
            selectCallCount === 1 ? [agent] : [{ maxVersion: 2 }],
          );
        return c;
      });

      const updateClauses: Record<string, any>[] = [];
      let updateCallCount = 0;
      mockTxClient.update.mockImplementation(() => {
        updateCallCount += 1;
        const c: Record<string, any> = {};
        c.set = vi.fn().mockImplementation((clause: Record<string, any>) => {
          updateClauses.push(clause);
          return c;
        });
        c.where = vi.fn().mockReturnValue(c);
        c.returning = vi
          .fn()
          .mockResolvedValue(
            updateCallCount === 1 ? [updatedDraft] : [publishedDetail],
          );
        return c;
      });

      let insertValues: Record<string, any> | null = null;
      mockTxClient.insert.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.values = vi.fn().mockImplementation((value: Record<string, any>) => {
          insertValues = value;
          return c;
        });
        c.returning = vi.fn().mockResolvedValue([version]);
        return c;
      });

      await service.applyCanvasSnapshot(
        'agent-1',
        {
          canvasNodes: canvasNodes as never,
          canvasEdges: canvasEdges as never,
          expectedVersion: 2,
          publishIfCurrentlyPublished: true,
        },
        'user-1',
      );

      expect(updateClauses[0]).toBeDefined();
      expect(
        (updateClauses[0] as unknown as Record<string, any>).sandboxConfig,
      ).toEqual({
        cpu: 2,
        memory: 1536,
        disk: 5,
        timeout: 1,
        timeoutSeconds: 901,
        conversationIdleAutoEndMinutes: 10,
        lifecycleMode: undefined,
        persistencePath: undefined,
        restoreWorkspaceId: 'workspace-1',
        persistenceExpiryHours: undefined,
        persistentSandboxId: undefined,
      });
      expect(insertValues).not.toBeNull();
      expect(
        (
          (insertValues as unknown as Record<string, any>).snapshot as Record<
            string,
            any
          >
        ).sandboxConfig,
      ).toEqual({
        cpu: 2,
        memory: 1536,
        disk: 5,
        timeout: 1,
        timeoutSeconds: 901,
        conversationIdleAutoEndMinutes: 10,
        lifecycleMode: undefined,
        persistencePath: undefined,
        restoreWorkspaceId: 'workspace-1',
        persistenceExpiryHours: undefined,
        persistentSandboxId: undefined,
      });
    });
  });

  // ─── createVersion ────────────────────────────────────────
  describe('createVersion', () => {
    it('应成功创建版本并返回版本 DTO', async () => {
      const agent = makeAgent();
      const version = makeVersion({
        versionNumber: 1,
        createdAt: new Date('2025-01-01'),
      });
      let capturedValues: Record<string, any> | null = null;

      let selectCallCount = 0;
      mockTxClient.select.mockImplementation(() => {
        selectCallCount += 1;
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi
          .fn()
          .mockResolvedValue(
            selectCallCount === 1 ? [agent] : [{ maxVersion: 0 }],
          );
        return c;
      });

      mockTxClient.insert.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.values = vi.fn().mockImplementation((v: Record<string, any>) => {
          capturedValues = v;
          return c;
        });
        c.returning = vi.fn().mockResolvedValue([version]);
        return c;
      });

      const result = await service.createVersion(
        'agent-1',
        makeCreateAgentVersionDto({ label: '首版快照' }),
        'user-1',
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('version-1');
      expect(result.versionNumber).toBe(1);
      expect((capturedValues as { label?: string } | null)?.label).toBe(
        '首版快照',
      );
    });

    it('应将 canvas metadata fields 冻结到版本快照中', async () => {
      const agent = makeAgent({
        sandboxConfig: {
          cpu: 1,
          memory: 512,
          disk: 1,
          timeout: 60,
          lifecycleMode: 'persistent',
        },
        metadata: {
          inputSchema: {
            type: 'object',
            properties: { question: { type: 'string' } },
          },
          memoryInstanceIds: ['019d2a7c-c19c-7a9c-8233-db2b87a23de6'],
          sandboxLifecycle: 'persistent',
        },
      });
      const version = makeVersion({
        versionNumber: 1,
        createdAt: new Date('2025-01-01'),
      });

      let selectCallCount = 0;
      mockTxClient.select.mockImplementation(() => {
        selectCallCount += 1;
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi
          .fn()
          .mockResolvedValue(
            selectCallCount === 1 ? [agent] : [{ maxVersion: 0 }],
          );
        return c;
      });

      let capturedValues: Record<string, any> | null = null;
      mockTxClient.insert.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.values = vi.fn().mockImplementation((v: Record<string, any>) => {
          capturedValues = v;
          return c;
        });
        c.returning = vi.fn().mockResolvedValue([version]);
        return c;
      });

      await service.createVersion(
        'agent-1',
        makeCreateAgentVersionDto({ releaseNotes: 'Snapshot metadata' }),
        'user-1',
      );

      const snapshotMetadata = (
        capturedValues as { snapshot?: { metadata?: unknown } } | null
      )?.snapshot?.metadata;

      expect(snapshotMetadata).toMatchObject({
        releaseNotes: 'Snapshot metadata',
        inputSchema: {
          type: 'object',
          properties: { question: { type: 'string' } },
        },
        memoryInstanceIds: ['019d2a7c-c19c-7a9c-8233-db2b87a23de6'],
        sandboxLifecycle: 'persistent',
      });
    });

    it('Agent 不存在时应抛出 AgentNotFoundException', async () => {
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([]);
        return c;
      });

      await expect(
        service.createVersion(
          'nonexistent',
          makeCreateAgentVersionDto(),
          'user-1',
        ),
      ).rejects.toThrow(AgentNotFoundException);
    });

    it('Agent 已归档时应抛出 AgentArchivedException', async () => {
      const archived = makeAgent({ status: 'archived' });
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([archived]);
        return c;
      });

      await expect(
        service.createVersion('agent-1', makeCreateAgentVersionDto(), 'user-1'),
      ).rejects.toThrow(AgentArchivedException);
    });

    it('releaseNotes 超过 50 字符时 label 应截断', async () => {
      const agent = makeAgent();
      const longReleaseNotes = 'A'.repeat(60);
      const version = makeVersion({
        label: `v1 - ${'A'.repeat(50)}`,
        createdAt: new Date('2025-01-01'),
      });

      let selectCallCount = 0;
      mockTxClient.select.mockImplementation(() => {
        selectCallCount += 1;
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi
          .fn()
          .mockResolvedValue(
            selectCallCount === 1 ? [agent] : [{ maxVersion: 0 }],
          );
        return c;
      });

      let capturedValues: Record<string, any> | null = null;
      mockTxClient.insert.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.values = vi.fn().mockImplementation((v: Record<string, any>) => {
          capturedValues = v;
          return c;
        });
        c.returning = vi.fn().mockResolvedValue([version]);
        return c;
      });

      await service.createVersion(
        'agent-1',
        makeCreateAgentVersionDto({ releaseNotes: longReleaseNotes }),
        'user-1',
      );

      expect(capturedValues).toBeDefined();
      expect(capturedValues!.label).toBe(`v1 - ${'A'.repeat(50)}`);
    });
  });

  // ─── rollback ─────────────────────────────────────────────
  describe('rollback', () => {
    const mockSelectResults = (...results: unknown[][]) => {
      let selectCall = 0;
      mockTxClient.select.mockImplementation(() => {
        const chain: Record<string, any> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi
          .fn()
          .mockImplementation(() => Promise.resolve(results[selectCall++]));
        return chain;
      });
    };

    it('应从目标版本恢复全部草稿字段并递增版本且不修改已发布指针', async () => {
      const agent = makeAgent({
        version: 7,
        status: 'published',
        publishedVersionId: 'published-version',
      });
      const snapshot: Record<string, any> = {
        runtimeMode: 'sandbox',
        nodes: [{ id: 'snapshot-node', type: 'text', data: {} }],
        edges: [
          {
            id: 'snapshot-edge',
            source: 'snapshot-node',
            target: 'snapshot-node',
          },
        ],
        viewport: { x: 12, y: 34, zoom: 0.8 },
        systemPrompt: 'snapshot prompt',
        sandboxConfig: { timeoutSeconds: 3600 },
        workspaceSnapshotId: 'workspace-snapshot',
        metadata: { nodeCount: 1, edgeCount: 1, createdFromVersion: 2 },
      };
      const targetVersion = makeVersion({
        id: 'version-target',
        versionNumber: 3,
        snapshot,
      });
      mockSelectResults([agent], [targetVersion]);

      let capturedSet: Record<string, any> | undefined;
      mockTxClient.update.mockImplementation(() => {
        const chain: Record<string, any> = {};
        chain.set = vi
          .fn()
          .mockImplementation((values: Record<string, any>) => {
            capturedSet = values;
            return chain;
          });
        chain.where = vi.fn().mockResolvedValue(undefined);
        return chain;
      });

      const result = await service.rollback(
        'agent-1',
        'version-target',
        'user-rollback',
      );

      expect(result.id).toBe('version-target');
      expect(capturedSet).toMatchObject({
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        viewport: snapshot.viewport,
        runtimeMode: snapshot.runtimeMode,
        systemPrompt: snapshot.systemPrompt,
        sandboxConfig: snapshot.sandboxConfig,
        workspaceSnapshotId: snapshot.workspaceSnapshotId,
        updatedBy: 'user-rollback',
      });
      expect(capturedSet).not.toHaveProperty('publishedVersionId');
      expect(capturedSet).not.toHaveProperty('status');
      expect(capturedSet?.version?.[1]).toBe('version');
      expect(capturedSet?.version?.[0]?.join('')).toContain('+ 1');
      expect(mockTxClient.execute).toHaveBeenCalledOnce();
    });

    it('跨租户 Agent 不可见时应返回 AgentNotFoundException', async () => {
      mockSelectResults([]);

      await expect(
        service.rollback('other-tenant-agent', 'version-1', 'user-1'),
      ).rejects.toBeInstanceOf(AgentNotFoundException);
      expect(mockTxClient.update).not.toHaveBeenCalled();
    });

    it('不存在版本时应返回 AgentVersionNotFoundException', async () => {
      mockSelectResults([makeAgent()], []);

      await expect(
        service.rollback('agent-1', 'missing-version', 'user-1'),
      ).rejects.toBeInstanceOf(AgentVersionNotFoundException);
      expect(mockTxClient.update).not.toHaveBeenCalled();
    });

    it('版本不属于路径 Agent 时应返回 AgentVersionNotFoundException', async () => {
      mockSelectResults([makeAgent()], []);

      await expect(
        service.rollback('agent-1', 'other-agent-version', 'user-1'),
      ).rejects.toBeInstanceOf(AgentVersionNotFoundException);
      expect(eq).toHaveBeenCalledWith('agentDefinitionId', 'agent-1');
      expect(mockTxClient.update).not.toHaveBeenCalled();
    });

    it('跨租户版本不可见时应按 tenantId 过滤并返回 AgentVersionNotFoundException', async () => {
      mockSelectResults([makeAgent({ tenantId: 'tenant-1' })], []);

      await expect(
        service.rollback('agent-1', 'other-tenant-version', 'user-1'),
      ).rejects.toBeInstanceOf(AgentVersionNotFoundException);
      expect(eq).toHaveBeenCalledWith('tenantId', 'tenant-1');
      expect(mockTxClient.update).not.toHaveBeenCalled();
    });
  });

  // ─── listVersions ────────────────────────────────────────
  describe('listVersions', () => {
    it('应返回分页版本列表', async () => {
      const versions = [
        makeVersion({ versionNumber: 2, createdAt: new Date('2025-01-02') }),
        makeVersion({
          id: 'version-2',
          versionNumber: 1,
          createdAt: new Date('2025-01-01'),
        }),
      ];

      const rowsChain: Record<string, any> = {};
      rowsChain.from = vi.fn().mockReturnValue(rowsChain);
      rowsChain.where = vi.fn().mockReturnValue(rowsChain);
      rowsChain.orderBy = vi.fn().mockReturnValue(rowsChain);
      rowsChain.limit = vi.fn().mockReturnValue(rowsChain);
      rowsChain.offset = vi.fn().mockResolvedValue(versions);

      const countChain: Record<string, any> = {};
      countChain.from = vi.fn().mockReturnValue(countChain);
      countChain.where = vi.fn().mockResolvedValue([{ total: 2 }]);

      mockTenantDb.select
        .mockReturnValueOnce(rowsChain)
        .mockReturnValueOnce(countChain);

      const result = await service.listVersions('agent-1', 1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });

    it('无版本时应返回空数组', async () => {
      const rowsChain: Record<string, any> = {};
      rowsChain.from = vi.fn().mockReturnValue(rowsChain);
      rowsChain.where = vi.fn().mockReturnValue(rowsChain);
      rowsChain.orderBy = vi.fn().mockReturnValue(rowsChain);
      rowsChain.limit = vi.fn().mockReturnValue(rowsChain);
      rowsChain.offset = vi.fn().mockResolvedValue([]);

      const countChain: Record<string, any> = {};
      countChain.from = vi.fn().mockReturnValue(countChain);
      countChain.where = vi.fn().mockResolvedValue([{ total: 0 }]);

      mockTenantDb.select
        .mockReturnValueOnce(rowsChain)
        .mockReturnValueOnce(countChain);

      const result = await service.listVersions('agent-1');

      expect(result.data).toHaveLength(0);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  // ─── publish ──────────────────────────────────────────────
  describe('publish', () => {
    it('应成功发布 Agent（创建版本 + 更新定义状态）', async () => {
      const agent = makeAgent({
        nodes: [{ id: 'n1', type: 'llm-model', data: {} }],
      });
      const version = makeVersion({ createdAt: new Date('2025-01-01') });
      const updated = makeAgent({
        status: 'published',
        publishedVersionId: 'version-1',
      });

      let selectCallCount = 0;
      mockTxClient.select.mockImplementation(() => {
        selectCallCount += 1;
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi
          .fn()
          .mockResolvedValue(
            selectCallCount === 1 ? [agent] : [{ maxVersion: 0 }],
          );
        return c;
      });

      mockTxClient.insert.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.values = vi.fn().mockReturnValue(c);
        c.returning = vi.fn().mockResolvedValue([version]);
        return c;
      });

      let updateCallCount = 0;
      mockTxClient.update.mockImplementation(() => {
        updateCallCount += 1;
        const c: Record<string, any> = {};
        c.set = vi.fn().mockReturnValue(c);
        c.where =
          updateCallCount === 1
            ? vi.fn().mockResolvedValue(undefined)
            : vi.fn().mockReturnValue(c);
        c.returning = vi.fn().mockResolvedValue([updated]);
        return c;
      });

      const result = await service.publish(
        'agent-1',
        makePublishAgentDto(),
        'user-1',
      );

      expect(result).toBeDefined();
    });

    it('指定 versionId 时应直接重新发布历史版本', async () => {
      const agent = makeAgent({
        nodes: [{ id: 'n1', type: 'llm-model', data: {} }],
      });
      const existingVersion = makeVersion({
        id: 'version-2',
        versionNumber: 2,
        label: '历史快照',
        snapshot: {
          runtimeMode: 'sandbox',
          nodes: [{ id: 'n1', type: 'llm-model', data: {} }],
          edges: [],
          viewport: null,
          metadata: {
            nodeCount: 1,
            edgeCount: 0,
            createdFromVersion: 2,
            releaseNotes: '旧说明',
          },
        },
      });
      const republishedVersion = makeVersion({
        id: 'version-2',
        versionNumber: 2,
        label: '重新发布版本',
        publishedAt: new Date('2025-01-03'),
        snapshot: {
          ...existingVersion.snapshot,
          metadata: {
            ...existingVersion.snapshot.metadata,
            releaseNotes: '新的发布说明',
          },
        },
      });
      const updated = makeAgent({
        status: 'published',
        publishedVersionId: 'version-2',
      });

      let selectCallCount = 0;
      mockTxClient.select.mockImplementation(() => {
        selectCallCount += 1;
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi
          .fn()
          .mockResolvedValue(
            selectCallCount === 1 ? [agent] : [existingVersion],
          );
        return c;
      });

      const updateValues: Record<string, any>[] = [];
      let updateCallCount = 0;
      mockTxClient.update.mockImplementation(() => {
        updateCallCount += 1;
        const c: Record<string, any> = {};
        c.set = vi.fn().mockImplementation((value: Record<string, any>) => {
          updateValues.push(value);
          return c;
        });
        c.where =
          updateCallCount === 1
            ? vi.fn().mockResolvedValue(undefined)
            : vi.fn().mockReturnValue(c);
        c.returning = vi
          .fn()
          .mockResolvedValue(
            updateCallCount === 2 ? [republishedVersion] : [updated],
          );
        return c;
      });

      const result = await service.publish(
        'agent-1',
        makePublishAgentDto({
          versionId: 'version-2',
          label: '重新发布版本',
          releaseNotes: '新的发布说明',
        }),
        'user-1',
      );

      expect(result.publishedVersionId).toBe('version-2');
      expect(updateValues[1]).toMatchObject({
        label: '重新发布版本',
        snapshot: {
          metadata: expect.objectContaining({
            releaseNotes: '新的发布说明',
          }),
        },
      });
    });

    it('Agent 不存在时应抛出 AgentNotFoundException', async () => {
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([]);
        return c;
      });

      await expect(
        service.publish('nonexistent', makePublishAgentDto(), 'user-1'),
      ).rejects.toThrow(AgentNotFoundException);
    });

    it('Agent 已归档时应抛出 AgentArchivedException', async () => {
      const archived = makeAgent({ status: 'archived' });
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([archived]);
        return c;
      });

      await expect(
        service.publish('agent-1', makePublishAgentDto(), 'user-1'),
      ).rejects.toThrow(AgentArchivedException);
    });

    it('画布无节点时应抛出 AgentPublishValidationException', async () => {
      const noNodes = makeAgent({ nodes: [] });
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([noNodes]);
        return c;
      });

      await expect(
        service.publish('agent-1', makePublishAgentDto(), 'user-1'),
      ).rejects.toThrow(AgentPublishValidationException);
    });

    it('画布 nodes 为 null 时应抛出 AgentPublishValidationException', async () => {
      const nullNodes = makeAgent({ nodes: null });
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([nullNodes]);
        return c;
      });

      await expect(
        service.publish('agent-1', makePublishAgentDto(), 'user-1'),
      ).rejects.toThrow(AgentPublishValidationException);
    });
  });
  describe('CRUD、资源来源、OCC 与事务边界补充', () => {
    it.each([
      {
        runtimeMode: 'sandbox',
        globalSandboxConfig: { cpu: 2 },
        expectedSandboxConfig: { cpu: 2 },
      },
      {
        runtimeMode: 'no_sandbox',
        globalSandboxConfig: { cpu: 8 },
        expectedSandboxConfig: null,
      },
    ] as const)(
      'create 应按 $runtimeMode 持久化可选字段和 sandbox 配置',
      async ({ runtimeMode, globalSandboxConfig, expectedSandboxConfig }) => {
        let inserted: Record<string, unknown> | undefined;
        mockTxClient.insert.mockImplementation(() => {
          const chain: Record<string, any> = {};
          chain.values = vi.fn((values: Record<string, unknown>) => {
            inserted = values;
            return chain;
          });
          chain.returning = vi
            .fn()
            .mockResolvedValue([
              makeAgent({ runtimeMode, sandboxConfig: expectedSandboxConfig }),
            ]);
          return chain;
        });

        await service.create(
          makeCreateAgentDefinitionDto({
            name: '  Preserved Name  ',
            description: 'description',
            icon: 'robot',
            runtimeMode,
            globalSandboxConfig,
          }),
          'creator',
        );

        expect(inserted).toMatchObject({
          name: '  Preserved Name  ',
          description: 'description',
          icon: 'robot',
          runtimeMode,
          sandboxConfig: expectedSandboxConfig,
          createdBy: 'creator',
          updatedBy: 'creator',
        });
      },
    );

    it('create 的事务错误应原样传播且不进行 slug 重试', async () => {
      const transactionError = new Error('begin failed');
      mockTenantDb.transaction.mockRejectedValue(transactionError);

      await expect(
        service.create(makeCreateAgentDefinitionDto({}), 'user-1'),
      ).rejects.toBe(transactionError);
      expect(mockTenantDb.transaction).toHaveBeenCalledTimes(1);
    });

    it.each([
      {
        sourceKind: 'share_imported',
        mappedKind: 'share_imported',
        expectedCondition: { type: 'share-imported' },
      },
      {
        sourceKind: 'manual',
        mappedKind: undefined,
        expectedCondition: ['not', { type: 'share-imported' }],
      },
    ] as const)(
      'findAll 应按 $sourceKind 过滤并返回资源来源',
      async ({ sourceKind, mappedKind, expectedCondition }) => {
        const row = makeAgent();
        const rowsChain: Record<string, any> = {};
        rowsChain.from = vi.fn().mockReturnValue(rowsChain);
        rowsChain.where = vi.fn().mockReturnValue(rowsChain);
        rowsChain.orderBy = vi.fn().mockReturnValue(rowsChain);
        rowsChain.limit = vi.fn().mockReturnValue(rowsChain);
        rowsChain.offset = vi.fn().mockResolvedValue([row]);
        const countChain: Record<string, any> = {};
        countChain.from = vi.fn().mockReturnValue(countChain);
        countChain.where = vi.fn().mockResolvedValue([{ total: 1 }]);
        mockTenantDb.select
          .mockReturnValueOnce(rowsChain)
          .mockReturnValueOnce(countChain);
        mockResourceSourceService.mapCurrentKinds.mockResolvedValue(
          mappedKind ? new Map([[row.id, mappedKind]]) : new Map(),
        );

        const result = await service.findAll(
          makeListAgentDefinitionsQueryDto({
            sourceKind,
            sort: 'createdAt',
          }),
        );

        expect(rowsChain.where).toHaveBeenCalledWith([expectedCondition]);
        expect(result.data[0]).toMatchObject({
          id: 'agent-1',
          resourceSourceKind: mappedKind ?? 'manual',
        });
      },
    );

    it.each([
      ['findById', 'share_imported'],
      ['findDetailById', undefined],
    ] as const)(
      '%s 应将缺失资源来源回退 manual',
      async (method, mappedKind) => {
        const row = makeAgent();
        const chain: Record<string, any> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockResolvedValue([row]);
        mockTenantDb.select.mockReturnValue(chain);
        mockResourceSourceService.mapCurrentKinds.mockResolvedValue(
          mappedKind ? new Map([[row.id, mappedKind]]) : new Map(),
        );

        const result = await service[method]('agent-1');

        expect(result.resourceSourceKind).toBe(mappedKind ?? 'manual');
        expect(mockResourceSourceService.mapCurrentKinds).toHaveBeenCalledWith(
          'agent_definition',
          ['agent-1'],
        );
      },
    );

    it.each([
      {
        runtimeMode: 'sandbox',
        globalSandboxConfig: { cpu: 4 },
        expectedSandboxConfig: { cpu: 4 },
      },
      {
        runtimeMode: 'no_sandbox',
        globalSandboxConfig: { cpu: 4 },
        expectedSandboxConfig: null,
      },
    ] as const)(
      'update 应按 $runtimeMode 持久化所有可选字段',
      async ({ runtimeMode, globalSandboxConfig, expectedSandboxConfig }) => {
        const agent = makeAgent({ runtimeMode });
        let setClause: Record<string, unknown> | undefined;
        mockTxClient.select.mockImplementation(() => {
          const chain: Record<string, any> = {};
          chain.from = vi.fn().mockReturnValue(chain);
          chain.where = vi.fn().mockResolvedValue([agent]);
          return chain;
        });
        mockTxClient.update.mockImplementation(() => {
          const chain: Record<string, any> = {};
          chain.set = vi.fn((value: Record<string, unknown>) => {
            setClause = value;
            return chain;
          });
          chain.where = vi.fn().mockReturnValue(chain);
          chain.returning = vi
            .fn()
            .mockResolvedValue([makeAgent({ runtimeMode, version: 2 })]);
          return chain;
        });

        await service.update(
          'agent-1',
          {
            version: 1,
            name: 'renamed',
            description: null,
            icon: 'new-icon',
            globalSandboxConfig,
          },
          'editor',
        );

        expect(setClause).toMatchObject({
          name: 'renamed',
          description: null,
          icon: 'new-icon',
          sandboxConfig: expectedSandboxConfig,
          updatedBy: 'editor',
        });
      },
    );

    it('写锁 transaction 失败时 update 不执行读写并原样传播', async () => {
      const transactionError = new Error('transaction unavailable');
      mockTenantDb.transaction.mockRejectedValue(transactionError);

      await expect(
        service.update('agent-1', { version: 1 }, 'user-1'),
      ).rejects.toBe(transactionError);
      expect(mockTxClient.select).not.toHaveBeenCalled();
      expect(mockTxClient.update).not.toHaveBeenCalled();
    });

    it('archive 第二次持久化失败时应回滚式传播错误', async () => {
      const definitionUpdateError = new Error('definition update failed');
      mockTxClient.select.mockImplementation(() => {
        const chain: Record<string, any> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockResolvedValue([makeAgent()]);
        return chain;
      });
      const archivedValues: Record<string, unknown>[] = [];
      mockTxClient.update
        .mockImplementationOnce(() => {
          const chain: Record<string, any> = {};
          chain.set = vi.fn((value: Record<string, unknown>) => {
            archivedValues.push(value);
            return chain;
          });
          chain.where = vi.fn().mockResolvedValue(undefined);
          return chain;
        })
        .mockImplementationOnce(() => {
          const chain: Record<string, any> = {};
          chain.set = vi.fn((value: Record<string, unknown>) => {
            archivedValues.push(value);
            return chain;
          });
          chain.where = vi.fn().mockRejectedValue(definitionUpdateError);
          return chain;
        });

      await expect(service.archive('agent-1', 'archiver')).rejects.toBe(
        definitionUpdateError,
      );
      expect(archivedValues[0]?.archivedAt).toBeInstanceOf(Date);
      expect(archivedValues[1]).toMatchObject({
        status: 'archived',
        updatedBy: 'archiver',
      });
    });
  });

  describe('canvas snapshot 边界与事务错误', () => {
    it.each([
      {
        selected: undefined,
        error: AgentNotFoundException,
      },
      {
        selected: makeAgent({ status: 'archived' }),
        error: AgentArchivedException,
      },
      {
        selected: makeAgent({ version: 9 }),
        error: AgentVersionConflictException,
      },
    ])(
      'applyCanvasSnapshot 应抛出 $error.name',
      async ({ selected, error }) => {
        mockTxClient.select.mockImplementation(() => {
          const chain: Record<string, any> = {};
          chain.from = vi.fn().mockReturnValue(chain);
          chain.where = vi.fn().mockResolvedValue(selected ? [selected] : []);
          return chain;
        });

        await expect(
          service.applyCanvasSnapshot(
            'agent-1',
            {
              canvasNodes: [],
              canvasEdges: [],
              expectedVersion: 1,
            },
            'user-1',
          ),
        ).rejects.toThrow(error);
        expect(mockTxClient.update).not.toHaveBeenCalled();
      },
    );

    it('applyCanvasSnapshot 应持久化 viewport/workspace/metadata 且不误发布草稿', async () => {
      const agent = makeAgent({
        version: 3,
        publishedVersionId: null,
      });
      const updated = makeAgent({ version: 4, nodes: [] });
      let setClause: Record<string, unknown> | undefined;
      mockTxClient.select.mockImplementation(() => {
        const chain: Record<string, any> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockResolvedValue([agent]);
        return chain;
      });
      mockTxClient.update.mockImplementation(() => {
        const chain: Record<string, any> = {};
        chain.set = vi.fn((value: Record<string, unknown>) => {
          setClause = value;
          return chain;
        });
        chain.where = vi.fn().mockReturnValue(chain);
        chain.returning = vi.fn().mockResolvedValue([updated]);
        return chain;
      });

      const result = await service.applyCanvasSnapshot(
        'agent-1',
        {
          canvasNodes: [],
          canvasEdges: [],
          expectedVersion: 3,
          canvasViewport: { x: 1, y: 2, zoom: 0.5 },
          workspaceSnapshotId: null,
          inputSchema: null,
          memoryInstanceIds: [],
          sandboxLifecycle: 'session',
          publishIfCurrentlyPublished: true,
        },
        'user-1',
      );

      expect(setClause).toMatchObject({
        viewport: { x: 1, y: 2, zoom: 0.5 },
        workspaceSnapshotId: null,
      });
      expect(setClause).toHaveProperty('metadata');
      expect(result.publishedVersionId).toBeUndefined();
      expect(mockTxClient.insert).not.toHaveBeenCalled();
    });

    it.each([null, []] as const)(
      '发布空 updatedDraft.nodes=%s 应抛发布校验异常且不插入版本',
      async (nodes) => {
        const agent = makeAgent({ version: 1 });
        mockTxClient.select.mockImplementation(() => {
          const chain: Record<string, any> = {};
          chain.from = vi.fn().mockReturnValue(chain);
          chain.where = vi.fn().mockResolvedValue([agent]);
          return chain;
        });
        mockTxClient.update.mockImplementation(() => {
          const chain: Record<string, any> = {};
          chain.set = vi.fn().mockReturnValue(chain);
          chain.where = vi.fn().mockReturnValue(chain);
          chain.returning = vi
            .fn()
            .mockResolvedValue([makeAgent({ nodes, version: 2 })]);
          return chain;
        });

        await expect(
          service.applyCanvasSnapshot(
            'agent-1',
            {
              canvasNodes: [],
              canvasEdges: [],
              publishAfterSave: true,
            },
            'user-1',
          ),
        ).rejects.toThrow(AgentPublishValidationException);
        expect(mockTxClient.insert).not.toHaveBeenCalled();
      },
    );

    it('saveCanvas 的 update 事务错误应原样传播', async () => {
      const updateError = new Error('canvas persistence failed');
      mockTxClient.select.mockImplementation(() => {
        const chain: Record<string, any> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockResolvedValue([makeAgent()]);
        return chain;
      });
      mockTxClient.update.mockImplementation(() => {
        const chain: Record<string, any> = {};
        chain.set = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockReturnValue(chain);
        chain.returning = vi.fn().mockRejectedValue(updateError);
        return chain;
      });

      await expect(
        service.saveCanvas(
          'agent-1',
          { canvasNodes: [], canvasEdges: [] },
          'user-1',
        ),
      ).rejects.toBe(updateError);
    });
  });

  describe('版本与发布分支补充', () => {
    it('createVersion 应规范空 label/releaseNotes、从空 maxVersion 创建 v1', async () => {
      const agent = makeAgent({ metadata: null, edges: null });
      let selectCount = 0;
      mockTxClient.select.mockImplementation(() => {
        selectCount += 1;
        const chain: Record<string, any> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi
          .fn()
          .mockResolvedValue(selectCount === 1 ? [agent] : []);
        return chain;
      });
      let inserted: Record<string, any> | undefined;
      mockTxClient.insert.mockImplementation(() => {
        const chain: Record<string, any> = {};
        chain.values = vi.fn((value: Record<string, any>) => {
          inserted = value;
          return chain;
        });
        chain.returning = vi.fn().mockResolvedValue([
          makeVersion({
            label: 'v1',
            snapshot: {
              runtimeMode: 'sandbox',
              nodes: agent.nodes,
              edges: null,
              viewport: null,
              systemPrompt: null,
              sandboxConfig: null,
              workspaceSnapshotId: null,
              metadata: {
                nodeCount: 1,
                edgeCount: 0,
                createdFromVersion: 1,
              },
            },
          }),
        ]);
        return chain;
      });

      const result = await service.createVersion(
        'agent-1',
        makeCreateAgentVersionDto({ label: ' ', releaseNotes: '  ' }),
        'user-1',
      );

      expect(inserted).toMatchObject({
        versionNumber: 1,
        label: 'v1',
      });
      expect(inserted?.snapshot.metadata).toMatchObject({
        nodeCount: 1,
        edgeCount: 0,
        createdFromVersion: 1,
        releaseNotes: undefined,
      });
      expect(result.snapshot.runtimeMode).toBe('sandbox');
    });

    it('listVersions 应序列化日期、迁移 legacy prompt 并保留冻结的 no_sandbox 快照', async () => {
      const version = makeVersion({
        publishedAt: new Date('2025-02-03T04:05:06.000Z'),
        archivedAt: new Date('2025-03-04T05:06:07.000Z'),
        snapshot: {
          runtimeMode: 'no_sandbox',
          nodes: [
            {
              id: 'main',
              type: 'agent',
              position: { x: 320, y: 320 },
              data: { nodeType: 'agent-main' },
            },
          ],
          edges: [],
          viewport: null,
          systemPrompt: 'legacy',
          sandboxConfig: { cpu: 8 },
          metadata: {
            nodeCount: 1,
            edgeCount: 0,
            createdFromVersion: 1,
          },
        },
      });
      const rowsChain: Record<string, any> = {};
      rowsChain.from = vi.fn().mockReturnValue(rowsChain);
      rowsChain.where = vi.fn().mockReturnValue(rowsChain);
      rowsChain.orderBy = vi.fn().mockReturnValue(rowsChain);
      rowsChain.limit = vi.fn().mockReturnValue(rowsChain);
      rowsChain.offset = vi.fn().mockResolvedValue([version]);
      const countChain: Record<string, any> = {};
      countChain.from = vi.fn().mockReturnValue(countChain);
      countChain.where = vi.fn().mockResolvedValue([{ total: 21 }]);
      mockTenantDb.select
        .mockReturnValueOnce(rowsChain)
        .mockReturnValueOnce(countChain);

      const result = await service.listVersions('agent-1', 2, 10);

      expect(result.meta).toEqual({
        total: 21,
        page: 2,
        pageSize: 10,
        totalPages: 3,
      });
      expect(result.data[0]).toMatchObject({
        publishedAt: '2025-02-03T04:05:06.000Z',
        archivedAt: '2025-03-04T05:06:07.000Z',
        snapshot: {
          runtimeMode: 'no_sandbox',
          systemPrompt: null,
          sandboxConfig: { cpu: 8 },
        },
      });
      expect(result.data[0]?.snapshot.nodes).toContainEqual(
        expect.objectContaining({ id: 'main__system-prompt' }),
      );
    });

    it('publish 指定不存在版本时应抛 AgentVersionNotFoundException', async () => {
      let selectCount = 0;
      mockTxClient.select.mockImplementation(() => {
        selectCount += 1;
        const chain: Record<string, any> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi
          .fn()
          .mockResolvedValue(selectCount === 1 ? [makeAgent()] : []);
        return chain;
      });
      mockTxClient.update.mockImplementation(() => {
        const chain: Record<string, any> = {};
        chain.set = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockResolvedValue(undefined);
        return chain;
      });

      await expect(
        service.publish(
          'agent-1',
          makePublishAgentDto({ versionId: 'missing-version' }),
          'user-1',
        ),
      ).rejects.toThrow(AgentVersionNotFoundException);
    });

    it('重新发布历史版本时空覆盖值应保留原 label 和 releaseNotes', async () => {
      const existing = makeVersion({
        id: 'version-old',
        label: 'Original',
        snapshot: {
          runtimeMode: 'sandbox',
          nodes: [{ id: 'node', type: 'text', data: { nodeType: 'text' } }],
          edges: [],
          viewport: null,
          systemPrompt: null,
          metadata: {
            nodeCount: 1,
            edgeCount: 0,
            createdFromVersion: 1,
            releaseNotes: 'Original notes',
          },
        },
      });
      let selectCount = 0;
      mockTxClient.select.mockImplementation(() => {
        selectCount += 1;
        const chain: Record<string, any> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi
          .fn()
          .mockResolvedValue(selectCount === 1 ? [makeAgent()] : [existing]);
        return chain;
      });
      const updates: Record<string, any>[] = [];
      let updateCount = 0;
      mockTxClient.update.mockImplementation(() => {
        updateCount += 1;
        const chain: Record<string, any> = {};
        chain.set = vi.fn((value: Record<string, any>) => {
          updates.push(value);
          return chain;
        });
        if (updateCount === 1) {
          chain.where = vi.fn().mockResolvedValue(undefined);
        } else {
          chain.where = vi.fn().mockReturnValue(chain);
          chain.returning = vi.fn().mockResolvedValue(
            updateCount === 2
              ? [{ ...existing, publishedAt: new Date() }]
              : [
                  makeAgent({
                    status: 'published',
                    publishedVersionId: existing.id,
                  }),
                ],
          );
        }
        return chain;
      });

      await service.publish(
        'agent-1',
        makePublishAgentDto({
          versionId: existing.id,
          label: ' ',
          releaseNotes: ' ',
        }),
        'publisher',
      );

      expect(updates[1]).toMatchObject({
        label: 'Original',
        snapshot: {
          metadata: {
            releaseNotes: 'Original notes',
          },
        },
      });
      expect(updates[2]).toMatchObject({
        status: 'published',
        publishedVersionId: existing.id,
        updatedBy: 'publisher',
      });
    });

    it('publish 的版本插入错误应原样传播且不更新 definition', async () => {
      const insertError = new Error('version insert failed');
      let selectCount = 0;
      mockTxClient.select.mockImplementation(() => {
        selectCount += 1;
        const chain: Record<string, any> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi
          .fn()
          .mockResolvedValue(
            selectCount === 1 ? [makeAgent()] : [{ maxVersion: null }],
          );
        return chain;
      });
      let updateCount = 0;
      mockTxClient.update.mockImplementation(() => {
        updateCount += 1;
        const chain: Record<string, any> = {};
        chain.set = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockResolvedValue(undefined);
        return chain;
      });
      mockTxClient.insert.mockImplementation(() => {
        const chain: Record<string, any> = {};
        chain.values = vi.fn().mockReturnValue(chain);
        chain.returning = vi.fn().mockRejectedValue(insertError);
        return chain;
      });

      await expect(
        service.publish('agent-1', makePublishAgentDto(), 'user-1'),
      ).rejects.toBe(insertError);
      expect(updateCount).toBe(1);
    });
  });

  describe('可选配置、输入迁移与错误分支契约', () => {
    it('findAll 遇到未知排序字段时应回退 updatedAt 并返回稳定分页结果', async () => {
      const row = makeAgent({ id: 'fallback-sort-agent' });
      const rowsChain: Record<string, any> = {};
      rowsChain.from = vi.fn().mockReturnValue(rowsChain);
      rowsChain.where = vi.fn().mockReturnValue(rowsChain);
      rowsChain.orderBy = vi.fn().mockReturnValue(rowsChain);
      rowsChain.limit = vi.fn().mockReturnValue(rowsChain);
      rowsChain.offset = vi.fn().mockResolvedValue([row]);
      const countChain: Record<string, any> = {};
      countChain.from = vi.fn().mockReturnValue(countChain);
      countChain.where = vi.fn().mockResolvedValue([{ total: 1 }]);
      mockTenantDb.select
        .mockReturnValueOnce(rowsChain)
        .mockReturnValueOnce(countChain);

      const result = await service.findAll(
        makeListAgentDefinitionsQueryDto({
          sort: 'removed-column' as ListAgentDefinitionsQueryDto['sort'],
        }),
      );

      expect(result).toMatchObject({
        data: [{ id: 'fallback-sort-agent' }],
        meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
      });
    });
    it.each([
      {
        field: 'authConfig',
        value: { header: 'Authorization', scheme: 'Bearer' },
      },
      {
        field: 'auth_config',
        value: { queryParam: 'api_key' },
      },
    ])('llm-model 应保留 $field 对象认证配置', ({ field, value }) => {
      const config = service.buildRuntimeConfigFromNodes(
        [
          {
            id: `model-${field}`,
            type: 'llm-model',
            data: {
              llmConfigId: 'config-1',
              provider: 'custom',
              [field]: value,
            },
          },
        ],
        [],
      );

      expect(config.modelConfig).toMatchObject({
        modelId: 'config-1',
        provider: 'custom',
        authConfig: value,
      });
    });

    it('工具缺少可选执行字段时应保留有效判别字段且不伪造默认值', () => {
      const config = service.buildRuntimeConfigFromNodes(
        [
          {
            id: 'http-sparse',
            type: 'http-tool',
            data: { url: 'https://example.test/ping' },
          },
          {
            id: 'code-sparse',
            type: 'code-tool',
            data: { language: 'python' },
          },
        ],
        [],
      );

      expect(config.tools).toEqual([
        expect.objectContaining({
          toolId: 'http-sparse',
          toolType: 'http',
          url: 'https://example.test/ping',
        }),
        expect.objectContaining({
          toolId: 'code-sparse',
          toolType: 'code',
          language: 'python',
        }),
      ]);
      expect(config.tools?.[0]).not.toHaveProperty('method');
      expect(config.tools?.[1]).not.toHaveProperty('code');
      expect(config.tools?.[1]).not.toHaveProperty('timeout');
    });

    it('input-preprocessor 应区分直接、嵌套与纯内联配置并遵守优先级', () => {
      const config = service.buildRuntimeConfigFromNodes(
        [
          {
            id: 'direct',
            type: 'input-preprocessor',
            data: {
              type: 'direct',
              preprocessorConfig: { source: 'direct' },
              config: { source: 'ignored' },
              expression: 'ignored-inline',
            },
          },
          {
            id: 'nested-config',
            type: 'input-preprocessor',
            data: {
              type: 'nested',
              config: {
                config: {
                  config: { expression: 'input.value' },
                  outputFormat: 'json',
                },
              },
            },
          },
          {
            id: 'nested-preprocessor',
            type: 'input-preprocessor',
            data: {
              type: 'nested-alias',
              config: {
                preprocessorConfig: { template: '{{input}}' },
              },
            },
          },
          {
            id: 'inline',
            type: 'input-preprocessor',
            data: {
              type: 'inline',
              expression: 'input.trim()',
              label: 'not runtime config',
              icon: 'also excluded',
            },
          },
        ],
        [],
      );

      expect(config.inputPreprocessors).toEqual([
        { type: 'direct', config: { source: 'direct' } },
        {
          type: 'nested',
          config: { expression: 'input.value', outputFormat: 'json' },
        },
        {
          type: 'nested-alias',
          config: { template: '{{input}}' },
        },
        {
          type: 'inline',
          config: { type: 'inline', expression: 'input.trim()' },
        },
      ]);
    });

    it('smart-routing 无显式顺序时应按端口序号排序、去重并追加非标准端口', () => {
      const nodes = [
        { id: 'main', type: 'agent-main', data: {} },
        {
          id: 'router',
          type: 'smart-routing',
          data: { strategy: 'COST_FIRST' },
        },
        {
          id: 'model-two',
          type: 'llm-model',
          data: { modelId: 'model-2' },
        },
        {
          id: 'model-ten',
          type: 'llm-model',
          data: { modelId: 'model-10' },
        },
        {
          id: 'model-custom',
          type: 'llm-model',
          data: { modelId: 'model-custom' },
        },
        {
          id: 'model-empty',
          type: 'llm-model',
          data: {},
        },
        { id: 'not-model', type: 'text', data: { text: 'ignored' } },
      ];
      const edges = [
        { source: 'router', target: 'main', targetHandle: 'model-in' },
        { source: 'model-ten', target: 'router', targetHandle: 'model-in-10' },
        { source: 'model-two', target: 'router', targetHandle: 'model-in-2' },
        { source: 'model-custom', target: 'router', targetHandle: 'custom' },
        { source: 'model-two', target: 'router', targetHandle: 'model-in-2' },
        { source: 'model-empty', target: 'router' },
        { source: 'not-model', target: 'router', targetHandle: 'model-in-1' },
        { source: 'missing', target: 'router', targetHandle: 'model-in-0' },
        null,
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, edges);

      expect(config.routingConfig).toEqual({
        strategy: 'COST_FIRST',
        candidateModelIds: ['model-2', 'model-10', 'model-custom'],
        fallbackModelId: undefined,
      });
    });

    it('仅配置旧 timeout 小时值时应保留小时并不派生秒字段', () => {
      const config = service.buildRuntimeConfigFromNodes(
        [
          {
            id: 'sandbox-hours',
            type: 'sandbox',
            data: {
              timeout: 3,
              timeoutSeconds: Number.NaN,
              cpuLimit: 2,
              memoryLimitMb: 2048,
              diskLimitGb: 8,
            },
          },
        ],
        [],
      );

      expect(config.sandboxConfig).toMatchObject({
        cpu: 2,
        memory: 2048,
        disk: 8,
        timeout: 3,
      });
      expect(config.sandboxConfig).not.toHaveProperty('timeoutSeconds');
    });

    it('listVersions 应迁移 legacy sub-agent 输入句柄并派生 sandbox 快照配置', async () => {
      const version = makeVersion({
        snapshot: {
          runtimeMode: 'sandbox',
          nodes: [
            {
              id: 'main',
              type: 'agent-main',
              position: { x: 0, y: 0 },
              data: {},
            },
            {
              id: 'sub',
              type: 'sub-agent',
              position: { x: 100, y: 0 },
              data: { agentDefinitionId: 'child-agent' },
            },
            {
              id: 'sandbox',
              type: 'sandbox',
              position: { x: 0, y: 100 },
              data: { cpu: 2, timeoutSeconds: 900 },
            },
          ],
          edges: [
            {
              id: 'legacy-text',
              source: 'main',
              target: 'sub',
              targetHandle: 'text-in',
            },
            {
              id: 'legacy-json',
              source: 'main',
              target: 'sub',
              targetHandle: 'json',
            },
            {
              id: 'sandbox-to-main',
              source: 'sandbox',
              target: 'main',
              targetHandle: 'sandbox-in',
            },
          ],
          viewport: null,
          systemPrompt: null,
          metadata: { nodeCount: 3, edgeCount: 2, createdFromVersion: 1 },
        },
      });
      const rowsChain: Record<string, any> = {};
      rowsChain.from = vi.fn().mockReturnValue(rowsChain);
      rowsChain.where = vi.fn().mockReturnValue(rowsChain);
      rowsChain.orderBy = vi.fn().mockReturnValue(rowsChain);
      rowsChain.limit = vi.fn().mockReturnValue(rowsChain);
      rowsChain.offset = vi.fn().mockResolvedValue([version]);
      const countChain: Record<string, any> = {};
      countChain.from = vi.fn().mockReturnValue(countChain);
      countChain.where = vi.fn().mockResolvedValue([{ total: 1 }]);
      mockTenantDb.select
        .mockReturnValueOnce(rowsChain)
        .mockReturnValueOnce(countChain);

      const result = await service.listVersions('agent-1');

      expect(result.data[0]?.snapshot.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'legacy-text',
            targetHandle: 'system-prompt-in',
          }),
          expect.objectContaining({
            id: 'legacy-json',
            targetHandle: 'schema-in',
          }),
        ]),
      );
      expect(result.data[0]?.snapshot.sandboxConfig).toMatchObject({
        cpu: 2,
        timeoutSeconds: 900,
      });
    });

    it('no_sandbox 创建版本时绑定 stdio MCP 应以发布校验错误拒绝', async () => {
      const agent = makeAgent({
        runtimeMode: 'no_sandbox',
        nodes: [
          {
            id: 'mcp-tool',
            type: 'mcp-tool',
            data: {
              mcpServerConfigId: 'stdio-config',
              toolName: 'local_tool',
            },
          },
        ],
        edges: [],
      });
      let selectCount = 0;
      mockTxClient.select.mockImplementation(() => {
        selectCount += 1;
        const chain: Record<string, any> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockResolvedValue(
          selectCount === 1
            ? [agent]
            : [
                {
                  id: 'stdio-config',
                  name: 'Local stdio',
                  transportType: 'stdio',
                },
              ],
        );
        return chain;
      });

      await expect(
        service.createVersion('agent-1', makeCreateAgentVersionDto(), 'user-1'),
      ).rejects.toMatchObject({
        type: 'https://agentloom.dev/errors/agent-publish-validation',
        detail:
          '无 sandbox Agent 只能绑定 HTTP MCP，以下 MCP server 使用了 stdio: Local stdio',
        errors: [
          {
            field: 'agent',
            message:
              '无 sandbox Agent 只能绑定 HTTP MCP，以下 MCP server 使用了 stdio: Local stdio',
          },
        ],
      });
      expect(mockTxClient.insert).not.toHaveBeenCalled();
    });

    it('archive 的版本归档写入失败时应传播错误且不更新 definition', async () => {
      const archiveError = new Error('version archive failed');
      mockTxClient.select.mockImplementation(() => {
        const chain: Record<string, any> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockResolvedValue([makeAgent()]);
        return chain;
      });
      let updateCount = 0;
      mockTxClient.update.mockImplementation(() => {
        updateCount += 1;
        const chain: Record<string, any> = {};
        chain.set = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockRejectedValue(archiveError);
        return chain;
      });

      await expect(service.archive('agent-1', 'user-1')).rejects.toBe(
        archiveError,
      );
      expect(updateCount).toBe(1);
    });
  });
});

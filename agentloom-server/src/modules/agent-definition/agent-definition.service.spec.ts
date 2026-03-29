import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentDefinitionService } from './agent-definition.service';
import {
  AgentNotFoundException,
  AgentArchivedException,
  AgentVersionConflictException,
  AgentPublishValidationException,
} from './agent-definition.exceptions';

const { mockTenantDb, mockDbExecute, mockTransactionStorage } = vi.hoisted(
  () => {
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
      mockDbExecute: vi.fn(),
      mockTransactionStorage: {
        getStore: vi.fn(),
      },
    };
  },
);

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
}));

vi.mock('../organization/slug.utils', () => ({
  generateSlug: vi.fn((name: string) =>
    name.toLowerCase().replace(/\s+/g, '-'),
  ),
  appendSlugSuffix: vi.fn((slug: string) => `${slug}-1`),
}));

vi.mock('./dto/agent-definition-response.dto', () => ({
  serializeAgentDefinition: vi.fn((row: Record<string, any>) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    version: row.version,
  })),
  serializeAgentDefinitionDetail: vi.fn((row: Record<string, any>) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    version: row.version,
    nodes: row.nodes ?? [],
    edges: row.edges ?? [],
    systemPrompt: row.systemPrompt ?? null,
    sandboxConfig: row.sandboxConfig ?? null,
  })),
}));

// 由于 drizzle-orm 操作符在 mock DB 中不会真正执行，直接 mock 避免导入问题
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((col: unknown) => col),
  desc: vi.fn((col: unknown) => col),
  eq: vi.fn((a: unknown, b: unknown) => [a, b]),
  ilike: vi.fn((a: unknown, b: unknown) => [a, b]),
  max: vi.fn((col: unknown) => col),
  or: vi.fn((...args: unknown[]) => args),
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

    const makeTxInsertChain = (result: unknown[]) => {
      const chain: Record<string, any> = {};
      chain.values = vi.fn().mockReturnValue(chain);
      chain.returning = vi.fn().mockResolvedValue(result);
      return chain;
    };

    const makeTxUpdateChain = (result: unknown[]) => {
      const chain: Record<string, any> = {};
      chain.set = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.returning = vi.fn().mockResolvedValue(result);
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

    service = new AgentDefinitionService(mockTenantDb as never);
  });

  // ─── create ───────────────────────────────────────────────
  describe('create', () => {
    it('应成功创建 Agent 并返回 detail', async () => {
      const created = makeAgent({ id: 'new-agent' });
      // mock tenantDb.insert chain
      const insertChain: Record<string, any> = {};
      insertChain.values = vi.fn().mockReturnValue(insertChain);
      insertChain.returning = vi.fn().mockResolvedValue([created]);
      mockTenantDb.insert.mockReturnValue(insertChain);

      const result = await service.create(
        { name: 'Test Agent', description: 'desc' },
        'user-1',
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('new-agent');
      expect(mockTenantDb.insert).toHaveBeenCalledTimes(1);
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
      mockTenantDb.insert.mockReturnValue(insertChain);

      const result = await service.create({ name: 'Test Agent' }, 'user-1');

      expect(result).toBeDefined();
      // insert 被调用 1 次（chain 复用），但 returning 被调用 2 次
      expect(insertChain.returning).toHaveBeenCalledTimes(2);
    });

    it('非唯一约束错误直接抛出', async () => {
      const otherError = new Error('connection error');
      const insertChain: Record<string, any> = {};
      insertChain.values = vi.fn().mockReturnValue(insertChain);
      insertChain.returning = vi.fn().mockRejectedValue(otherError);
      mockTenantDb.insert.mockReturnValue(insertChain);

      await expect(
        service.create({ name: 'Test Agent' }, 'user-1'),
      ).rejects.toThrow('connection error');
    });

    it('重试次数用尽后仍冲突应抛出原始错误', async () => {
      const uniqueViolation = Object.assign(new Error('unique violation'), {
        code: '23505',
      });
      const insertChain: Record<string, any> = {};
      insertChain.values = vi.fn().mockReturnValue(insertChain);
      insertChain.returning = vi.fn().mockRejectedValue(uniqueViolation);
      mockTenantDb.insert.mockReturnValue(insertChain);

      await expect(
        service.create({ name: 'Test Agent' }, 'user-1'),
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

      const result = await service.findAll({
        page: 1,
        pageSize: 20,
        sort: 'updatedAt',
        order: 'desc',
      });

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

      const result = await service.findAll({
        page: 1,
        pageSize: 10,
        status: 'draft',
        search: 'test',
        sort: 'name',
        order: 'asc',
      });

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

      const result = await service.findAll({
        page: 1,
        pageSize: 10,
        sort: 'updatedAt',
        order: 'desc',
      });

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
      });
      // metadata 应包含 inputSchema (via SQL jsonb_set)
      expect(capturedSetClause!.metadata).toBeDefined();
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
        { id: 'n9', type: 'unknown-type', data: {} }, // 未知类型应被忽略
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

    it('空节点数组返回空配置', () => {
      const config = service.buildRuntimeConfigFromNodes([], []);

      expect(config.modelConfig).toBeUndefined();
      expect(config.tools).toBeUndefined();
      expect(config.knowledgeBindings).toBeUndefined();
      expect(config.subAgents).toBeUndefined();
      expect(config.inputPreprocessors).toBeUndefined();
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
        expect.objectContaining({ type: 'jmespath', config: { foo: 'bar' } }),
      ]);
      expect(config.routingConfig).toEqual(
        expect.objectContaining({ strategy: 'QUALITY_FIRST' }),
      );
      expect(config.sandboxConfig).toEqual({
        cpu: 2,
        memory: 1024,
        disk: 1,
        timeout: 600,
        lifecycleMode: undefined,
        persistencePath: undefined,
        restoreWorkspaceId: undefined,
        persistenceExpiryHours: undefined,
      });
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
          timeout: 120,
          disk: 1,
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
            provider: 'private_cloud',
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
        provider: 'private_cloud',
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

    it('MCP 工具缺少关键字段时不应设置 toolType（退化为基础 binding）', () => {
      const nodes = [
        {
          id: 'mcp-3',
          type: 'mcp-tool',
          data: { mcpServerConfigId: 'cfg-only' },
        },
      ];

      const config = service.buildRuntimeConfigFromNodes(nodes, []);

      expect(config.tools).toHaveLength(1);
      const tool = config.tools![0] as any;
      expect(tool.toolType).toBeUndefined();
      expect(tool.mcpServerConfigId).toBe('cfg-only');
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
      expect(config.sandboxConfig!.timeout).toBe(300);
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
  describe('createVersion', () => {
    it('应成功创建版本并返回版本 DTO', async () => {
      const agent = makeAgent();
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

      mockTxClient.insert.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.values = vi.fn().mockReturnValue(c);
        c.returning = vi.fn().mockResolvedValue([version]);
        return c;
      });

      const result = await service.createVersion(
        'agent-1',
        { changelog: 'First version' },
        'user-1',
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('version-1');
      expect(result.versionNumber).toBe(1);
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
        { changelog: 'Snapshot metadata' },
        'user-1',
      );

      expect(capturedValues?.snapshot?.metadata).toMatchObject({
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
        service.createVersion('nonexistent', {}, 'user-1'),
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
        service.createVersion('agent-1', {}, 'user-1'),
      ).rejects.toThrow(AgentArchivedException);
    });

    it('changelog 超过 50 字符时 label 应截断', async () => {
      const agent = makeAgent();
      const longChangelog = 'A'.repeat(60);
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
        { changelog: longChangelog },
        'user-1',
      );

      expect(capturedValues).toBeDefined();
      expect(capturedValues!.label).toBe(`v1 - ${'A'.repeat(50)}`);
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

      mockTxClient.update.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.set = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockReturnValue(c);
        c.returning = vi.fn().mockResolvedValue([updated]);
        return c;
      });

      const result = await service.publish('agent-1', 'user-1');

      expect(result).toBeDefined();
    });

    it('Agent 不存在时应抛出 AgentNotFoundException', async () => {
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([]);
        return c;
      });

      await expect(service.publish('nonexistent', 'user-1')).rejects.toThrow(
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

      await expect(service.publish('agent-1', 'user-1')).rejects.toThrow(
        AgentArchivedException,
      );
    });

    it('画布无节点时应抛出 AgentPublishValidationException', async () => {
      const noNodes = makeAgent({ nodes: [] });
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([noNodes]);
        return c;
      });

      await expect(service.publish('agent-1', 'user-1')).rejects.toThrow(
        AgentPublishValidationException,
      );
    });

    it('画布 nodes 为 null 时应抛出 AgentPublishValidationException', async () => {
      const nullNodes = makeAgent({ nodes: null });
      mockTxClient.select.mockImplementation(() => {
        const c: Record<string, any> = {};
        c.from = vi.fn().mockReturnValue(c);
        c.where = vi.fn().mockResolvedValue([nullNodes]);
        return c;
      });

      await expect(service.publish('agent-1', 'user-1')).rejects.toThrow(
        AgentPublishValidationException,
      );
    });
  });
});

import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RedisCacheService } from '../../../common/redis/redis-cache.service';
import { DRIZZLE } from '../../../database/database.module';
import { TemplateService } from '../../template/template.service';
import { WorkflowVersionService } from '../workflow-version.service';
import {
  InvalidStatusTransitionException,
  WorkflowArchivedException,
  WorkflowNotFoundException,
  WorkflowPublishValidationException,
  WorkflowVersionNotFoundException,
} from '../workflow-version.exceptions';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const WORKFLOW_ID = '00000000-0000-0000-0000-000000000003';
const VERSION_ID = '00000000-0000-0000-0000-000000000004';
const VERSION_ID_2 = '00000000-0000-0000-0000-000000000005';
const NOW = new Date('2025-01-01T00:00:00Z');

const MOCK_NODES = [
  { id: 'node-1', type: 'test', position: { x: 0, y: 0 }, data: {} },
];
const MOCK_EDGES = [{ id: 'edge-1', source: 'node-1', target: 'node-2' }];
const MOCK_VIEWPORT = { x: 0, y: 0, zoom: 1 };

const MOCK_SNAPSHOT = {
  nodes: MOCK_NODES,
  edges: MOCK_EDGES,
  viewport: MOCK_VIEWPORT,
  metadata: { nodeCount: 1, edgeCount: 1, createdFromVersion: 1 },
};

function createDraftWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKFLOW_ID,
    tenantId: TENANT_ID,
    name: '测试工作流',
    slug: 'test-workflow',
    description: null,
    nodes: MOCK_NODES,
    edges: MOCK_EDGES,
    viewport: MOCK_VIEWPORT,
    version: 1,
    status: 'draft' as const,
    publishedVersionId: null,
    createdBy: USER_ID,
    updatedBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createMockVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: VERSION_ID,
    workflowDefinitionId: WORKFLOW_ID,
    tenantId: TENANT_ID,
    versionNumber: 1,
    label: null,
    snapshot: MOCK_SNAPSHOT,
    publishedAt: null,
    archivedAt: null,
    createdBy: USER_ID,
    createdAt: NOW,
    ...overrides,
  };
}

function createPortMappedWorkflow(sourceType: string, targetType: string) {
  return createDraftWorkflow({
    nodes: [
      {
        id: 'node-1',
        type: 'test',
        position: { x: 0, y: 0 },
        data: {
          portMappingMetadata: {
            outputs: [{ name: 'output-text', dataType: sourceType }],
          },
        },
      },
      {
        id: 'node-2',
        type: 'test',
        position: { x: 200, y: 0 },
        data: {
          portMappingMetadata: {
            inputs: [{ name: 'input-data', dataType: targetType }],
          },
        },
      },
    ],
    edges: [
      {
        id: 'edge-typed-1',
        source: 'node-1',
        target: 'node-2',
        sourceHandle: 'output-text',
        targetHandle: 'input-data',
      },
    ],
  });
}

function createSelectChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });
  return { from, where };
}

function createSelectChainWithPagination(result: unknown) {
  const offset = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, orderBy, limit, offset };
}

function createInsertChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });
  return { values, returning };
}

function createUpdateChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { set, where, returning };
}

/** update 不带 returning 的场景 */
function createUpdateChainVoid() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  return { set, where };
}

describe('WorkflowVersionService', () => {
  let service: WorkflowVersionService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let redis: Record<string, ReturnType<typeof vi.fn>>;
  let templateService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn(async (callback: (tx: typeof db) => unknown) =>
        callback(db),
      ),
    };

    redis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      delByPattern: vi.fn(),
    };

    templateService = {
      findBySlug: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowVersionService,
        { provide: DRIZZLE, useValue: db },
        { provide: RedisCacheService, useValue: redis },
        { provide: TemplateService, useValue: templateService },
      ],
    }).compile();

    service = module.get(WorkflowVersionService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('createVersion', () => {
    it('应当创建版本快照并返回 DTO', async () => {
      // findWorkflowOrThrow
      const selectWf = createSelectChain([createDraftWorkflow()]);
      // maxVersion
      const selectMax = createSelectChain([{ maxVersion: 2 }]);
      db.select.mockReturnValueOnce(selectWf).mockReturnValueOnce(selectMax);

      const insertChain = createInsertChain([
        createMockVersion({ versionNumber: 3 }),
      ]);
      db.insert.mockReturnValueOnce(insertChain);

      const result = await service.createVersion(
        WORKFLOW_ID,
        { label: '标签' },
        USER_ID,
      );

      expect(result.versionNumber).toBe(3);
      expect(result.workflowDefinitionId).toBe(WORKFLOW_ID);
      expect(db.insert).toHaveBeenCalledOnce();
      expect(db.execute).toHaveBeenCalledOnce();
      expect(db.transaction).toHaveBeenCalledOnce();
    });

    it('应当在无历史版本时从 1 开始编号', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectMax = createSelectChain([{ maxVersion: null }]);
      db.select.mockReturnValueOnce(selectWf).mockReturnValueOnce(selectMax);

      const version = createMockVersion({ versionNumber: 1 });
      const insertChain = createInsertChain([version]);
      db.insert.mockReturnValueOnce(insertChain);

      const result = await service.createVersion(WORKFLOW_ID, {}, USER_ID);

      expect(result.versionNumber).toBe(1);
    });

    it('工作流已归档时应当抛出 WorkflowArchivedException', async () => {
      const selectWf = createSelectChain([
        createDraftWorkflow({ status: 'archived' }),
      ]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.createVersion(WORKFLOW_ID, {}, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowArchivedException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('工作流不存在时应当抛出 WorkflowNotFoundException', async () => {
      const selectWf = createSelectChain([]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.createVersion(WORKFLOW_ID, {}, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowNotFoundException);
    });
  });

  describe('listVersions', () => {
    it('应当返回分页版本列表', async () => {
      // findWorkflowOrThrow
      const selectWf = createSelectChain([createDraftWorkflow()]);
      // versions (paginated)
      const selectVersions = createSelectChainWithPagination([
        createMockVersion({ versionNumber: 2 }),
        createMockVersion({ id: VERSION_ID_2, versionNumber: 1 }),
      ]);
      // count
      const selectCount = createSelectChain([{ count: 2 }]);

      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectVersions)
        .mockReturnValueOnce(selectCount);

      const result = await service.listVersions(WORKFLOW_ID, {
        page: 1,
        pageSize: 10,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(10);
      expect(result.meta.totalPages).toBe(1);
    });

    it('应当使用默认分页参数', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectVersions = createSelectChainWithPagination([]);
      const selectCount = createSelectChain([{ count: 0 }]);

      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectVersions)
        .mockReturnValueOnce(selectCount);

      const result = await service.listVersions(WORKFLOW_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(20);
      expect(result.meta.totalPages).toBe(0);
      expect(result.data).toHaveLength(0);
    });

    it('工作流不存在时应当抛出异常', async () => {
      const selectWf = createSelectChain([]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.listVersions(WORKFLOW_ID, { page: 1, pageSize: 20 }),
      ).rejects.toBeInstanceOf(WorkflowNotFoundException);
    });
  });

  describe('rollback', () => {
    it('应当回滚工作流到指定版本', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectVersion = createSelectChain([createMockVersion()]);
      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectVersion);

      const updateChain = createUpdateChainVoid();
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.rollback(WORKFLOW_ID, VERSION_ID, USER_ID);

      expect(result.id).toBe(VERSION_ID);
      expect(db.update).toHaveBeenCalledOnce();
    });

    it('工作流已归档时应当抛出 WorkflowArchivedException', async () => {
      const selectWf = createSelectChain([
        createDraftWorkflow({ status: 'archived' }),
      ]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.rollback(WORKFLOW_ID, VERSION_ID, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowArchivedException);

      expect(db.update).not.toHaveBeenCalled();
    });

    it('版本不存在时应当抛出 WorkflowVersionNotFoundException', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectVersion = createSelectChain([]);
      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectVersion);

      await expect(
        service.rollback(WORKFLOW_ID, VERSION_ID, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowVersionNotFoundException);
    });
  });

  describe('publish', () => {
    it('应当从当前快照创建新版本并发布', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectMax = createSelectChain([{ maxVersion: 1 }]);
      db.select.mockReturnValueOnce(selectWf).mockReturnValueOnce(selectMax);

      const publishedVersion = createMockVersion({
        versionNumber: 2,
        publishedAt: NOW,
      });
      const insertChain = createInsertChain([publishedVersion]);
      db.insert.mockReturnValueOnce(insertChain);

      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid());

      redis.del.mockResolvedValueOnce(undefined);

      const result = await service.publish(
        WORKFLOW_ID,
        { label: '发布版本' },
        USER_ID,
      );

      expect(result.data.versionNumber).toBe(2);
      expect(result.data.publishedAt).toBe(NOW.toISOString());
      expect(result.warnings).toEqual([]);
      expect(db.insert).toHaveBeenCalledOnce();
      expect(db.update).toHaveBeenCalledTimes(2);
      expect(redis.del).toHaveBeenCalledOnce();
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it('应当发布指定的已有版本', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectVersion = createSelectChain([createMockVersion()]);
      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectVersion);

      const updatedVersion = createMockVersion({ publishedAt: NOW });
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChain([updatedVersion]))
        .mockReturnValueOnce(createUpdateChainVoid());

      redis.del.mockResolvedValueOnce(undefined);

      const result = await service.publish(
        WORKFLOW_ID,
        { versionId: VERSION_ID },
        USER_ID,
      );

      expect(result.data.id).toBe(VERSION_ID);
      expect(result.data.publishedAt).toBe(NOW.toISOString());
      expect(result.warnings).toEqual([]);
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).toHaveBeenCalledTimes(3);
    });

    it('工作流已归档时应当抛出 WorkflowArchivedException', async () => {
      const selectWf = createSelectChain([
        createDraftWorkflow({ status: 'archived' }),
      ]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.publish(WORKFLOW_ID, {}, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowArchivedException);
    });

    it('非 draft 状态时应当抛出 InvalidStatusTransitionException', async () => {
      const selectWf = createSelectChain([
        createDraftWorkflow({ status: 'published' }),
      ]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.publish(WORKFLOW_ID, {}, USER_ID),
      ).rejects.toBeInstanceOf(InvalidStatusTransitionException);
    });

    it('工作流无节点时应当抛出 WorkflowPublishValidationException', async () => {
      const selectWf = createSelectChain([createDraftWorkflow({ nodes: [] })]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.publish(WORKFLOW_ID, {}, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowPublishValidationException);
    });

    it('工作流 nodes 为 null 时应当抛出验证异常', async () => {
      const selectWf = createSelectChain([
        createDraftWorkflow({ nodes: null }),
      ]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.publish(WORKFLOW_ID, {}, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowPublishValidationException);
    });

    it('端口类型不兼容时应当返回发布 warnings', async () => {
      const workflow = createPortMappedWorkflow('text', 'image');
      const selectWf = createSelectChain([workflow]);
      const selectMax = createSelectChain([{ maxVersion: 1 }]);
      db.select.mockReturnValueOnce(selectWf).mockReturnValueOnce(selectMax);

      const publishedVersion = createMockVersion({
        versionNumber: 2,
        publishedAt: NOW,
      });
      db.insert.mockReturnValueOnce(createInsertChain([publishedVersion]));
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid());
      redis.del.mockResolvedValueOnce(undefined);

      const result = await service.publish(WORKFLOW_ID, {}, USER_ID);

      expect(result.warnings).toEqual([
        {
          code: 'PORT_TYPE_INCOMPATIBLE',
          sourceNodeId: 'node-1',
          targetNodeId: 'node-2',
          sourcePort: {
            name: 'output-text',
            dataType: 'text',
          },
          targetPort: {
            name: 'input-data',
            dataType: 'image',
          },
          message:
            '输出端口 "output-text" (text) 与输入端口 "input-data" (image) 类型不兼容',
        },
      ]);
    });

    it('端口类型一致时不应返回发布 warnings', async () => {
      const workflow = createPortMappedWorkflow('text', 'text');
      const selectWf = createSelectChain([workflow]);
      const selectMax = createSelectChain([{ maxVersion: 1 }]);
      db.select.mockReturnValueOnce(selectWf).mockReturnValueOnce(selectMax);

      const publishedVersion = createMockVersion({
        versionNumber: 2,
        publishedAt: NOW,
      });
      db.insert.mockReturnValueOnce(createInsertChain([publishedVersion]));
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid());
      redis.del.mockResolvedValueOnce(undefined);

      const result = await service.publish(WORKFLOW_ID, {}, USER_ID);

      expect(result.warnings).toEqual([]);
    });

    it('目标端口为 json 时不应返回发布 warnings', async () => {
      const workflow = createPortMappedWorkflow('model', 'json');
      const selectWf = createSelectChain([workflow]);
      const selectMax = createSelectChain([{ maxVersion: 1 }]);
      db.select.mockReturnValueOnce(selectWf).mockReturnValueOnce(selectMax);

      const publishedVersion = createMockVersion({
        versionNumber: 2,
        publishedAt: NOW,
      });
      db.insert.mockReturnValueOnce(createInsertChain([publishedVersion]));
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid());
      redis.del.mockResolvedValueOnce(undefined);

      const result = await service.publish(WORKFLOW_ID, {}, USER_ID);

      expect(result.warnings).toEqual([]);
    });
  });

  describe('archive', () => {
    it('应当归档 draft 状态的工作流', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      db.select.mockReturnValueOnce(selectWf);

      const updateVersionsChain = createUpdateChainVoid();
      const updateWfChain = createUpdateChainVoid();
      db.update
        .mockReturnValueOnce(updateVersionsChain)
        .mockReturnValueOnce(updateWfChain);

      redis.del.mockResolvedValueOnce(undefined);

      await service.archive(WORKFLOW_ID, USER_ID);

      expect(db.update).toHaveBeenCalledTimes(2);
      expect(redis.del).toHaveBeenCalledOnce();
    });

    it('应当归档 published 状态的工作流', async () => {
      const selectWf = createSelectChain([
        createDraftWorkflow({
          status: 'published',
          publishedVersionId: VERSION_ID,
        }),
      ]);
      db.select.mockReturnValueOnce(selectWf);

      const updateVersionsChain = createUpdateChainVoid();
      const updateWfChain = createUpdateChainVoid();
      db.update
        .mockReturnValueOnce(updateVersionsChain)
        .mockReturnValueOnce(updateWfChain);

      redis.del.mockResolvedValueOnce(undefined);

      await service.archive(WORKFLOW_ID, USER_ID);

      expect(db.update).toHaveBeenCalledTimes(2);
    });

    it('工作流已归档时应当抛出 WorkflowArchivedException', async () => {
      const selectWf = createSelectChain([
        createDraftWorkflow({ status: 'archived' }),
      ]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.archive(WORKFLOW_ID, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowArchivedException);

      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('getPublishedVersion', () => {
    it('缓存命中时应当返回缓存的版本', async () => {
      const cachedDto = {
        id: VERSION_ID,
        workflowDefinitionId: WORKFLOW_ID,
        versionNumber: 1,
        label: null,
        snapshot: MOCK_SNAPSHOT,
        publishedAt: NOW.toISOString(),
        archivedAt: null,
        createdBy: USER_ID,
        createdAt: NOW.toISOString(),
      };
      redis.get.mockResolvedValueOnce(JSON.stringify(cachedDto));

      const result = await service.getPublishedVersion(WORKFLOW_ID, TENANT_ID);

      expect(result).toEqual(cachedDto);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('空值标记命中时应当返回 null', async () => {
      redis.get.mockResolvedValueOnce('__NULL__');

      const result = await service.getPublishedVersion(WORKFLOW_ID, TENANT_ID);

      expect(result).toBeNull();
      expect(db.select).not.toHaveBeenCalled();
    });

    it('缓存未命中且无 publishedVersionId 时应当缓存空值标记并返回 null', async () => {
      redis.get.mockResolvedValueOnce(null);

      const selectWf = createSelectChain([
        createDraftWorkflow({ publishedVersionId: null }),
      ]);
      db.select.mockReturnValueOnce(selectWf);

      redis.set.mockResolvedValueOnce(undefined);

      const result = await service.getPublishedVersion(WORKFLOW_ID, TENANT_ID);

      expect(result).toBeNull();
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('wf:published:'),
        '__NULL__',
        60,
      );
    });

    it('缓存未命中时应当从数据库获取并缓存', async () => {
      redis.get.mockResolvedValueOnce(null);

      const workflow = createDraftWorkflow({ publishedVersionId: VERSION_ID });
      const selectWf = createSelectChain([workflow]);

      const version = createMockVersion({ publishedAt: NOW });
      const selectVersion = createSelectChain([version]);

      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectVersion);

      redis.set.mockResolvedValueOnce(undefined);

      const result = await service.getPublishedVersion(WORKFLOW_ID, TENANT_ID);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(VERSION_ID);
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('wf:published:'),
        expect.any(String),
        300,
      );
    });

    it('缓存未命中且版本记录不存在时应当缓存空值标记', async () => {
      redis.get.mockResolvedValueOnce(null);

      const workflow = createDraftWorkflow({ publishedVersionId: VERSION_ID });
      const selectWf = createSelectChain([workflow]);
      const selectVersion = createSelectChain([]);

      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectVersion);

      redis.set.mockResolvedValueOnce(undefined);

      const result = await service.getPublishedVersion(WORKFLOW_ID, TENANT_ID);

      expect(result).toBeNull();
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('wf:published:'),
        '__NULL__',
        60,
      );
    });
  });

  describe('状态转换矩阵', () => {
    describe('draft →', () => {
      it('draft → published：应当允许', async () => {
        const selectWf = createSelectChain([createDraftWorkflow()]);
        const selectMax = createSelectChain([{ maxVersion: 0 }]);
        db.select.mockReturnValueOnce(selectWf).mockReturnValueOnce(selectMax);

        const insertChain = createInsertChain([
          createMockVersion({ publishedAt: NOW }),
        ]);
        db.insert.mockReturnValueOnce(insertChain);

        db.update
          .mockReturnValueOnce(createUpdateChainVoid())
          .mockReturnValueOnce(createUpdateChainVoid());
        redis.del.mockResolvedValueOnce(undefined);

        await expect(
          service.publish(WORKFLOW_ID, {}, USER_ID),
        ).resolves.toBeDefined();
      });

      it('draft → archived：应当允许', async () => {
        const selectWf = createSelectChain([createDraftWorkflow()]);
        db.select.mockReturnValueOnce(selectWf);

        db.update
          .mockReturnValueOnce(createUpdateChainVoid())
          .mockReturnValueOnce(createUpdateChainVoid());
        redis.del.mockResolvedValueOnce(undefined);

        await expect(
          service.archive(WORKFLOW_ID, USER_ID),
        ).resolves.toBeUndefined();
      });
    });

    describe('published →', () => {
      it('published → published（再次发布）：应当拒绝', async () => {
        const selectWf = createSelectChain([
          createDraftWorkflow({ status: 'published' }),
        ]);
        db.select.mockReturnValueOnce(selectWf);

        await expect(
          service.publish(WORKFLOW_ID, {}, USER_ID),
        ).rejects.toBeInstanceOf(InvalidStatusTransitionException);
      });

      it('published → archived：应当允许', async () => {
        const selectWf = createSelectChain([
          createDraftWorkflow({ status: 'published' }),
        ]);
        db.select.mockReturnValueOnce(selectWf);

        db.update
          .mockReturnValueOnce(createUpdateChainVoid())
          .mockReturnValueOnce(createUpdateChainVoid());
        redis.del.mockResolvedValueOnce(undefined);

        await expect(
          service.archive(WORKFLOW_ID, USER_ID),
        ).resolves.toBeUndefined();
      });
    });

    describe('archived →', () => {
      it('archived → published：应当拒绝', async () => {
        const selectWf = createSelectChain([
          createDraftWorkflow({ status: 'archived' }),
        ]);
        db.select.mockReturnValueOnce(selectWf);

        await expect(
          service.publish(WORKFLOW_ID, {}, USER_ID),
        ).rejects.toBeInstanceOf(WorkflowArchivedException);
      });

      it('archived → archived：应当拒绝（幂等保护）', async () => {
        const selectWf = createSelectChain([
          createDraftWorkflow({ status: 'archived' }),
        ]);
        db.select.mockReturnValueOnce(selectWf);

        await expect(
          service.archive(WORKFLOW_ID, USER_ID),
        ).rejects.toBeInstanceOf(WorkflowArchivedException);
      });

      it('archived → createVersion：应当拒绝', async () => {
        const selectWf = createSelectChain([
          createDraftWorkflow({ status: 'archived' }),
        ]);
        db.select.mockReturnValueOnce(selectWf);

        await expect(
          service.createVersion(WORKFLOW_ID, {}, USER_ID),
        ).rejects.toBeInstanceOf(WorkflowArchivedException);
      });

      it('archived → rollback：应当拒绝', async () => {
        const selectWf = createSelectChain([
          createDraftWorkflow({ status: 'archived' }),
        ]);
        db.select.mockReturnValueOnce(selectWf);

        await expect(
          service.rollback(WORKFLOW_ID, VERSION_ID, USER_ID),
        ).rejects.toBeInstanceOf(WorkflowArchivedException);
      });
    });
  });

  describe('toResponseDto 映射', () => {
    it('应当将 Date 字段转换为 ISO 字符串', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectMax = createSelectChain([{ maxVersion: 0 }]);
      db.select.mockReturnValueOnce(selectWf).mockReturnValueOnce(selectMax);

      const version = createMockVersion({
        publishedAt: new Date('2025-06-01T12:00:00Z'),
        archivedAt: null,
      });
      const insertChain = createInsertChain([version]);
      db.insert.mockReturnValueOnce(insertChain);

      const result = await service.createVersion(WORKFLOW_ID, {}, USER_ID);

      expect(result.publishedAt).toBe('2025-06-01T12:00:00.000Z');
      expect(result.archivedAt).toBeNull();
      expect(result.createdAt).toBe(NOW.toISOString());
    });

    it('应当正确映射 label 字段（null 兜底）', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectMax = createSelectChain([{ maxVersion: 0 }]);
      db.select.mockReturnValueOnce(selectWf).mockReturnValueOnce(selectMax);

      const version = createMockVersion({ label: undefined });
      const insertChain = createInsertChain([version]);
      db.insert.mockReturnValueOnce(insertChain);

      const result = await service.createVersion(WORKFLOW_ID, {}, USER_ID);

      expect(result.label).toBeNull();
    });

    it('应当在事务内获取工作流级写锁', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectMax = createSelectChain([{ maxVersion: 0 }]);
      db.select.mockReturnValueOnce(selectWf).mockReturnValueOnce(selectMax);

      db.insert.mockReturnValueOnce(
        createInsertChain([createMockVersion({ versionNumber: 1 })]),
      );

      await service.createVersion(WORKFLOW_ID, {}, USER_ID);

      expect(db.transaction).toHaveBeenCalledOnce();
      expect(db.execute).toHaveBeenCalledOnce();
    });
  });

  describe('create', () => {
    const MOCK_DTO_BLANK = { name: '测试工作流' };
    const MOCK_DTO_WITH_TEMPLATE = {
      name: '模板副本',
      description: '从模板创建',
      template_slug: 'code-review-assistant',
    };
    const MOCK_TEMPLATE = {
      id: '00000000-0000-0000-0000-000000000099',
      name: '代码审查助手',
      slug: 'code-review-assistant',
      definition: {
        nodes: [
          { id: 'tmpl-node-1', type: 'agent', position: { x: 0, y: 0 }, data: {} },
          { id: 'tmpl-node-2', type: 'output', position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [
          {
            id: 'tmpl-edge-1',
            source: 'tmpl-node-1',
            target: 'tmpl-node-2',
            sourceHandle: 'tmpl-node-1-output',
            targetHandle: 'tmpl-node-2-input',
          },
        ],
        viewport: { x: 100, y: 100, zoom: 0.8 },
      },
    };

    const createInsertReturning = (result: unknown) => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([result]),
      }),
    });

    it('应创建空白工作流（无模板）', async () => {
      const mockResult = createDraftWorkflow({
        name: '测试工作流',
        slug: 'ce-shi-gong-zuo-liu',
        nodes: [],
        edges: [],
      });
      db.insert.mockReturnValue(createInsertReturning(mockResult));

      const result = await service.create(TENANT_ID, USER_ID, MOCK_DTO_BLANK);

      expect(result).toEqual(mockResult);
      expect(templateService.findBySlug).not.toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalledOnce();

      // 验证插入参数
      const insertCall = db.insert.mock.results[0].value;
      const valuesArg = insertCall.values.mock.calls[0][0];
      expect(valuesArg).toMatchObject({
        tenantId: TENANT_ID,
        name: '测试工作流',
        description: null,
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        metadata: {},
        createdBy: USER_ID,
        updatedBy: USER_ID,
      });
      expect(valuesArg.slug).toBeDefined();
    });

    it('应从模板克隆定义并设置元数据', async () => {
      templateService.findBySlug.mockResolvedValue(MOCK_TEMPLATE);

      const mockResult = createDraftWorkflow({
        name: '模板副本',
        slug: 'mo-ban-fu-ben',
        description: '从模板创建',
      });
      db.insert.mockReturnValue(createInsertReturning(mockResult));

      const result = await service.create(TENANT_ID, USER_ID, MOCK_DTO_WITH_TEMPLATE);

      expect(result).toEqual(mockResult);
      expect(templateService.findBySlug).toHaveBeenCalledWith('code-review-assistant');

      // 验证克隆后的节点 ID 已替换（不等于原始模板 ID）
      const valuesArg = db.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(valuesArg.nodes).toHaveLength(2);
      expect(valuesArg.nodes[0].id).not.toBe('tmpl-node-1');
      expect(valuesArg.nodes[1].id).not.toBe('tmpl-node-2');
      expect(valuesArg.edges).toHaveLength(1);
      expect(valuesArg.edges[0].source).toBe(valuesArg.nodes[0].id);
      expect(valuesArg.edges[0].target).toBe(valuesArg.nodes[1].id);
      expect(valuesArg.viewport).toEqual(MOCK_TEMPLATE.definition.viewport);

      // 验证元数据包含克隆信息
      expect(valuesArg.metadata).toMatchObject({
        cloned_from_template: {
          templateSlug: 'code-review-assistant',
          templateName: '代码审查助手',
        },
      });
      expect(valuesArg.metadata.cloned_from_template.clonedAt).toBeDefined();
      expect(valuesArg.description).toBe('从模板创建');
    });

    it('应在 slug 冲突时自动重试', async () => {
      const uniqueViolation = new Error('unique_violation');
      (uniqueViolation as Record<string, unknown>).code = '23505';

      const mockResult = createDraftWorkflow({ name: '测试工作流' });

      // 第一次插入抛唯一约束错误，第二次成功
      db.insert
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(uniqueViolation),
          }),
        })
        .mockReturnValueOnce(createInsertReturning(mockResult));

      const result = await service.create(TENANT_ID, USER_ID, MOCK_DTO_BLANK);

      expect(result).toEqual(mockResult);
      expect(db.insert).toHaveBeenCalledTimes(2);
    });

    it('应在达到最大重试次数后抛出原始错误', async () => {
      const uniqueViolation = new Error('unique_violation');
      (uniqueViolation as Record<string, unknown>).code = '23505';

      // 所有 4 次尝试（0..3）都抛唯一约束错误
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(uniqueViolation),
        }),
      });

      await expect(
        service.create(TENANT_ID, USER_ID, MOCK_DTO_BLANK),
      ).rejects.toThrow('unique_violation');

      expect(db.insert).toHaveBeenCalledTimes(4); // MAX_SLUG_RETRIES + 1
    });

    it('应在非唯一约束错误时直接抛出', async () => {
      const otherError = new Error('connection_refused');

      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(otherError),
        }),
      });

      await expect(
        service.create(TENANT_ID, USER_ID, MOCK_DTO_BLANK),
      ).rejects.toThrow('connection_refused');

      // 不应重试
      expect(db.insert).toHaveBeenCalledOnce();
    });
  });
});

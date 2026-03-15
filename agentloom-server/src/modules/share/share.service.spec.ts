import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TenantRequiredException } from '../../common/exceptions/auth.exceptions';
import { DomainException } from '../../common/exceptions/domain.exception';
import { DRIZZLE } from '../../database/database.module';
import { WorkflowNotFoundException } from '../workflow-definition/workflow-version.exceptions';
import {
  ShareExpiredException,
  ShareNotFoundException,
  ShareRevokedException,
  ShareWorkflowNotPublishedException,
} from './share.exceptions';
import {
  type AccessibleShareTokenRecord,
  ShareService,
  type ShareTokenRecord,
} from './share.service';

const mocks = vi.hoisted(() => ({
  randomBytes: vi.fn(),
  configService: {
    get: vi.fn(),
  },
}));

vi.mock('crypto', () => ({
  randomBytes: mocks.randomBytes,
}));

type MockFn = ReturnType<typeof vi.fn>;

interface MockDb {
  select: MockFn;
  insert: MockFn;
  update: MockFn;
}

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WORKFLOW_ID = '33333333-3333-4333-8333-333333333333';
const SHARE_ID = '44444444-4444-4444-8444-444444444444';
const VERSION_ID = '55555555-5555-4555-8555-555555555555';
const SHARE_TOKEN = 'ab'.repeat(32);
const NOW = new Date('2025-01-01T00:00:00.000Z');
const ORIGINAL_APP_FRONTEND_URL = process.env.APP_FRONTEND_URL;

function createShareRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: SHARE_ID,
    workflowDefinitionId: WORKFLOW_ID,
    shareType: 'read_only',
    shareToken: SHARE_TOKEN,
    expiresAt: null,
    isRevoked: false,
    viewCount: 0,
    copyCount: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function createShareTokenRecord(
  overrides: Partial<ShareTokenRecord> = {},
): ShareTokenRecord {
  return {
    id: SHARE_ID,
    workflowDefinitionId: WORKFLOW_ID,
    tenantId: TENANT_ID,
    shareToken: SHARE_TOKEN,
    shareType: 'read_only',
    createdBy: USER_ID,
    expiresAt: null,
    isRevoked: false,
    viewCount: 0,
    copyCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    workflowName: '测试工作流',
    workflowDescription: '用于 ShareService 单测',
    publishedVersionId: VERSION_ID,
    snapshot: {
      nodes: [
        {
          id: 'node-1',
          type: 'agent',
          position: { x: 10, y: 20 },
          data: { label: 'Agent 节点' },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'node-1',
          target: 'node-2',
        },
      ],
      viewport: { x: 1, y: 2, zoom: 1.5 },
      metadata: {
        nodeCount: 1,
        edgeCount: 1,
        createdFromVersion: 1,
      },
    },
    ...overrides,
  } as ShareTokenRecord;
}

function createAccessibleShareTokenRecord(
  overrides: Partial<AccessibleShareTokenRecord> = {},
): AccessibleShareTokenRecord {
  return createShareTokenRecord(overrides) as AccessibleShareTokenRecord;
}

function createSelectChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });
  return { from, where };
}

function createPaginatedSelectChain(result: unknown) {
  const offset = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, orderBy, limit, offset };
}

function createSelectChainWithJoins(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const leftJoin = vi.fn().mockReturnValue({ where });
  const innerJoin = vi.fn().mockReturnValue({ leftJoin });
  const from = vi.fn().mockReturnValue({ innerJoin });
  return { from, innerJoin, leftJoin, where };
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

function createUpdateWhereChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const set = vi.fn().mockReturnValue({ where });
  return { set, where };
}

describe('ShareService', () => {
  let module: TestingModule;
  let service: ShareService;
  let db: MockDb;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    delete process.env.APP_FRONTEND_URL;

    mocks.randomBytes.mockReturnValue(Buffer.from(SHARE_TOKEN, 'hex'));
    mocks.configService.get.mockReturnValue('https://studio.agentloom.dev/');

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    };

    module = await Test.createTestingModule({
      providers: [
        ShareService,
        { provide: DRIZZLE, useValue: db },
        { provide: ConfigService, useValue: mocks.configService },
      ],
    }).compile();

    service = module.get(ShareService);
  });

  afterEach(async () => {
    await module.close();
    vi.useRealTimers();

    if (ORIGINAL_APP_FRONTEND_URL === undefined) {
      delete process.env.APP_FRONTEND_URL;
    } else {
      process.env.APP_FRONTEND_URL = ORIGINAL_APP_FRONTEND_URL;
    }
  });

  describe('createShare', () => {
    it('应校验工作流已发布、生成 token、插入 share 并构造分享 URL', async () => {
      const workflowSelectChain = createSelectChain([
        { id: WORKFLOW_ID, publishedVersionId: VERSION_ID },
      ]);
      const createdShare = createShareRecord({
        shareType: 'copyable',
        expiresAt: new Date('2025-02-01T00:00:00.000Z'),
      });
      const insertChain = createInsertChain([createdShare]);

      db.select.mockReturnValueOnce(workflowSelectChain);
      db.insert.mockReturnValueOnce(insertChain);

      const result = await service.createShare(TENANT_ID, USER_ID, {
        workflow_definition_id: WORKFLOW_ID,
        share_type: 'copyable',
        expires_at: '2025-02-01T00:00:00.000Z',
      });

      expect(mocks.randomBytes).toHaveBeenCalledWith(32);
      expect(insertChain.values).toHaveBeenCalledWith({
        workflowDefinitionId: WORKFLOW_ID,
        tenantId: TENANT_ID,
        shareToken: SHARE_TOKEN,
        shareType: 'copyable',
        createdBy: USER_ID,
        expiresAt: new Date('2025-02-01T00:00:00.000Z'),
      });
      expect(result).toEqual({
        ...createdShare,
        shareUrl: `https://studio.agentloom.dev/s/${SHARE_TOKEN}`,
      });
    });

    it('工作流不存在时应抛出 WorkflowNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.createShare(TENANT_ID, USER_ID, {
          workflow_definition_id: WORKFLOW_ID,
          share_type: 'read_only',
        }),
      ).rejects.toBeInstanceOf(WorkflowNotFoundException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('工作流未发布时应抛出 ShareWorkflowNotPublishedException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([{ id: WORKFLOW_ID, publishedVersionId: null }]),
      );

      await expect(
        service.createShare(TENANT_ID, USER_ID, {
          workflow_definition_id: WORKFLOW_ID,
          share_type: 'read_only',
        }),
      ).rejects.toBeInstanceOf(ShareWorkflowNotPublishedException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('缺少 tenantId 时应抛出 TenantRequiredException', async () => {
      await expect(
        service.createShare(undefined as unknown as string, USER_ID, {
          workflow_definition_id: WORKFLOW_ID,
          share_type: 'read_only',
        }),
      ).rejects.toBeInstanceOf(TenantRequiredException);

      expect(db.select).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('findSharesByWorkflow', () => {
    it('应按 tenant 和 workflow 过滤分页结果并使用环境变量回退构造分享 URL', async () => {
      mocks.configService.get.mockReturnValue(undefined);
      process.env.APP_FRONTEND_URL = 'https://env.agentloom.dev';

      const shares = [
        createShareRecord({ shareToken: '11'.repeat(32) }),
        createShareRecord({
          id: '00000000-0000-0000-0000-000000000010',
          shareToken: '22'.repeat(32),
        }),
      ];
      const listChain = createPaginatedSelectChain(shares);
      const countChain = createSelectChain([{ count: 7 }]);

      db.select
        .mockReturnValueOnce(listChain)
        .mockReturnValueOnce(countChain);

      const result = await service.findSharesByWorkflow(TENANT_ID, {
        page: 2,
        page_size: 2,
        workflow_definition_id: WORKFLOW_ID,
      });

      expect(listChain.limit).toHaveBeenCalledWith(2);
      expect(listChain.offset).toHaveBeenCalledWith(2);
      expect(result.meta).toEqual({
        page: 2,
        pageSize: 2,
        total: 7,
      });
      expect(result.data).toEqual([
        {
          ...shares[0],
          shareUrl: `https://env.agentloom.dev/s/${shares[0].shareToken}`,
        },
        {
          ...shares[1],
          shareUrl: `https://env.agentloom.dev/s/${shares[1].shareToken}`,
        },
      ]);
    });

    it('空结果时应返回空数组并把 total 回退为 0', async () => {
      db.select
        .mockReturnValueOnce(createPaginatedSelectChain([]))
        .mockReturnValueOnce(createSelectChain([]));

      const result = await service.findSharesByWorkflow(TENANT_ID, {
        page: 1,
        page_size: 20,
      });

      expect(result).toEqual({
        data: [],
        meta: {
          page: 1,
          pageSize: 20,
          total: 0,
        },
      });
    });

    it('缺少 tenantId 时应抛出 TenantRequiredException', async () => {
      await expect(
        service.findSharesByWorkflow(undefined as unknown as string, {
          page: 1,
          page_size: 20,
        }),
      ).rejects.toBeInstanceOf(TenantRequiredException);

      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe('revokeShare', () => {
    it('应把分享链接标记为已撤销', async () => {
      const updateChain = createUpdateChain([{ id: SHARE_ID }]);
      db.update.mockReturnValueOnce(updateChain);

      await expect(service.revokeShare(TENANT_ID, SHARE_ID)).resolves.toBeUndefined();

      expect(updateChain.set).toHaveBeenCalledWith({
        isRevoked: true,
        updatedAt: NOW,
      });
    });

    it('未找到分享链接时应抛出 ShareNotFoundException', async () => {
      db.update.mockReturnValueOnce(createUpdateChain([]));

      await expect(service.revokeShare(TENANT_ID, SHARE_ID)).rejects.toBeInstanceOf(
        ShareNotFoundException,
      );
    });
  });

  describe('getPublicShare', () => {
    it('应返回公开工作流定义并原子递增 viewCount', async () => {
      const share = createAccessibleShareTokenRecord();
      const selectChain = createSelectChainWithJoins([share]);
      const updateChain = createUpdateWhereChain(undefined);

      db.select.mockReturnValueOnce(selectChain);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.getPublicShare(SHARE_TOKEN);

      expect(selectChain.innerJoin).toHaveBeenCalledTimes(1);
      expect(selectChain.leftJoin).toHaveBeenCalledTimes(1);
      expect(updateChain.set).toHaveBeenCalledWith({
        viewCount: expect.any(Object),
        updatedAt: NOW,
      });
      expect(result).toEqual({
        workflowName: share.workflowName,
        workflowDescription: share.workflowDescription,
        shareType: share.shareType,
        definition: {
          nodes: share.snapshot.nodes,
          edges: share.snapshot.edges,
          viewport: share.snapshot.viewport,
        },
        createdAt: share.createdAt,
        expiresAt: share.expiresAt,
      });
    });

    it('snapshot 缺少 viewport 时应回退到默认视口', async () => {
      const baseSnapshot = createAccessibleShareTokenRecord().snapshot;
      const share = createAccessibleShareTokenRecord({
        snapshot: {
          ...baseSnapshot,
          viewport: null,
        },
      });

      db.select.mockReturnValueOnce(createSelectChainWithJoins([share]));
      db.update.mockReturnValueOnce(createUpdateWhereChain(undefined));

      const result = await service.getPublicShare(SHARE_TOKEN);

      expect(result.definition.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    it('分享链接不存在时应抛出 ShareNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithJoins([]));

      await expect(service.getPublicShare(SHARE_TOKEN)).rejects.toBeInstanceOf(
        ShareNotFoundException,
      );

      expect(db.update).not.toHaveBeenCalled();
    });

    it('已撤销的分享链接应抛出 ShareRevokedException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithJoins([
          createShareTokenRecord({ isRevoked: true }),
        ]),
      );

      await expect(service.getPublicShare(SHARE_TOKEN)).rejects.toBeInstanceOf(
        ShareRevokedException,
      );
    });

    it('过期的分享链接应抛出 ShareExpiredException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithJoins([
          createShareTokenRecord({ expiresAt: new Date(NOW) }),
        ]),
      );

      await expect(service.getPublicShare(SHARE_TOKEN)).rejects.toBeInstanceOf(
        ShareExpiredException,
      );
    });

    it('已发布版本缺失时应抛出 ShareWorkflowNotPublishedException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithJoins([
          createShareTokenRecord({ publishedVersionId: null }),
        ]),
      );

      await expect(service.getPublicShare(SHARE_TOKEN)).rejects.toBeInstanceOf(
        ShareWorkflowNotPublishedException,
      );
    });

    it('snapshot 缺失时应抛出 ShareWorkflowNotPublishedException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithJoins([
          createShareTokenRecord({ snapshot: null }),
        ]),
      );

      await expect(service.getPublicShare(SHARE_TOKEN)).rejects.toBeInstanceOf(
        ShareWorkflowNotPublishedException,
      );
    });
  });

  describe('incrementCopyCount', () => {
    it('copyable 分享链接应递增 copyCount 并返回更新后的响应', async () => {
      const share = createShareTokenRecord({ shareType: 'copyable' });
      const updatedShare = createShareRecord({
        shareType: 'copyable',
        copyCount: 3,
      });

      db.select.mockReturnValueOnce(createSelectChainWithJoins([share]));
      db.update.mockReturnValueOnce(createUpdateChain([updatedShare]));

      const result = await service.incrementCopyCount(SHARE_TOKEN);

      expect(result).toEqual({
        ...updatedShare,
        shareUrl: `https://studio.agentloom.dev/s/${SHARE_TOKEN}`,
      });
    });

    it('更新无返回记录时应回退到已加载的 share 数据，并使用默认 localhost URL', async () => {
      mocks.configService.get.mockReturnValue(undefined);
      const share = createShareTokenRecord({ shareType: 'copyable' });

      db.select.mockReturnValueOnce(createSelectChainWithJoins([share]));
      db.update.mockReturnValueOnce(createUpdateChain([]));

      const result = await service.incrementCopyCount(SHARE_TOKEN);

      expect(result).toEqual({
        id: share.id,
        workflowDefinitionId: share.workflowDefinitionId,
        shareType: share.shareType,
        shareToken: share.shareToken,
        expiresAt: share.expiresAt,
        isRevoked: share.isRevoked,
        viewCount: share.viewCount,
        copyCount: share.copyCount,
        createdAt: share.createdAt,
        shareUrl: `http://localhost:5173/s/${SHARE_TOKEN}`,
      });
    });

    it('只读分享链接不支持 copyCount 递增', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithJoins([
          createShareTokenRecord({ shareType: 'read_only' }),
        ]),
      );

      try {
        await service.incrementCopyCount(SHARE_TOKEN);
        throw new Error('Expected incrementCopyCount to throw');
      } catch (error) {
        const domainError = error as DomainException;
        expect(domainError).toBeInstanceOf(DomainException);
        expect(domainError.getStatus()).toBe(HttpStatus.CONFLICT);
        expect(domainError.type).toBe(
          'https://agentloom.dev/errors/share-copy-not-allowed',
        );
        expect(domainError.detail).toBe(`分享链接 ${SHARE_TOKEN} 不支持复制`);
      }

      expect(db.update).not.toHaveBeenCalled();
    });

    it('分享链接不存在时应抛出 ShareNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithJoins([]));

      await expect(service.incrementCopyCount(SHARE_TOKEN)).rejects.toBeInstanceOf(
        ShareNotFoundException,
      );
    });
  });

  describe('getShareByToken', () => {
    it('应通过 join 查询返回可访问的 share 记录', async () => {
      const share = createShareTokenRecord({
        expiresAt: new Date('2025-03-01T00:00:00.000Z'),
      });
      const selectChain = createSelectChainWithJoins([share]);
      db.select.mockReturnValueOnce(selectChain);

      const result = await service.getShareByToken(SHARE_TOKEN);

      expect(selectChain.from).toHaveBeenCalledTimes(1);
      expect(selectChain.innerJoin).toHaveBeenCalledTimes(1);
      expect(selectChain.leftJoin).toHaveBeenCalledTimes(1);
      expect(selectChain.where).toHaveBeenCalledTimes(1);
      expect(result).toEqual(share);
    });

    it('已撤销的 share token 应抛出 ShareRevokedException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithJoins([
          createShareTokenRecord({ isRevoked: true }),
        ]),
      );

      await expect(service.getShareByToken(SHARE_TOKEN)).rejects.toBeInstanceOf(
        ShareRevokedException,
      );
    });

    it('过期的 share token 应抛出 ShareExpiredException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithJoins([
          createShareTokenRecord({
            expiresAt: new Date('2024-12-31T23:59:59.000Z'),
          }),
        ]),
      );

      await expect(service.getShareByToken(SHARE_TOKEN)).rejects.toBeInstanceOf(
        ShareExpiredException,
      );
    });

    it('publishedVersionId 缺失时应抛出 ShareWorkflowNotPublishedException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithJoins([
          createShareTokenRecord({ publishedVersionId: null }),
        ]),
      );

      await expect(service.getShareByToken(SHARE_TOKEN)).rejects.toBeInstanceOf(
        ShareWorkflowNotPublishedException,
      );
    });

    it('snapshot 缺失时应抛出 ShareWorkflowNotPublishedException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithJoins([
          createShareTokenRecord({ snapshot: null }),
        ]),
      );

      await expect(service.getShareByToken(SHARE_TOKEN)).rejects.toBeInstanceOf(
        ShareWorkflowNotPublishedException,
      );
    });

    it('找不到 share token 时应抛出 ShareNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithJoins([]));

      await expect(service.getShareByToken(SHARE_TOKEN)).rejects.toBeInstanceOf(
        ShareNotFoundException,
      );
    });
  });
});

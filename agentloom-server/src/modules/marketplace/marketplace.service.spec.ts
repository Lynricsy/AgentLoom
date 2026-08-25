import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../database/database.module';
import type {
  MarketplaceListing,
  MarketplaceReviewResult,
} from '../../database/schema/marketplace-listings.schema';
import { PluginInactiveException } from '../plugin/plugin.exceptions';
import { PluginService } from '../plugin/plugin.service';
import { WorkflowVersionService } from '../workflow-definition/workflow-version.service';
import { SubmitMarketplaceListingDto } from './dto/marketplace.dto';
import {
  MarketplaceListingConflictException,
  MarketplaceListingNotFoundException,
  MarketplaceWorkflowVersionNotFoundException,
} from './marketplace.exceptions';
import { MarketplaceReviewService } from './marketplace-review.service';
import { MarketplaceService } from './marketplace.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const ORG_ID = '00000000-0000-0000-0000-000000000003';
const WORKFLOW_LISTING_ID = '00000000-0000-0000-0000-000000000004';
const VERSION_ID = '00000000-0000-0000-0000-000000000005';
const WORKFLOW_ID = '00000000-0000-0000-0000-000000000006';
const REVIEW_ID = '00000000-0000-0000-0000-000000000007';
const PLUGIN_DB_ID = '00000000-0000-0000-0000-000000000008';
const PLUGIN_LISTING_ID = '00000000-0000-0000-0000-000000000009';
const CREATED_PLUGIN_DB_ID = '00000000-0000-0000-0000-000000000010';
const PLUGIN_ID = 'com.agentloom.marketplace.plugin';
const NOW = new Date('2025-01-01T00:00:00.000Z');

function createReviewResult(
  overrides: Partial<MarketplaceReviewResult> = {},
): MarketplaceReviewResult {
  return {
    outcome: 'passed',
    checks: [],
    reviewedAt: NOW.toISOString(),
    ...overrides,
  };
}

function createMarketplaceListing(
  overrides: Partial<MarketplaceListing> = {},
): MarketplaceListing {
  return {
    id: WORKFLOW_LISTING_ID,
    workflowVersionId: VERSION_ID,
    pluginDbId: null,
    tenantId: TENANT_ID,
    title: `组织 ${ORG_ID.slice(-4)} 的测试上架工作流`,
    summary:
      `这是工作流 ${WORKFLOW_ID.slice(-4)} 的 Marketplace 摘要，` +
      '用���覆盖提交、上下架与查询状态机分支。',
    tags: ['analysis', `org-${ORG_ID.slice(-4)}`],
    coverImageUrl: `https://cdn.agentloom.dev/${ORG_ID}/cover.png`,
    category: 'analysis',
    listingType: 'workflow',
    pricingModel: 'free',
    pricePerExecution: null,
    useCount: 0,
    avgRating: null,
    reviewCount: 0,
    status: 'pending_review',
    reviewResult: null,
    submittedBy: USER_ID,
    submittedAt: NOW,
    publishedAt: null,
    unlistedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createSubmitDto(
  overrides: Partial<SubmitMarketplaceListingDto> = {},
): SubmitMarketplaceListingDto {
  return Object.assign(new SubmitMarketplaceListingDto(), {
    workflowVersionId: VERSION_ID,
    title: '高质量分析工作流',
    summary:
      '这是一个用于 marketplace 单元测试的工作流摘要，长度足够且用于验证状态机转换。',
    tags: ['analysis', 'automation'],
    coverImageUrl: `https://cdn.agentloom.dev/${ORG_ID}/submit-cover.png`,
    category: 'analysis',
    ...overrides,
  });
}

function createPublicWorkflowListingRow(
  overrides: Record<string, unknown> = {},
) {
  const snapshot = {
    nodes: [
      {
        id: 'public-node-1',
        type: 'agent',
        position: { x: 0, y: 0 },
        data: {},
      },
    ],
    edges: [],
    viewport: null,
    inputSchema: {
      version: 1,
      collectionMode: 'form',
      fields: [],
    },
    metadata: { nodeCount: 1, edgeCount: 0, createdFromVersion: 1 },
  };

  return {
    id: WORKFLOW_LISTING_ID,
    title: '公开工作流 listing',
    summary: '这是一个面向公开市场浏览的工作流 listing。',
    tags: ['analysis', 'marketplace'],
    coverImageUrl: 'https://cdn.agentloom.dev/public/workflow-cover.png',
    category: 'analysis' as const,
    useCount: 12,
    avgRating: '4.80',
    reviewCount: 6,
    publishedAt: NOW,
    listingType: 'workflow' as const,
    pricingModel: 'free' as const,
    pricePerExecution: null,
    pluginId: null,
    pluginName: null,
    pluginVersion: null,
    pluginAuthor: null,
    pluginDescription: null,
    pluginLicense: null,
    authorDisplayName: '公开工作流作者',
    snapshot,
    ...overrides,
  };
}

function createPublicPluginListingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PLUGIN_LISTING_ID,
    title: '公开插件 listing',
    summary: '这是一个面向公开市场浏览的插件 listing。',
    tags: ['plugin', 'automation'],
    coverImageUrl: 'https://cdn.agentloom.dev/public/plugin-cover.png',
    category: 'automation' as const,
    useCount: 8,
    avgRating: '4.20',
    reviewCount: 3,
    publishedAt: NOW,
    listingType: 'plugin' as const,
    pricingModel: 'per_execution' as const,
    pricePerExecution: '0.25000000',
    pluginId: PLUGIN_ID,
    pluginName: '公开插件',
    pluginVersion: '1.2.3',
    pluginAuthor: 'AgentLoom Team',
    pluginDescription: '这是一个公开插件描述。',
    pluginLicense: 'MIT',
    authorDisplayName: '公开插件作者',
    snapshot: null,
    ...overrides,
  };
}

function createPluginInstallSourceRow(overrides: Record<string, unknown> = {}) {
  return {
    listingId: PLUGIN_LISTING_ID,
    listingTitle: '公开插件 listing',
    pricingModel: 'per_execution' as const,
    pricePerExecution: '0.25000000',
    plugin: {
      id: PLUGIN_DB_ID,
      tenantId: TENANT_ID,
      orgId: ORG_ID,
      pluginId: PLUGIN_ID,
      name: '公开插件',
      version: '1.2.3',
      author: 'AgentLoom Team',
      description: '这是一个公开插件描述。',
      license: 'MIT',
      status: 'active',
    },
    ...overrides,
  };
}

function createReviewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REVIEW_ID,
    rating: 5,
    content: '非常好用',
    createdAt: NOW,
    authorDisplayName: '评论用户',
    ...overrides,
  };
}

function createSelectChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });
  return { from, where };
}

function createSelectChainWithDoubleLeftJoinPagination(result: unknown) {
  const offset = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const leftJoinSecond = vi.fn().mockReturnValue({ where });
  const leftJoinFirst = vi.fn().mockReturnValue({ leftJoin: leftJoinSecond });
  const from = vi.fn().mockReturnValue({ leftJoin: leftJoinFirst });
  return {
    from,
    leftJoinFirst,
    leftJoinSecond,
    where,
    orderBy,
    limit,
    offset,
  };
}

function createSelectChainWithTripleLeftJoinPagination(result: unknown) {
  const offset = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const leftJoinThird = vi.fn().mockReturnValue({ where });
  const leftJoinSecond = vi.fn().mockReturnValue({ leftJoin: leftJoinThird });
  const leftJoinFirst = vi.fn().mockReturnValue({ leftJoin: leftJoinSecond });
  const from = vi.fn().mockReturnValue({ leftJoin: leftJoinFirst });
  return {
    from,
    leftJoinFirst,
    leftJoinSecond,
    leftJoinThird,
    where,
    orderBy,
    limit,
    offset,
  };
}

function createSelectChainWithTripleLeftJoinWhere(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const leftJoinThird = vi.fn().mockReturnValue({ where });
  const leftJoinSecond = vi.fn().mockReturnValue({ leftJoin: leftJoinThird });
  const leftJoinFirst = vi.fn().mockReturnValue({ leftJoin: leftJoinSecond });
  const from = vi.fn().mockReturnValue({ leftJoin: leftJoinFirst });
  return {
    from,
    leftJoinFirst,
    leftJoinSecond,
    leftJoinThird,
    where,
  };
}

function createSelectChainWithInnerJoinWhereLimit(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin });
  return { from, innerJoin, where, limit };
}

function createSelectChainWithSingleLeftJoinOrdered(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin });
  return { from, leftJoin, where, orderBy, limit };
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

describe('MarketplaceService', () => {
  let service: MarketplaceService;
  let reviewService: { review: ReturnType<typeof vi.fn> };
  let workflowVersionService: { create: ReturnType<typeof vi.fn> };
  let pluginService: { cloneMarketplacePlugin: ReturnType<typeof vi.fn> };
  let db: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    reviewService = {
      review: vi.fn(),
    };

    workflowVersionService = {
      create: vi.fn(),
    };

    pluginService = {
      cloneMarketplacePlugin: vi.fn(),
    };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceService,
        { provide: DRIZZLE, useValue: db },
        { provide: MarketplaceReviewService, useValue: reviewService },
        { provide: WorkflowVersionService, useValue: workflowVersionService },
        { provide: PluginService, useValue: pluginService },
      ],
    }).compile();

    service = module.get(MarketplaceService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('submit', () => {
    it('首次提交时应创建 listing、执行审查并在通过后上架', async () => {
      const dto = createSubmitDto();
      const createdListing = createMarketplaceListing({
        status: 'pending_review',
        title: dto.title,
        summary: dto.summary,
        tags: dto.tags,
        coverImageUrl: dto.coverImageUrl,
      });
      const reviewResult = createReviewResult({ outcome: 'passed' });
      const updatedListing = createMarketplaceListing({
        status: 'listed',
        title: dto.title,
        summary: dto.summary,
        tags: dto.tags,
        coverImageUrl: dto.coverImageUrl,
        reviewResult,
        publishedAt: NOW,
      });

      db.select
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([{ id: VERSION_ID }]));
      db.insert.mockReturnValue(createInsertChain([createdListing]));
      db.update.mockReturnValue(createUpdateChain([updatedListing]));
      reviewService.review.mockResolvedValue(reviewResult);

      const result = await service.submit(TENANT_ID, USER_ID, dto);

      expect(reviewService.review).toHaveBeenCalledWith(TENANT_ID, VERSION_ID, {
        title: dto.title,
        summary: dto.summary,
        tags: dto.tags,
      });
      expect(result).toEqual({ listing: updatedListing, reviewResult });
    });

    it('已存在 review_failed listing 时应按新元数据重新提交', async () => {
      const dto = createSubmitDto({
        title: '重新提交后的标题',
        tags: ['refined', 'updated'],
      });
      const existingListing = createMarketplaceListing({
        status: 'review_failed',
      });
      const reviewResult = createReviewResult({ outcome: 'passed' });
      const updatePending = createUpdateWhereChain(undefined);
      const updatedListing = createMarketplaceListing({
        status: 'listed',
        title: dto.title,
        summary: dto.summary,
        tags: dto.tags,
        coverImageUrl: dto.coverImageUrl,
        submittedBy: USER_ID,
        submittedAt: NOW,
        updatedAt: NOW,
        reviewResult,
        publishedAt: NOW,
      });

      db.select
        .mockReturnValueOnce(createSelectChain([existingListing]))
        .mockReturnValueOnce(createSelectChain([{ id: VERSION_ID }]));
      db.update
        .mockReturnValueOnce(updatePending)
        .mockReturnValueOnce(createUpdateChain([updatedListing]));
      reviewService.review.mockResolvedValue(reviewResult);

      const result = await service.submit(TENANT_ID, USER_ID, dto);

      expect(updatePending.set).toHaveBeenCalledWith(
        expect.objectContaining({
          title: dto.title,
          summary: dto.summary,
          tags: dto.tags,
          coverImageUrl: dto.coverImageUrl,
          category: dto.category,
          status: 'pending_review',
          submittedBy: USER_ID,
          submittedAt: NOW,
          updatedAt: NOW,
        }),
      );
      expect(result).toEqual({ listing: updatedListing, reviewResult });
    });

    it('已上架 listing 再次提交时应抛出 409', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([createMarketplaceListing({ status: 'listed' })]),
      );

      await expect(
        service.submit(TENANT_ID, USER_ID, createSubmitDto()),
      ).rejects.toBeInstanceOf(MarketplaceListingConflictException);
    });

    it('工作流版本不存在时应抛出 404', async () => {
      db.select
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.submit(TENANT_ID, USER_ID, createSubmitDto()),
      ).rejects.toBeInstanceOf(MarketplaceWorkflowVersionNotFoundException);
    });
  });

  describe('unlist', () => {
    it('已上架 listing 应成功下架并写入 unlistedAt', async () => {
      const listedListing = createMarketplaceListing({
        status: 'listed',
        publishedAt: NOW,
      });
      const updatedListing = createMarketplaceListing({
        status: 'unlisted',
        publishedAt: NOW,
        unlistedAt: NOW,
      });

      db.select.mockReturnValue(createSelectChain([listedListing]));
      db.update.mockReturnValue(createUpdateChain([updatedListing]));

      const result = await service.unlist(
        TENANT_ID,
        WORKFLOW_LISTING_ID,
        USER_ID,
      );

      expect(result).toEqual(updatedListing);
    });

    it('插件 listing 应拒绝走通用下架路径', async () => {
      db.select.mockReturnValue(
        createSelectChain([
          createMarketplaceListing({
            status: 'listed',
            listingType: 'plugin',
          }),
        ]),
      );

      await expect(
        service.unlist(TENANT_ID, WORKFLOW_LISTING_ID, USER_ID),
      ).rejects.toBeInstanceOf(MarketplaceListingConflictException);
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('relist', () => {
    it('已下架 listing 在审查通过后应重新上架', async () => {
      const unlistedListing = createMarketplaceListing({
        status: 'unlisted',
        publishedAt: null,
        unlistedAt: NOW,
      });
      const reviewResult = createReviewResult({ outcome: 'passed' });
      const updatedListing = createMarketplaceListing({
        status: 'listed',
        reviewResult,
        publishedAt: NOW,
        unlistedAt: NOW,
      });

      db.select.mockReturnValue(createSelectChain([unlistedListing]));
      db.update
        .mockReturnValueOnce(createUpdateWhereChain(undefined))
        .mockReturnValueOnce(createUpdateChain([updatedListing]));
      reviewService.review.mockResolvedValue(reviewResult);

      const result = await service.relist(
        TENANT_ID,
        WORKFLOW_LISTING_ID,
        USER_ID,
      );

      expect(reviewService.review).toHaveBeenCalledWith(TENANT_ID, VERSION_ID, {
        title: unlistedListing.title,
        summary: unlistedListing.summary,
        tags: unlistedListing.tags,
      });
      expect(result).toEqual({ listing: updatedListing, reviewResult });
    });

    it('插件 listing 应拒绝走通用重新上架路径且不改状态', async () => {
      db.select.mockReturnValue(
        createSelectChain([
          createMarketplaceListing({
            status: 'unlisted',
            listingType: 'plugin',
          }),
        ]),
      );

      await expect(
        service.relist(TENANT_ID, WORKFLOW_LISTING_ID, USER_ID),
      ).rejects.toBeInstanceOf(MarketplaceListingConflictException);
      expect(db.update).not.toHaveBeenCalled();
      expect(reviewService.review).not.toHaveBeenCalled();
    });
  });

  describe('findMyListings', () => {
    it('应返回分页数据与 meta 信息', async () => {
      const reviewResult = createReviewResult({ outcome: 'passed' });
      const listItem = {
        id: WORKFLOW_LISTING_ID,
        workflowVersionId: VERSION_ID,
        pluginDbId: null,
        tenantId: TENANT_ID,
        title: '分页测试 listing',
        summary: '这是分页查询测试使用的摘要内容，确保返回结构完整。',
        tags: ['analysis'],
        coverImageUrl: null,
        category: 'analysis' as const,
        listingType: 'workflow' as const,
        pricingModel: 'free' as const,
        pricePerExecution: null,
        useCount: 0,
        avgRating: null,
        reviewCount: 0,
        status: 'listed' as const,
        reviewResult,
        submittedBy: USER_ID,
        submittedAt: NOW,
        publishedAt: NOW,
        unlistedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
        workflowDefinitionId: WORKFLOW_ID,
        workflowName: '市场分析工作流',
        versionNumber: 3,
        pluginId: null,
        pluginName: null,
        pluginVersion: null,
        pluginAuthor: null,
      };
      const selectData = createSelectChainWithTripleLeftJoinPagination([
        listItem,
      ]);
      const selectCount = createSelectChain([{ count: 21 }]);

      db.select
        .mockReturnValueOnce(selectData)
        .mockReturnValueOnce(selectCount);

      const result = await service.findMyListings(TENANT_ID, {
        page: 2,
        pageSize: 10,
        status: 'listed',
        listingType: 'workflow',
      });

      expect(result).toEqual({
        data: [listItem],
        meta: {
          total: 21,
          page: 2,
          pageSize: 10,
          totalPages: 3,
        },
      });
    });
  });

  describe('findById', () => {
    it('找到 listing 时应直接返回', async () => {
      const listing = createMarketplaceListing({ status: 'listed' });
      db.select.mockReturnValue(createSelectChain([listing]));

      await expect(
        service.findById(TENANT_ID, WORKFLOW_LISTING_ID),
      ).resolves.toEqual(listing);
    });

    it('listing 不存在时应抛出 404', async () => {
      db.select.mockReturnValue(createSelectChain([]));

      await expect(
        service.findById(TENANT_ID, WORKFLOW_LISTING_ID),
      ).rejects.toBeInstanceOf(MarketplaceListingNotFoundException);
    });
  });

  describe('findPublicListings', () => {
    it('应返回 workflow/plugin union 列表并映射作者与插件信息', async () => {
      const workflowRow = createPublicWorkflowListingRow();
      const pluginRow = createPublicPluginListingRow();
      const selectData = createSelectChainWithDoubleLeftJoinPagination([
        workflowRow,
        pluginRow,
      ]);
      const selectCount = createSelectChain([{ count: 2 }]);

      db.select
        .mockReturnValueOnce(selectData)
        .mockReturnValueOnce(selectCount);

      const result = await service.findPublicListings({
        search: '公开',
        sort: 'rating',
        page: 1,
        pageSize: 10,
      });

      expect(selectData.limit).toHaveBeenCalledWith(10);
      expect(selectData.offset).toHaveBeenCalledWith(0);
      expect(result).toEqual({
        data: [
          {
            id: WORKFLOW_LISTING_ID,
            title: workflowRow.title,
            summary: workflowRow.summary,
            tags: workflowRow.tags,
            coverImageUrl: workflowRow.coverImageUrl,
            category: workflowRow.category,
            useCount: workflowRow.useCount,
            avgRating: workflowRow.avgRating,
            reviewCount: workflowRow.reviewCount,
            publishedAt: workflowRow.publishedAt,
            listingType: 'workflow',
            pricingModel: 'free',
            pricePerExecution: null,
            plugin: null,
            author: { displayName: '公开工作流作者' },
          },
          {
            id: PLUGIN_LISTING_ID,
            title: pluginRow.title,
            summary: pluginRow.summary,
            tags: pluginRow.tags,
            coverImageUrl: pluginRow.coverImageUrl,
            category: pluginRow.category,
            useCount: pluginRow.useCount,
            avgRating: pluginRow.avgRating,
            reviewCount: pluginRow.reviewCount,
            publishedAt: pluginRow.publishedAt,
            listingType: 'plugin',
            pricingModel: 'per_execution',
            pricePerExecution: '0.25000000',
            plugin: {
              pluginId: PLUGIN_ID,
              name: '公开插件',
              version: '1.2.3',
              author: 'AgentLoom Team',
              description: '这是一个公开插件描述。',
              license: 'MIT',
            },
            author: { displayName: '公开插件作者' },
          },
        ],
        meta: {
          page: 1,
          pageSize: 10,
          total: 2,
          totalPages: 1,
        },
      });
    });
  });

  describe('findPublicById', () => {
    it('应返回 workflow 详情、规范化 viewport 与评论列表', async () => {
      const workflowRow = createPublicWorkflowListingRow();
      const reviewRow = createReviewRow();

      db.select
        .mockReturnValueOnce(
          createSelectChainWithTripleLeftJoinWhere([workflowRow]),
        )
        .mockReturnValueOnce(
          createSelectChainWithSingleLeftJoinOrdered([reviewRow]),
        );

      const result = await service.findPublicById(WORKFLOW_LISTING_ID);

      expect(result).toEqual({
        id: WORKFLOW_LISTING_ID,
        title: workflowRow.title,
        summary: workflowRow.summary,
        tags: workflowRow.tags,
        coverImageUrl: workflowRow.coverImageUrl,
        category: workflowRow.category,
        useCount: workflowRow.useCount,
        avgRating: workflowRow.avgRating,
        reviewCount: workflowRow.reviewCount,
        publishedAt: workflowRow.publishedAt,
        listingType: 'workflow',
        pricingModel: 'free',
        pricePerExecution: null,
        plugin: null,
        author: { displayName: '公开工作流作者' },
        definition: {
          nodes: workflowRow.snapshot.nodes,
          edges: workflowRow.snapshot.edges,
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        reviews: [
          {
            id: REVIEW_ID,
            rating: 5,
            content: '非常好用',
            createdAt: NOW,
            author: { displayName: '评论用户' },
          },
        ],
      });
    });

    it('应返回 plugin 详情而不暴露 workflow definition', async () => {
      const pluginRow = createPublicPluginListingRow();
      const reviewRow = createReviewRow({ rating: 4, content: '插件很稳定' });

      db.select
        .mockReturnValueOnce(
          createSelectChainWithTripleLeftJoinWhere([pluginRow]),
        )
        .mockReturnValueOnce(
          createSelectChainWithSingleLeftJoinOrdered([reviewRow]),
        );

      const result = await service.findPublicById(PLUGIN_LISTING_ID);

      expect(result).toEqual({
        id: PLUGIN_LISTING_ID,
        title: pluginRow.title,
        summary: pluginRow.summary,
        tags: pluginRow.tags,
        coverImageUrl: pluginRow.coverImageUrl,
        category: pluginRow.category,
        useCount: pluginRow.useCount,
        avgRating: pluginRow.avgRating,
        reviewCount: pluginRow.reviewCount,
        publishedAt: pluginRow.publishedAt,
        listingType: 'plugin',
        pricingModel: 'per_execution',
        pricePerExecution: '0.25000000',
        plugin: {
          pluginId: PLUGIN_ID,
          name: '公开插件',
          version: '1.2.3',
          author: 'AgentLoom Team',
          description: '这是一个公开插件描述。',
          license: 'MIT',
        },
        author: { displayName: '公开插件作者' },
        reviews: [
          {
            id: REVIEW_ID,
            rating: 4,
            content: '插件很稳定',
            createdAt: NOW,
            author: { displayName: '评论用户' },
          },
        ],
      });
    });
  });

  describe('installListing', () => {
    it('workflow listing 应创建工作流副本并递增 useCount', async () => {
      const workflowRow = createPublicWorkflowListingRow();
      const createdWorkflow = {
        id: WORKFLOW_ID,
        tenantId: TENANT_ID,
        name: workflowRow.title,
        slug: 'installed-workflow',
      };
      const updateChain = createUpdateWhereChain(undefined);

      db.select.mockReturnValueOnce(
        createSelectChainWithTripleLeftJoinWhere([workflowRow]),
      );
      db.update.mockReturnValueOnce(updateChain);
      workflowVersionService.create.mockResolvedValue(createdWorkflow);

      const result = await service.installListing(
        TENANT_ID,
        USER_ID,
        WORKFLOW_LISTING_ID,
        {},
      );

      expect(workflowVersionService.create).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        {
          name: workflowRow.title,
          description: workflowRow.summary,
          marketplace_listing_id: WORKFLOW_LISTING_ID,
        },
      );
      expect(pluginService.cloneMarketplacePlugin).not.toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ updatedAt: NOW }),
      );
      expect(result).toEqual({
        workflowDefinitionId: WORKFLOW_ID,
        name: workflowRow.title,
        message: 'Workflow installed successfully',
      });
    });

    it('plugin listing 应克隆插件副本并递增 useCount', async () => {
      const pluginRow = createPublicPluginListingRow();
      const pluginSourceRow = createPluginInstallSourceRow();
      const createdPlugin = {
        id: CREATED_PLUGIN_DB_ID,
        pluginId: PLUGIN_ID,
        name: 'Installed Plugin Copy',
      };
      const updateChain = createUpdateWhereChain(undefined);

      db.select
        .mockReturnValueOnce(
          createSelectChainWithTripleLeftJoinWhere([pluginRow]),
        )
        .mockReturnValueOnce(
          createSelectChainWithInnerJoinWhereLimit([pluginSourceRow]),
        );
      db.update.mockReturnValueOnce(updateChain);
      pluginService.cloneMarketplacePlugin.mockResolvedValue(createdPlugin);

      const result = await service.installListing(
        TENANT_ID,
        USER_ID,
        PLUGIN_LISTING_ID,
        {
          name: 'Installed Plugin Copy',
          description: '从公开市场安装的插件副本',
        },
      );

      expect(pluginService.cloneMarketplacePlugin).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        userId: USER_ID,
        source: pluginSourceRow,
        name: 'Installed Plugin Copy',
        description: '从公开市场安装的插件副本',
      });
      expect(workflowVersionService.create).not.toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ updatedAt: NOW }),
      );
      expect(result).toEqual({
        pluginDbId: CREATED_PLUGIN_DB_ID,
        pluginId: PLUGIN_ID,
        name: 'Installed Plugin Copy',
        message: 'Plugin installed successfully',
      });
    });

    it('源插件未激活时应拒绝安装 plugin listing', async () => {
      const pluginRow = createPublicPluginListingRow();
      const inactivePluginSourceRow = createPluginInstallSourceRow({
        plugin: {
          ...createPluginInstallSourceRow().plugin,
          status: 'disabled',
        },
      });

      db.select
        .mockReturnValueOnce(
          createSelectChainWithTripleLeftJoinWhere([pluginRow]),
        )
        .mockReturnValueOnce(
          createSelectChainWithInnerJoinWhereLimit([inactivePluginSourceRow]),
        );

      await expect(
        service.installListing(TENANT_ID, USER_ID, PLUGIN_LISTING_ID, {}),
      ).rejects.toBeInstanceOf(PluginInactiveException);

      expect(pluginService.cloneMarketplacePlugin).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });
  });
  describe('状态、筛选、定价与安装补充分支', () => {
    it('pending_review listing 禁止重复提交且不查询版本', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          createMarketplaceListing({ status: 'pending_review' }),
        ]),
      );

      await expect(
        service.submit(TENANT_ID, USER_ID, createSubmitDto()),
      ).rejects.toBeInstanceOf(MarketplaceListingConflictException);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(reviewService.review).not.toHaveBeenCalled();
    });

    it('首次审查失败转为 review_failed 并清空 publishedAt', async () => {
      const dto = createSubmitDto({
        coverImageUrl: undefined,
        category: undefined,
      });
      const created = createMarketplaceListing();
      const reviewResult = createReviewResult({ outcome: 'failed' });
      const failed = createMarketplaceListing({
        status: 'review_failed',
        reviewResult,
      });
      const insertChain = createInsertChain([created]);
      const updateChain = createUpdateChain([failed]);
      db.select
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([{ id: VERSION_ID }]));
      db.insert.mockReturnValue(insertChain);
      db.update.mockReturnValue(updateChain);
      reviewService.review.mockResolvedValue(reviewResult);

      const result = await service.submit(TENANT_ID, USER_ID, dto);

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ coverImageUrl: null, category: null }),
      );
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'review_failed',
          publishedAt: null,
        }),
      );
      expect(result).toEqual({ listing: failed, reviewResult });
    });

    it('重新提交审查失败时写回 review_failed 与 null publishedAt', async () => {
      const existing = createMarketplaceListing({ status: 'unlisted' });
      const reviewResult = createReviewResult({ outcome: 'failed' });
      const failed = createMarketplaceListing({
        status: 'review_failed',
        reviewResult,
      });
      const pendingUpdate = createUpdateWhereChain(undefined);
      const reviewedUpdate = createUpdateChain([failed]);
      db.select
        .mockReturnValueOnce(createSelectChain([existing]))
        .mockReturnValueOnce(createSelectChain([{ id: VERSION_ID }]));
      db.update
        .mockReturnValueOnce(pendingUpdate)
        .mockReturnValueOnce(reviewedUpdate);
      reviewService.review.mockResolvedValue(reviewResult);

      const result = await service.submit(
        TENANT_ID,
        USER_ID,
        createSubmitDto({ coverImageUrl: undefined, category: undefined }),
      );

      expect(pendingUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({ coverImageUrl: null, category: null }),
      );
      expect(reviewedUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'review_failed',
          publishedAt: null,
        }),
      );
      expect(result).toEqual({ listing: failed, reviewResult });
    });

    it('非 listed 状态禁止下架且不写数据库', async () => {
      db.select.mockReturnValue(
        createSelectChain([
          createMarketplaceListing({ status: 'review_failed' }),
        ]),
      );

      await expect(
        service.unlist(TENANT_ID, WORKFLOW_LISTING_ID, USER_ID),
      ).rejects.toBeInstanceOf(MarketplaceListingConflictException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('仅 unlisted 状态可 relist', async () => {
      db.select.mockReturnValue(
        createSelectChain([createMarketplaceListing({ status: 'listed' })]),
      );

      await expect(
        service.relist(TENANT_ID, WORKFLOW_LISTING_ID, USER_ID),
      ).rejects.toBeInstanceOf(MarketplaceListingConflictException);
      expect(reviewService.review).not.toHaveBeenCalled();
    });

    it('未绑定工作流版本的 unlisted listing 在进入审查前失败', async () => {
      const listing = createMarketplaceListing({
        status: 'unlisted',
        workflowVersionId: null,
      });
      const pendingUpdate = createUpdateWhereChain(undefined);
      db.select.mockReturnValue(createSelectChain([listing]));
      db.update.mockReturnValue(pendingUpdate);

      await expect(
        service.relist(TENANT_ID, WORKFLOW_LISTING_ID, USER_ID),
      ).rejects.toBeInstanceOf(MarketplaceListingConflictException);
      expect(pendingUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending_review' }),
      );
      expect(reviewService.review).not.toHaveBeenCalled();
    });

    it('relist 复审失败转为 review_failed 且 publishedAt 为空', async () => {
      const listing = createMarketplaceListing({ status: 'unlisted' });
      const reviewResult = createReviewResult({ outcome: 'failed' });
      const failed = createMarketplaceListing({
        status: 'review_failed',
        reviewResult,
      });
      const pendingUpdate = createUpdateWhereChain(undefined);
      const reviewedUpdate = createUpdateChain([failed]);
      db.select.mockReturnValue(createSelectChain([listing]));
      db.update
        .mockReturnValueOnce(pendingUpdate)
        .mockReturnValueOnce(reviewedUpdate);
      reviewService.review.mockResolvedValue(reviewResult);

      const result = await service.relist(
        TENANT_ID,
        WORKFLOW_LISTING_ID,
        USER_ID,
      );

      expect(reviewedUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'review_failed',
          publishedAt: null,
        }),
      );
      expect(result).toEqual({ listing: failed, reviewResult });
    });

    it('我的 listings 无筛选且空结果时 totalPages 为零', async () => {
      const dataQuery = createSelectChainWithTripleLeftJoinPagination([]);
      db.select
        .mockReturnValueOnce(dataQuery)
        .mockReturnValueOnce(createSelectChain([]));

      const result = await service.findMyListings(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result).toEqual({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      });
    });

    it.each(['newest', 'popular'] as const)(
      '公开列表支持 %s 排序、类型与分类筛选',
      async (sort) => {
        const dataQuery = createSelectChainWithDoubleLeftJoinPagination([]);
        db.select
          .mockReturnValueOnce(dataQuery)
          .mockReturnValueOnce(createSelectChain([{ count: 0 }]));

        const result = await service.findPublicListings({
          listingType: 'plugin',
          category: 'automation',
          sort,
          page: 1,
          pageSize: 5,
        });

        expect(dataQuery.orderBy).toHaveBeenCalled();
        expect(result.meta).toEqual({
          page: 1,
          pageSize: 5,
          total: 0,
          totalPages: 0,
        });
      },
    );

    it('公开列表为缺失作者与插件可选字段提供稳定回退', async () => {
      const pluginRow = createPublicPluginListingRow({
        pluginName: null,
        pluginVersion: null,
        pluginAuthor: null,
        pluginDescription: null,
        pluginLicense: null,
        authorDisplayName: null,
      });
      db.select
        .mockReturnValueOnce(
          createSelectChainWithDoubleLeftJoinPagination([pluginRow]),
        )
        .mockReturnValueOnce(createSelectChain([{ count: 1 }]));

      const result = await service.findPublicListings({});

      expect(result.data[0]).toMatchObject({
        plugin: {
          pluginId: PLUGIN_ID,
          name: PLUGIN_ID,
          version: '',
          author: '',
          description: null,
          license: null,
        },
        author: { displayName: '未知用户' },
      });
    });

    it('公开列表 pluginId 缺失时 descriptor 为 null', async () => {
      const pluginRow = createPublicPluginListingRow({ pluginId: null });
      db.select
        .mockReturnValueOnce(
          createSelectChainWithDoubleLeftJoinPagination([pluginRow]),
        )
        .mockReturnValueOnce(createSelectChain([{ count: 1 }]));

      const result = await service.findPublicListings({});

      expect(result.data[0].plugin).toBeNull();
    });

    it('plugin 详情缺少 pluginId 时按不可用 listing 处理', async () => {
      db.select
        .mockReturnValueOnce(
          createSelectChainWithTripleLeftJoinWhere([
            createPublicPluginListingRow({ pluginId: null }),
          ]),
        )
        .mockReturnValueOnce(createSelectChainWithSingleLeftJoinOrdered([]));

      await expect(
        service.findPublicById(PLUGIN_LISTING_ID),
      ).rejects.toBeInstanceOf(MarketplaceListingNotFoundException);
    });

    it('workflow 详情缺少 snapshot 时按不可用 listing 处理', async () => {
      db.select
        .mockReturnValueOnce(
          createSelectChainWithTripleLeftJoinWhere([
            createPublicWorkflowListingRow({ snapshot: null }),
          ]),
        )
        .mockReturnValueOnce(createSelectChainWithSingleLeftJoinOrdered([]));

      await expect(
        service.findPublicById(WORKFLOW_LISTING_ID),
      ).rejects.toBeInstanceOf(MarketplaceListingNotFoundException);
    });

    it('不存在或未 listed 的公开 listing 无法安装', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithTripleLeftJoinWhere([]),
      );

      await expect(
        service.installListing(TENANT_ID, USER_ID, WORKFLOW_LISTING_ID, {}),
      ).rejects.toBeInstanceOf(MarketplaceListingNotFoundException);
      expect(workflowVersionService.create).not.toHaveBeenCalled();
    });

    it('workflow 安装优先采用显式名称与描述', async () => {
      const workflowRow = createPublicWorkflowListingRow();
      const created = {
        id: WORKFLOW_ID,
        name: '自定义安装名称',
      };
      db.select.mockReturnValueOnce(
        createSelectChainWithTripleLeftJoinWhere([workflowRow]),
      );
      db.update.mockReturnValue(createUpdateWhereChain(undefined));
      workflowVersionService.create.mockResolvedValue(created);

      const result = await service.installListing(
        TENANT_ID,
        USER_ID,
        WORKFLOW_LISTING_ID,
        { name: '自定义安装名称', description: '自定义安装描述' },
      );

      expect(workflowVersionService.create).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        expect.objectContaining({
          name: '自定义安装名称',
          description: '自定义安装描述',
        }),
      );
      expect(result.name).toBe('自定义安装名称');
    });

    it('plugin listing 找不到有效安装源时不克隆也不记 useCount', async () => {
      db.select
        .mockReturnValueOnce(
          createSelectChainWithTripleLeftJoinWhere([
            createPublicPluginListingRow(),
          ]),
        )
        .mockReturnValueOnce(createSelectChainWithInnerJoinWhereLimit([]));

      await expect(
        service.installListing(TENANT_ID, USER_ID, PLUGIN_LISTING_ID, {}),
      ).rejects.toBeInstanceOf(MarketplaceListingNotFoundException);
      expect(pluginService.cloneMarketplacePlugin).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });
  });
});

import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../database/database.module';
import type {
  MarketplaceListing,
  MarketplaceReviewResult,
} from '../../database/schema/marketplace-listings.schema';
import { SubmitMarketplaceListingDto } from './dto/marketplace.dto';
import {
  MarketplaceListingConflictException,
  MarketplaceListingNotFoundException,
  MarketplaceWorkflowVersionNotFoundException,
} from './marketplace.exceptions';
import { MarketplaceReviewService } from './marketplace-review.service';
import { MarketplaceService } from './marketplace.service';
import { WorkflowVersionService } from '../workflow-definition/workflow-version.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const ORG_ID = '00000000-0000-0000-0000-000000000003';
const LISTING_ID = '00000000-0000-0000-0000-000000000004';
const VERSION_ID = '00000000-0000-0000-0000-000000000005';
const WORKFLOW_ID = '00000000-0000-0000-0000-000000000006';
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
    id: LISTING_ID,
    workflowVersionId: VERSION_ID,
    tenantId: TENANT_ID,
    title: `组织 ${ORG_ID.slice(-4)} 的测试上架工作流`,
    summary:
      `这是工作流 ${WORKFLOW_ID.slice(-4)} 的 Marketplace 摘要，` +
      '用于覆盖提交、上下架与查询状态机分支。',
    tags: ['analysis', `org-${ORG_ID.slice(-4)}`],
    coverImageUrl: `https://cdn.agentloom.dev/${ORG_ID}/cover.png`,
    category: 'analysis',
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

function createSelectChainWithSingleJoinPagination(result: unknown) {
  const offset = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin });
  return {
    from,
    leftJoin,
    where,
    orderBy,
    limit,
    offset,
  };
}

function createSelectChainWithSingleJoin(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin });
  return { from, leftJoin, where };
}

function createSelectChainWithInnerAndLeftJoin(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const leftJoin = vi.fn().mockReturnValue({ where });
  const innerJoin = vi.fn().mockReturnValue({ leftJoin });
  const from = vi.fn().mockReturnValue({ innerJoin });
  return { from, innerJoin, leftJoin, where };
}

function createSelectChainWithSingleJoinOrdered(result: unknown) {
  const orderBy = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ orderBy });
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin });
  return { from, leftJoin, where, orderBy };
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
        .mockReturnValueOnce(
          createSelectChain([{ id: VERSION_ID }]),
        );
      db.insert.mockReturnValue(createInsertChain([createdListing]));
      db.update.mockReturnValue(createUpdateChain([updatedListing]));
      reviewService.review.mockResolvedValue(reviewResult);

      const result = await service.submit(TENANT_ID, USER_ID, dto);

      expect(db.insert).toHaveBeenCalledTimes(1);
      const insertValues = db.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(insertValues.category).toBe(dto.category);
      expect(reviewService.review).toHaveBeenCalledWith(TENANT_ID, VERSION_ID, {
        title: dto.title,
        summary: dto.summary,
        tags: dto.tags,
      });
      expect(result).toEqual({
        listing: updatedListing,
        reviewResult,
      });
      expect(result.listing.status).toBe('listed');
      expect(result.listing.publishedAt).toEqual(NOW);
    });

    it('审查失败时应返回 review_failed 状态', async () => {
      const dto = createSubmitDto();
      const createdListing = createMarketplaceListing({
        title: dto.title,
        summary: dto.summary,
        tags: dto.tags,
        coverImageUrl: dto.coverImageUrl,
      });
      const reviewResult = createReviewResult({
        outcome: 'failed',
        checks: [
          {
            code: 'SUMMARY_INVALID',
            status: 'failed',
            message: '摘要不合法',
          },
        ],
      });
      const updatedListing = createMarketplaceListing({
        status: 'review_failed',
        title: dto.title,
        summary: dto.summary,
        tags: dto.tags,
        coverImageUrl: dto.coverImageUrl,
        reviewResult,
        publishedAt: null,
      });

      db.select
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(
          createSelectChain([{ id: VERSION_ID }]),
        );
      db.insert.mockReturnValue(createInsertChain([createdListing]));
      db.update.mockReturnValue(createUpdateChain([updatedListing]));
      reviewService.review.mockResolvedValue(reviewResult);

      const result = await service.submit(TENANT_ID, USER_ID, dto);

      expect(result.listing.status).toBe('review_failed');
      expect(result.listing.publishedAt).toBeNull();
      expect(result.reviewResult).toEqual(reviewResult);
    });

    it('已存在 review_failed listing 时应按新元数据重新提交', async () => {
      const dto = createSubmitDto({
        title: '重新提交后的标题',
        tags: ['refined', 'updated'],
      });
      const existingListing = createMarketplaceListing({ status: 'review_failed' });
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
      const updateFinal = createUpdateChain([updatedListing]);

      db.select
        .mockReturnValueOnce(createSelectChain([existingListing]))
        .mockReturnValueOnce(
          createSelectChain([{ id: VERSION_ID }]),
        );
      db.update
        .mockReturnValueOnce(updatePending)
        .mockReturnValueOnce(updateFinal);
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
      expect(reviewService.review).toHaveBeenCalledWith(TENANT_ID, VERSION_ID, {
        title: dto.title,
        summary: dto.summary,
        tags: dto.tags,
      });
      expect(result.listing).toEqual(updatedListing);
      expect(result.reviewResult).toEqual(reviewResult);
    });

    it('已上架 listing 再次提交时应抛出 409', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([createMarketplaceListing({ status: 'listed' })]),
      );

      await expect(
        service.submit(TENANT_ID, USER_ID, createSubmitDto()),
      ).rejects.toBeInstanceOf(MarketplaceListingConflictException);
      expect(reviewService.review).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('待审查 listing 再次提交时应抛出 409', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          createMarketplaceListing({ status: 'pending_review' }),
        ]),
      );

      await expect(
        service.submit(TENANT_ID, USER_ID, createSubmitDto()),
      ).rejects.toBeInstanceOf(MarketplaceListingConflictException);
      expect(reviewService.review).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('工作流版本不存在时应抛出 404', async () => {
      db.select
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.submit(TENANT_ID, USER_ID, createSubmitDto()),
      ).rejects.toBeInstanceOf(MarketplaceWorkflowVersionNotFoundException);
      expect(reviewService.review).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('封面图缺失时首次提交应写入 null', async () => {
      const dto = createSubmitDto({ coverImageUrl: undefined });
      const createdListing = createMarketplaceListing({
        status: 'pending_review',
        title: dto.title,
        summary: dto.summary,
        tags: dto.tags,
        coverImageUrl: null,
      });
      const reviewResult = createReviewResult({ outcome: 'passed' });
      const updatedListing = createMarketplaceListing({
        status: 'listed',
        title: dto.title,
        summary: dto.summary,
        tags: dto.tags,
        coverImageUrl: null,
        reviewResult,
        publishedAt: NOW,
      });
      const insertChain = createInsertChain([createdListing]);

      db.select
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(
          createSelectChain([{ id: VERSION_ID }]),
        );
      db.insert.mockReturnValue(insertChain);
      db.update.mockReturnValue(createUpdateChain([updatedListing]));
      reviewService.review.mockResolvedValue(reviewResult);

      const result = await service.submit(TENANT_ID, USER_ID, dto);

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ coverImageUrl: null }),
      );
      expect(result.listing.coverImageUrl).toBeNull();
    });

    it('重新提交时封面图缺失应回写为 null', async () => {
      const dto = createSubmitDto({ coverImageUrl: undefined });
      const existingListing = createMarketplaceListing({ status: 'review_failed' });
      const reviewResult = createReviewResult({ outcome: 'passed' });
      const updatePending = createUpdateWhereChain(undefined);
      const updatedListing = createMarketplaceListing({
        status: 'listed',
        title: dto.title,
        summary: dto.summary,
        tags: dto.tags,
        coverImageUrl: null,
        reviewResult,
        publishedAt: NOW,
      });

      db.select
        .mockReturnValueOnce(createSelectChain([existingListing]))
        .mockReturnValueOnce(
          createSelectChain([{ id: VERSION_ID }]),
        );
      db.update
        .mockReturnValueOnce(updatePending)
        .mockReturnValueOnce(createUpdateChain([updatedListing]));
      reviewService.review.mockResolvedValue(reviewResult);

      const result = await service.submit(TENANT_ID, USER_ID, dto);

      expect(updatePending.set).toHaveBeenCalledWith(
        expect.objectContaining({ coverImageUrl: null }),
      );
      expect(result.listing.coverImageUrl).toBeNull();
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
      const updateChain = createUpdateChain([updatedListing]);

      db.select.mockReturnValue(createSelectChain([listedListing]));
      db.update.mockReturnValue(updateChain);

      const result = await service.unlist(TENANT_ID, LISTING_ID, USER_ID);

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unlisted',
          unlistedAt: NOW,
          updatedAt: NOW,
        }),
      );
      expect(result).toEqual(updatedListing);
    });

    it('非 listed 状态下架时应抛出 409', async () => {
      db.select.mockReturnValue(
        createSelectChain([createMarketplaceListing({ status: 'review_failed' })]),
      );

      await expect(
        service.unlist(TENANT_ID, LISTING_ID, USER_ID),
      ).rejects.toBeInstanceOf(MarketplaceListingConflictException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('listing 不存在时应抛出 404', async () => {
      db.select.mockReturnValue(createSelectChain([]));

      await expect(
        service.unlist(TENANT_ID, LISTING_ID, USER_ID),
      ).rejects.toBeInstanceOf(MarketplaceListingNotFoundException);
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
      const updatePending = createUpdateWhereChain(undefined);
      const updatedListing = createMarketplaceListing({
        status: 'listed',
        reviewResult,
        publishedAt: NOW,
        unlistedAt: NOW,
      });
      const updateFinal = createUpdateChain([updatedListing]);

      db.select.mockReturnValue(createSelectChain([unlistedListing]));
      db.update
        .mockReturnValueOnce(updatePending)
        .mockReturnValueOnce(updateFinal);
      reviewService.review.mockResolvedValue(reviewResult);

      const result = await service.relist(TENANT_ID, LISTING_ID, USER_ID);

      expect(updatePending.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending_review', updatedAt: NOW }),
      );
      expect(reviewService.review).toHaveBeenCalledWith(TENANT_ID, VERSION_ID, {
        title: unlistedListing.title,
        summary: unlistedListing.summary,
        tags: unlistedListing.tags,
      });
      expect(result).toEqual({ listing: updatedListing, reviewResult });
      expect(result.listing.status).toBe('listed');
    });

    it('已下架 listing 在审查失败后应变为 review_failed', async () => {
      const unlistedListing = createMarketplaceListing({
        status: 'unlisted',
        publishedAt: NOW,
        unlistedAt: NOW,
      });
      const reviewResult = createReviewResult({
        outcome: 'failed',
        checks: [
          {
            code: 'WORKFLOW_CRITICAL_CONFIG_INCOMPLETE',
            status: 'failed',
            message: 'Agent 配置不完整',
          },
        ],
      });
      const updatedListing = createMarketplaceListing({
        status: 'review_failed',
        reviewResult,
        publishedAt: null,
        unlistedAt: NOW,
      });

      db.select.mockReturnValue(createSelectChain([unlistedListing]));
      db.update
        .mockReturnValueOnce(createUpdateWhereChain(undefined))
        .mockReturnValueOnce(createUpdateChain([updatedListing]));
      reviewService.review.mockResolvedValue(reviewResult);

      const result = await service.relist(TENANT_ID, LISTING_ID, USER_ID);

      expect(result.listing.status).toBe('review_failed');
      expect(result.listing.publishedAt).toBeNull();
      expect(result.reviewResult).toEqual(reviewResult);
    });

    it('非 unlisted 状态重新上架时应抛出 409', async () => {
      db.select.mockReturnValue(
        createSelectChain([createMarketplaceListing({ status: 'listed' })]),
      );

      await expect(
        service.relist(TENANT_ID, LISTING_ID, USER_ID),
      ).rejects.toBeInstanceOf(MarketplaceListingConflictException);
      expect(reviewService.review).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('listing 不存在时重新上架应抛出 404', async () => {
      db.select.mockReturnValue(createSelectChain([]));

      await expect(
        service.relist(TENANT_ID, LISTING_ID, USER_ID),
      ).rejects.toBeInstanceOf(MarketplaceListingNotFoundException);
    });
  });

  describe('findMyListings', () => {
    it('应返回分页数据与 meta 信息', async () => {
      const reviewResult = createReviewResult({ outcome: 'passed' });
      const listItem = {
        id: LISTING_ID,
        workflowVersionId: VERSION_ID,
        tenantId: TENANT_ID,
        title: '分页测试 listing',
        summary: '这是分页查询测试使用的摘要内容，确保返回结构完整。',
        tags: ['analysis'],
        coverImageUrl: null,
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
      };
      const selectData = createSelectChainWithPagination([listItem]);
      const selectCount = createSelectChain([{ count: 21 }]);

      db.select
        .mockReturnValueOnce(selectData)
        .mockReturnValueOnce(selectCount);

      const result = await service.findMyListings(
        TENANT_ID,
        { page: 2, pageSize: 10, status: 'listed' },
      );

      expect(selectData.limit).toHaveBeenCalledWith(10);
      expect(selectData.offset).toHaveBeenCalledWith(10);
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

    it('无状态筛选且没有数据时应返回 totalPages 为 0', async () => {
      const selectData = createSelectChainWithPagination([]);
      const selectCount = createSelectChain([]);

      db.select
        .mockReturnValueOnce(selectData)
        .mockReturnValueOnce(selectCount);

      const result = await service.findMyListings(TENANT_ID, {
        page: 1,
        pageSize: 10,
      });

      expect(selectData.limit).toHaveBeenCalledWith(10);
      expect(selectData.offset).toHaveBeenCalledWith(0);
      expect(result).toEqual({
        data: [],
        meta: {
          total: 0,
          page: 1,
          pageSize: 10,
          totalPages: 0,
        },
      });
    });
  });

  describe('findById', () => {
    it('找到 listing 时应直接返回', async () => {
      const listing = createMarketplaceListing({ status: 'listed' });
      db.select.mockReturnValue(createSelectChain([listing]));

      const result = await service.findById(TENANT_ID, LISTING_ID);

      expect(result).toEqual(listing);
    });

    it('listing 不存在时应抛出 404', async () => {
      db.select.mockReturnValue(createSelectChain([]));

      await expect(service.findById(TENANT_ID, LISTING_ID)).rejects.toBeInstanceOf(
        MarketplaceListingNotFoundException,
      );
    });
  });

  describe('findPublicListings', () => {
    it('应返回公开 listing 列表并映射作者信息', async () => {
      const listItem = {
        id: LISTING_ID,
        title: '公开分析 listing',
        summary: '这是一个面向公开市场浏览的测试摘要，用于验证分页与作者映射。',
        tags: ['analysis', 'marketplace'],
        coverImageUrl: 'https://cdn.agentloom.dev/public/cover.png',
        category: 'analysis' as const,
        useCount: 12,
        avgRating: '4.80',
        reviewCount: 6,
        publishedAt: NOW,
        authorId: USER_ID,
        authorDisplayName: '公开作者',
        authorAvatarUrl: 'https://cdn.agentloom.dev/public/avatar.png',
      };
      const selectData = createSelectChainWithSingleJoinPagination([listItem]);
      const selectCount = createSelectChain([{ count: 1 }]);

      db.select
        .mockReturnValueOnce(selectData)
        .mockReturnValueOnce(selectCount);

      const result = await service.findPublicListings({
        category: 'analysis',
        search: '公开',
        sort: 'rating',
        page: 2,
        pageSize: 5,
      });

      expect(selectData.limit).toHaveBeenCalledWith(5);
      expect(selectData.offset).toHaveBeenCalledWith(5);
      expect(selectData.where.mock.calls[0]?.[0]).toBeDefined();
      expect(selectCount.where).toHaveBeenCalledWith(
        selectData.where.mock.calls[0]?.[0],
      );
      expect(result).toEqual({
        data: [
          {
            id: LISTING_ID,
            title: listItem.title,
            summary: listItem.summary,
            tags: listItem.tags,
            coverImageUrl: listItem.coverImageUrl,
            category: 'analysis',
            useCount: 12,
            avgRating: '4.80',
            reviewCount: 6,
            publishedAt: NOW,
            author: {
              id: USER_ID,
              displayName: '公开作者',
              avatarUrl: 'https://cdn.agentloom.dev/public/avatar.png',
            },
          },
        ],
        total: 1,
        page: 2,
        pageSize: 5,
      });
    });
  });

  describe('findPublicById', () => {
    it('应返回公开 listing 详情、规范化 viewport 与评论列表', async () => {
      const snapshot = {
        nodes: [
          { id: 'public-node-1', type: 'agent', position: { x: 0, y: 0 }, data: {} },
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
      const listing = {
        id: LISTING_ID,
        workflowVersionId: VERSION_ID,
        title: '公开详情 listing',
        summary: '这是公开详情测试的摘要，验证 definition 与 reviews 一并返回。',
        tags: ['analysis'],
        coverImageUrl: null,
        category: 'analysis' as const,
        useCount: 20,
        avgRating: '4.50',
        reviewCount: 2,
        publishedAt: NOW,
        authorId: USER_ID,
        authorDisplayName: '详情作者',
        authorAvatarUrl: null,
        snapshot,
      };
      const review = {
        id: '00000000-0000-0000-0000-000000000007',
        rating: 5,
        content: '非常好用',
        createdAt: NOW,
        updatedAt: NOW,
        authorId: '00000000-0000-0000-0000-000000000008',
        authorDisplayName: '评论用户',
        authorAvatarUrl: null,
      };

      db.select
        .mockReturnValueOnce(createSelectChainWithInnerAndLeftJoin([listing]))
        .mockReturnValueOnce(createSelectChainWithSingleJoinOrdered([review]));

      const result = await service.findPublicById(LISTING_ID);

      expect(result).toEqual({
        id: LISTING_ID,
        workflowVersionId: VERSION_ID,
        title: listing.title,
        summary: listing.summary,
        tags: listing.tags,
        coverImageUrl: null,
        category: 'analysis',
        useCount: 20,
        avgRating: '4.50',
        reviewCount: 2,
        publishedAt: NOW,
        author: {
          id: USER_ID,
          displayName: '详情作者',
          avatarUrl: null,
        },
        definition: {
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          viewport: { x: 0, y: 0, zoom: 1 },
          inputSchema: snapshot.inputSchema,
        },
        reviews: [
          {
            id: review.id,
            rating: 5,
            content: '非常好用',
            createdAt: NOW,
            updatedAt: NOW,
            author: {
              id: review.authorId,
              displayName: '评论用户',
              avatarUrl: null,
            },
          },
        ],
      });
    });
  });

  describe('installListing', () => {
    it('应创建工作流副本并原子递增 useCount', async () => {
      const listing = {
        id: LISTING_ID,
        workflowVersionId: VERSION_ID,
        title: '一键安装 listing',
        summary: '这是用于验证一键安装逻辑的公开摘要。',
        tags: ['automation'],
        coverImageUrl: null,
        category: 'automation' as const,
        useCount: 9,
        avgRating: '4.20',
        reviewCount: 4,
        publishedAt: NOW,
        authorId: USER_ID,
        authorDisplayName: '作者',
        authorAvatarUrl: null,
        snapshot: {
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
          inputSchema: null,
          metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 },
        },
      };
      const createdWorkflow = {
        id: WORKFLOW_ID,
        tenantId: TENANT_ID,
        name: listing.title,
        slug: 'installed-workflow',
      };
      const updateChain = createUpdateWhereChain(undefined);

      db.select.mockReturnValueOnce(createSelectChainWithInnerAndLeftJoin([listing]));
      db.update.mockReturnValueOnce(updateChain);
      workflowVersionService.create.mockResolvedValue(createdWorkflow);

      const result = await service.installListing(TENANT_ID, USER_ID, LISTING_ID, {});

      expect(workflowVersionService.create).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        {
          name: listing.title,
          description: listing.summary,
          marketplace_listing_id: LISTING_ID,
        },
      );
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ updatedAt: NOW }),
      );
      expect(result).toEqual(createdWorkflow);
    });
  });
});

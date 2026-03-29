import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../database/database.module';
import {
  MarketplaceListingNotFoundException,
  MarketplaceReviewConflictException,
} from './marketplace.exceptions';
import { MarketplaceReviewUserService } from './marketplace-review-user.service';

const LISTING_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const REVIEW_ID = '00000000-0000-0000-0000-000000000003';
const NOW = new Date('2025-01-01T00:00:00.000Z');

function createSelectChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });
  return { from, where };
}

function createSelectChainWithPaginatedJoin(result: unknown) {
  const offset = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin });

  return { from, leftJoin, where, orderBy, limit, offset };
}

function createInsertChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });
  return { values, returning };
}

function createUpdateWhereChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const set = vi.fn().mockReturnValue({ where });
  return { set, where };
}

describe('MarketplaceReviewUserService', () => {
  let service: MarketplaceReviewUserService;
  let db: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

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
        MarketplaceReviewUserService,
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    service = module.get(MarketplaceReviewUserService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('submitReview', () => {
    it('应创建评论、回算评分并返回精简评论数据', async () => {
      const insertChain = createInsertChain([{ id: REVIEW_ID }]);
      const updateChain = createUpdateWhereChain(undefined);

      db.select
        .mockReturnValueOnce(createSelectChain([{ id: LISTING_ID }]))
        .mockReturnValueOnce(
          createSelectChain([{ avgRating: '5.00', reviewCount: 1 }]),
        )
        .mockReturnValueOnce(
          createSelectChain([
            {
              id: REVIEW_ID,
              rating: 5,
              content: '非常实用',
              createdAt: NOW,
            },
          ]),
        );
      db.insert.mockReturnValueOnce(insertChain);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.submitReview(USER_ID, LISTING_ID, {
        rating: 5,
        content: '非常实用',
      });

      expect(insertChain.values).toHaveBeenCalledWith({
        listingId: LISTING_ID,
        userId: USER_ID,
        rating: 5,
        content: '非常实用',
      });
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          avgRating: '5.00',
          reviewCount: 1,
          updatedAt: NOW,
        }),
      );
      expect(result).toEqual({
        id: REVIEW_ID,
        rating: 5,
        content: '非常实用',
        createdAt: NOW,
      });
    });

    it('重复评论时应抛出 MarketplaceReviewConflictException', async () => {
      const uniqueViolation = Object.assign(new Error('duplicate key'), {
        code: '23505',
      });

      db.select.mockReturnValueOnce(createSelectChain([{ id: LISTING_ID }]));
      db.insert.mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(uniqueViolation),
        }),
      });

      await expect(
        service.submitReview(USER_ID, LISTING_ID, { rating: 4 }),
      ).rejects.toBeInstanceOf(MarketplaceReviewConflictException);
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('findReviewsByListing', () => {
    it('应返回分页评论列表', async () => {
      const dataChain = createSelectChainWithPaginatedJoin([
        {
          id: REVIEW_ID,
          rating: 4,
          content: '很好',
          createdAt: NOW,
          authorDisplayName: '评论用户',
        },
      ]);

      db.select
        .mockReturnValueOnce(createSelectChain([{ id: LISTING_ID }]))
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(createSelectChain([{ count: 75 }]));

      const result = await service.findReviewsByListing(LISTING_ID, {
        page: 2,
        pageSize: 50,
      });

      expect(dataChain.limit).toHaveBeenCalledWith(50);
      expect(dataChain.offset).toHaveBeenCalledWith(50);
      expect(result).toEqual({
        data: [
          {
            id: REVIEW_ID,
            rating: 4,
            content: '很好',
            createdAt: NOW,
            author: {
              displayName: '评论用户',
            },
          },
        ],
        meta: {
          page: 2,
          pageSize: 50,
          total: 75,
          totalPages: 2,
        },
      });
    });

    it('listing 不存在时应抛出 404', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.findReviewsByListing(LISTING_ID, { page: 1, pageSize: 20 }),
      ).rejects.toBeInstanceOf(MarketplaceListingNotFoundException);
    });
  });

  describe('recalculateRating', () => {
    it('应根据评论聚合结果更新 listing 评分统计', async () => {
      const updateChain = createUpdateWhereChain(undefined);

      db.select.mockReturnValueOnce(
        createSelectChain([{ avgRating: '4.25', reviewCount: 4 }]),
      );
      db.update.mockReturnValueOnce(updateChain);

      await service.recalculateRating(LISTING_ID);

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          avgRating: '4.25',
          reviewCount: 4,
          updatedAt: NOW,
        }),
      );
    });
  });
});

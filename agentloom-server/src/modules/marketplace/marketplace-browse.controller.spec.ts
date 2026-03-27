import { describe, expect, it, vi } from 'vitest';

import { MarketplaceBrowseController } from './marketplace-browse.controller';
import type { QueryPublicListingsDto } from './dto/marketplace.dto';
import type { MarketplaceReviewUserService } from './marketplace-review-user.service';
import type { MarketplaceService } from './marketplace.service';

const IS_PUBLIC_KEY = 'isPublic';
const LISTING_ID = '00000000-0000-0000-0000-000000000001';

describe('MarketplaceBrowseController', () => {
  const marketplaceService = {
    findPublicListings: vi.fn(),
    findPublicById: vi.fn(),
  };
  const reviewUserService = {
    findReviewsByListing: vi.fn(),
  };

  const controller = new MarketplaceBrowseController(
    marketplaceService as unknown as MarketplaceService,
    reviewUserService as unknown as MarketplaceReviewUserService,
  );

  describe('decorators', () => {
    it('应在控制器类上声明 @Public()', () => {
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, MarketplaceBrowseController),
      ).toBe(true);
    });
  });

  describe('list', () => {
    it('应将查询参数透传给 marketplaceService.findPublicListings', async () => {
      const query: QueryPublicListingsDto = {
        category: 'analysis' as const,
        search: 'market',
        sort: 'rating' as const,
        page: 2,
        pageSize: 5,
      };
      const mockResult = {
        data: [{ id: LISTING_ID, title: '公开 listing' }],
        meta: {
          page: 2,
          pageSize: 5,
          total: 1,
          totalPages: 1,
        },
      };
      marketplaceService.findPublicListings.mockResolvedValue(mockResult);

      const result = await controller.list(query);

      expect(marketplaceService.findPublicListings).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });
  });

  describe('detail', () => {
    it('应调用 marketplaceService.findPublicById', async () => {
      const mockResult = { id: LISTING_ID, title: '详情 listing' };
      marketplaceService.findPublicById.mockResolvedValue(mockResult);

      const result = await controller.detail(LISTING_ID);

      expect(marketplaceService.findPublicById).toHaveBeenCalledWith(
        LISTING_ID,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('reviews', () => {
    it('应调用 reviewUserService.findReviewsByListing', async () => {
      const mockResult = {
        data: [{ id: 'review-1', rating: 5 }],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      };
      reviewUserService.findReviewsByListing.mockResolvedValue(mockResult);

      const result = await controller.reviews(LISTING_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(reviewUserService.findReviewsByListing).toHaveBeenCalledWith(
        LISTING_ID,
        {
          page: 1,
          pageSize: 20,
        },
      );
      expect(result).toEqual(mockResult);
    });
  });
});

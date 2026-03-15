import { describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { MarketplaceController } from './marketplace.controller';
import type { MarketplaceReviewUserService } from './marketplace-review-user.service';
import type { MarketplaceService } from './marketplace.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const LISTING_ID = '00000000-0000-0000-0000-000000000003';

function getRoles(controller: MarketplaceController, methodName: string) {
  const handler = Object.getPrototypeOf(controller)[methodName];
  return handler ? Reflect.getMetadata(ROLES_KEY, handler) : undefined;
}

describe('MarketplaceController', () => {
  const marketplaceService = {
    submit: vi.fn(),
    unlist: vi.fn(),
    relist: vi.fn(),
    findMyListings: vi.fn(),
    findById: vi.fn(),
    installListing: vi.fn(),
  };
  const reviewUserService = {
    submitReview: vi.fn(),
  };

  const controller = new MarketplaceController(
    marketplaceService as unknown as MarketplaceService,
    reviewUserService as unknown as MarketplaceReviewUserService,
  );

  describe('角色元数据', () => {
    it('install 应要求 owner/admin/creator/operator 角色', () => {
      expect(getRoles(controller, 'install')).toEqual([
        'owner',
        'admin',
        'creator',
        'operator',
      ]);
    });
  });

  describe('install', () => {
    it('应调用 marketplaceService.installListing 并返回 {data}', async () => {
      const dto = { name: 'Marketplace 副本' };
      const mockWorkflow = { id: 'wf-1', name: 'Marketplace 副本' };
      marketplaceService.installListing.mockResolvedValue(mockWorkflow);

      const result = await controller.install(TENANT_ID, USER_ID, LISTING_ID, dto);

      expect(marketplaceService.installListing).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        LISTING_ID,
        dto,
      );
      expect(result).toEqual({ data: mockWorkflow });
    });
  });

  describe('submitReview', () => {
    it('应调用 reviewUserService.submitReview 并返回 {data}', async () => {
      const dto = { rating: 5, content: '非常好用' };
      const mockReview = { id: 'review-1', rating: 5 };
      reviewUserService.submitReview.mockResolvedValue(mockReview);

      const result = await controller.submitReview(USER_ID, LISTING_ID, dto);

      expect(reviewUserService.submitReview).toHaveBeenCalledWith(
        USER_ID,
        LISTING_ID,
        dto,
      );
      expect(result).toEqual({ data: mockReview });
    });
  });
});

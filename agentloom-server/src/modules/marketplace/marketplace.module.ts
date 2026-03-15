import { Module } from '@nestjs/common';

import { MarketplaceController } from './marketplace.controller';
import { MarketplaceReviewService } from './marketplace-review.service';
import { MarketplaceService } from './marketplace.service';

@Module({
  controllers: [MarketplaceController],
  providers: [MarketplaceService, MarketplaceReviewService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}

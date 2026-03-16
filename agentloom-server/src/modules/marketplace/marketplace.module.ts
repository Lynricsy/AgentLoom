import { Module } from '@nestjs/common';

import { PluginModule } from '../plugin/plugin.module';
import { WorkflowDefinitionModule } from '../workflow-definition/workflow-definition.module';
import { MarketplaceBrowseController } from './marketplace-browse.controller';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceReviewService } from './marketplace-review.service';
import { MarketplaceReviewUserService } from './marketplace-review-user.service';
import { MarketplaceService } from './marketplace.service';

@Module({
  imports: [WorkflowDefinitionModule, PluginModule],
  controllers: [MarketplaceController, MarketplaceBrowseController],
  providers: [
    MarketplaceService,
    MarketplaceReviewService,
    MarketplaceReviewUserService,
  ],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { EarningsSettlementWorker } from './earnings-settlement.worker';
import {
  EARNINGS_SETTLEMENT_QUEUE,
  PLUGIN_EXECUTION_QUEUE,
  earningsSettlementQueueDefaultJobOptions,
  pluginExecutionQueueDefaultJobOptions,
} from './plugin.constants';
import { PluginController } from './plugin.controller';
import { PluginDeveloperKeyController } from './plugin-developer-key.controller';
import { PluginDeveloperKeyService } from './plugin-developer-key.service';
import { PluginEarningsService } from './plugin-earnings.service';
import { PluginEarningsSettlementProducer } from './plugin-earnings-settlement.producer';
import { PluginExecutionWorker } from './plugin-execution.worker';
import { PluginMarketplaceController } from './plugin-marketplace.controller';
import { PluginMarketplaceReviewService } from './plugin-marketplace-review.service';
import { PluginSandboxService } from './plugin-sandbox.service';
import { PluginUsageService } from './plugin-usage.service';
import { PluginService } from './plugin.service';
import { PluginSignatureService } from './plugin-signature.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: PLUGIN_EXECUTION_QUEUE,
      defaultJobOptions: pluginExecutionQueueDefaultJobOptions,
    }),
    BullModule.registerQueue({
      name: EARNINGS_SETTLEMENT_QUEUE,
      defaultJobOptions: earningsSettlementQueueDefaultJobOptions,
    }),
  ],
  controllers: [PluginController, PluginDeveloperKeyController, PluginMarketplaceController],
  providers: [
    PluginService,
    PluginSignatureService,
    PluginSandboxService,
    PluginDeveloperKeyService,
    PluginUsageService,
    PluginEarningsService,
    PluginMarketplaceReviewService,
    PluginEarningsSettlementProducer,
    PluginExecutionWorker,
    EarningsSettlementWorker,
  ],
  exports: [
    PluginService,
    PluginSignatureService,
    PluginSandboxService,
    PluginUsageService,
    PluginEarningsService,
    PluginEarningsSettlementProducer,
    BullModule,
  ],
})
export class PluginModule {}

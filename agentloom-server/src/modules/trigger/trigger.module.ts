import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';

import { ExecutionModule } from '../execution/execution.module';
import { EventSourceAdapterRegistry } from './adapters/event-source-adapter.registry';
import { GenericEventAdapter } from './adapters/generic-event.adapter';
import { GithubWebhookAdapter } from './adapters/github-webhook.adapter';
import { ApiEventIngestionController } from './api-event-ingestion.controller';
import { ApiEventIngestionService } from './api-event-ingestion.service';
import { TriggerController } from './trigger.controller';
import {
  TRIGGER_QUEUE,
  TRIGGER_QUEUE_DEFAULT_JOB_OPTIONS,
} from './trigger.constants';
import { TriggerHistoryService } from './trigger-history.service';
import { TriggerSchedulerProcessor } from './trigger-scheduler.processor';
import { TriggerSchedulerService } from './trigger-scheduler.service';
import { TriggerService } from './trigger.service';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [
    ConfigModule,
    ExecutionModule,
    BullModule.registerQueue({
      name: TRIGGER_QUEUE,
      defaultJobOptions: TRIGGER_QUEUE_DEFAULT_JOB_OPTIONS,
    }),
  ],
  controllers: [
    TriggerController,
    WebhookController,
    ApiEventIngestionController,
  ],
  providers: [
    TriggerService,
    TriggerHistoryService,
    TriggerSchedulerService,
    TriggerSchedulerProcessor,
    WebhookService,
    GithubWebhookAdapter,
    GenericEventAdapter,
    EventSourceAdapterRegistry,
    ApiEventIngestionService,
  ],
  exports: [TriggerService, EventSourceAdapterRegistry],
})
export class TriggerModule {}

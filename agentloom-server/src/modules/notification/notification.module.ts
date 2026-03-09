import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationProcessor } from './notification.processor';
import { NotificationGateway } from './notification.gateway';
import { NotificationListener } from './notification.listener';
import {
  NOTIFICATION_QUEUE,
  NOTIFICATION_QUEUE_DEFAULT_JOB_OPTIONS,
} from './notification.constants';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE,
      defaultJobOptions: NOTIFICATION_QUEUE_DEFAULT_JOB_OPTIONS,
    }),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationProcessor,
    NotificationGateway,
    NotificationListener,
  ],
  exports: [NotificationService, NotificationGateway],
})
export class NotificationModule {}

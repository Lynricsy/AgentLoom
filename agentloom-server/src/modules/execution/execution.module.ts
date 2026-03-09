import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { ExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';
import { ExecutionWorker } from './execution.worker';
import { ExecutionGateway } from './execution.gateway';
import { EXECUTION_QUEUE } from './execution.constants';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: EXECUTION_QUEUE,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 1,
      },
    }),
  ],
  controllers: [ExecutionController],
  providers: [ExecutionService, ExecutionWorker, ExecutionGateway],
  exports: [ExecutionService, ExecutionGateway],
})
export class ExecutionModule {}

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { SandboxService } from './sandbox.service';
import { SANDBOX_LIFECYCLE_QUEUE } from './sandbox.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: SANDBOX_LIFECYCLE_QUEUE,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    }),
  ],
  providers: [SandboxService],
  exports: [SandboxService],
})
export class SandboxModule {}

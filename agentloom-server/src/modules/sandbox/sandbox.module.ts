import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { SandboxService } from './sandbox.service';
import { DockerService } from './docker.service';
import { SandboxLifecycleProducer } from './sandbox-lifecycle.producer';
import { SandboxLifecycleWorker } from './sandbox-lifecycle.worker';
import { SandboxController } from './sandbox.controller';
import { SANDBOX_LIFECYCLE_QUEUE } from './sandbox.constants';
import { PiConfigGeneratorService } from './pi-config-generator.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: SANDBOX_LIFECYCLE_QUEUE,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    }),
  ],
  controllers: [SandboxController],
  providers: [
    SandboxService,
    DockerService,
    SandboxLifecycleProducer,
    SandboxLifecycleWorker,
    PiConfigGeneratorService,
  ],
  exports: [
    SandboxService,
    DockerService,
    SandboxLifecycleProducer,
    PiConfigGeneratorService,
  ],
})
export class SandboxModule {}

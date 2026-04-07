import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { StorageModule } from '../../infrastructure/storage';
import { ApiKeyModule } from '../api-key/api-key.module';
import { SandboxService } from './sandbox.service';
import { DockerService } from './docker.service';
import { SandboxLifecycleProducer } from './sandbox-lifecycle.producer';
import { SandboxLifecycleWorker } from './sandbox-lifecycle.worker';
import { SandboxController } from './sandbox.controller';
import { SANDBOX_LIFECYCLE_QUEUE } from './sandbox.constants';
import { PiConfigGeneratorService } from './pi-config-generator.service';
import { SANDBOX_RUNTIME_DRIVER } from './sandbox-runtime-driver.port';

@Module({
  imports: [
    StorageModule,
    ApiKeyModule,
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
    {
      provide: SANDBOX_RUNTIME_DRIVER,
      useExisting: DockerService,
    },
    SandboxLifecycleProducer,
    SandboxLifecycleWorker,
    PiConfigGeneratorService,
  ],
  exports: [
    SandboxService,
    DockerService,
    SANDBOX_RUNTIME_DRIVER,
    SandboxLifecycleProducer,
    PiConfigGeneratorService,
  ],
})
export class SandboxModule {}

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import {
  PLUGIN_EXECUTION_QUEUE,
  pluginExecutionQueueDefaultJobOptions,
} from './plugin.constants';
import { PluginController } from './plugin.controller';
import { PluginDeveloperKeyController } from './plugin-developer-key.controller';
import { PluginDeveloperKeyService } from './plugin-developer-key.service';
import { PluginExecutionWorker } from './plugin-execution.worker';
import { PluginSandboxService } from './plugin-sandbox.service';
import { PluginService } from './plugin.service';
import { PluginSignatureService } from './plugin-signature.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: PLUGIN_EXECUTION_QUEUE,
      defaultJobOptions: pluginExecutionQueueDefaultJobOptions,
    }),
  ],
  controllers: [PluginController, PluginDeveloperKeyController],
  providers: [
    PluginService,
    PluginSignatureService,
    PluginSandboxService,
    PluginDeveloperKeyService,
    PluginExecutionWorker,
  ],
  exports: [PluginService, PluginSignatureService, PluginSandboxService, BullModule],
})
export class PluginModule {}

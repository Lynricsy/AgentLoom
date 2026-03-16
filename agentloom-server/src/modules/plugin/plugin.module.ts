import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import {
  PLUGIN_EXECUTION_QUEUE,
  pluginExecutionQueueDefaultJobOptions,
} from './plugin.constants';
import { PluginController } from './plugin.controller';
import { PluginExecutionWorker } from './plugin-execution.worker';
import { PluginService } from './plugin.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: PLUGIN_EXECUTION_QUEUE,
      defaultJobOptions: pluginExecutionQueueDefaultJobOptions,
    }),
  ],
  controllers: [PluginController],
  providers: [PluginService, PluginExecutionWorker],
  exports: [PluginService, BullModule],
})
export class PluginModule {}

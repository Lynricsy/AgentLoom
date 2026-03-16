import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { PLUGIN_EXECUTION_QUEUE } from './plugin.constants';

export interface PluginExecutionJobData {
  tenantId: string;
  executionId: string;
  stepId: string;
  pluginId: string;
  nodeType: string;
  inputs: Record<string, unknown>;
  config: Record<string, unknown>;
}

@Processor(PLUGIN_EXECUTION_QUEUE)
export class PluginExecutionWorker extends WorkerHost {
  private readonly logger = new Logger(PluginExecutionWorker.name);

  async process(job: Job<PluginExecutionJobData>): Promise<Record<string, unknown>> {
    this.logger.log(
      `Processing plugin execution: ${job.data.pluginId}/${job.data.nodeType}`,
    );

    return {
      status: 'completed',
      outputs: {},
      message: `Plugin ${job.data.pluginId} node ${job.data.nodeType} execution placeholder`,
    };
  }
}

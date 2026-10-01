import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { AgentApiEventMirrorListener } from './agent-api-event-mirror.listener';
import { AgentApiEventStreamService } from './agent-api-event-stream.service';
import { AgentApiMaintenanceScheduler } from './agent-api-maintenance.scheduler';
import { AgentApiMaintenanceWorker } from './agent-api-maintenance.worker';
import { AgentApiRunService } from './agent-api-run.service';
import {
  AGENT_API_MAINTENANCE_QUEUE,
  AGENT_API_MAINTENANCE_QUEUE_DEFAULT_JOB_OPTIONS,
} from './agent-api-runtime.constants';

/**
 * 对外 API 的 run 运行时：run 状态机、Redis Stream 事件流、执行事件 mirror 与定期清扫。
 * 不依赖 agent-execution，由 AgentExecutionModule 与对外 controller 模块共同导入。
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: AGENT_API_MAINTENANCE_QUEUE,
      defaultJobOptions: AGENT_API_MAINTENANCE_QUEUE_DEFAULT_JOB_OPTIONS,
    }),
  ],
  providers: [
    AgentApiEventStreamService,
    AgentApiRunService,
    AgentApiEventMirrorListener,
    AgentApiMaintenanceScheduler,
    AgentApiMaintenanceWorker,
  ],
  exports: [AgentApiRunService, AgentApiEventStreamService],
})
export class AgentApiRuntimeModule {}

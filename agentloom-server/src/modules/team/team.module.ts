import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { AgentConversationModule } from '../agent-conversation/agent-conversation.module';
import { ExecutionModule } from '../execution/execution.module';
import { TeamController } from './team.controller';
import {
  TEAM_RUNTIME_QUEUE,
  TEAM_RUNTIME_QUEUE_DEFAULT_JOB_OPTIONS,
} from './team.constants';
import { TeamMailboxService } from './team-mailbox.service';
import { TeamRunQueryService } from './team-run-query.service';
import { TeamRunService } from './team-run.service';
import { TeamRuntimeScheduler } from './team-runtime.scheduler';
import { TeamRuntimeWorker } from './team-runtime.worker';

/**
 * 受控团队运行时：团队运行、成员邮箱、成员工具、截止与清扫。
 *
 * 依赖方向 AgentExecutionModule → TeamModule → ExecutionModule：
 * 本模块不导入 AgentExecutionModule，成员对话的派发/取消经事件由
 * `TeamConversationBridgeListener` 完成；`team` 节点执行器经事件请求启动团队运行。
 */
@Module({
  imports: [
    AgentConversationModule,
    ExecutionModule,
    BullModule.registerQueue({
      name: TEAM_RUNTIME_QUEUE,
      defaultJobOptions: TEAM_RUNTIME_QUEUE_DEFAULT_JOB_OPTIONS,
    }),
  ],
  controllers: [TeamController],
  providers: [
    TeamMailboxService,
    TeamRunService,
    TeamRunQueryService,
    TeamRuntimeWorker,
    TeamRuntimeScheduler,
  ],
})
export class TeamModule {}

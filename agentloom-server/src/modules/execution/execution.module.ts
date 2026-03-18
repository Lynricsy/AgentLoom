import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from '../agent/agent.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { InterventionPolicyModule } from '../intervention-policy/intervention-policy.module';
import { NotificationModule } from '../notification/notification.module';
import { LlmModule } from '../llm/llm.module';
import { SmartRoutingModule } from '../smart-routing/smart-routing.module';
import { PluginModule } from '../plugin/plugin.module';
import { OrganizationModule } from '../organization/organization.module';
import { RbacCacheService } from '../../common/services/rbac-cache.service';
import { ExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';
import { ExecutionWorker } from './execution.worker';
import { ExecutionGateway } from './execution.gateway';
import { StepStateMachineService } from './step-state-machine.service';
import { DagResolverService } from './dag-resolver.service';
import { NodeSchedulerService } from './node-scheduler.service';
import { AgentTaskWorker } from './agent-task.worker';
import { CheckpointService } from './checkpoint.service';
import { EventBridgeService } from './services/event-bridge.service';
import { ThrottleService } from './services/throttle.service';
import { StateReplayService } from './services/state-replay.service';
import { ToolCallStateMachineService } from './services/tool-call-state-machine.service';
import {
  EXECUTION_QUEUE,
  AGENT_TASK_QUEUE,
  EXECUTION_QUEUE_DEFAULT_JOB_OPTIONS,
  AGENT_TASK_QUEUE_DEFAULT_JOB_OPTIONS,
} from './execution.constants';

@Module({
  imports: [
    ConfigModule,
    AgentModule,
    SandboxModule,
    InterventionPolicyModule,
    NotificationModule,
    LlmModule,
    SmartRoutingModule,
    PluginModule,
    OrganizationModule,
    BullModule.registerQueue({
      name: EXECUTION_QUEUE,
      defaultJobOptions: EXECUTION_QUEUE_DEFAULT_JOB_OPTIONS,
    }),
    BullModule.registerQueue({
      name: AGENT_TASK_QUEUE,
      defaultJobOptions: AGENT_TASK_QUEUE_DEFAULT_JOB_OPTIONS,
    }),
  ],
  controllers: [ExecutionController],
  providers: [
    ExecutionService,
    ExecutionWorker,
    ExecutionGateway,
    StepStateMachineService,
    DagResolverService,
    NodeSchedulerService,
    AgentTaskWorker,
    CheckpointService,
    EventBridgeService,
    ThrottleService,
    StateReplayService,
    ToolCallStateMachineService,
    RbacCacheService,
  ],
  exports: [
    ExecutionService,
    ExecutionGateway,
    EventBridgeService,
    ThrottleService,
    StateReplayService,
    StepStateMachineService,
    DagResolverService,
    NodeSchedulerService,
    CheckpointService,
  ],
})
export class ExecutionModule {}

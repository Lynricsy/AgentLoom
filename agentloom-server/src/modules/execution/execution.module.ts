import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from '../agent/agent.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { ExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';
import { ExecutionWorker } from './execution.worker';
import { ExecutionGateway } from './execution.gateway';
import { StepStateMachineService } from './step-state-machine.service';
import { DagResolverService } from './dag-resolver.service';
import { NodeSchedulerService } from './node-scheduler.service';
import { AgentTaskWorker } from './agent-task.worker';
import { EventBridgeService } from './services/event-bridge.service';
import { EXECUTION_QUEUE, AGENT_TASK_QUEUE } from './execution.constants';

@Module({
  imports: [
    ConfigModule,
    AgentModule,
    SandboxModule,
    BullModule.registerQueue({
      name: EXECUTION_QUEUE,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 1,
      },
    }),
    BullModule.registerQueue({
      name: AGENT_TASK_QUEUE,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
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
    EventBridgeService,
  ],
  exports: [
    ExecutionService,
    ExecutionGateway,
    EventBridgeService,
    StepStateMachineService,
    DagResolverService,
    NodeSchedulerService,
  ],
})
export class ExecutionModule {}

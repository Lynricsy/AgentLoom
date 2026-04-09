import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { DRIZZLE } from '../../database/database.module';
import { AgentModule } from '../agent/agent.module';
import { AGENT_RUNTIME_FACTORY } from '../agent/agent-adapter.factory';
import { AGENT_RUNTIME } from '../agent/ports/agent-runtime.port';
import { AgentDefinitionModule } from '../agent-definition/agent-definition.module';
import { AgentDefinitionService } from '../agent-definition/agent-definition.service';
import { SandboxModule } from '../sandbox/sandbox.module';
import { SandboxService } from '../sandbox/sandbox.service';
import { InterventionPolicyModule } from '../intervention-policy/intervention-policy.module';
import { NotificationModule } from '../notification/notification.module';
import { LlmModule } from '../llm/llm.module';
import { SmartRoutingModule } from '../smart-routing/smart-routing.module';
import { PluginModule } from '../plugin/plugin.module';
import { OrganizationModule } from '../organization/organization.module';
import { ResourceGovernanceModule } from '../resource-governance/resource-governance.module';
import { SharedResourcesModule } from '../shared-resources/shared-resources.module';
import { SkillModule } from '../skill/skill.module';
import { SkillResolverService } from '../skill/skill-resolver.service';
import { McpModule } from '../mcp/mcp.module';
import { SubAgentToolsProvider } from '../agent-execution/subagent';
import { WorkspaceIntegrationModule } from '../agent-execution/workspace-integration.module';
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
import { ExecutionWorkspaceRealtimeBridgeService } from './services/execution-workspace-realtime-bridge.service';
import { ThrottleService } from './services/throttle.service';
import { StateReplayService } from './services/state-replay.service';
import { ToolCallStateMachineService } from './services/tool-call-state-machine.service';
import { AgentAdapterFactory } from './adapters/agent-adapter-factory';
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
    AgentDefinitionModule,
    SandboxModule,
    InterventionPolicyModule,
    NotificationModule,
    LlmModule,
    SmartRoutingModule,
    PluginModule,
    OrganizationModule,
    ResourceGovernanceModule,
    SharedResourcesModule,
    SkillModule,
    McpModule,
    WorkspaceIntegrationModule,
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
    ExecutionWorkspaceRealtimeBridgeService,
    ThrottleService,
    StateReplayService,
    ToolCallStateMachineService,
    {
      provide: AgentAdapterFactory,
      useFactory: (
        db,
        agentRuntime,
        runtimeAdapterFactory,
        agentDefinitionService,
        sandboxService,
        eventBridge,
        skillResolverService,
      ) =>
        new AgentAdapterFactory(
          db,
          agentRuntime,
          runtimeAdapterFactory,
          agentDefinitionService,
        sandboxService,
        eventBridge,
        new SubAgentToolsProvider(db, agentDefinitionService, eventBridge),
        skillResolverService,
      ),
      inject: [
        DRIZZLE,
        AGENT_RUNTIME,
        AGENT_RUNTIME_FACTORY,
        AgentDefinitionService,
        SandboxService,
        EventBridgeService,
        SkillResolverService,
      ],
    },
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

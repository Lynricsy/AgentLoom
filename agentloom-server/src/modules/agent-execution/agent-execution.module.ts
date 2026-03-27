import { Module, type Provider } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  AGENT_RUNTIME_FACTORY,
  type AgentAdapterFactory,
} from '../agent/agent-adapter.factory';
import { AgentModule } from '../agent/agent.module';
import {
  AGENT_RUNTIME,
  type IAgentRuntime,
} from '../agent/ports/agent-runtime.port';
import { AgentConversationService } from '../agent-conversation/agent-conversation.service';
import { AgentConversationModule } from '../agent-conversation/agent-conversation.module';
import { AgentDefinitionService } from '../agent-definition/agent-definition.service';
import { AgentDefinitionModule } from '../agent-definition/agent-definition.module';
import { ExecutionModule } from '../execution/execution.module';
import { EventBridgeService } from '../execution/services/event-bridge.service';
import { ThrottleService } from '../execution/services/throttle.service';
import { TokenBlacklistService } from '../../common/services/token-blacklist.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { SandboxModule } from '../sandbox/sandbox.module';
import { MemoryToolsService } from '../agent-memory/memory-tools.service';
import { MemoryResourceProvider } from '../agent-memory/memory-resource.provider';
import { MemoryFusionService } from '../agent-memory/services/memory-fusion.service';
import { SkillModule } from '../skill/skill.module';
import { SkillResolverService } from '../skill/skill-resolver.service';
import { SubAgentToolsProvider } from './subagent';
import {
  AGENT_CONVERSATION_EXECUTION_QUEUE,
  AGENT_CONVERSATION_EXECUTION_QUEUE_DEFAULT_JOB_OPTIONS,
  AgentExecutionService,
} from './agent-execution.service';
import { AgentExecutionWorker } from './agent-execution.worker';
import { AgentConversationGateway } from './agent-conversation.gateway';

const agentExecutionServiceProvider: Provider = {
  provide: AgentExecutionService,
  useFactory: (
    db: DrizzleDB,
    executionQueue: Queue,
    conversationService: AgentConversationService,
  ) => new AgentExecutionService(db, executionQueue, conversationService),
  inject: [
    DRIZZLE,
    getQueueToken(AGENT_CONVERSATION_EXECUTION_QUEUE),
    AgentConversationService,
  ],
};

const agentExecutionWorkerProvider: Provider = {
  provide: AgentExecutionWorker,
  useFactory: (
    db: DrizzleDB,
    agentRuntime: IAgentRuntime,
    adapterFactory: AgentAdapterFactory,
    executionService: AgentExecutionService,
    eventBridge: EventBridgeService,
    sandboxService: SandboxService,
    agentDefinitionService: AgentDefinitionService,
    memoryToolsService?: MemoryToolsService,
    memoryFusionService?: MemoryFusionService,
    memoryResourceProvider?: MemoryResourceProvider,
    skillResolverService?: SkillResolverService,
    subAgentToolsProvider?: SubAgentToolsProvider,
  ) =>
    new AgentExecutionWorker(
      db,
      agentRuntime,
      adapterFactory,
      executionService,
      eventBridge,
      sandboxService,
      agentDefinitionService,
      memoryToolsService,
      memoryFusionService,
      memoryResourceProvider,
      skillResolverService,
      subAgentToolsProvider,
    ),
  inject: [
    DRIZZLE,
    AGENT_RUNTIME,
    AGENT_RUNTIME_FACTORY,
    AgentExecutionService,
    EventBridgeService,
    SandboxService,
    AgentDefinitionService,
    { token: MemoryToolsService, optional: true },
    { token: MemoryFusionService, optional: true },
    { token: MemoryResourceProvider, optional: true },
    { token: SkillResolverService, optional: true },
    { token: SubAgentToolsProvider, optional: true },
  ],
};

@Module({
  imports: [
    ConfigModule,
    AgentModule,
    AgentConversationModule,
    AgentDefinitionModule,
    ExecutionModule,
    SandboxModule,
    SkillModule,
    BullModule.registerQueue({
      name: AGENT_CONVERSATION_EXECUTION_QUEUE,
      defaultJobOptions: AGENT_CONVERSATION_EXECUTION_QUEUE_DEFAULT_JOB_OPTIONS,
    }),
  ],
  providers: [
    agentExecutionServiceProvider,
    agentExecutionWorkerProvider,
    AgentConversationGateway,
    SubAgentToolsProvider,
  ],
  exports: [AgentExecutionService],
})
export class AgentExecutionModule {}

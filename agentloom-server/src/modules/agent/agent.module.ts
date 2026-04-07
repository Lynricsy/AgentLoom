import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { ApiKeyModule } from '../api-key/api-key.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { LlmModule } from '../llm/llm.module';
import { McpModule } from '../mcp/mcp.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { SelfEvolutionModule } from '../self-evolution/self-evolution.module';

import {
  AGENT_RUNTIME_FACTORY,
  AgentAdapterFactory,
} from './agent-adapter.factory';
import { AgentRuntimeController } from './agent-runtime.controller';
import { AutonomyResolverService } from './autonomy-resolver.service';
import { AgentToolPermissionSyncService } from './agent-tool-permission-sync.service';
import { CodeExecutionService } from './code-execution.service';
import { InProcessAgentAdapter } from './in-process-agent.adapter';
import { OutputFormatService } from './output-format.service';
import { AGENT_RUNTIME } from './ports/agent-runtime.port';
import { SandboxAgentAdapter } from './sandbox-agent.adapter';
import { AgentSessionFactory } from '../execution/services/agent-session-factory.service';
import { SessionPersistenceService } from '../execution/services/session-persistence.service';

@Module({
  imports: [
    DatabaseModule,
    ApiKeyModule,
    LlmModule,
    SandboxModule,
    McpModule,
    KnowledgeModule,
    SelfEvolutionModule,
  ],
  controllers: [AgentRuntimeController],
  providers: [
    AutonomyResolverService,
    AgentToolPermissionSyncService,
    CodeExecutionService,
    OutputFormatService,
    AgentSessionFactory,
    SessionPersistenceService,
    InProcessAgentAdapter,
    SandboxAgentAdapter,
    { provide: AGENT_RUNTIME, useClass: InProcessAgentAdapter },
    { provide: AGENT_RUNTIME_FACTORY, useClass: AgentAdapterFactory },
  ],
  exports: [
    AutonomyResolverService,
    CodeExecutionService,
    OutputFormatService,
    AgentSessionFactory,
    SessionPersistenceService,
    InProcessAgentAdapter,
    SandboxAgentAdapter,
    AGENT_RUNTIME,
    AGENT_RUNTIME_FACTORY,
  ],
})
export class AgentModule {}

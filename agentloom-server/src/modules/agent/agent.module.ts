import { Module } from '@nestjs/common';

import { SandboxModule } from '../sandbox/sandbox.module';
import { LlmModule } from '../llm/llm.module';
import { McpModule } from '../mcp/mcp.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

import {
  AGENT_RUNTIME_FACTORY,
  AgentAdapterFactory,
} from './agent-adapter.factory';
import { AutonomyResolverService } from './autonomy-resolver.service';
import { InProcessAgentAdapter } from './in-process-agent.adapter';
import { OutputFormatService } from './output-format.service';
import { AGENT_RUNTIME } from './ports/agent-runtime.port';
import { SandboxAgentAdapter } from './sandbox-agent.adapter';
import { AgentSessionFactory } from '../execution/services/agent-session-factory.service';
import { SessionPersistenceService } from '../execution/services/session-persistence.service';

@Module({
  imports: [LlmModule, SandboxModule, McpModule, KnowledgeModule],
  providers: [
    AutonomyResolverService,
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
    OutputFormatService,
    AgentSessionFactory,
    SessionPersistenceService,
    SandboxAgentAdapter,
    AGENT_RUNTIME,
    AGENT_RUNTIME_FACTORY,
  ],
})
export class AgentModule {}

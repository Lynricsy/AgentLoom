import { Module } from '@nestjs/common';

import { SandboxModule } from '../sandbox/sandbox.module';
import { LlmModule } from '../llm/llm.module';

import {
  AGENT_RUNTIME_FACTORY,
  AgentAdapterFactory,
} from './agent-adapter.factory';
import { AutonomyResolverService } from './autonomy-resolver.service';
import { InProcessAgentAdapter } from './in-process-agent.adapter';
import { OutputFormatService } from './output-format.service';
import { AGENT_RUNTIME } from './ports/agent-runtime.port';
import { SandboxAgentAdapter } from './sandbox-agent.adapter';

@Module({
  imports: [LlmModule, SandboxModule],
  providers: [
    AutonomyResolverService,
    OutputFormatService,
    InProcessAgentAdapter,
    SandboxAgentAdapter,
    { provide: AGENT_RUNTIME, useClass: InProcessAgentAdapter },
    { provide: AGENT_RUNTIME_FACTORY, useClass: AgentAdapterFactory },
  ],
  exports: [
    AutonomyResolverService,
    OutputFormatService,
    AGENT_RUNTIME,
    AGENT_RUNTIME_FACTORY,
  ],
})
export class AgentModule {}

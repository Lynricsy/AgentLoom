import { Module } from '@nestjs/common';
import { AutonomyResolverService } from './autonomy-resolver.service';
import { OutputFormatService } from './output-format.service';
import { InProcessAgentAdapter } from './in-process-agent.adapter';
import { AGENT_RUNTIME } from './ports/agent-runtime.port';

@Module({
  providers: [
    AutonomyResolverService,
    OutputFormatService,
    { provide: AGENT_RUNTIME, useClass: InProcessAgentAdapter },
  ],
  exports: [AutonomyResolverService, OutputFormatService, AGENT_RUNTIME],
})
export class AgentModule {}

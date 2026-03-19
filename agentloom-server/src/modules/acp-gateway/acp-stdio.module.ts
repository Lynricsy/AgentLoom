import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/config.module';
import { DatabaseModule } from '../../database/database.module';
import { InProcessAgentAdapter } from '../agent/in-process-agent.adapter';
import { AgentSessionFactory } from '../execution/services/agent-session-factory.service';
import { SessionPersistenceService } from '../execution/services/session-persistence.service';
import { LlmModule } from '../llm/llm.module';
import { AcpGatewayModule } from './acp-gateway.module';
import { ACP_TEST_RUNTIME_PROVIDER } from './testing/acp-test-runtime';

@Module({
  imports: [AppConfigModule, DatabaseModule, LlmModule, AcpGatewayModule],
  providers: [
    AgentSessionFactory,
    SessionPersistenceService,
    InProcessAgentAdapter,
    ACP_TEST_RUNTIME_PROVIDER,
  ],
})
export class AcpStdioModule {}

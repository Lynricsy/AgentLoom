import { Module } from '@nestjs/common';

import { AgentApiRuntimeModule } from '../agent-api-runtime/agent-api-runtime.module';
import { AgentConversationModule } from '../agent-conversation/agent-conversation.module';
import { AgentExecutionModule } from '../agent-execution/agent-execution.module';
import { AgentApiController } from './agent-api.controller';
import { AgentApiKeyController } from './agent-api-key.controller';
import { AgentApiKeyGuard } from './agent-api-key.guard';
import { AgentApiKeyService } from './agent-api-key.service';
import { AgentApiService } from './agent-api.service';

@Module({
  imports: [
    AgentApiRuntimeModule,
    AgentConversationModule,
    AgentExecutionModule,
  ],
  controllers: [AgentApiKeyController, AgentApiController],
  providers: [AgentApiKeyService, AgentApiKeyGuard, AgentApiService],
  exports: [AgentApiKeyService, AgentApiKeyGuard],
})
export class AgentApiModule {}

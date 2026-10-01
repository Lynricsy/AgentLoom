import { Module } from '@nestjs/common';

import { AgentApiKeyController } from './agent-api-key.controller';
import { AgentApiKeyGuard } from './agent-api-key.guard';
import { AgentApiKeyService } from './agent-api-key.service';

@Module({
  controllers: [AgentApiKeyController],
  providers: [AgentApiKeyService, AgentApiKeyGuard],
  exports: [AgentApiKeyService, AgentApiKeyGuard],
})
export class AgentApiModule {}

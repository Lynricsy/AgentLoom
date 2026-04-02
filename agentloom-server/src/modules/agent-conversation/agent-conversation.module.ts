import { Module } from '@nestjs/common';

import { AgentModule } from '../agent/agent.module';
import { WorkspaceIntegrationModule } from '../agent-execution/workspace-integration.module';
import { LlmModule } from '../llm/llm.module';
import { SelfEvolutionModule } from '../self-evolution/self-evolution.module';
import { UserPreferenceModule } from '../user-preference/user-preference.module';
import { AgentConversationController } from './agent-conversation.controller';
import { AgentConversationService } from './agent-conversation.service';
import { ConversationTitleService } from './conversation-title.service';

@Module({
  imports: [
    AgentModule,
    WorkspaceIntegrationModule,
    LlmModule,
    SelfEvolutionModule,
    UserPreferenceModule,
  ],
  controllers: [AgentConversationController],
  providers: [AgentConversationService, ConversationTitleService],
  exports: [
    AgentConversationService,
    ConversationTitleService,
    WorkspaceIntegrationModule,
  ],
})
export class AgentConversationModule {}

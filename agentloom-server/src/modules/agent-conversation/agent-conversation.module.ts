import { Module } from '@nestjs/common';

import { AgentModule } from '../agent/agent.module';
import { LlmModule } from '../llm/llm.module';
import { UserPreferenceModule } from '../user-preference/user-preference.module';
import { AgentConversationController } from './agent-conversation.controller';
import { AgentConversationService } from './agent-conversation.service';
import { ConversationTitleService } from './conversation-title.service';
import { WorkspaceIntegrationService } from '../agent-execution/workspace-integration.service';
import { SandboxModule } from '../sandbox/sandbox.module';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [AgentModule, SandboxModule, WorkspaceModule, LlmModule, UserPreferenceModule],
  controllers: [AgentConversationController],
  providers: [AgentConversationService, ConversationTitleService, WorkspaceIntegrationService],
  exports: [AgentConversationService, ConversationTitleService, WorkspaceIntegrationService],
})
export class AgentConversationModule {}

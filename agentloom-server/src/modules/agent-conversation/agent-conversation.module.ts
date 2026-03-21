import { Module } from '@nestjs/common';

import { AgentConversationController } from './agent-conversation.controller';
import { AgentConversationService } from './agent-conversation.service';
import { WorkspaceIntegrationService } from '../agent-execution/workspace-integration.service';
import { SandboxModule } from '../sandbox/sandbox.module';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [SandboxModule, WorkspaceModule],
  controllers: [AgentConversationController],
  providers: [AgentConversationService, WorkspaceIntegrationService],
  exports: [AgentConversationService, WorkspaceIntegrationService],
})
export class AgentConversationModule {}

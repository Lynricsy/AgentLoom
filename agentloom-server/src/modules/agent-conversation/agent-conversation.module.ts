import { Module } from '@nestjs/common';

import { AgentConversationController } from './agent-conversation.controller';
import { AgentConversationService } from './agent-conversation.service';

@Module({
  controllers: [AgentConversationController],
  providers: [AgentConversationService],
  exports: [AgentConversationService],
})
export class AgentConversationModule {}

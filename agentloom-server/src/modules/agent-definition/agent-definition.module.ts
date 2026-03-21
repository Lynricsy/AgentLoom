import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgentDefinitionController } from './agent-definition.controller';
import { AgentDefinitionService } from './agent-definition.service';

@Module({
  imports: [ConfigModule],
  controllers: [AgentDefinitionController],
  providers: [AgentDefinitionService],
  exports: [AgentDefinitionService],
})
export class AgentDefinitionModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ResourceSourceModule } from '../resource-source/resource-source.module';
import { AgentDefinitionController } from './agent-definition.controller';
import { AgentDefinitionService } from './agent-definition.service';

@Module({
  imports: [ConfigModule, ResourceSourceModule],
  controllers: [AgentDefinitionController],
  providers: [AgentDefinitionService],
  exports: [AgentDefinitionService],
})
export class AgentDefinitionModule {}

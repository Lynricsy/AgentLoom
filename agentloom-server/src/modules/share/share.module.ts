import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { KnowledgeModule } from '../knowledge/knowledge.module';
import { ResourceSourceModule } from '../resource-source/resource-source.module';
import { SkillModule } from '../skill/skill.module';
import { AgentShareController } from './agent-share.controller';
import { AgentShareImportService } from './agent-share-import.service';
import { ShareController } from './share.controller';
import { SharePublicController } from './share-public.controller';
import { ShareService } from './share.service';

@Module({
  imports: [ConfigModule, KnowledgeModule, SkillModule, ResourceSourceModule],
  controllers: [ShareController, AgentShareController, SharePublicController],
  providers: [ShareService, AgentShareImportService],
  exports: [ShareService],
})
export class ShareModule {}

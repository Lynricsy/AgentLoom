import { Module } from '@nestjs/common';

import { ResourceSourceModule } from '../resource-source/resource-source.module';
import { SkillController } from './skill.controller';
import { SkillResolverService } from './skill-resolver.service';
import { SkillService } from './skill.service';
import { SkillStorageService } from './skill-storage.service';

@Module({
  imports: [ResourceSourceModule],
  controllers: [SkillController],
  providers: [SkillService, SkillStorageService, SkillResolverService],
  exports: [SkillService, SkillStorageService, SkillResolverService],
})
export class SkillModule {}

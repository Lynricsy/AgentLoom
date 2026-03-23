import { Module } from '@nestjs/common';

import { SkillController } from './skill.controller';
import { SkillResolverService } from './skill-resolver.service';
import { SkillService } from './skill.service';
import { SkillStorageService } from './skill-storage.service';

@Module({
  controllers: [SkillController],
  providers: [SkillService, SkillStorageService, SkillResolverService],
  exports: [SkillService, SkillStorageService, SkillResolverService],
})
export class SkillModule {}

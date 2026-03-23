import { Module } from '@nestjs/common';

import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';
import { SkillStorageService } from './skill-storage.service';

@Module({
  controllers: [SkillController],
  providers: [SkillService, SkillStorageService],
  exports: [SkillService, SkillStorageService],
})
export class SkillModule {}

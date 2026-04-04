import { Module } from '@nestjs/common';

import { ResourceSourceController } from './resource-source.controller';
import { ResourceSourceService } from './resource-source.service';

@Module({
  controllers: [ResourceSourceController],
  providers: [ResourceSourceService],
  exports: [ResourceSourceService],
})
export class ResourceSourceModule {}

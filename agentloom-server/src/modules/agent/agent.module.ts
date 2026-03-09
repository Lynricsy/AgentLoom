import { Module } from '@nestjs/common';
import { AutonomyResolverService } from './autonomy-resolver.service';
import { OutputFormatService } from './output-format.service';

@Module({
  providers: [AutonomyResolverService, OutputFormatService],
  exports: [AutonomyResolverService, OutputFormatService],
})
export class AgentModule {}

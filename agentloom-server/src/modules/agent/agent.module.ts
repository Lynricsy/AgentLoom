import { Module } from '@nestjs/common'
import { AutonomyResolverService } from './autonomy-resolver.service'

@Module({
  providers: [AutonomyResolverService],
  exports: [AutonomyResolverService],
})
export class AgentModule {}

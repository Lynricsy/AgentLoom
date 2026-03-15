import { Module } from '@nestjs/common';
import { InterventionPolicyController } from './intervention-policy.controller';
import { InterventionPolicyService } from './intervention-policy.service';

@Module({
  controllers: [InterventionPolicyController],
  providers: [InterventionPolicyService],
  exports: [InterventionPolicyService],
})
export class InterventionPolicyModule {}

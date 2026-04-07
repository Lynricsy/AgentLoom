import { Module } from '@nestjs/common';
import { RedisModule } from '../../common/redis/redis.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { RbacCacheService } from '../../common/services/rbac-cache.service';
import { OrganizationAutonomyPolicyService } from './organization-autonomy-policy.service';

@Module({
  imports: [EvidenceModule, RedisModule],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    OrganizationAutonomyPolicyService,
    RbacCacheService,
  ],
  exports: [OrganizationService, OrganizationAutonomyPolicyService],
})
export class OrganizationModule {}

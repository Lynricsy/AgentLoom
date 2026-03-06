import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { RbacCacheService } from '../../common/services/rbac-cache.service';

@Module({
  controllers: [OrganizationController],
  providers: [OrganizationService, RbacCacheService],
  exports: [OrganizationService],
})
export class OrganizationModule {}

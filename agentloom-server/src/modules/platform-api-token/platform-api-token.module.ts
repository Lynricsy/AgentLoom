import { Module } from '@nestjs/common';

import { RbacCacheService } from '../../common/services/rbac-cache.service';
import { PlatformApiTokenController } from './platform-api-token.controller';
import { PlatformApiTokenService } from './platform-api-token.service';

@Module({
  controllers: [PlatformApiTokenController],
  providers: [PlatformApiTokenService, RbacCacheService],
  exports: [PlatformApiTokenService],
})
export class PlatformApiTokenModule {}

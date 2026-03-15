import { Module } from '@nestjs/common';

import { PlatformApiTokenController } from './platform-api-token.controller';
import { PlatformApiTokenService } from './platform-api-token.service';

@Module({
  controllers: [PlatformApiTokenController],
  providers: [PlatformApiTokenService],
  exports: [PlatformApiTokenService],
})
export class PlatformApiTokenModule {}

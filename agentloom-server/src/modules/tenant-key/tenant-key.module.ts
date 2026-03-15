import { Module } from '@nestjs/common';

import { TenantKeyController } from './tenant-key.controller';
import { TenantKeyService } from './tenant-key.service';

@Module({
  controllers: [TenantKeyController],
  providers: [TenantKeyService],
  exports: [TenantKeyService],
})
export class TenantKeyModule {}

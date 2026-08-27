import { Module } from '@nestjs/common';

import { PluginModule } from '../plugin/plugin.module';

import { TenantKeyController } from './tenant-key.controller';
import { TenantKeyService } from './tenant-key.service';

@Module({
  // 复用插件模块的租户组织解析器，避免不同入口各自实现组织回查而产生契约漂移。
  imports: [PluginModule],
  controllers: [TenantKeyController],
  providers: [TenantKeyService],
  exports: [TenantKeyService],
})
export class TenantKeyModule {}

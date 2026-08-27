import { Module } from '@nestjs/common';

import { TenantOrganizationResolver } from '../../common/providers/tenant-organization.resolver';

import { TenantKeyController } from './tenant-key.controller';
import { TenantKeyService } from './tenant-key.service';

@Module({
  // 只依赖轻量的租户组织解析器；此前 import PluginModule 会把基于 extism 的
  // 插件运行时拖进所有进程（含 ACP stdio），触发 Node WASI 告警污染 stderr。
  controllers: [TenantKeyController],
  providers: [TenantKeyService, TenantOrganizationResolver],
  exports: [TenantKeyService],
})
export class TenantKeyModule {}

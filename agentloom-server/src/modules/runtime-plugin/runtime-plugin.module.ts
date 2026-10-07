import { Module } from '@nestjs/common';

import { TenantOrganizationResolver } from '../../common/providers/tenant-organization.resolver';
import { PluginModule } from '../plugin/plugin.module';
import { RuntimePluginController } from './runtime-plugin.controller';
import { RuntimePluginService } from './runtime-plugin.service';

/**
 * sandbox 运行态 dsh runtime 插件：上传（复用节点插件的签名校验管线）、存储与状态管理。
 */
@Module({
  imports: [PluginModule],
  controllers: [RuntimePluginController],
  providers: [RuntimePluginService, TenantOrganizationResolver],
  exports: [RuntimePluginService],
})
export class RuntimePluginModule {}

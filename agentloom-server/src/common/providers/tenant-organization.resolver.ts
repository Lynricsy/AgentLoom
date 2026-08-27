import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { organizations } from '../../database/schema';
import { getTenantDb } from './tenant-aware-db.provider';

/**
 * 由 tenantId 反查组织 ID。
 *
 * 为什么单独抽一个 provider：租户密钥、插件等多个入口都需要在 JWT 缺少 org claim 时
 * 回查组织。此前 tenant-key 直接注入 PluginService 复用其私有实现，代价是
 * TenantKeyModule 必须 import PluginModule，把基于 @extism/extism 的插件运行时
 * 拖进每一个进程（包括 ACP stdio），触发 Node 的 WASI 实验特性告警并污染 stderr。
 * 这个 provider 只依赖 DRIZZLE，既保持解析口径唯一，又不牵连重量级依赖。
 */
@Injectable()
export class TenantOrganizationResolver {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** 解析不到组织时返回 null，由调用方决定抛出何种领域异常。 */
  async findOrganizationId(tenantId: string): Promise<string | null> {
    const [organization] = await getTenantDb(this.db)
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.tenantId, tenantId))
      .limit(1);

    return organization?.id ?? null;
  }
}

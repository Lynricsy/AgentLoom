import { SetMetadata } from '@nestjs/common';

export const SKIP_TENANT_API_QUOTA_KEY = 'skipTenantApiQuota';

/**
 * 管理员自救接口：不计入组织共享的分钟限流桶和每日 API 额度，改按调用者 + 接口单独限流（全局默认上限）。
 * 组织配额被打满后，owner/admin 仍能读取并调整资源治理配置（D-211）。只用于解除限制必需的接口。
 */
export const SkipTenantApiQuota = () =>
  SetMetadata(SKIP_TENANT_API_QUOTA_KEY, true);

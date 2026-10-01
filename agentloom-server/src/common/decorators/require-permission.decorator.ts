import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@agentloom/contracts';

export const PERMISSION_KEY = 'permission';

/**
 * 按 `@agentloom/contracts` 的 RBAC_PERMISSION_MATRIX 声明路由所需权限：
 * - RolesGuard 以矩阵中该权限的角色集合做判定（与 `@Roles` 二选一，方法级优先于类级）；
 * - 平台 API Token 限定了 scopes 时，ApiScopeGuard 要求 scopes 包含该权限。
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

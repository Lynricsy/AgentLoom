import { SetMetadata } from '@nestjs/common';
import type { OrgRole } from '../types/org-role.type';

export const ROLES_KEY = 'roles';

/**
 * 角色装饰器 - 标记路由需要的组织角色
 * 未标记 @Roles() 的路由会跳过 RolesGuard 检查
 *
 * @example
 * ```typescript
 * @Roles('owner', 'admin')
 * @Put(':id/members/:userId/role')
 * updateMemberRole() {}
 * ```
 */
export const Roles = (...roles: OrgRole[]) => SetMetadata(ROLES_KEY, roles);

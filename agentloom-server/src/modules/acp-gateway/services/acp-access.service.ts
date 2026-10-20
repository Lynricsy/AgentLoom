import { Injectable } from '@nestjs/common';
import { RBAC_PERMISSION_MATRIX, type Permission } from '@agentloom/contracts';
import { validate as isUuid } from 'uuid';
import {
  InsufficientPermissionsException,
  InvalidTenantContextException,
} from '../../../common/exceptions/auth.exceptions';
import { RbacCacheService } from '../../../common/services/rbac-cache.service';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import type { AcpConnectionState } from '../acp-types';

/**
 * ACP 网关的角色校验，与 HTTP `RolesGuard` 同一判定：权限矩阵取自 `@agentloom/contracts` 的
 * `RBAC_PERMISSION_MATRIX`，角色每次从组织成员表（经 Redis 缓存）读取，不信任 JWT 里的
 * `tenant_role` 声明，降级或移出组织在缓存失效后立即生效。
 * 失败抛 DomainException，由路由器转换为 `-32000`（`data.type` 为 `insufficient-permissions`）。
 */
@Injectable()
export class AcpAccessService {
  constructor(private readonly rbacCacheService: RbacCacheService) {}

  async assertPermission(
    state: AcpConnectionState,
    permission: Permission,
  ): Promise<void> {
    const authContext = state.authContext;
    const tenantId = authContext?.tenantId;
    if (!authContext || typeof tenantId !== 'string' || tenantId.length === 0) {
      throw new AcpJsonRpcError(-32002, 'Authentication required');
    }
    if (!isUuid(tenantId)) {
      throw new InvalidTenantContextException();
    }

    const requiredRoles = RBAC_PERMISSION_MATRIX[permission];
    const role = await this.rbacCacheService.getUserRole(
      tenantId,
      authContext.userId,
    );
    if (!role || !(requiredRoles as readonly string[]).includes(role)) {
      throw new InsufficientPermissionsException(
        [...requiredRoles],
        role ?? undefined,
      );
    }
  }
}

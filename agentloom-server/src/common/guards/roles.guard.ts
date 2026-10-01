import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RBAC_PERMISSION_MATRIX,
  type OrgRole,
  type Permission,
} from '@agentloom/contracts';
import type { FastifyRequest } from 'fastify';
import { validate as isUuid } from 'uuid';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import {
  InsufficientPermissionsException,
  InvalidTenantContextException,
  TenantRequiredException,
} from '../exceptions/auth.exceptions';
import { RbacCacheService } from '../services/rbac-cache.service';
import type { JwtPayload } from './auth.guard';

type DecoratorTargets = Parameters<Reflector['getAllAndOverride']>[1];

export type RouteAccessRequirement =
  | { kind: 'permission'; permission: Permission; roles: readonly OrgRole[] }
  | { kind: 'roles'; roles: readonly OrgRole[] };

/**
 * 路由的访问要求：每种元数据都是方法级覆盖类级；`@RequirePermission` 优先于 `@Roles`。
 * 返回 undefined 表示不做角色检查。RolesGuard、TenantGuard、ApiScopeGuard 与
 * 路由访问快照测试共用这一判定。
 */
export function resolveRouteAccess(
  reflector: Reflector,
  targets: DecoratorTargets,
): RouteAccessRequirement | undefined {
  const permission = reflector.getAllAndOverride<Permission | undefined>(
    PERMISSION_KEY,
    targets,
  );
  if (permission) {
    return {
      kind: 'permission',
      permission,
      roles: RBAC_PERMISSION_MATRIX[permission],
    };
  }

  const roles = reflector.getAllAndOverride<OrgRole[] | undefined>(
    ROLES_KEY,
    targets,
  );
  return roles ? { kind: 'roles', roles } : undefined;
}

export function resolveRequiredRoles(
  reflector: Reflector,
  targets: DecoratorTargets,
): readonly OrgRole[] | undefined {
  return resolveRouteAccess(reflector, targets)?.roles;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacCacheService: RbacCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );

    if (isPublic) return true;

    const requiredRoles = resolveRequiredRoles(this.reflector, targets);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: JwtPayload }>();
    const userId = request.user?.sub;
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
      throw new TenantRequiredException();
    }

    if (!isUuid(tenantId)) {
      throw new InvalidTenantContextException();
    }

    if (!userId) {
      throw new InsufficientPermissionsException([...requiredRoles]);
    }

    const userRole = await this.rbacCacheService.getUserRole(tenantId, userId);

    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new InsufficientPermissionsException(
        [...requiredRoles],
        userRole ?? undefined,
      );
    }

    return true;
  }
}

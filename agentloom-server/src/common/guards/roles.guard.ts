import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { validate as isUuid } from 'uuid';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import {
  InsufficientPermissionsException,
  InvalidTenantContextException,
  TenantRequiredException,
} from '../exceptions/auth.exceptions';
import type { OrgRole } from '../types/org-role.type';
import { RbacCacheService } from '../services/rbac-cache.service';
import type { JwtPayload } from './auth.guard';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacCacheService: RbacCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);

    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<OrgRole[] | undefined>(
      ROLES_KEY,
      targets,
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { user: JwtPayload }>();
    const userId = request.user?.sub;
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
      throw new TenantRequiredException();
    }

    if (!isUuid(tenantId)) {
      throw new InvalidTenantContextException();
    }

    if (!userId) {
      throw new InsufficientPermissionsException(requiredRoles);
    }

    const userRole = await this.rbacCacheService.getUserRole(tenantId, userId);

    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new InsufficientPermissionsException(requiredRoles, userRole ?? undefined);
    }

    return true;
  }
}

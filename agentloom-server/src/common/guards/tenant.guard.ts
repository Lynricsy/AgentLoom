import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { validate as isUuid } from 'uuid';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  InvalidTenantContextException,
  TenantRequiredException,
} from '../exceptions/auth.exceptions';
import type { JwtPayload } from './auth.guard';
import { resolveRequiredRoles } from './roles.guard';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );

    if (isPublic) return true;

    const requiredRoles = resolveRequiredRoles(this.reflector, targets);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: JwtPayload }>();
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
      throw new TenantRequiredException();
    }

    if (!isUuid(tenantId)) {
      throw new InvalidTenantContextException();
    }

    return true;
  }
}

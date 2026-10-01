import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@agentloom/contracts';
import type { FastifyRequest } from 'fastify';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { DomainException } from '../exceptions/domain.exception';
import type { AuthMethod } from './auth.guard';
import { resolveRouteAccess } from './roles.guard';

type ScopedRequest = FastifyRequest & {
  authMethod?: AuthMethod;
  apiKeyScopes?: Permission[] | null;
};

/**
 * 平台 API Token 作用域守卫，排在 RolesGuard 之后：角色决定上限，scopes 只能再收窄。
 * - 非 X-Api-Key 认证（JWT 会话）不受影响；
 * - scopes 为 null（历史 token / 未填写）视为继承所有者全部权限；
 * - scope 名即 `@RequirePermission` 的权限名；限定了 scopes 的 token 访问只声明了
 *   `@Roles`（尚未迁移到权限矩阵）或未声明权限的路由一律拒绝（默认拒绝）。
 */
@Injectable()
export class ApiScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<ScopedRequest>();
    if (request.authMethod !== 'api_key' || !request.apiKeyScopes) {
      return true;
    }

    const access = resolveRouteAccess(this.reflector, targets);
    const requiredScope =
      access?.kind === 'permission' ? access.permission : null;
    const grantedScopes = request.apiKeyScopes;

    if (!requiredScope || !grantedScopes.includes(requiredScope)) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/insufficient-scope',
        title: 'API Token 作用域不足',
        status: HttpStatus.FORBIDDEN,
        detail: requiredScope
          ? `缺少作用域：${requiredScope}`
          : '该接口未开放给限定作用域的 API Token',
        extensions: { requiredScope, grantedScopes },
      });
    }

    return true;
  }
}

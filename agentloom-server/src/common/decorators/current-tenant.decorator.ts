import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { JwtPayload } from '../guards/auth.guard';

/**
 * 当前租户参数装饰器
 * 从请求中提取 tenantId（由 AuthGuard 解析 JWT 后设置）
 *
 * @example
 * ```typescript
 * @Get('settings')
 * getSettings(@CurrentTenant() tenantId: string) {}
 * ```
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user: JwtPayload }>();
    return request.user?.tenantId;
  },
);

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { JwtPayload } from '../guards/auth.guard';

/**
 * 当前用户参数装饰器
 * 从请求中提取完整的 JwtPayload（由 AuthGuard 解析 JWT 后设置）
 *
 * @example
 * ```typescript
 * @Get('profile')
 * getProfile(@CurrentUser() user: JwtPayload) {}
 *
 * // 提取特定字段
 * @Get('me')
 * getMe(@CurrentUser('sub') userId: string) {}
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<FastifyRequest & { user: JwtPayload }>();
    const user = request.user;

    if (data) {
      return user?.[data];
    }

    return user;
  },
);

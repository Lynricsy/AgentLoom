import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../guards/auth.guard';
import { TokenBlacklistService } from './token-blacklist.service';
import { UserIdentityResolverService } from './user-identity-resolver.service';

/** 认证失败的 Socket.IO 连接错误码，客户端通过 `err.data.code` 读取。 */
export const WS_CLOSE_AUTH_FAILURE = 4001;

export class WsAuthError extends Error {
  readonly data: { code: number; reason: string };

  constructor(reason: string) {
    super(reason);
    this.data = { code: WS_CLOSE_AUTH_FAILURE, reason };
  }
}

/**
 * 所有 Socket.IO 命名空间共用的身份解析。
 *
 * 与 HTTP AuthGuard 保持同一身份契约：`sub` = public.users.id（应用用户 ID），
 * `supabaseUserId` = 原始 JWT sub。握手中间件与 WsJwtGuard 都只经过这里，
 * 不允许各 gateway 自行 jwt.verify。
 */
@Injectable()
export class WsAuthService {
  private readonly jwtSecret: string;

  constructor(
    configService: ConfigService,
    private readonly tokenBlacklist: TokenBlacklistService,
    private readonly userIdentityResolver: UserIdentityResolverService,
  ) {
    this.jwtSecret = configService.get<string>('APP_JWT_SECRET')!;
  }

  /** 安装握手中间件：成功时写入 `socket.data.user`，失败时以 4001 拒绝连接。 */
  attachHandshake(server: Server): void {
    server.use(async (socket, next) => {
      try {
        socket.data.user = await this.authenticate(this.extractToken(socket));
        next();
      } catch (error) {
        next(
          error instanceof WsAuthError
            ? error
            : new WsAuthError('Invalid or expired token'),
        );
      }
    });
  }

  extractToken(socket: Socket): string | undefined {
    const authToken: unknown = socket.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }
    const header = socket.handshake.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  }

  async authenticate(token: string | undefined): Promise<JwtPayload> {
    if (!token) {
      throw new WsAuthError('Authentication required');
    }

    if (await this.tokenBlacklist.isBlacklisted(token)) {
      throw new WsAuthError('Token has been revoked');
    }

    let verified: string | jwt.JwtPayload;
    try {
      verified = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
        audience: 'authenticated',
      });
    } catch (error) {
      throw new WsAuthError(
        error instanceof jwt.TokenExpiredError
          ? 'Token has expired'
          : 'Invalid or expired token',
      );
    }

    if (typeof verified === 'string') {
      throw new WsAuthError('Invalid token claims');
    }

    if (verified.type === 'mfa_pending') {
      throw new WsAuthError('MFA verification required');
    }

    if (
      typeof verified.sub !== 'string' ||
      !verified.aud ||
      typeof verified.exp !== 'number' ||
      typeof verified.iat !== 'number'
    ) {
      throw new WsAuthError('Invalid token claims');
    }

    const supabaseUserId = verified.sub;
    const appUserId =
      await this.userIdentityResolver.resolveAppUserId(supabaseUserId);
    if (!appUserId) {
      throw new WsAuthError('User account not found');
    }

    return {
      sub: appUserId,
      supabaseUserId,
      email: typeof verified.email === 'string' ? verified.email : '',
      aud: verified.aud,
      exp: verified.exp,
      iat: verified.iat,
      tenantId: readStringClaim(verified, 'tenantId', 'tenant_id'),
      tenantRole: readStringClaim(verified, 'tenantRole', 'tenant_role'),
    };
  }
}

function readStringClaim(
  payload: jwt.JwtPayload,
  ...claimNames: string[]
): string | undefined {
  for (const claimName of claimNames) {
    const value: unknown = payload[claimName];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

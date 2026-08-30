import { Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import * as jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { TokenBlacklistService } from '../../common/services/token-blacklist.service';
import { UserIdentityResolverService } from '../../common/services/user-identity-resolver.service';
import type { Notification } from '../../database/schema';
import type { JwtPayload } from '../../common/guards/auth.guard';

const WS_CLOSE_AUTH_FAILURE = 4001;

@WebSocketGateway({
  namespace: '/notification',
  cors: { origin: '*' },
})
@UseGuards(WsJwtGuard)
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly userIdentityResolver: UserIdentityResolverService,
  ) {}

  afterInit(server: Server): void {
    const secret = this.configService.get<string>('APP_JWT_SECRET');

    server.use(async (socket, next) => {
      const token =
        socket.handshake.auth?.token ??
        (socket.handshake.headers.authorization?.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);

      if (!token) {
        return next(this.createAuthError('Authentication required'));
      }

      try {
        if (await this.tokenBlacklistService.isBlacklisted(token)) {
          return next(this.createAuthError('Token has been revoked'));
        }

        const payload = jwt.verify(token, secret!, {
          algorithms: ['HS256'],
          audience: 'authenticated',
        }) as jwt.JwtPayload;

        if ((payload as Record<string, unknown>).type === 'mfa_pending') {
          return next(this.createAuthError('MFA verification required'));
        }

        if (!payload.sub || !payload.aud || !payload.exp || !payload.iat) {
          return next(this.createAuthError('Invalid token claims'));
        }

        const email = (payload as Record<string, unknown>).email as
          string | undefined;

        // 必须与 WsJwtGuard 保持同一身份契约：sub = 内部 app user id，
        // supabaseUserId = 原始 JWT sub。此前这里直接沿用原始 Supabase sub 建房间，
        // 而 processor 用内部 app user id 发送，房间键不一致导致通知永远送不到客户端。
        const supabaseUserId = payload.sub;
        const appUserId =
          await this.userIdentityResolver.resolveAppUserId(supabaseUserId);

        if (!appUserId) {
          return next(this.createAuthError('User account not found'));
        }

        socket.data.user = {
          sub: appUserId,
          supabaseUserId,
          email: email ?? '',
          aud: payload.aud,
          exp: payload.exp,
          iat: payload.iat,
          tenantId:
            ((payload as Record<string, unknown>).tenantId as
              string | undefined) ??
            ((payload as Record<string, unknown>).tenant_id as
              string | undefined),
          tenantRole:
            ((payload as Record<string, unknown>).tenantRole as
              string | undefined) ??
            ((payload as Record<string, unknown>).tenant_role as
              string | undefined),
        } satisfies JwtPayload;

        next();
      } catch {
        next(this.createAuthError('Invalid or expired token'));
      }
    });
  }

  handleConnection(client: Socket): void {
    const user = client.data?.user as JwtPayload | undefined;

    if (user?.tenantId && user.sub) {
      void client.join(this.buildRoom(user.tenantId, user.sub));
    }

    this.logger.debug(
      `Client connected: ${client.id} (user=${user?.sub ?? 'unknown'})`,
    );
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('notification:subscribe')
  async handleSubscribe(
    client: Socket,
  ): Promise<{ status: 'subscribed' | 'error' }> {
    const user = client.data?.user as JwtPayload | undefined;

    if (!user?.tenantId || !user.sub) {
      return { status: 'error' };
    }

    await client.join(this.buildRoom(user.tenantId, user.sub));
    return { status: 'subscribed' };
  }

  @SubscribeMessage('notification:unsubscribe')
  async handleUnsubscribe(
    client: Socket,
  ): Promise<{ status: 'unsubscribed' | 'error' }> {
    const user = client.data?.user as JwtPayload | undefined;

    if (!user?.tenantId || !user.sub) {
      return { status: 'error' };
    }

    await client.leave(this.buildRoom(user.tenantId, user.sub));
    return { status: 'unsubscribed' };
  }

  sendToUser(
    tenantId: string,
    userId: string,
    notification: Notification,
  ): void {
    const room = this.buildRoom(tenantId, userId);
    this.server.to(room).emit('notification.new', notification);
  }

  sendUnreadCount(tenantId: string, userId: string, count: number): void {
    const room = this.buildRoom(tenantId, userId);
    this.server.to(room).emit('notification.unread-count', { count });
  }

  private buildRoom(tenantId: string, userId: string): string {
    return `tenant:${tenantId}:user:${userId}`;
  }

  private createAuthError(message: string): Error & {
    data?: { code: number; reason: string };
  } {
    const err: Error & { data?: { code: number; reason: string } } = new Error(
      message,
    );
    err.data = { code: WS_CLOSE_AUTH_FAILURE, reason: message };
    return err;
  }
}

import { Logger, UseGuards } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { WsAuthService } from '../../common/services/ws-auth.service';
import type { Notification } from '../../database/schema';
import type { JwtPayload } from '../../common/guards/auth.guard';

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

  constructor(private readonly wsAuth: WsAuthService) {}

  /** 房间键使用应用用户 ID（与 NotificationProcessor 发送端一致），由 WsAuthService 保证。 */
  afterInit(server: Server): void {
    this.wsAuth.attachHandshake(server);
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
}

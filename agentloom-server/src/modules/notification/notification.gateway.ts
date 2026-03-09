import { Logger, UseGuards } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import type { Notification } from '../../database/schema';

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

  afterInit(): void {}

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  sendToUser(tenantId: string, userId: string, notification: Notification): void {
    const room = `tenant:${tenantId}:user:${userId}`;
    this.server.to(room).emit('notification:new', notification);
  }

  sendUnreadCount(tenantId: string, userId: string, count: number): void {
    const room = `tenant:${tenantId}:user:${userId}`;
    this.server.to(room).emit('notification:unread-count', { count });
  }
}

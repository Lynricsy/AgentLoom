import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/execution',
  cors: { origin: '*' },
})
export class ExecutionGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ExecutionGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('execution:subscribe')
  handleSubscribe(
    client: Socket,
    payload: { tenantId: string; executionId: string },
  ) {
    this.joinRoom(client, payload);
  }

  @SubscribeMessage('join')
  handleJoin(
    client: Socket,
    payload: { tenantId: string; executionId: string },
  ) {
    this.joinRoom(client, payload);
  }

  @SubscribeMessage('execution:unsubscribe')
  handleUnsubscribe(
    client: Socket,
    payload: { tenantId: string; executionId: string },
  ) {
    this.leaveRoom(client, payload);
  }

  @SubscribeMessage('leave')
  handleLeave(
    client: Socket,
    payload: { tenantId: string; executionId: string },
  ) {
    this.leaveRoom(client, payload);
  }

  private joinRoom(
    client: Socket,
    payload: { tenantId: string; executionId: string },
  ): void {
    const room = this.buildRoom(payload.tenantId, payload.executionId);
    void client.join(room);
    this.logger.debug(`Client ${client.id} joined room ${room}`);
  }

  private leaveRoom(
    client: Socket,
    payload: { tenantId: string; executionId: string },
  ): void {
    const room = this.buildRoom(payload.tenantId, payload.executionId);
    void client.leave(room);
    this.logger.debug(`Client ${client.id} left room ${room}`);
  }

  broadcastEvent(
    tenantId: string,
    executionId: string,
    event: string,
    data: Record<string, unknown>,
  ) {
    const room = this.buildRoom(tenantId, executionId);
    this.server.to(room).emit(event, data);
  }

  private buildRoom(tenantId: string, executionId: string): string {
    return `execution:${tenantId}:${executionId}`;
  }
}

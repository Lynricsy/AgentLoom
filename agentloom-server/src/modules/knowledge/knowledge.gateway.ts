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
import type { JwtPayload } from '../../common/guards/auth.guard';

export type DocumentRealtimeStatus =
  'uploaded' | 'processing' | 'ready' | 'failed';

export type DocumentProgressStage =
  'preparing' | 'parsing' | 'chunking' | 'queueing' | 'completed';

export interface DocumentStatusProgress {
  percentage: number;
  stage: DocumentProgressStage;
  currentStep: number;
  totalSteps: number;
}

export interface DocumentStatusEvent {
  documentId: string;
  knowledgeBaseId: string;
  status: DocumentRealtimeStatus;
  progress?: DocumentStatusProgress;
  errorMessage?: string;
}

export interface KnowledgeBaseUpdatedEvent {
  knowledgeBaseId: string;
}

/**
 * 房间订阅入参。`tenantId` 仅作为客户端自查用的可选回声，
 * 服务端一律以 JWT 的 tenantId 为准，绝不接受客户端指定租户。
 */
interface KnowledgeRoomPayload {
  tenantId?: string;
  knowledgeBaseId: string;
}

interface KnowledgeJoinAck {
  status: 'joined' | 'error';
  knowledgeBaseId?: string;
  error?: 'FORBIDDEN' | 'INVALID_PAYLOAD';
}

interface KnowledgeLeaveAck {
  status: 'left' | 'error';
  knowledgeBaseId?: string;
  error?: 'FORBIDDEN' | 'INVALID_PAYLOAD';
}

@WebSocketGateway({
  namespace: '/knowledge',
  cors: { origin: '*' },
})
@UseGuards(WsJwtGuard)
export class KnowledgeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(KnowledgeGateway.name);

  constructor(private readonly wsAuth: WsAuthService) {}

  /**
   * 握手期校验 JWT 并把身份写入 socket.data.user（统一走 WsAuthService）。
   * 未认证连接在握手阶段即被拒绝，房间只能由服务端解析出的 tenantId 构成。
   */
  afterInit(server: Server): void {
    this.wsAuth.attachHandshake(server);
  }

  handleConnection(client: Socket) {
    const user = client.data?.user as JwtPayload | undefined;
    this.logger.debug(
      `Client connected: ${client.id} (user=${user?.sub ?? 'unknown'})`,
    );
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoin(client: Socket, payload: KnowledgeRoomPayload): KnowledgeJoinAck {
    const resolved = this.resolveRoom(client, payload);
    if ('error' in resolved) {
      return { status: 'error', error: resolved.error };
    }

    void client.join(resolved.room);
    this.logger.debug(`Client ${client.id} joined room ${resolved.room}`);

    return { status: 'joined', knowledgeBaseId: payload.knowledgeBaseId };
  }

  @SubscribeMessage('leave')
  handleLeave(
    client: Socket,
    payload: KnowledgeRoomPayload,
  ): KnowledgeLeaveAck {
    const resolved = this.resolveRoom(client, payload);
    if ('error' in resolved) {
      return { status: 'error', error: resolved.error };
    }

    void client.leave(resolved.room);
    this.logger.debug(`Client ${client.id} left room ${resolved.room}`);

    return { status: 'left', knowledgeBaseId: payload.knowledgeBaseId };
  }

  emitDocumentStatusChanged(
    tenantId: string,
    knowledgeBaseId: string,
    event: DocumentStatusEvent,
  ) {
    const room = this.buildRoom(tenantId, knowledgeBaseId);
    this.server.to(room).emit('document:status-changed', event);
  }

  emitKnowledgeBaseUpdated(tenantId: string, knowledgeBaseId: string) {
    const room = this.buildRoom(tenantId, knowledgeBaseId);
    this.server.to(room).emit('knowledge-base:updated', {
      knowledgeBaseId,
    } satisfies KnowledgeBaseUpdatedEvent);
  }

  /**
   * 用 JWT 的 tenantId 解析房间；客户端若显式带了不一致的 tenantId 直接拒绝，
   * 避免「自报租户」窃听其他租户的文档处理事件。
   */
  private resolveRoom(
    client: Socket,
    payload: KnowledgeRoomPayload | undefined,
  ): { room: string } | { error: 'FORBIDDEN' | 'INVALID_PAYLOAD' } {
    const user = client.data?.user as JwtPayload | undefined;

    if (!user?.tenantId) {
      return { error: 'FORBIDDEN' };
    }

    if (payload?.tenantId && payload.tenantId !== user.tenantId) {
      return { error: 'FORBIDDEN' };
    }

    if (!payload?.knowledgeBaseId) {
      return { error: 'INVALID_PAYLOAD' };
    }

    return { room: this.buildRoom(user.tenantId, payload.knowledgeBaseId) };
  }

  private buildRoom(tenantId: string, knowledgeBaseId: string): string {
    return `knowledge:${tenantId}:${knowledgeBaseId}`;
  }
}

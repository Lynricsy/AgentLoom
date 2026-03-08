import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

export type DocumentRealtimeStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export type DocumentProgressStage =
  | 'preparing'
  | 'parsing'
  | 'chunking'
  | 'queueing'
  | 'completed';

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

@WebSocketGateway({
  namespace: '/knowledge',
  cors: { origin: '*' },
})
export class KnowledgeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(KnowledgeGateway.name);

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoin(client: Socket, payload: { tenantId: string; knowledgeBaseId: string }) {
    const room = this.buildRoom(payload.tenantId, payload.knowledgeBaseId);
    void client.join(room);
    this.logger.debug(`Client ${client.id} joined room ${room}`);
  }

  @SubscribeMessage('leave')
  handleLeave(client: Socket, payload: { tenantId: string; knowledgeBaseId: string }) {
    const room = this.buildRoom(payload.tenantId, payload.knowledgeBaseId);
    void client.leave(room);
    this.logger.debug(`Client ${client.id} left room ${room}`);
  }

  emitDocumentStatusChanged(
    tenantId: string,
    knowledgeBaseId: string,
    event: DocumentStatusEvent,
  ) {
    const room = this.buildRoom(tenantId, knowledgeBaseId);
    this.server.to(room).emit('document:status-changed', event);
  }

  emitKnowledgeBaseUpdated(
    tenantId: string,
    knowledgeBaseId: string,
  ) {
    const room = this.buildRoom(tenantId, knowledgeBaseId);
    this.server.to(room).emit('knowledge-base:updated', {
      knowledgeBaseId,
    } satisfies KnowledgeBaseUpdatedEvent);
  }

  private buildRoom(tenantId: string, knowledgeBaseId: string): string {
    return `knowledge:${tenantId}:${knowledgeBaseId}`;
  }
}

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
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { TokenBlacklistService } from '../../common/services/token-blacklist.service';
import type { JwtPayload } from '../../common/guards/auth.guard';

/** 认证失败的 WebSocket 关闭代码 */
const WS_CLOSE_AUTH_FAILURE = 4001;

export type DocumentRealtimeStatus =
  | 'uploaded'
  | 'processing'
  | 'ready'
  | 'failed';

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

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

  /**
   * 握手期校验 JWT 并把租户写入 socket.data.user。
   * 与 `/execution`、`/memory` 两个 namespace 保持同一套认证语义：
   * 未认证连接在握手阶段即被拒绝，房间只能由服务端解析出的 tenantId 构成。
   */
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
        const isBlacklisted =
          await this.tokenBlacklistService.isBlacklisted(token);
        if (isBlacklisted) {
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
          | string
          | undefined;

        socket.data.user = {
          sub: payload.sub,
          email: email ?? '',
          aud: payload.aud,
          exp: payload.exp,
          iat: payload.iat,
          tenantId:
            ((payload as Record<string, unknown>).tenantId as
              | string
              | undefined) ??
            ((payload as Record<string, unknown>).tenant_id as
              | string
              | undefined),
          tenantRole:
            ((payload as Record<string, unknown>).tenantRole as
              | string
              | undefined) ??
            ((payload as Record<string, unknown>).tenant_role as
              | string
              | undefined),
        } satisfies JwtPayload;

        next();
      } catch (err) {
        if (err instanceof Error && err.message.includes('MFA')) {
          return next(err);
        }
        if (err instanceof Error && err.message.includes('revoked')) {
          return next(err);
        }
        next(this.createAuthError('Invalid or expired token'));
      }
    });
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
  handleLeave(client: Socket, payload: KnowledgeRoomPayload): KnowledgeLeaveAck {
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

  /**
   * 构造带关闭代码的握手错误，客户端可从 `err.data.code` 读取。
   */
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

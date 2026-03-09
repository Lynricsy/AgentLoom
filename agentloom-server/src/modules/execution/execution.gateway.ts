import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WsException,
} from '@nestjs/websockets';
import { Logger, UseGuards, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { TokenBlacklistService } from '../../common/services/token-blacklist.service';
import { StateReplayService } from './services/state-replay.service';
import { ThrottleService } from './services/throttle.service';
import { EventBridgeService } from './services/event-bridge.service';
import type { JwtPayload } from '../../common/guards/auth.guard';
import type {
  ExecutionEventName,
  ExecutionStateSnapshot,
} from './types/execution-event.types';

interface SubscribePayload {
  tenantId?: string;
  executionId: string;
  lastEventId?: number;
}

interface UnsubscribePayload {
  tenantId?: string;
  executionId: string;
}

@WebSocketGateway({
  namespace: '/execution',
  cors: { origin: '*' },
})
@UseGuards(WsJwtGuard)
export class ExecutionGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit
{
  private readonly logger = new Logger(ExecutionGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly configService: ConfigService,
    private readonly stateReplayService: StateReplayService,
    private readonly throttleService: ThrottleService,
    @Inject(forwardRef(() => EventBridgeService))
    private readonly eventBridgeService: EventBridgeService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

  onModuleInit() {
    this.throttleService.registerFlushHandler((executionId, merged) => {
      const parts = executionId.split(':');
      const tenantId = parts.length >= 2 ? parts[0] : '';
      const execId = parts.length >= 2 ? parts[1] : executionId;

      for (const chunk of merged) {
        this.eventBridgeService.emitOutputChunk(tenantId, execId, {
          stepId: chunk.stepId,
          chunk: chunk.chunk,
          index: chunk.startIndex,
        });
      }
    });
  }

  afterInit(server: Server) {
    const secret = this.configService.get<string>('APP_JWT_SECRET');

    server.use(async (socket, next) => {
      const token =
        socket.handshake.auth?.token ??
        (socket.handshake.headers.authorization?.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);

      if (!token) {
        return next(new Error('Authentication required'));
      }

      try {
        const isBlacklisted =
          await this.tokenBlacklistService.isBlacklisted(token);
        if (isBlacklisted) {
          return next(new Error('Token has been revoked'));
        }

        const payload = jwt.verify(token, secret!, {
          algorithms: ['HS256'],
          audience: 'authenticated',
        }) as jwt.JwtPayload;

        if ((payload as Record<string, unknown>).type === 'mfa_pending') {
          return next(new Error('MFA verification required'));
        }

        socket.data.user = {
          sub: payload.sub,
          email: payload.email,
          aud: payload.aud,
          exp: payload.exp,
          iat: payload.iat,
          tenantId: payload.tenantId ?? payload.tenant_id,
          tenantRole: payload.tenantRole ?? payload.tenant_role,
        } satisfies JwtPayload;

        next();
      } catch (err) {
        if (err instanceof Error && err.message.includes('MFA')) {
          return next(err);
        }
        if (err instanceof Error && err.message.includes('revoked')) {
          return next(err);
        }
        next(new Error('Invalid or expired token'));
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

  @SubscribeMessage('execution:subscribe')
  async handleSubscribe(client: Socket, payload: SubscribePayload) {
    return this.subscribe(client, payload);
  }

  @SubscribeMessage('subscribe')
  async handleSubscribeLegacy(client: Socket, payload: SubscribePayload) {
    return this.subscribe(client, payload);
  }

  @SubscribeMessage('join')
  async handleJoin(client: Socket, payload: SubscribePayload) {
    return this.subscribe(client, payload);
  }

  @SubscribeMessage('execution:unsubscribe')
  handleUnsubscribe(client: Socket, payload: UnsubscribePayload) {
    this.unsubscribe(client, payload);
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribeLegacy(client: Socket, payload: UnsubscribePayload) {
    this.unsubscribe(client, payload);
  }

  @SubscribeMessage('leave')
  handleLeave(client: Socket, payload: UnsubscribePayload) {
    this.unsubscribe(client, payload);
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

  private async subscribe(
    client: Socket,
    payload: SubscribePayload,
  ): Promise<{ status: string; currentState: ExecutionStateSnapshot | null }> {
    const user = client.data?.user as JwtPayload | undefined;
    if (!user?.tenantId) {
      throw new WsException('Tenant context required');
    }

    if (payload.tenantId && payload.tenantId !== user.tenantId) {
      throw new WsException('Tenant mismatch: access denied');
    }

    const tenantId = user.tenantId;
    const { executionId, lastEventId } = payload;

    if (!executionId) {
      throw new WsException('executionId is required');
    }

    const snapshot = await this.stateReplayService.getExecutionSnapshot(
      executionId,
      tenantId,
      this.eventBridgeService,
    );

    if (!snapshot) {
      throw new WsException('Execution not found or access denied');
    }

    const room = this.buildRoom(tenantId, executionId);
    await client.join(room);
    this.logger.debug(`Client ${client.id} joined room ${room}`);

    this.replaySnapshot(client, snapshot, lastEventId);

    return { status: 'subscribed', currentState: snapshot };
  }

  private unsubscribe(client: Socket, payload: UnsubscribePayload): void {
    const user = client.data?.user as JwtPayload | undefined;
    const tenantId = user?.tenantId ?? payload.tenantId ?? '';
    const room = this.buildRoom(tenantId, payload.executionId);
    void client.leave(room);
    this.logger.debug(`Client ${client.id} left room ${room}`);
  }

  private replaySnapshot(
    client: Socket,
    snapshot: ExecutionStateSnapshot,
    lastEventId?: number,
  ): void {
    if (lastEventId != null) {
      const currentEventId =
        this.eventBridgeService.getLastEventId(snapshot.executionId) ?? 0;
      if (lastEventId >= currentEventId) {
        return;
      }
    }

    client.emit('execution.state.snapshot' satisfies `${string}`, snapshot);
  }

  broadcastTypedEvent<K extends (typeof ExecutionEventName)[keyof typeof ExecutionEventName]>(
    tenantId: string,
    executionId: string,
    event: K,
    data: Record<string, unknown>,
  ) {
    if (!this.throttleService.tryConsume(executionId)) {
      this.logger.warn(
        `Rate limit reached for execution ${executionId}, event ${event} dropped`,
      );
      return;
    }
    const room = this.buildRoom(tenantId, executionId);
    this.server.to(room).emit(event, data);
  }

  private buildRoom(tenantId: string, executionId: string): string {
    return `execution:${tenantId}:${executionId}`;
  }
}

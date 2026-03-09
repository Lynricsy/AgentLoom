import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import {
  Logger,
  UseGuards,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
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

/** 认证失败的 WebSocket 关闭代码 */
const WS_CLOSE_AUTH_FAILURE = 4001;

/** 背压队列每个执行实例的最大容量 */
const BACKPRESSURE_QUEUE_LIMIT = 500;

/** 背压队列排空重试间隔 (ms) */
const BACKPRESSURE_DRAIN_INTERVAL_MS = 100;

interface SubscribePayload {
  tenantId?: string;
  executionId: string;
  lastEventId?: number;
}

interface UnsubscribePayload {
  tenantId?: string;
  executionId: string;
}

interface QueuedEvent {
  readonly event: string;
  readonly data: Record<string, unknown>;
}

interface SubscribeResult {
  status: string;
  error?: string;
  currentState: ExecutionStateSnapshot | null;
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
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(ExecutionGateway.name);

  @WebSocketServer()
  server!: Server;

  /** 背压事件队列: key = `tenantId:executionId` */
  private readonly eventQueue = new Map<string, QueuedEvent[]>();
  private readonly drainTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

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

  onModuleDestroy(): void {
    for (const timer of this.drainTimers.values()) {
      clearTimeout(timer);
    }
    this.drainTimers.clear();
    this.eventQueue.clear();
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
        const err = this.createAuthError('Authentication required');
        return next(err);
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

        // jwt.verify 保证 sub/aud/exp/iat 存在（HS256 标准声明）
        if (!payload.sub || !payload.aud || !payload.exp || !payload.iat) {
          return next(this.createAuthError('Invalid token claims'));
        }

        const email =
          (payload as Record<string, unknown>).email as string | undefined;

        socket.data.user = {
          sub: payload.sub,
          email: email ?? '',
          aud: payload.aud,
          exp: payload.exp,
          iat: payload.iat,
          tenantId:
            (payload as Record<string, unknown>).tenantId as
              | string
              | undefined ??
            (payload as Record<string, unknown>).tenant_id as
              | string
              | undefined,
          tenantRole:
            (payload as Record<string, unknown>).tenantRole as
              | string
              | undefined ??
            (payload as Record<string, unknown>).tenant_role as
              | string
              | undefined,
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

  /**
   * 带背压控制的事件广播。
   * 当令牌桶耗尽时，事件进入队列而非丢弃，并通过定时器排空。
   */
  broadcastTypedEvent<
    K extends (typeof ExecutionEventName)[keyof typeof ExecutionEventName],
  >(
    tenantId: string,
    executionId: string,
    event: K,
    data: Record<string, unknown>,
  ) {
    const queueKey = `${tenantId}:${executionId}`;
    const queue = this.eventQueue.get(queueKey);

    if (queue && queue.length > 0) {
      this.drainQueueSync(tenantId, executionId, queueKey);
    }

    if (this.throttleService.tryConsume(executionId)) {
      const room = this.buildRoom(tenantId, executionId);
      this.server.to(room).emit(event, data);
    } else {
      this.enqueueEvent(tenantId, executionId, queueKey, event, data);
    }
  }

  /**
   * 清理指定执行实例的背压队列。
   * 在执行到达终态后调用以释放内存。
   */
  clearExecutionQueue(tenantId: string, executionId: string): void {
    const queueKey = `${tenantId}:${executionId}`;
    this.eventQueue.delete(queueKey);
    const timer = this.drainTimers.get(queueKey);
    if (timer) {
      clearTimeout(timer);
      this.drainTimers.delete(queueKey);
    }
  }

  private async subscribe(
    client: Socket,
    payload: SubscribePayload,
  ): Promise<SubscribeResult> {
    const user = client.data?.user as JwtPayload | undefined;
    if (!user?.tenantId) {
      return {
        status: 'error',
        error: 'FORBIDDEN',
        currentState: null,
      };
    }

    if (payload.tenantId && payload.tenantId !== user.tenantId) {
      return {
        status: 'error',
        error: 'FORBIDDEN',
        currentState: null,
      };
    }

    const tenantId = user.tenantId;
    const { executionId, lastEventId } = payload;

    if (!executionId) {
      return {
        status: 'error',
        error: 'INVALID_PAYLOAD',
        currentState: null,
      };
    }

    const snapshot = await this.stateReplayService.getExecutionSnapshot(
      executionId,
      tenantId,
      this.eventBridgeService,
    );

    if (!snapshot) {
      return {
        status: 'error',
        error: 'NOT_FOUND',
        currentState: null,
      };
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

  /**
   * 创建带有 close code 4001 的认证错误。
   * Socket.IO 客户端可通过 `err.data.code` 获取此代码。
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

  private enqueueEvent(
    tenantId: string,
    executionId: string,
    queueKey: string,
    event: string,
    data: Record<string, unknown>,
  ): void {
    let queue = this.eventQueue.get(queueKey);
    if (!queue) {
      queue = [];
      this.eventQueue.set(queueKey, queue);
    }

    if (queue.length >= BACKPRESSURE_QUEUE_LIMIT) {
      this.logger.warn(
        `Backpressure queue full for execution ${executionId} (limit=${BACKPRESSURE_QUEUE_LIMIT}), dropping oldest event`,
      );
      queue.shift();
    }

    queue.push({ event, data });

    if (!this.drainTimers.has(queueKey)) {
      const timer = setTimeout(() => {
        this.drainTimers.delete(queueKey);
        this.drainQueueSync(tenantId, executionId, queueKey);

        // 如果仍有积压，继续调度排空
        const remaining = this.eventQueue.get(queueKey);
        if (remaining && remaining.length > 0) {
          this.scheduleDrain(tenantId, executionId, queueKey);
        }
      }, BACKPRESSURE_DRAIN_INTERVAL_MS);
      this.drainTimers.set(queueKey, timer);
    }
  }

  private scheduleDrain(

    tenantId: string,
    executionId: string,
    queueKey: string,
  ): void {
    if (this.drainTimers.has(queueKey)) return;

    const timer = setTimeout(() => {
      this.drainTimers.delete(queueKey);
      this.drainQueueSync(tenantId, executionId, queueKey);

      const remaining = this.eventQueue.get(queueKey);
      if (remaining && remaining.length > 0) {
        this.scheduleDrain(tenantId, executionId, queueKey);
      }
    }, BACKPRESSURE_DRAIN_INTERVAL_MS);
    this.drainTimers.set(queueKey, timer);
  }

  private drainQueueSync(
    tenantId: string,
    executionId: string,
    queueKey: string,
  ): void {
    const queue = this.eventQueue.get(queueKey);
    if (!queue || queue.length === 0) return;

    const room = this.buildRoom(tenantId, executionId);

    while (
      queue.length > 0 &&
      this.throttleService.tryConsume(executionId)
    ) {
      const item = queue.shift()!;
      this.server.to(room).emit(item.event, item.data);
    }

    if (queue.length === 0) {
      this.eventQueue.delete(queueKey);
    }
  }

  private buildRoom(tenantId: string, executionId: string): string {
    return `execution:${tenantId}:${executionId}`;
  }
}

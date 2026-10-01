import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger, UseGuards, OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { WsAuthService } from '../../common/services/ws-auth.service';
import type { JwtPayload } from '../../common/guards/auth.guard';

// ────────────────────── 常量 ──────────────────────

// 背压队列每个 memory instance 的最大容量
const BACKPRESSURE_QUEUE_LIMIT = 500;

// 背压队列排空重试间隔 (ms)
const BACKPRESSURE_DRAIN_INTERVAL_MS = 100;

// 重连回放缓冲区每个 room 最大事件数
const REPLAY_BUFFER_LIMIT = 1000;

// ────────────────────── 事件名称 ──────────────────────

export const MemoryEventName = {
  NODE_CREATED: 'memory.node.created',
  NODE_UPDATED: 'memory.node.updated',
  NODE_DELETED: 'memory.node.deleted',
  // 边事件：验收 P2-13 要求建/删边同样有实时反馈，此前 wire 上完全没有这两个事件。
  EDGE_CREATED: 'memory.edge.created',
  EDGE_DELETED: 'memory.edge.deleted',
  VERSION_CREATED: 'memory.version.created',
  VERSION_ROLLBACK: 'memory.version.rollback',
  REVIEW_SUBMITTED: 'memory.review.submitted',
} as const;

export type MemoryEventName =
  (typeof MemoryEventName)[keyof typeof MemoryEventName];

// ────────────────────── 接口 ──────────────────────

interface MemorySubscribePayload {
  instanceId: string;
}

interface MemoryUnsubscribePayload {
  instanceId: string;
}

interface MemorySubscribeAck {
  status: 'subscribed' | 'error';
  instanceId?: string;
  error?: string;
}

interface MemoryUnsubscribeAck {
  status: 'unsubscribed';
  instanceId: string;
}

interface MemoryEvent {
  readonly eventId: number;
  readonly timestamp: string;
  readonly type: MemoryEventName;
  readonly data: Record<string, unknown>;
}

interface QueuedEvent {
  readonly event: string;
  readonly data: Record<string, unknown>;
}

interface ReplayEntry {
  readonly eventId: number;
  readonly event: string;
  readonly data: Record<string, unknown>;
}

// ────────────────────── Gateway ──────────────────────

@WebSocketGateway({
  namespace: '/memory',
  cors: { origin: '*' },
})
@UseGuards(WsJwtGuard)
export class MemoryGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  private readonly logger = new Logger(MemoryGateway.name);

  @WebSocketServer()
  server!: Server;

  // 单调递增事件 ID
  private eventCounter = 0;

  // 背压事件队列: key = `tenantId:instanceId`
  private readonly eventQueue = new Map<string, QueuedEvent[]>();
  private readonly drainTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  // 重连回放缓冲区: key = `tenantId:instanceId`
  private readonly replayBuffer = new Map<string, ReplayEntry[]>();

  constructor(private readonly wsAuth: WsAuthService) {}

  // ────────── 生命周期 ──────────

  onModuleDestroy(): void {
    for (const timer of this.drainTimers.values()) {
      clearTimeout(timer);
    }
    this.drainTimers.clear();
    this.eventQueue.clear();
    this.replayBuffer.clear();
  }

  afterInit(server: Server): void {
    this.wsAuth.attachHandshake(server);
  }

  handleConnection(client: Socket): void {
    const user = client.data?.user as JwtPayload | undefined;
    this.logger.debug(
      `Client connected: ${client.id} (user=${user?.sub ?? 'unknown'})`,
    );
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  // ────────── 订阅 / 取消订阅 ──────────

  @SubscribeMessage('memory:subscribe')
  async handleSubscribe(
    client: Socket,
    payload: MemorySubscribePayload,
  ): Promise<MemorySubscribeAck> {
    const user = client.data?.user as JwtPayload | undefined;
    if (!user?.tenantId) {
      return { status: 'error', error: 'FORBIDDEN' };
    }

    const { instanceId } = payload;
    if (!instanceId) {
      return { status: 'error', error: 'INVALID_PAYLOAD' };
    }

    const tenantId = user.tenantId;
    const room = this.buildRoom(tenantId, instanceId);
    await client.join(room);
    this.logger.debug(`Client ${client.id} joined room ${room}`);

    // lastEventId 重连回放
    const lastEventIdRaw = client.handshake.query?.lastEventId as
      string | undefined;
    if (lastEventIdRaw != null && lastEventIdRaw !== '') {
      const lastEventId = parseInt(lastEventIdRaw, 10);
      if (!isNaN(lastEventId)) {
        this.replayEventsSince(client, tenantId, instanceId, lastEventId);
      }
    }

    return { status: 'subscribed', instanceId };
  }

  @SubscribeMessage('memory:unsubscribe')
  handleUnsubscribe(
    client: Socket,
    payload: MemoryUnsubscribePayload,
  ): MemoryUnsubscribeAck {
    const user = client.data?.user as JwtPayload | undefined;
    const tenantId = user?.tenantId ?? '';
    const room = this.buildRoom(tenantId, payload.instanceId);
    void client.leave(room);
    this.logger.debug(`Client ${client.id} left room ${room}`);
    return { status: 'unsubscribed', instanceId: payload.instanceId };
  }

  // ────────── 公共 emit 方法（供 service 层直接调用）──────────

  emitNodeCreated(
    tenantId: string,
    instanceId: string,
    data: Record<string, unknown>,
  ): void {
    this.broadcastMemoryEvent(
      tenantId,
      instanceId,
      MemoryEventName.NODE_CREATED,
      data,
    );
  }

  emitNodeUpdated(
    tenantId: string,
    instanceId: string,
    data: Record<string, unknown>,
  ): void {
    this.broadcastMemoryEvent(
      tenantId,
      instanceId,
      MemoryEventName.NODE_UPDATED,
      data,
    );
  }

  emitNodeDeleted(
    tenantId: string,
    instanceId: string,
    data: Record<string, unknown>,
  ): void {
    this.broadcastMemoryEvent(
      tenantId,
      instanceId,
      MemoryEventName.NODE_DELETED,
      data,
    );
  }

  emitEdgeCreated(
    tenantId: string,
    instanceId: string,
    data: Record<string, unknown>,
  ): void {
    this.broadcastMemoryEvent(
      tenantId,
      instanceId,
      MemoryEventName.EDGE_CREATED,
      data,
    );
  }

  emitEdgeDeleted(
    tenantId: string,
    instanceId: string,
    data: Record<string, unknown>,
  ): void {
    this.broadcastMemoryEvent(
      tenantId,
      instanceId,
      MemoryEventName.EDGE_DELETED,
      data,
    );
  }

  emitVersionCreated(
    tenantId: string,
    instanceId: string,
    data: Record<string, unknown>,
  ): void {
    this.broadcastMemoryEvent(
      tenantId,
      instanceId,
      MemoryEventName.VERSION_CREATED,
      data,
    );
  }

  emitVersionRollback(
    tenantId: string,
    instanceId: string,
    data: Record<string, unknown>,
  ): void {
    this.broadcastMemoryEvent(
      tenantId,
      instanceId,
      MemoryEventName.VERSION_ROLLBACK,
      data,
    );
  }

  emitReviewSubmitted(
    tenantId: string,
    instanceId: string,
    data: Record<string, unknown>,
  ): void {
    this.broadcastMemoryEvent(
      tenantId,
      instanceId,
      MemoryEventName.REVIEW_SUBMITTED,
      data,
    );
  }

  // ────────── 背压队列管理 ──────────

  // 立即排空指定 memory instance 的背压队列。
  // 在 memory instance 操作到达终态后调用以确保所有事件投递完毕。
  flushMemoryQueue(tenantId: string, instanceId: string): void {
    const queueKey = `${tenantId}:${instanceId}`;
    const queue = this.eventQueue.get(queueKey);
    if (!queue || queue.length === 0) {
      this.clearMemoryQueue(tenantId, instanceId);
      return;
    }

    this.clearDrainTimer(queueKey);

    const room = this.buildRoom(tenantId, instanceId);
    const emitter = this.server.to(room);
    for (const item of queue) {
      emitter.emit(item.event, item.data);
    }

    this.eventQueue.delete(queueKey);
  }

  // 清理指定 memory instance 的背压队列。
  // 用于释放不再需要的内存资源。
  clearMemoryQueue(tenantId: string, instanceId: string): void {
    const queueKey = `${tenantId}:${instanceId}`;
    this.eventQueue.delete(queueKey);
    this.clearDrainTimer(queueKey);
  }

  // ────────── 私有方法 ──────────

  // 带背压控制和重连回放缓冲的事件广播。
  // 所有 memory 事件统一经由此方法发出。
  private broadcastMemoryEvent(
    tenantId: string,
    instanceId: string,
    eventName: MemoryEventName,
    data: Record<string, unknown>,
  ): void {
    const eventId = ++this.eventCounter;
    const envelope: MemoryEvent = {
      eventId,
      timestamp: new Date().toISOString(),
      type: eventName,
      data,
    };

    // 写入回放缓冲区
    this.appendToReplayBuffer(tenantId, instanceId, {
      eventId,
      event: eventName,
      data: envelope as unknown as Record<string, unknown>,
    });

    const queueKey = `${tenantId}:${instanceId}`;
    const queue = this.eventQueue.get(queueKey);

    // 如果有积压，先尝试排空
    if (queue && queue.length > 0) {
      this.drainQueueSync(tenantId, instanceId, queueKey);
    }

    // 尝试直接发送（简化版：无 ThrottleService，直接发送，仅在有积压时排队）
    const stillQueued = this.eventQueue.get(queueKey);
    if (stillQueued && stillQueued.length > 0) {
      // 仍有积压，入队等待排空
      this.enqueueEvent(
        tenantId,
        instanceId,
        queueKey,
        eventName,
        envelope as unknown as Record<string, unknown>,
      );
    } else {
      // 直接发送
      const room = this.buildRoom(tenantId, instanceId);
      this.server.to(room).emit(eventName, envelope);
    }
  }

  private enqueueEvent(
    tenantId: string,
    instanceId: string,
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
        `Backpressure queue full for memory instance ${instanceId} (limit=${BACKPRESSURE_QUEUE_LIMIT}), dropping oldest event`,
      );
      queue.shift();
    }

    queue.push({ event, data });

    if (!this.drainTimers.has(queueKey)) {
      this.scheduleDrain(tenantId, instanceId, queueKey);
    }
  }

  private scheduleDrain(
    tenantId: string,
    instanceId: string,
    queueKey: string,
  ): void {
    if (this.drainTimers.has(queueKey)) return;

    const timer = setTimeout(() => {
      this.drainTimers.delete(queueKey);
      this.drainQueueSync(tenantId, instanceId, queueKey);

      const remaining = this.eventQueue.get(queueKey);
      if (remaining && remaining.length > 0) {
        this.scheduleDrain(tenantId, instanceId, queueKey);
      }
    }, BACKPRESSURE_DRAIN_INTERVAL_MS);
    this.drainTimers.set(queueKey, timer);
  }

  private drainQueueSync(
    tenantId: string,
    instanceId: string,
    queueKey: string,
  ): void {
    const queue = this.eventQueue.get(queueKey);
    if (!queue || queue.length === 0) return;

    const room = this.buildRoom(tenantId, instanceId);

    // 简化版：直接排空全部（不依赖外部 ThrottleService）
    while (queue.length > 0) {
      const item = queue.shift()!;
      this.server.to(room).emit(item.event, item.data);
    }

    if (queue.length === 0) {
      this.eventQueue.delete(queueKey);
    }
  }

  // ────────── 重连回放 ──────────

  private appendToReplayBuffer(
    tenantId: string,
    instanceId: string,
    entry: ReplayEntry,
  ): void {
    const key = `${tenantId}:${instanceId}`;
    let buffer = this.replayBuffer.get(key);
    if (!buffer) {
      buffer = [];
      this.replayBuffer.set(key, buffer);
    }

    buffer.push(entry);

    // 维持缓冲区上限
    if (buffer.length > REPLAY_BUFFER_LIMIT) {
      buffer.splice(0, buffer.length - REPLAY_BUFFER_LIMIT);
    }
  }

  private replayEventsSince(
    client: Socket,
    tenantId: string,
    instanceId: string,
    lastEventId: number,
  ): void {
    const key = `${tenantId}:${instanceId}`;
    const buffer = this.replayBuffer.get(key);
    if (!buffer || buffer.length === 0) return;

    // 找到 lastEventId 之后的事件
    const missedEvents = buffer.filter((entry) => entry.eventId > lastEventId);
    for (const entry of missedEvents) {
      client.emit(entry.event, entry.data);
    }
  }

  // ────────── 工具方法 ──────────

  private buildRoom(tenantId: string, instanceId: string): string {
    return `memory:${tenantId}:${instanceId}`;
  }

  private clearDrainTimer(queueKey: string): void {
    const timer = this.drainTimers.get(queueKey);
    if (timer) {
      clearTimeout(timer);
      this.drainTimers.delete(queueKey);
    }
  }
}

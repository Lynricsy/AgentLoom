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
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { WsAuthService } from '../../common/services/ws-auth.service';
import { StateReplayService } from './services/state-replay.service';
import { ThrottleService } from './services/throttle.service';
import {
  EventBridgeService,
  ExecutionBroadcastIntent,
  type ExecutionBroadcastIntentPayload,
} from './services/event-bridge.service';
import type { JwtPayload } from '../../common/guards/auth.guard';
import { ExecutionEventName } from './types/execution-event.types';
import type {
  ExecutionEvent,
  ExecutionStateSnapshot,
  StepSnapshot,
  SubscribeAck,
} from './types/execution-event.types';

/** 背压队列每个执行实例的最大容量 */
const BACKPRESSURE_QUEUE_LIMIT = 500;

/** 背压队列排空重试间隔 (ms) */
const BACKPRESSURE_DRAIN_INTERVAL_MS = 100;

const INITIAL_REPLAY_ACTIVE_STEP_STATUSES = new Set([
  'queued',
  'running',
  'waiting_intervention',
]);

const INITIAL_REPLAY_EVENT_NAMES = new Set<ExecutionEventName>([
  ExecutionEventName.STEP_STATUS_CHANGED,
  ExecutionEventName.STEP_AGENT_EVENT,
  ExecutionEventName.STEP_RETRYING,
  ExecutionEventName.OUTPUT_CHUNK,
  ExecutionEventName.NODE_INTERVENTION_REQUIRED,
  ExecutionEventName.NODE_INTERVENTION_RESOLVED,
  ExecutionEventName.NODE_TOOL_CALL_STATUS,
  ExecutionEventName.NODE_TOOL_PERMISSION_REQUIRED,
  ExecutionEventName.NODE_TOOL_PERMISSION_RESOLVED,
]);

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
    private readonly wsAuth: WsAuthService,
    private readonly stateReplayService: StateReplayService,
    private readonly throttleService: ThrottleService,
    private readonly eventBridgeService: EventBridgeService,
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

  @OnEvent(ExecutionBroadcastIntent.BROADCAST)
  handleBroadcastIntent(payload: ExecutionBroadcastIntentPayload): void {
    if (!payload.event || !payload.data) return;
    this.broadcastTypedEvent(
      payload.tenantId,
      payload.executionId,
      payload.event,
      payload.data,
    );
  }

  @OnEvent(ExecutionBroadcastIntent.BROADCAST_IMMEDIATELY)
  handleImmediateBroadcastIntent(
    payload: ExecutionBroadcastIntentPayload,
  ): void {
    if (!payload.event || !payload.data) return;
    this.broadcastTypedEventImmediately(
      payload.tenantId,
      payload.executionId,
      payload.event,
      payload.data,
    );
  }

  @OnEvent(ExecutionBroadcastIntent.FLUSH_QUEUE)
  handleFlushQueueIntent(payload: ExecutionBroadcastIntentPayload): void {
    this.flushExecutionQueue(payload.tenantId, payload.executionId);
  }

  @OnEvent(ExecutionBroadcastIntent.CLEAR_QUEUE)
  handleClearQueueIntent(payload: ExecutionBroadcastIntentPayload): void {
    this.clearExecutionQueue(payload.tenantId, payload.executionId);
  }

  onModuleDestroy(): void {
    for (const timer of this.drainTimers.values()) {
      clearTimeout(timer);
    }
    this.drainTimers.clear();
    this.eventQueue.clear();
  }

  afterInit(server: Server) {
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

  broadcastTypedEventImmediately<
    K extends (typeof ExecutionEventName)[keyof typeof ExecutionEventName],
  >(
    tenantId: string,
    executionId: string,
    event: K,
    data: Record<string, unknown>,
  ) {
    const room = this.buildRoom(tenantId, executionId);
    this.server.to(room).emit(event, data);
  }

  flushExecutionQueue(tenantId: string, executionId: string): void {
    const queueKey = `${tenantId}:${executionId}`;
    const queue = this.eventQueue.get(queueKey);
    if (!queue || queue.length === 0) {
      this.clearExecutionQueue(tenantId, executionId);
      return;
    }

    this.clearDrainTimer(queueKey);

    const room = this.buildRoom(tenantId, executionId);
    const emitter = this.server.to(room);
    for (const item of queue) {
      emitter.emit(item.event, item.data);
    }

    this.eventQueue.delete(queueKey);
  }

  /**
   * 清理指定执行实例的背压队列。
   * 在执行到达终态后调用以释放内存。
   */
  clearExecutionQueue(tenantId: string, executionId: string): void {
    const queueKey = `${tenantId}:${executionId}`;
    this.eventQueue.delete(queueKey);
    this.clearDrainTimer(queueKey);
  }

  private async subscribe(
    client: Socket,
    payload: SubscribePayload,
  ): Promise<SubscribeAck> {
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
      const exists =
        await this.stateReplayService.checkExecutionExists(executionId);
      return {
        status: 'error',
        error: exists ? 'FORBIDDEN' : 'NOT_FOUND',
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
    const tenantId = user?.tenantId ?? '';
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

      const missedEvents = this.eventBridgeService.getEventsSince(
        snapshot.executionId,
        lastEventId,
      );
      if (missedEvents && missedEvents.length > 0) {
        for (const event of missedEvents) {
          client.emit(event.event satisfies `${string}`, event);
        }
        return;
      }
    }

    client.emit('execution.state.snapshot' satisfies `${string}`, snapshot);

    for (const event of this.getInitialReplayEvents(snapshot)) {
      client.emit(event.event satisfies `${string}`, event);
    }
  }

  private getInitialReplayEvents(
    snapshot: ExecutionStateSnapshot,
  ): ExecutionEvent[] {
    const activeStepIds = new Set(
      snapshot.steps
        .filter((step) => this.shouldReplayBufferedEventsForStep(step))
        .map((step) => step.stepId),
    );

    if (activeStepIds.size === 0) {
      return [];
    }

    return this.eventBridgeService
      .getBufferedEvents(snapshot.executionId)
      .filter((event) => {
        if (!INITIAL_REPLAY_EVENT_NAMES.has(event.event)) {
          return false;
        }

        const stepId = this.readEventStepId(event);
        return stepId !== null && activeStepIds.has(stepId);
      });
  }

  private shouldReplayBufferedEventsForStep(step: StepSnapshot): boolean {
    return INITIAL_REPLAY_ACTIVE_STEP_STATUSES.has(step.status);
  }

  private readEventStepId(event: ExecutionEvent): string | null {
    const stepId =
      'stepId' in event.data ? (event.data.stepId as unknown) : undefined;
    return typeof stepId === 'string' && stepId.length > 0 ? stepId : null;
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

    while (queue.length > 0 && this.throttleService.tryConsume(executionId)) {
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

  private clearDrainTimer(queueKey: string): void {
    const timer = this.drainTimers.get(queueKey);
    if (timer) {
      clearTimeout(timer);
      this.drainTimers.delete(queueKey);
    }
  }
}

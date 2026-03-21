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
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { TokenBlacklistService } from '../../common/services/token-blacklist.service';
import { ThrottleService } from '../execution/services/throttle.service';
import { EventBridgeService } from '../execution/services/event-bridge.service';
import { ExecutionEventName } from '../execution/types/execution-event.types';
import type {
  ExecutionEvent,
  ExecutionStatusChangedPayload,
  StepStatusChangedPayload,
  StepAgentEventPayload,
  ToolCallStatusPayload,
  InterventionRequiredPayload,
  InterventionResolvedPayload,
} from '../execution/types/execution-event.types';
import type { JwtPayload } from '../../common/guards/auth.guard';
import { AgentExecutionService } from './agent-execution.service';

export const ConversationEventName = {
  AGENT_MESSAGE_CHUNK: 'conversation.agent.message_chunk',
  AGENT_THINKING: 'conversation.agent.thinking',
  AGENT_TOOL_CALL: 'conversation.agent.tool_call',
  AGENT_TOOL_RESULT: 'conversation.agent.tool_result',
  AGENT_DONE: 'conversation.agent.done',
  SANDBOX_TERMINAL_OUTPUT: 'conversation.sandbox.terminal_output',
  SANDBOX_FILE_CHANGE: 'conversation.sandbox.file_change',
  STATUS_CHANGED: 'conversation.status.changed',
} as const;

export type ConversationEventName =
  (typeof ConversationEventName)[keyof typeof ConversationEventName];

interface ConversationSubscribePayload {
  tenantId?: string;
  conversationId: string;
  lastEventId?: number;
}

interface ConversationUnsubscribePayload {
  tenantId?: string;
  conversationId: string;
}

interface ConversationMessagePayload {
  conversationId: string;
  content: string;
  contentType?: 'text' | 'image' | 'file';
  metadata?: Record<string, unknown>;
}

interface ConversationCancelPayload {
  conversationId: string;
}

export interface ConversationSubscribeAck {
  status: 'subscribed' | 'error';
  error?: string;
}

interface QueuedEvent {
  readonly event: string;
  readonly data: Record<string, unknown>;
}

const WS_CLOSE_AUTH_FAILURE = 4001;

const BACKPRESSURE_QUEUE_LIMIT = 500;

const BACKPRESSURE_DRAIN_INTERVAL_MS = 100;

@WebSocketGateway({
  namespace: '/agent-conversation',
  cors: { origin: '*' },
})
@UseGuards(WsJwtGuard)
export class AgentConversationGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(AgentConversationGateway.name);

  @WebSocketServer()
  server!: Server;

  private readonly conversationSockets = new Map<string, Set<string>>();

  private readonly eventQueue = new Map<string, QueuedEvent[]>();
  private readonly drainTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly throttleService: ThrottleService,
    @Inject(forwardRef(() => EventBridgeService))
    private readonly eventBridgeService: EventBridgeService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly agentExecutionService: AgentExecutionService,
  ) {}

  onModuleInit() {
    this.throttleService.registerFlushHandler((executionId, merged) => {
      const parts = executionId.split(':');
      const tenantId = parts.length >= 2 ? parts[0] : '';
      const convId = parts.length >= 2 ? parts[1] : executionId;

      if (!this.hasSubscribers(convId)) return;

      for (const chunk of merged) {
        const envelope = this.eventBridgeService['createEnvelope'](
          ExecutionEventName.OUTPUT_CHUNK,
          tenantId,
          convId,
          {
            stepId: chunk.stepId,
            chunk: chunk.chunk,
            index: chunk.startIndex,
          },
        );
        this.broadcastConversationEvent(
          tenantId,
          convId,
          ConversationEventName.AGENT_MESSAGE_CHUNK,
          envelope as unknown as Record<string, unknown>,
        );
      }
    });
  }

  onModuleDestroy(): void {
    for (const timer of this.drainTimers.values()) {
      clearTimeout(timer);
    }
    this.drainTimers.clear();
    this.eventQueue.clear();
    this.conversationSockets.clear();
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
    for (const [convId, sockets] of this.conversationSockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.conversationSockets.delete(convId);
      }
    }
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('conversation:subscribe')
  async handleSubscribe(
    client: Socket,
    payload: ConversationSubscribePayload,
  ): Promise<ConversationSubscribeAck> {
    const user = client.data?.user as JwtPayload | undefined;
    if (!user?.tenantId) {
      return { status: 'error', error: 'FORBIDDEN' };
    }

    if (payload.tenantId && payload.tenantId !== user.tenantId) {
      return { status: 'error', error: 'FORBIDDEN' };
    }

    const tenantId = user.tenantId;
    const { conversationId, lastEventId } = payload;

    if (!conversationId) {
      return { status: 'error', error: 'INVALID_PAYLOAD' };
    }

    const room = this.buildRoom(tenantId, conversationId);
    await client.join(room);

    let sockets = this.conversationSockets.get(conversationId);
    if (!sockets) {
      sockets = new Set();
      this.conversationSockets.set(conversationId, sockets);
    }
    sockets.add(client.id);

    this.logger.debug(`Client ${client.id} subscribed to conversation ${conversationId}`);

    if (lastEventId != null) {
      this.replayEvents(client, conversationId, lastEventId);
    }

    return { status: 'subscribed' };
  }

  @SubscribeMessage('conversation:unsubscribe')
  handleUnsubscribe(
    client: Socket,
    payload: ConversationUnsubscribePayload,
  ): void {
    const user = client.data?.user as JwtPayload | undefined;
    const tenantId = user?.tenantId ?? '';
    const room = this.buildRoom(tenantId, payload.conversationId);
    void client.leave(room);

    const sockets = this.conversationSockets.get(payload.conversationId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.conversationSockets.delete(payload.conversationId);
      }
    }

    this.logger.debug(`Client ${client.id} unsubscribed from conversation ${payload.conversationId}`);
  }

  @SubscribeMessage('conversation:message')
  async handleMessage(
    client: Socket,
    payload: ConversationMessagePayload,
  ): Promise<{ status: 'ok' | 'error'; error?: string }> {
    const user = client.data?.user as JwtPayload | undefined;
    if (!user?.tenantId) {
      return { status: 'error', error: 'FORBIDDEN' };
    }

    if (!payload.conversationId || !payload.content) {
      return { status: 'error', error: 'INVALID_PAYLOAD' };
    }

    try {
      await this.agentExecutionService.injectMessage(
        payload.conversationId,
        {
          content: payload.content,
          role: 'user',
          contentType: payload.contentType ?? 'text',
          metadata: payload.metadata,
        },
      );
      return { status: 'ok' };
    } catch (error) {
      this.logger.warn(
        `Failed to inject message into conversation ${payload.conversationId}: ${(error as Error).message}`,
      );
      return { status: 'error', error: (error as Error).message };
    }
  }

  @SubscribeMessage('conversation:cancel')
  async handleCancel(
    client: Socket,
    payload: ConversationCancelPayload,
  ): Promise<{ status: 'ok' | 'error'; error?: string }> {
    const user = client.data?.user as JwtPayload | undefined;
    if (!user?.tenantId) {
      return { status: 'error', error: 'FORBIDDEN' };
    }

    if (!payload.conversationId) {
      return { status: 'error', error: 'INVALID_PAYLOAD' };
    }

    try {
      await this.agentExecutionService.cancelExecution(
        payload.conversationId,
      );
      return { status: 'ok' };
    } catch (error) {
      this.logger.warn(
        `Failed to cancel conversation ${payload.conversationId}: ${(error as Error).message}`,
      );
      return { status: 'error', error: (error as Error).message };
    }
  }

  @OnEvent('execution.status.changed')
  handleExecutionStatusChanged(
    payload: ExecutionStatusChangedPayload & { tenantId: string },
  ): void {
    const conversationId = payload.executionId;
    if (!this.hasSubscribers(conversationId)) return;

    const envelope = this.buildEventPayload(
      conversationId,
      payload.tenantId,
      payload,
    );
    this.broadcastConversationEvent(
      payload.tenantId,
      conversationId,
      ConversationEventName.STATUS_CHANGED,
      envelope,
    );

    if (['completed', 'failed', 'cancelled'].includes(payload.status)) {
      this.broadcastConversationEventImmediately(
        payload.tenantId,
        conversationId,
        ConversationEventName.AGENT_DONE,
        envelope,
      );
    }
  }

  @OnEvent(ExecutionEventName.STEP_STATUS_CHANGED)
  handleStepStatusChanged(
    payload: StepStatusChangedPayload & {
      tenantId: string;
      executionId: string;
    },
  ): void {
    const conversationId = payload.executionId;
    if (!this.hasSubscribers(conversationId)) return;

    const envelope = this.buildEventPayload(
      conversationId,
      payload.tenantId,
      payload,
    );
    this.broadcastConversationEvent(
      payload.tenantId,
      conversationId,
      ConversationEventName.STATUS_CHANGED,
      envelope,
    );
  }

  @OnEvent(ExecutionEventName.STEP_AGENT_EVENT)
  handleStepAgentEvent(
    payload: StepAgentEventPayload & {
      tenantId: string;
      executionId: string;
    },
  ): void {
    const conversationId = payload.executionId;
    if (!this.hasSubscribers(conversationId)) return;

    const eventType = payload.event?.type;
    let conversationEvent: ConversationEventName;

    switch (eventType) {
      case 'thinking':
        conversationEvent = ConversationEventName.AGENT_THINKING;
        break;
      case 'message_chunk':
        conversationEvent = ConversationEventName.AGENT_MESSAGE_CHUNK;
        break;
      case 'tool_call':
        conversationEvent = ConversationEventName.AGENT_TOOL_CALL;
        break;
      case 'tool_result':
        conversationEvent = ConversationEventName.AGENT_TOOL_RESULT;
        break;
      case 'terminal_output':
        conversationEvent = ConversationEventName.SANDBOX_TERMINAL_OUTPUT;
        break;
      case 'file_change':
        conversationEvent = ConversationEventName.SANDBOX_FILE_CHANGE;
        break;
      default:
        conversationEvent = ConversationEventName.AGENT_MESSAGE_CHUNK;
        break;
    }

    const envelope = this.buildEventPayload(
      conversationId,
      payload.tenantId,
      payload,
    );
    this.broadcastConversationEvent(
      payload.tenantId,
      conversationId,
      conversationEvent,
      envelope,
    );
  }

  @OnEvent(ExecutionEventName.NODE_TOOL_CALL_STATUS)
  handleToolCallStatus(
    payload: ToolCallStatusPayload & {
      tenantId: string;
      executionId: string;
    },
  ): void {
    const conversationId = payload.executionId;
    if (!this.hasSubscribers(conversationId)) return;

    const conversationEvent =
      payload.status === 'completed' || payload.status === 'failed'
        ? ConversationEventName.AGENT_TOOL_RESULT
        : ConversationEventName.AGENT_TOOL_CALL;

    const envelope = this.buildEventPayload(
      conversationId,
      payload.tenantId,
      payload,
    );
    this.broadcastConversationEvent(
      payload.tenantId,
      conversationId,
      conversationEvent,
      envelope,
    );
  }

  @OnEvent(ExecutionEventName.NODE_INTERVENTION_REQUIRED)
  handleInterventionRequired(
    payload: InterventionRequiredPayload & {
      tenantId: string;
      executionId: string;
    },
  ): void {
    const conversationId = payload.executionId;
    if (!this.hasSubscribers(conversationId)) return;

    const envelope = this.buildEventPayload(
      conversationId,
      payload.tenantId,
      payload,
    );
    this.broadcastConversationEvent(
      payload.tenantId,
      conversationId,
      ConversationEventName.STATUS_CHANGED,
      envelope,
    );
  }

  @OnEvent(ExecutionEventName.NODE_INTERVENTION_RESOLVED)
  handleInterventionResolved(
    payload: InterventionResolvedPayload & {
      tenantId: string;
      executionId: string;
    },
  ): void {
    const conversationId = payload.executionId;
    if (!this.hasSubscribers(conversationId)) return;

    const envelope = this.buildEventPayload(
      conversationId,
      payload.tenantId,
      payload,
    );
    this.broadcastConversationEvent(
      payload.tenantId,
      conversationId,
      ConversationEventName.STATUS_CHANGED,
      envelope,
    );
  }

  broadcastConversationEvent(
    tenantId: string,
    conversationId: string,
    event: ConversationEventName,
    data: Record<string, unknown>,
  ): void {
    const queueKey = `${tenantId}:${conversationId}`;
    const queue = this.eventQueue.get(queueKey);

    if (queue && queue.length > 0) {
      this.drainQueueSync(tenantId, conversationId, queueKey);
    }

    if (this.throttleService.tryConsume(conversationId)) {
      const room = this.buildRoom(tenantId, conversationId);
      this.server.to(room).emit(event, data);
    } else {
      this.enqueueEvent(tenantId, conversationId, queueKey, event, data);
    }
  }

  broadcastConversationEventImmediately(
    tenantId: string,
    conversationId: string,
    event: ConversationEventName,
    data: Record<string, unknown>,
  ): void {
    const room = this.buildRoom(tenantId, conversationId);
    this.server.to(room).emit(event, data);
  }

  flushConversationQueue(tenantId: string, conversationId: string): void {
    const queueKey = `${tenantId}:${conversationId}`;
    const queue = this.eventQueue.get(queueKey);
    if (!queue || queue.length === 0) {
      this.clearConversationQueue(tenantId, conversationId);
      return;
    }

    this.clearDrainTimer(queueKey);

    const room = this.buildRoom(tenantId, conversationId);
    const emitter = this.server.to(room);
    for (const item of queue) {
      emitter.emit(item.event, item.data);
    }

    this.eventQueue.delete(queueKey);
  }

  clearConversationQueue(tenantId: string, conversationId: string): void {
    const queueKey = `${tenantId}:${conversationId}`;
    this.eventQueue.delete(queueKey);
    this.clearDrainTimer(queueKey);
  }

  private hasSubscribers(conversationId: string): boolean {
    const sockets = this.conversationSockets.get(conversationId);
    return !!sockets && sockets.size > 0;
  }

  private replayEvents(
    client: Socket,
    conversationId: string,
    lastEventId: number,
  ): void {
    const currentEventId =
      this.eventBridgeService.getLastEventId(conversationId) ?? 0;
    if (lastEventId >= currentEventId) {
      return;
    }

    const missedEvents = this.eventBridgeService.getEventsSince(
      conversationId,
      lastEventId,
    );
    if (missedEvents && missedEvents.length > 0) {
      for (const event of missedEvents) {
        const conversationEvent = this.mapExecutionEventToConversation(
          event.event,
        );
        client.emit(conversationEvent, event);
      }
    }
  }

  private mapExecutionEventToConversation(
    executionEvent: string,
  ): ConversationEventName {
    switch (executionEvent) {
      case ExecutionEventName.OUTPUT_CHUNK:
        return ConversationEventName.AGENT_MESSAGE_CHUNK;
      case ExecutionEventName.STEP_AGENT_EVENT:
        return ConversationEventName.AGENT_THINKING;
      case ExecutionEventName.NODE_TOOL_CALL_STATUS:
        return ConversationEventName.AGENT_TOOL_CALL;
      case ExecutionEventName.EXECUTION_STATUS_CHANGED:
        return ConversationEventName.STATUS_CHANGED;
      case ExecutionEventName.STEP_STATUS_CHANGED:
        return ConversationEventName.STATUS_CHANGED;
      case ExecutionEventName.NODE_INTERVENTION_REQUIRED:
      case ExecutionEventName.NODE_INTERVENTION_RESOLVED:
        return ConversationEventName.STATUS_CHANGED;
      default:
        return ConversationEventName.AGENT_MESSAGE_CHUNK;
    }
  }

  private buildEventPayload(
    conversationId: string,
    tenantId: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      conversationId,
      tenantId,
      timestamp: new Date().toISOString(),
      eventId:
        this.eventBridgeService.getLastEventId(conversationId) ?? 0,
      ...data,
    };
  }

  private buildRoom(tenantId: string, conversationId: string): string {
    return `conversation:${tenantId}:${conversationId}`;
  }

  private createAuthError(
    message: string,
  ): Error & { data?: { code: number; reason: string } } {
    const err: Error & { data?: { code: number; reason: string } } =
      new Error(message);
    err.data = { code: WS_CLOSE_AUTH_FAILURE, reason: message };
    return err;
  }

  private enqueueEvent(
    tenantId: string,
    conversationId: string,
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
        `Backpressure queue full for conversation ${conversationId} (limit=${BACKPRESSURE_QUEUE_LIMIT}), dropping oldest event`,
      );
      queue.shift();
    }

    queue.push({ event, data });

    if (!this.drainTimers.has(queueKey)) {
      const timer = setTimeout(() => {
        this.drainTimers.delete(queueKey);
        this.drainQueueSync(tenantId, conversationId, queueKey);

        const remaining = this.eventQueue.get(queueKey);
        if (remaining && remaining.length > 0) {
          this.scheduleDrain(tenantId, conversationId, queueKey);
        }
      }, BACKPRESSURE_DRAIN_INTERVAL_MS);
      this.drainTimers.set(queueKey, timer);
    }
  }

  private scheduleDrain(
    tenantId: string,
    conversationId: string,
    queueKey: string,
  ): void {
    if (this.drainTimers.has(queueKey)) return;

    const timer = setTimeout(() => {
      this.drainTimers.delete(queueKey);
      this.drainQueueSync(tenantId, conversationId, queueKey);

      const remaining = this.eventQueue.get(queueKey);
      if (remaining && remaining.length > 0) {
        this.scheduleDrain(tenantId, conversationId, queueKey);
      }
    }, BACKPRESSURE_DRAIN_INTERVAL_MS);
    this.drainTimers.set(queueKey, timer);
  }

  private drainQueueSync(
    tenantId: string,
    conversationId: string,
    queueKey: string,
  ): void {
    const queue = this.eventQueue.get(queueKey);
    if (!queue || queue.length === 0) return;

    const room = this.buildRoom(tenantId, conversationId);

    while (
      queue.length > 0 &&
      this.throttleService.tryConsume(conversationId)
    ) {
      const item = queue.shift()!;
      this.server.to(room).emit(item.event, item.data);
    }

    if (queue.length === 0) {
      this.eventQueue.delete(queueKey);
    }
  }

  private clearDrainTimer(queueKey: string): void {
    const timer = this.drainTimers.get(queueKey);
    if (timer) {
      clearTimeout(timer);
      this.drainTimers.delete(queueKey);
    }
  }
}

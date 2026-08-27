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
  OnModuleDestroy,
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
  OutputChunkPayload,
  ToolCallStatusPayload,
  InterventionRequiredPayload,
  InterventionResolvedPayload,
} from '../execution/types/execution-event.types';
import type { JwtPayload } from '../../common/guards/auth.guard';
import { AgentExecutionService } from './agent-execution.service';
import type { AgentEvent } from '../agent/types/agent-event.types';
import type { SubAgentEventEnvelope } from './subagent';
import {
  CONVERSATION_STATE_SNAPSHOT_EVENT,
  type ConversationStateSnapshot,
} from '@agentloom/contracts';

export const ConversationEventName = {
  AGENT_MESSAGE_CHUNK: 'conversation.agent.message_chunk',
  AGENT_THINKING: 'conversation.agent.thinking',
  AGENT_TOOL_CALL: 'conversation.agent.tool_call',
  AGENT_TOOL_RESULT: 'conversation.agent.tool_result',
  AGENT_DONE: 'conversation.agent.done',
  SUBAGENT_STATUS: 'conversation.subagent.status',
  SANDBOX_TERMINAL_OUTPUT: 'conversation.sandbox.terminal_output',
  SANDBOX_FILE_CHANGE: 'conversation.sandbox.file_change',
  STATUS_CHANGED: 'conversation.status.changed',
  TITLE_UPDATED: 'conversation.title.updated',
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
  /** 增量补发完成后服务端的真实进度；客户端据此推进游标（snapshot 路径不带）。 */
  lastEventId?: number;
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
    private readonly eventBridgeService: EventBridgeService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly agentExecutionService: AgentExecutionService,
  ) {}

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

    this.logger.debug(
      `Client ${client.id} subscribed to conversation ${conversationId}`,
    );

    if (lastEventId != null) {
      const replayCursor = await this.replayEvents(
        client,
        tenantId,
        conversationId,
        lastEventId,
      );

      // 逐事件补发会跳过 unmapped 事件，客户端只能从「实际收到的」eventId 推进，
      // 游标会卡在最后一个可映射事件上，之后每次重连都重放同一段。
      // 这里把服务端真实进度回给客户端；snapshot 路径不带（它自己是 epoch 起点），
      // 快照查询失败时更不能推进。
      if (replayCursor !== null) {
        return { status: 'subscribed', lastEventId: replayCursor };
      }
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

    this.logger.debug(
      `Client ${client.id} unsubscribed from conversation ${payload.conversationId}`,
    );
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
      await this.agentExecutionService.injectMessage(payload.conversationId, {
        content: payload.content,
        role: 'user',
        contentType: payload.contentType ?? 'text',
        metadata: payload.metadata,
      });
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
      await this.agentExecutionService.cancelExecution(payload.conversationId);
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
    if (payload.executionType && payload.executionType !== 'conversation') {
      return;
    }

    const conversationId = payload.executionId;
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
    if (payload.executionType && payload.executionType !== 'conversation') {
      return;
    }

    const conversationId = payload.executionId;
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

  @OnEvent(ExecutionEventName.OUTPUT_CHUNK)
  handleOutputChunk(
    payload: OutputChunkPayload & {
      tenantId: string;
      executionId: string;
    },
  ): void {
    const isConversationChunk =
      payload.executionType === 'conversation' ||
      (!payload.executionType && payload.stepId === payload.executionId);

    if (!isConversationChunk) {
      return;
    }

    const conversationId = payload.executionId;
    const envelope = this.buildEventPayload(
      conversationId,
      payload.tenantId,
      payload,
    );
    this.broadcastConversationEvent(
      payload.tenantId,
      conversationId,
      ConversationEventName.AGENT_MESSAGE_CHUNK,
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
    if (payload.executionType && payload.executionType !== 'conversation') {
      return;
    }

    const conversationId = payload.executionId;
    const eventType = payload.event?.type as string | undefined;
    let conversationEvent: ConversationEventName;

    switch (eventType) {
      case 'thinking':
      case 'plan':
      case 'decision':
        conversationEvent = ConversationEventName.AGENT_THINKING;
        break;
      case 'message_chunk':
        conversationEvent = ConversationEventName.AGENT_MESSAGE_CHUNK;
        break;
      case 'terminal_output':
      case 'pty.output':
        conversationEvent = ConversationEventName.SANDBOX_TERMINAL_OUTPUT;
        break;
      case 'file_change':
        conversationEvent = ConversationEventName.SANDBOX_FILE_CHANGE;
        break;
      case 'tool_call':
      case 'done':
        return;
      default:
        return;
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
    if (payload.executionType && payload.executionType !== 'conversation') {
      return;
    }

    const conversationId = payload.executionId;
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
    if (payload.executionType && payload.executionType !== 'conversation') {
      return;
    }

    const conversationId = payload.executionId;
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
    if (payload.executionType && payload.executionType !== 'conversation') {
      return;
    }

    const conversationId = payload.executionId;
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

  @OnEvent('workspace.file_change')
  handleWorkspaceFileChange(payload: {
    tenantId: string;
    changedFiles: string[];
    timestamp: string;
    conversationId?: string;
  }): void {
    if (!payload.conversationId) {
      return;
    }

    for (const path of payload.changedFiles) {
      const envelope = this.buildEventPayload(
        payload.conversationId,
        payload.tenantId,
        {
          path,
          changeType: 'modified',
          timestamp: payload.timestamp,
        },
      );
      this.broadcastConversationEvent(
        payload.tenantId,
        payload.conversationId,
        ConversationEventName.SANDBOX_FILE_CHANGE,
        envelope,
      );
    }
  }

  @OnEvent('conversation.subagent.event')
  handleSubAgentEvent(payload: {
    conversationId: string;
    tenantId: string;
    event: AgentEvent;
    subagent: SubAgentEventEnvelope;
  }): void {
    const eventType = payload.event.type;
    let conversationEvent: ConversationEventName;

    switch (eventType) {
      case 'plan':
        conversationEvent = ConversationEventName.AGENT_THINKING;
        break;
      case 'message_chunk':
        conversationEvent = ConversationEventName.AGENT_MESSAGE_CHUNK;
        break;
      case 'tool_call': {
        const toolStatus =
          'call' in payload.event ? payload.event.call.status : undefined;
        conversationEvent =
          toolStatus === 'completed' || toolStatus === 'failed'
            ? ConversationEventName.AGENT_TOOL_RESULT
            : ConversationEventName.AGENT_TOOL_CALL;
        break;
      }
      case 'decision':
        conversationEvent = ConversationEventName.AGENT_THINKING;
        break;
      case 'done':
        conversationEvent = ConversationEventName.AGENT_DONE;
        break;
      default:
        conversationEvent = ConversationEventName.AGENT_MESSAGE_CHUNK;
        break;
    }

    const envelope = this.buildEventPayload(
      payload.conversationId,
      payload.tenantId,
      {
        event: payload.event,
        subagent: payload.subagent,
      } as unknown as Record<string, unknown>,
    );
    this.broadcastConversationEvent(
      payload.tenantId,
      payload.conversationId,
      conversationEvent,
      envelope,
    );
  }

  @OnEvent('conversation.subagent.status')
  handleSubAgentStatus(payload: {
    conversationId: string;
    tenantId: string;
    subagent: SubAgentEventEnvelope;
    handle: string;
    status: string;
    error?: string;
  }): void {
    const envelope = this.buildEventPayload(
      payload.conversationId,
      payload.tenantId,
      payload as unknown as Record<string, unknown>,
    );
    this.broadcastConversationEvent(
      payload.tenantId,
      payload.conversationId,
      ConversationEventName.SUBAGENT_STATUS,
      envelope,
    );
  }

  @OnEvent('conversation.title.updated')
  handleTitleUpdated(payload: {
    conversationId: string;
    tenantId: string;
    title: string;
  }): void {
    const envelope = this.buildEventPayload(
      payload.conversationId,
      payload.tenantId,
      { title: payload.title },
    );
    this.broadcastConversationEventImmediately(
      payload.tenantId,
      payload.conversationId,
      ConversationEventName.TITLE_UPDATED,
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

  /**
   * 重连补发。两级判别，缺一不可：
   *
   * 1. **计数器回退** —— `lastEventId > getLastEventId()` 说明服务端的进度比客户端
   *    还旧，只可能是 epoch 变了：终态 30s 后 `clearExecution()` 同时删 counter 与
   *    buffer（归零），或同一 conversation 已经开启下一轮（新 buffer 从 1 重新计数）。
   *    后者尤其阴险——新 buffer 存在，`getEventsSince(5)` 会返回空数组，看起来像
   *    「已追平」，实际整轮都漏了。
   * 2. **缓冲区是否覆盖** —— `getEventsSince()` 返回数组表示缓冲区仍持有这段区间
   *    （空数组＝确已追平）；返回 null 表示缓冲区没了或游标已滑出窗口。
   *
   * 此前只用 `lastEventId >= getLastEventId()` 抢先短路，上面两种回退都被误判为
   * 已追平而静默结束，断线期间的内容永远补不回来——这就是 D-12。
   */
  private async replayEvents(
    client: Socket,
    tenantId: string,
    conversationId: string,
    lastEventId: number,
  ): Promise<number | null> {
    const currentEventId =
      this.eventBridgeService.getLastEventId(conversationId) ?? 0;

    if (lastEventId <= currentEventId) {
      const missedEvents = this.eventBridgeService.getEventsSince(
        conversationId,
        lastEventId,
      );

      if (missedEvents !== null) {
        for (const event of missedEvents) {
          const conversationEvent = this.mapExecutionEventToConversation(event);
          if (!conversationEvent) {
            continue;
          }

          client.emit(conversationEvent, event);

          // 复刻 live 的终态语义与顺序：handleExecutionStatusChanged 在终态时
          // 紧跟着补一条 AGENT_DONE。少了它，客户端补回最后一段 chunk 后
          // 不会调 finishStreamingAssistantMessage，那条消息会永久卡在 streaming。
          if (this.isTerminalExecutionEvent(event)) {
            client.emit(ConversationEventName.AGENT_DONE, event);
          }
        }
        // 循环是同步的，这里读到的就是补发完成时刻的服务端进度。
        return this.eventBridgeService.getLastEventId(conversationId) ?? 0;
      }
    }

    await this.emitConversationSnapshot(client, tenantId, conversationId);
    return null;
  }

  /** 终态判定与 live 的 handleExecutionStatusChanged 保持同一套状态集合。 */
  private isTerminalExecutionEvent(event: ExecutionEvent): boolean {
    if (event.event !== ExecutionEventName.EXECUTION_STATUS_CHANGED) {
      return false;
    }

    const { status } = event.data as ExecutionStatusChangedPayload;
    return status === 'completed' || status === 'failed' || status === 'cancelled';
  }

  private async emitConversationSnapshot(
    client: Socket,
    tenantId: string,
    conversationId: string,
  ): Promise<void> {
    try {
      const messages =
        await this.agentExecutionService.getConversationSnapshotMessages(
          tenantId,
          conversationId,
        );

      // 游标必须在 DB 查询**之后**读:socket 早已 join room,查询期间产生的实时
      // 事件会先于 snapshot 抵达并推进客户端游标。若沿用查询前的旧值,客户端会
      // 被回退到更早的位置,下次 replay 就把这批 chunk 重复追加一遍。
      // 这里到 emit 之间不得再有 await。
      const lastEventId =
        this.eventBridgeService.getLastEventId(conversationId) ?? 0;

      const snapshot: ConversationStateSnapshot = {
        event: CONVERSATION_STATE_SNAPSHOT_EVENT,
        conversationId,
        lastEventId,
        reason: 'replay-buffer-gap',
        messages,
        timestamp: new Date().toISOString(),
      };

      client.emit(CONVERSATION_STATE_SNAPSHOT_EVENT, snapshot);
    } catch (error) {
      // 快照失败不能让订阅本身失败：客户端已经订阅上，后续实时事件仍应送达。
      this.logger.warn(
        `Failed to build conversation snapshot for ${conversationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private mapExecutionEventToConversation(
    executionEvent: ExecutionEvent,
  ): ConversationEventName | null {
    switch (executionEvent.event) {
      case ExecutionEventName.OUTPUT_CHUNK:
        return ConversationEventName.AGENT_MESSAGE_CHUNK;
      case ExecutionEventName.STEP_AGENT_EVENT: {
        const eventType = (executionEvent.data as StepAgentEventPayload).event
          ?.type as string | undefined;
        switch (eventType) {
          case 'thinking':
          case 'plan':
          case 'decision':
            return ConversationEventName.AGENT_THINKING;
          case 'message_chunk':
            return ConversationEventName.AGENT_MESSAGE_CHUNK;
          case 'pty.output':
          case 'terminal_output':
            return ConversationEventName.SANDBOX_TERMINAL_OUTPUT;
          case 'file_change':
            return ConversationEventName.SANDBOX_FILE_CHANGE;
          default:
            return null;
        }
      }
      case ExecutionEventName.NODE_TOOL_CALL_STATUS: {
        const toolCallStatus = executionEvent.data as ToolCallStatusPayload;
        return toolCallStatus.status === 'completed' ||
          toolCallStatus.status === 'failed'
          ? ConversationEventName.AGENT_TOOL_RESULT
          : ConversationEventName.AGENT_TOOL_CALL;
      }
      case ExecutionEventName.EXECUTION_STATUS_CHANGED:
        return ConversationEventName.STATUS_CHANGED;
      case ExecutionEventName.STEP_STATUS_CHANGED:
        return ConversationEventName.STATUS_CHANGED;
      case ExecutionEventName.NODE_INTERVENTION_REQUIRED:
      case ExecutionEventName.NODE_INTERVENTION_RESOLVED:
        return ConversationEventName.STATUS_CHANGED;
      default:
        return null;
    }
  }

  private buildEventPayload(
    conversationId: string,
    tenantId: string,
    data: object,
  ): Record<string, unknown> {
    return {
      conversationId,
      tenantId,
      timestamp: new Date().toISOString(),
      eventId: this.eventBridgeService.getLastEventId(conversationId) ?? 0,
      ...data,
    } as Record<string, unknown>;
  }

  private buildRoom(tenantId: string, conversationId: string): string {
    return `conversation:${tenantId}:${conversationId}`;
  }

  private createAuthError(
    message: string,
  ): Error & { data?: { code: number; reason: string } } {
    const err: Error & { data?: { code: number; reason: string } } = new Error(
      message,
    );
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

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { io, type Socket } from 'socket.io-client';
import { TokenBlacklistService } from '../src/common/services/token-blacklist.service';
import { UserIdentityResolverService } from '../src/common/services/user-identity-resolver.service';
import { WsJwtGuard } from '../src/common/guards/ws-jwt.guard';
import { KnowledgeGateway } from '../src/modules/knowledge/knowledge.gateway';
import { ExecutionGateway } from '../src/modules/execution/execution.gateway';
import { NotificationGateway } from '../src/modules/notification/notification.gateway';
import {
  MemoryEventName,
  MemoryGateway,
} from '../src/modules/agent-memory/memory.gateway';
import {
  AgentConversationGateway,
  ConversationEventName,
} from '../src/modules/agent-execution/agent-conversation.gateway';
import { AgentExecutionService } from '../src/modules/agent-execution/agent-execution.service';
import { EventBridgeService } from '../src/modules/execution/services/event-bridge.service';
import { StateReplayService } from '../src/modules/execution/services/state-replay.service';
import { ThrottleService } from '../src/modules/execution/services/throttle.service';
import { ExecutionEventName } from '../src/modules/execution/types/execution-event.types';
import type { ExecutionStateSnapshot } from '../src/modules/execution/types/execution-event.types';

const JWT_SECRET = 'test-e2e-jwt-secret';
const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KB_ID = '33333333-3333-4333-8333-333333333333';
const MEMORY_ID = '44444444-4444-4444-8444-444444444444';
const CONVERSATION_ID = '55555555-5555-4555-8555-555555555555';
const SOCKET_TIMEOUT_MS = 3_000;

type SocketError = Error & { data?: { code?: number; reason?: string } };
type SubscribeAck = {
  status: 'subscribed' | 'error';
  error?: string;
  currentState: ExecutionStateSnapshot | null;
};

function signToken(userId: string, tenantId: string): string {
  return jwt.sign(
    {
      sub: userId,
      email: `${userId}@example.com`,
      aud: 'authenticated',
      jti: crypto.randomUUID(),
      tenant_id: tenantId,
      tenant_role: 'owner',
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for socket event: ${event}`));
    }, SOCKET_TIMEOUT_MS);
    const handler = (value: T) => {
      clearTimeout(timer);
      resolve(value);
    };
    socket.once(event, handler);
  });
}

function emitWithAck<T>(
  socket: Socket,
  event: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ACK: ${event}`)),
      SOCKET_TIMEOUT_MS,
    );
    socket.emit(event, payload ?? {}, (ack: T) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

function delay(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Gateway live Socket.IO (E2E)', () => {
  let app: NestFastifyApplication;
  let baseUrl: string;
  let knowledgeGateway: KnowledgeGateway;
  let notificationGateway: NotificationGateway;
  let memoryGateway: MemoryGateway;
  let eventBridge: EventBridgeService;
  let conversationSnapshotMessages: ReturnType<typeof vi.fn>;
  let snapshots: Map<string, ExecutionStateSnapshot>;
  const sockets = new Set<Socket>();

  const tokenA = signToken(USER_A, TENANT_A);
  const tokenB = signToken(USER_B, TENANT_A);

  function connect(
    namespace:
      | '/knowledge'
      | '/execution'
      | '/notification'
      | '/memory'
      | '/agent-conversation',
    token?: string,
    query?: Record<string, string>,
  ): Socket {
    const socket = io(`${baseUrl}${namespace}`, {
      auth: token ? { token } : {},
      query,
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.add(socket);
    return socket;
  }

  async function connectAuthenticated(
    namespace:
      | '/knowledge'
      | '/execution'
      | '/notification'
      | '/memory'
      | '/agent-conversation',
    token = tokenA,
    query?: Record<string, string>,
  ): Promise<Socket> {
    const socket = connect(namespace, token, query);
    await waitForEvent(socket, 'connect');
    return socket;
  }

  function snapshot(
    executionId: string,
    steps: ExecutionStateSnapshot['steps'] = [],
  ): ExecutionStateSnapshot {
    return {
      executionId,
      status: 'running',
      completedSteps: 0,
      totalSteps: steps.length,
      steps,
      snapshotAt: new Date().toISOString(),
      lastEventId: eventBridge.getLastEventId(executionId) ?? 0,
    };
  }

  beforeAll(async () => {
    snapshots = new Map();
    const stateReplay = {
      getExecutionSnapshot: vi.fn(async (executionId: string) =>
        snapshots.get(executionId),
      ),
      checkExecutionExists: vi.fn().mockResolvedValue(false),
    };
    conversationSnapshotMessages = vi.fn().mockResolvedValue([]);
    const tokenBlacklist = {
      isBlacklisted: vi.fn().mockResolvedValue(false),
    };
    const identityResolver = {
      resolveAppUserId: vi.fn(async (userId: string) => userId),
    };
    const config = {
      get: vi.fn((key: string) =>
        key === 'APP_JWT_SECRET' ? JWT_SECRET : undefined,
      ),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        KnowledgeGateway,
        ExecutionGateway,
        NotificationGateway,
        MemoryGateway,
        AgentConversationGateway,
        EventBridgeService,
        ThrottleService,
        WsJwtGuard,
        { provide: ConfigService, useValue: config },
        { provide: TokenBlacklistService, useValue: tokenBlacklist },
        { provide: UserIdentityResolverService, useValue: identityResolver },
        { provide: StateReplayService, useValue: stateReplay },
        {
          provide: AgentExecutionService,
          useValue: {
            injectMessage: vi.fn(),
            cancelExecution: vi.fn(),
            getConversationSnapshotMessages: conversationSnapshotMessages,
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();

    knowledgeGateway = app.get(KnowledgeGateway);
    notificationGateway = app.get(NotificationGateway);
    memoryGateway = app.get(MemoryGateway);
    eventBridge = app.get(EventBridgeService);
  }, 120_000);

  afterEach(() => {
    for (const socket of sockets) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    sockets.clear();
    snapshots.clear();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await app?.close();
  });

  describe('/knowledge', () => {
    it('无 token 在握手期以 4001 拒绝，且收不到任何知识库事件', async () => {
      const socket = connect('/knowledge');
      const received: unknown[] = [];
      socket.on('document:status-changed', (event) => received.push(event));
      socket.on('knowledge-base:updated', (event) => received.push(event));

      const error = await waitForEvent<SocketError>(socket, 'connect_error');
      knowledgeGateway.emitDocumentStatusChanged(TENANT_A, KB_ID, {
        documentId: crypto.randomUUID(),
        knowledgeBaseId: KB_ID,
        status: 'ready',
      });
      await delay();

      expect(error.message).toBe('Authentication required');
      expect(error.data).toEqual({
        code: 4001,
        reason: 'Authentication required',
      });
      expect(socket.connected).toBe(false);
      expect(received).toEqual([]);
    });

    it('合法 token 自报其他 tenantId 时返回 FORBIDDEN 且不入房', async () => {
      const socket = await connectAuthenticated('/knowledge');
      const received: unknown[] = [];
      socket.on('document:status-changed', (event) => received.push(event));

      const ack = await emitWithAck(socket, 'join', {
        tenantId: TENANT_B,
        knowledgeBaseId: KB_ID,
      });
      knowledgeGateway.emitDocumentStatusChanged(TENANT_B, KB_ID, {
        documentId: crypto.randomUUID(),
        knowledgeBaseId: KB_ID,
        status: 'ready',
      });
      await delay();

      expect(ack).toEqual({ status: 'error', error: 'FORBIDDEN' });
      expect(received).toEqual([]);
    });

    it('房间从 JWT 租户推导，并接收本租户两类事件', async () => {
      const socket = await connectAuthenticated('/knowledge');
      const documentEvent = waitForEvent<Record<string, unknown>>(
        socket,
        'document:status-changed',
      );
      const knowledgeBaseEvent = waitForEvent<Record<string, unknown>>(
        socket,
        'knowledge-base:updated',
      );

      const ack = await emitWithAck(socket, 'join', {
        knowledgeBaseId: KB_ID,
      });
      const documentId = crypto.randomUUID();
      knowledgeGateway.emitDocumentStatusChanged(TENANT_A, KB_ID, {
        documentId,
        knowledgeBaseId: KB_ID,
        status: 'ready',
      });
      knowledgeGateway.emitKnowledgeBaseUpdated(TENANT_A, KB_ID);

      expect(ack).toEqual({ status: 'joined', knowledgeBaseId: KB_ID });
      await expect(documentEvent).resolves.toMatchObject({
        documentId,
        knowledgeBaseId: KB_ID,
        status: 'ready',
      });
      await expect(knowledgeBaseEvent).resolves.toEqual({ knowledgeBaseId: KB_ID });
    });

    it('缺 knowledgeBaseId 返回 INVALID_PAYLOAD', async () => {
      const socket = await connectAuthenticated('/knowledge');
      const ack = await emitWithAck(socket, 'join', {});

      expect(ack).toEqual({ status: 'error', error: 'INVALID_PAYLOAD' });
    });
  });

  describe('/execution', () => {
    it('无 lastEventId 时返回 subscribed/currentState ACK 并发送快照', async () => {
      const executionId = crypto.randomUUID();
      snapshots.set(executionId, snapshot(executionId));
      const socket = await connectAuthenticated('/execution');
      const snapshotEvent = waitForEvent<ExecutionStateSnapshot>(
        socket,
        'execution.state.snapshot',
      );

      const ack = await emitWithAck<SubscribeAck>(socket, 'execution:subscribe', {
        executionId,
      });

      expect(ack).toEqual({
        status: 'subscribed',
        currentState: snapshots.get(executionId),
      });
      await expect(snapshotEvent).resolves.toEqual(snapshots.get(executionId));
    });

    it('lastEventId 大于等于 currentEventId 时不发送任何回放包', async () => {
      const executionId = crypto.randomUUID();
      eventBridge.emitStepStatusChanged(TENANT_A, executionId, {
        stepId: 'step-1',
        nodeId: 'node-1',
        from: 'pending',
        to: 'running',
      });
      snapshots.set(executionId, snapshot(executionId));
      const socket = await connectAuthenticated('/execution');
      const received: unknown[] = [];
      socket.on('execution.state.snapshot', (event) => received.push(event));
      socket.on(ExecutionEventName.STEP_STATUS_CHANGED, (event) =>
        received.push(event),
      );

      const ack = await emitWithAck<SubscribeAck>(socket, 'execution:subscribe', {
        executionId,
        lastEventId: 1,
      });
      await delay();

      expect(ack.status).toBe('subscribed');
      expect(received).toEqual([]);
    });

    it('lastEventId 落后且缓冲可用时只补发缺失事件，不发送快照', async () => {
      const executionId = crypto.randomUUID();
      eventBridge.emitStepStatusChanged(TENANT_A, executionId, {
        stepId: 'step-1',
        nodeId: 'node-1',
        from: 'pending',
        to: 'running',
      });
      eventBridge.emitStepStatusChanged(TENANT_A, executionId, {
        stepId: 'step-1',
        nodeId: 'node-1',
        from: 'running',
        to: 'completed',
      });
      snapshots.set(executionId, snapshot(executionId));
      const socket = await connectAuthenticated('/execution');
      const replayed: Array<{ eventId: number }> = [];
      const snapshotsReceived: unknown[] = [];
      socket.on(ExecutionEventName.STEP_STATUS_CHANGED, (event) =>
        replayed.push(event),
      );
      socket.on('execution.state.snapshot', (event) =>
        snapshotsReceived.push(event),
      );

      const ack = await emitWithAck<SubscribeAck>(socket, 'execution:subscribe', {
        executionId,
        lastEventId: 1,
      });
      await delay();

      expect(ack.status).toBe('subscribed');
      expect(replayed.map((event) => event.eventId)).toEqual([2]);
      expect(snapshotsReceived).toEqual([]);
    });

    it('增量缓冲取不到时降级为快照与活跃步骤初始回放', async () => {
      const executionId = crypto.randomUUID();
      eventBridge.emitStepStatusChanged(TENANT_A, executionId, {
        stepId: 'step-active',
        nodeId: 'node-active',
        from: 'pending',
        to: 'running',
      });
      snapshots.set(
        executionId,
        snapshot(executionId, [
          {
            stepId: 'step-active',
            nodeId: 'node-active',
            status: 'running',
            startedAt: null,
            completedAt: null,
            result: null,
            checkpointData: null,
          },
        ]),
      );
      vi.spyOn(eventBridge, 'getEventsSince').mockReturnValueOnce(null);
      const socket = await connectAuthenticated('/execution');
      const snapshotEvent = waitForEvent<ExecutionStateSnapshot>(
        socket,
        'execution.state.snapshot',
      );
      const activeStepEvent = waitForEvent<{ eventId: number }>(
        socket,
        ExecutionEventName.STEP_STATUS_CHANGED,
      );

      const ack = await emitWithAck<SubscribeAck>(socket, 'execution:subscribe', {
        executionId,
        lastEventId: 0,
      });

      expect(ack.status).toBe('subscribed');
      await expect(snapshotEvent).resolves.toEqual(snapshots.get(executionId));
      await expect(activeStepEvent).resolves.toMatchObject({ eventId: 1 });
    });
  });

  describe('/notification', () => {
    it('通知按 tenant/user room 隔离，A 的通知不会流到 B', async () => {
      const socketA = await connectAuthenticated('/notification', tokenA);
      const socketB = await connectAuthenticated('/notification', tokenB);
      await emitWithAck(socketA, 'notification:subscribe');
      await emitWithAck(socketB, 'notification:subscribe');
      const receivedByA: unknown[] = [];
      const receivedByB: unknown[] = [];
      socketA.on('notification.new', (event) => receivedByA.push(event));
      socketB.on('notification.new', (event) => receivedByB.push(event));

      const notification = {
        id: crypto.randomUUID(),
        tenantId: TENANT_A,
        userId: USER_A,
        type: 'execution_completed',
        title: 'Execution completed',
      };
      notificationGateway.sendToUser(
        TENANT_A,
        USER_A,
        notification as never,
      );
      await delay();

      expect(receivedByA).toEqual([notification]);
      expect(receivedByB).toEqual([]);
    });
  });

  describe('/memory', () => {
    it('返回订阅 ACK，并按 lastEventId 回放后续事件', async () => {
      // 生产调用点在 MemoryNode/Edge/VersionService 的 broadcastAfterCommit；
      // 本用例固化 Gateway 的传输与按 lastEventId 回放。
      memoryGateway.emitNodeCreated(TENANT_A, MEMORY_ID, { nodeId: 'node-1' });
      memoryGateway.emitNodeUpdated(TENANT_A, MEMORY_ID, { nodeId: 'node-1' });
      const socket = await connectAuthenticated('/memory', tokenA, {
        lastEventId: '1',
      });
      const replay = waitForEvent<{ eventId: number; data: { nodeId: string } }>(
        socket,
        MemoryEventName.NODE_UPDATED,
      );

      const ack = await emitWithAck(socket, 'memory:subscribe', {
        instanceId: MEMORY_ID,
      });

      expect(ack).toEqual({ status: 'subscribed', instanceId: MEMORY_ID });
      await expect(replay).resolves.toMatchObject({
        eventId: 2,
        data: { nodeId: 'node-1' },
      });
    });

    it('边事件同样带单调 eventId 并可被订阅端收到', async () => {
      const socket = await connectAuthenticated('/memory', tokenA);
      const created = waitForEvent<{
        eventId: number;
        data: { edgeId: string };
      }>(socket, MemoryEventName.EDGE_CREATED);

      await emitWithAck(socket, 'memory:subscribe', {
        instanceId: MEMORY_ID,
      });

      memoryGateway.emitEdgeCreated(TENANT_A, MEMORY_ID, {
        edgeId: 'edge-1',
        parentNodeId: 'node-1',
        childNodeId: 'node-2',
      });

      await expect(created).resolves.toMatchObject({
        data: { edgeId: 'edge-1' },
      });
    });
  });

  // D-12：断线重连补发。缓存窗口内逐事件补发，缓存缺口回退持久 snapshot——
  // 修复前后者是静默 return，客户端永远补不回断线期间的正文。
  describe('/agent-conversation', () => {
    it('断线期间产生的 chunk 在重连订阅后被逐条补发，ack 回传服务端进度', async () => {
      // 1) socket1 正常订阅，收一条 live chunk 并记下游标。
      const socket1 = await connectAuthenticated('/agent-conversation');
      const liveChunk = waitForEvent<{ eventId: number }>(
        socket1,
        ConversationEventName.AGENT_MESSAGE_CHUNK,
      );
      await emitWithAck(socket1, 'conversation:subscribe', {
        conversationId: CONVERSATION_ID,
      });

      eventBridge.emitOutputChunk(TENANT_A, CONVERSATION_ID, {
        stepId: 'step-1',
        chunk: '断线前已收到',
        index: 0,
        executionType: 'conversation',
      });
      const { eventId: cursorBeforeDisconnect } = await liveChunk;

      // 2) 真断开：走完 gateway 的 disconnect 清理。
      socket1.removeAllListeners();
      socket1.disconnect();
      await delay(100);

      // 3) 断线期间继续产生事件——它们只进环形缓冲，没有任何在线客户端。
      eventBridge.emitOutputChunk(TENANT_A, CONVERSATION_ID, {
        stepId: 'step-1',
        chunk: '断线期间的第一段',
        index: 1,
        executionType: 'conversation',
      });
      eventBridge.emitOutputChunk(TENANT_A, CONVERSATION_ID, {
        stepId: 'step-1',
        chunk: '断线期间的第二段',
        index: 2,
        executionType: 'conversation',
      });
      const currentEventId = eventBridge.getLastEventId(CONVERSATION_ID);

      // 4) socket2 拿旧游标重连订阅。
      const socket2 = await connectAuthenticated('/agent-conversation');
      const replayed: string[] = [];
      socket2.on(
        ConversationEventName.AGENT_MESSAGE_CHUNK,
        (event: { data?: { chunk?: string } }) => {
          if (event?.data?.chunk) {
            replayed.push(event.data.chunk);
          }
        },
      );

      const ack = await emitWithAck<{
        status: string;
        lastEventId?: number;
      }>(socket2, 'conversation:subscribe', {
        conversationId: CONVERSATION_ID,
        lastEventId: cursorBeforeDisconnect,
      });
      await delay();

      expect(ack.status).toBe('subscribed');
      // 只补断线期间那两段，已收到的那段不得重发。
      expect(replayed).toEqual(['断线期间的第一段', '断线期间的第二段']);
      // ack 必须带服务端真实进度，否则客户端游标会卡在最后一个可映射事件上。
      expect(ack.lastEventId).toBe(currentEventId);
      expect(conversationSnapshotMessages).not.toHaveBeenCalled();
    });

    it('缓存缺口时回退持久 snapshot 而不是静默结束', async () => {
      const unbufferedConversationId = '66666666-6666-4666-8666-666666666666';
      conversationSnapshotMessages.mockResolvedValueOnce([
        {
          messageId: 'msg-persisted',
          role: 'assistant',
          contentType: 'text',
          content: '断线期间完成的完整回答',
          toolCalls: null,
          metadata: {},
          createdAt: new Date().toISOString(),
        },
      ]);

      const socket = await connectAuthenticated('/agent-conversation');
      const snapshotEvent = waitForEvent<{
        reason: string;
        messages: Array<{ messageId: string; content: string }>;
      }>(socket, 'conversation.state.snapshot');

      const ack = await emitWithAck<{
        status: string;
        lastEventId?: number;
      }>(socket, 'conversation:subscribe', {
        conversationId: unbufferedConversationId,
        // 旧游标高于服务端进度＝终态清理或新一轮重排，必须走 snapshot。
        lastEventId: 5,
      });

      expect(ack.status).toBe('subscribed');
      // snapshot 路径不带 ack 游标：snapshot 事件自己是新 epoch 的起点。
      expect(ack.lastEventId).toBeUndefined();
      expect(conversationSnapshotMessages).toHaveBeenCalledWith(
        TENANT_A,
        unbufferedConversationId,
      );
      await expect(snapshotEvent).resolves.toMatchObject({
        reason: 'replay-buffer-gap',
        messages: [{ messageId: 'msg-persisted' }],
      });
    });
  });
});

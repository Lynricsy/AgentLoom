import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { Logger } from '@nestjs/common';
import { ExecutionGateway } from '../execution.gateway';
import type { StateReplayService } from '../services/state-replay.service';
import type { ThrottleService } from '../services/throttle.service';
import type { EventBridgeService } from '../services/event-bridge.service';
import type { ConfigService } from '@nestjs/config';
import type { TokenBlacklistService } from '../../../common/services/token-blacklist.service';
import type { ExecutionStateSnapshot } from '../types/execution-event.types';
import * as jwt from 'jsonwebtoken';

vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

function makeSocket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'socket-1',
    handshake: { auth: { token: 'valid-jwt' }, headers: {} },
    data: { user: { sub: 'user-1', tenantId: 'tenant-1', email: 'a@b.com' } },
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn(),
    ...overrides,
  };
}

function makeSnapshot(
  overrides: Partial<ExecutionStateSnapshot> = {},
): ExecutionStateSnapshot {
  return {
    executionId: 'exec-1',
    status: 'running',
    completedSteps: 0,
    totalSteps: 3,
    steps: [],
    snapshotAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ExecutionGateway', () => {
  let gateway: ExecutionGateway;
  let mockConfig: { get: Mock };
  let mockStateReplay: {
    getExecutionSnapshot: Mock;
    checkExecutionExists: Mock;
  };
  let mockThrottle: {
    registerFlushHandler: Mock;
    tryConsume: Mock;
    hasPending: Mock;
    forceFlush: Mock;
    clearExecution: Mock;
    bufferOutputChunk: Mock;
  };
  let mockEventBridge: {
    getLastEventId: Mock;
    getEventsSince: Mock;
    getBufferedEvents: Mock;
    emitOutputChunk: Mock;
    emitStepStatusChanged: Mock;
    emitExecutionStatusChanged: Mock;
    clearExecution: Mock;
  };
  let mockTokenBlacklist: { isBlacklisted: Mock };
  let mockServer: { to: Mock; use: Mock };

  beforeEach(() => {
    mockConfig = { get: vi.fn().mockReturnValue('test-secret') };
    mockStateReplay = {
      getExecutionSnapshot: vi.fn().mockResolvedValue(makeSnapshot()),
      checkExecutionExists: vi.fn().mockResolvedValue(false),
    };
    mockThrottle = {
      registerFlushHandler: vi.fn(),
      tryConsume: vi.fn().mockReturnValue(true),
      hasPending: vi.fn().mockReturnValue(false),
      forceFlush: vi.fn().mockReturnValue([]),
      clearExecution: vi.fn(),
      bufferOutputChunk: vi.fn(),
    };
    mockEventBridge = {
      getLastEventId: vi.fn().mockReturnValue(0),
      getEventsSince: vi.fn().mockReturnValue(null),
      getBufferedEvents: vi.fn().mockReturnValue([]),
      emitOutputChunk: vi.fn(),
      emitStepStatusChanged: vi.fn(),
      emitExecutionStatusChanged: vi.fn(),
      clearExecution: vi.fn(),
    };
    mockServer = {
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      use: vi.fn(),
    };
    mockTokenBlacklist = {
      isBlacklisted: vi.fn().mockResolvedValue(false),
    };

    gateway = new ExecutionGateway(
      mockConfig as unknown as ConfigService,
      mockStateReplay as unknown as StateReplayService,
      mockThrottle as unknown as ThrottleService,
      mockEventBridge as unknown as EventBridgeService,
      mockTokenBlacklist as unknown as TokenBlacklistService,
    );
    gateway.server = mockServer as any;
  });

  afterEach(() => {
    gateway.onModuleDestroy();
  });

  describe('onModuleInit', () => {
    it('registers throttle flush handler', () => {
      gateway.onModuleInit();
      expect(mockThrottle.registerFlushHandler).toHaveBeenCalledOnce();
    });

    it('flush handler emits output chunks via EventBridge', () => {
      gateway.onModuleInit();
      const handler = mockThrottle.registerFlushHandler.mock.calls[0][0];

      handler('tenant-1:exec-1', [
        { stepId: 'step-1', chunk: 'hello ', startIndex: 0, endIndex: 2 },
      ]);

      expect(mockEventBridge.emitOutputChunk).toHaveBeenCalledWith(
        'tenant-1',
        'exec-1',
        { stepId: 'step-1', chunk: 'hello ', index: 0 },
      );
    });
  });

  describe('afterInit', () => {
    it('installs Socket.IO authentication middleware', () => {
      gateway.afterInit(mockServer as any);
      expect(mockServer.use).toHaveBeenCalledOnce();
      expect(typeof mockServer.use.mock.calls[0][0]).toBe('function');
    });
  });

  describe('authentication middleware', () => {
    it('accepts a bearer token and maps fallback JWT claims', async () => {
      const token = jwt.sign(
        {
          tenant_id: 'tenant-snake',
          tenant_role: 'member',
        },
        'test-secret',
        {
          subject: 'user-snake',
          audience: 'authenticated',
          expiresIn: '1h',
        },
      );
      gateway.afterInit(mockServer as any);
      const middleware = mockServer.use.mock.calls[0][0];
      const socket = makeSocket({
        handshake: {
          auth: {},
          headers: { authorization: `Bearer ${token}` },
        },
        data: {},
      });
      const next = vi.fn();

      await middleware(socket, next);

      expect(mockTokenBlacklist.isBlacklisted).toHaveBeenCalledWith(token);
      expect(socket.data.user).toMatchObject({
        sub: 'user-snake',
        email: '',
        tenantId: 'tenant-snake',
        tenantRole: 'member',
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('prefers auth token and camel-case tenant claims', async () => {
      const token = jwt.sign(
        {
          email: 'user@example.com',
          tenantId: 'tenant-camel',
          tenant_id: 'tenant-snake',
          tenantRole: 'owner',
          tenant_role: 'member',
        },
        'test-secret',
        {
          subject: 'user-camel',
          audience: 'authenticated',
          expiresIn: '1h',
        },
      );
      gateway.afterInit(mockServer as any);
      const middleware = mockServer.use.mock.calls[0][0];
      const socket = makeSocket({
        handshake: {
          auth: { token },
          headers: { authorization: 'Bearer ignored-token' },
        },
        data: {},
      });
      const next = vi.fn();

      await middleware(socket, next);

      expect(mockTokenBlacklist.isBlacklisted).toHaveBeenCalledWith(token);
      expect(socket.data.user).toMatchObject({
        email: 'user@example.com',
        tenantId: 'tenant-camel',
        tenantRole: 'owner',
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('rejects a blacklisted token with the authentication close code', async () => {
      mockTokenBlacklist.isBlacklisted.mockResolvedValue(true);
      gateway.afterInit(mockServer as any);
      const middleware = mockServer.use.mock.calls[0][0];
      const next = vi.fn();

      await middleware(makeSocket(), next);

      expect(next.mock.calls[0][0]).toMatchObject({
        message: 'Token has been revoked',
        data: { code: 4001, reason: 'Token has been revoked' },
      });
    });

    it('rejects an MFA-pending token', async () => {
      const token = jwt.sign({ type: 'mfa_pending' }, 'test-secret', {
        subject: 'user-1',
        audience: 'authenticated',
        expiresIn: '1h',
      });
      gateway.afterInit(mockServer as any);
      const middleware = mockServer.use.mock.calls[0][0];
      const next = vi.fn();

      await middleware(
        makeSocket({ handshake: { auth: { token }, headers: {} } }),
        next,
      );

      expect(next.mock.calls[0][0]).toMatchObject({
        message: 'MFA verification required',
        data: { code: 4001, reason: 'MFA verification required' },
      });
    });

    it('rejects a verified token that lacks required claims', async () => {
      const token = jwt.sign({}, 'test-secret', {
        audience: 'authenticated',
        expiresIn: '1h',
      });
      gateway.afterInit(mockServer as any);
      const middleware = mockServer.use.mock.calls[0][0];
      const next = vi.fn();

      await middleware(
        makeSocket({ handshake: { auth: { token }, headers: {} } }),
        next,
      );

      expect(next.mock.calls[0][0]).toMatchObject({
        message: 'Invalid token claims',
        data: { code: 4001, reason: 'Invalid token claims' },
      });
    });

    it('normalizes verification failures to an authentication error', async () => {
      gateway.afterInit(mockServer as any);
      const middleware = mockServer.use.mock.calls[0][0];
      const next = vi.fn();

      await middleware(makeSocket(), next);

      expect(next.mock.calls[0][0]).toMatchObject({
        message: 'Invalid or expired token',
        data: { code: 4001, reason: 'Invalid or expired token' },
      });
    });

    it.each(['MFA provider unavailable', 'token revoked upstream'])(
      'preserves explicit authentication errors containing %s',
      async (message) => {
        mockTokenBlacklist.isBlacklisted.mockRejectedValue(new Error(message));
        gateway.afterInit(mockServer as any);
        const middleware = mockServer.use.mock.calls[0][0];
        const next = vi.fn();

        await middleware(makeSocket(), next);

        expect(next.mock.calls[0][0]).toEqual(new Error(message));
      },
    );
  });

  describe('handleConnection', () => {
    it('logs authenticated client', () => {
      const client = makeSocket();
      gateway.handleConnection(client as any);
    });

    it('logs unknown user when no data.user', () => {
      const client = makeSocket({ data: {} });
      gateway.handleConnection(client as any);
    });
  });

  describe('handleDisconnect', () => {
    it('accepts disconnects from authenticated sockets', () => {
      expect(() => gateway.handleDisconnect(makeSocket() as any)).not.toThrow();
    });
  });

  describe('handleSubscribe / handleJoin', () => {
    it('joins room with tenant from JWT', async () => {
      const client = makeSocket();
      await gateway.handleSubscribe(client as any, { executionId: 'exec-1' });

      expect(client.join).toHaveBeenCalledWith('execution:tenant-1:exec-1');
    });

    it('handleJoin delegates to same subscribe logic', async () => {
      const client = makeSocket();
      await gateway.handleJoin(client as any, { executionId: 'exec-1' });

      expect(client.join).toHaveBeenCalledWith('execution:tenant-1:exec-1');
    });

    it('legacy subscribe returns the same acknowledgement', async () => {
      const client = makeSocket();

      const result = await gateway.handleSubscribeLegacy(client as any, {
        executionId: 'exec-1',
      });

      expect(result).toEqual({
        status: 'subscribed',
        currentState: makeSnapshot(),
      });
      expect(client.join).toHaveBeenCalledWith('execution:tenant-1:exec-1');
    });

    it('returns FORBIDDEN error when no tenant context', async () => {
      const client = makeSocket({
        data: { user: { sub: 'u1', email: 'a@b.com' } },
      });

      const result = await gateway.handleSubscribe(client as any, {
        executionId: 'exec-1',
      });

      expect(result).toEqual({
        status: 'error',
        error: 'FORBIDDEN',
        currentState: null,
      });
      expect(client.join).not.toHaveBeenCalled();
    });

    it('returns FORBIDDEN error on tenant mismatch', async () => {
      const client = makeSocket();

      const result = await gateway.handleSubscribe(client as any, {
        tenantId: 'other-tenant',
        executionId: 'exec-1',
      });

      expect(result).toEqual({
        status: 'error',
        error: 'FORBIDDEN',
        currentState: null,
      });
      expect(client.join).not.toHaveBeenCalled();
    });

    it('returns INVALID_PAYLOAD error when executionId is missing', async () => {
      const client = makeSocket();

      const result = await gateway.handleSubscribe(client as any, {
        executionId: '',
      });

      expect(result).toEqual({
        status: 'error',
        error: 'INVALID_PAYLOAD',
        currentState: null,
      });
      expect(client.join).not.toHaveBeenCalled();
    });

    it('emits state snapshot on subscribe', async () => {
      const snapshot = makeSnapshot();
      mockStateReplay.getExecutionSnapshot.mockResolvedValue(snapshot);
      mockEventBridge.getLastEventId.mockReturnValue(5);

      const client = makeSocket();
      await gateway.handleSubscribe(client as any, { executionId: 'exec-1' });

      expect(mockStateReplay.getExecutionSnapshot).toHaveBeenCalledWith(
        'exec-1',
        'tenant-1',
        mockEventBridge,
      );
      expect(client.emit).toHaveBeenCalledWith(
        'execution.state.snapshot',
        snapshot,
      );
    });

    it('首次订阅时会在快照后补发活动步骤的缓冲事件', async () => {
      const snapshot = makeSnapshot({
        steps: [
          {
            stepId: 'step-active',
            nodeId: 'node-active',
            status: 'running',
            startedAt: '2025-01-01T00:00:01.000Z',
            completedAt: null,
          },
          {
            stepId: 'step-done',
            nodeId: 'node-done',
            status: 'completed',
            startedAt: '2025-01-01T00:00:00.000Z',
            completedAt: '2025-01-01T00:00:10.000Z',
          },
        ],
      });
      mockStateReplay.getExecutionSnapshot.mockResolvedValue(snapshot);

      const bufferedEvents = [
        {
          eventId: 1,
          event: 'execution.node.output-chunk',
          timestamp: '2025-01-01T00:00:02.000Z',
          executionId: 'exec-1',
          tenantId: 'tenant-1',
          data: { stepId: 'step-active', chunk: 'Hello', index: 1 },
        },
        {
          eventId: 2,
          event: 'execution.node.tool-call-status',
          timestamp: '2025-01-01T00:00:03.000Z',
          executionId: 'exec-1',
          tenantId: 'tenant-1',
          data: {
            stepId: 'step-active',
            nodeId: 'node-active',
            toolCallId: 'tool-1',
            tool: 'search_docs',
            status: 'in_progress',
          },
        },
        {
          eventId: 3,
          event: 'execution.node.output-chunk',
          timestamp: '2025-01-01T00:00:04.000Z',
          executionId: 'exec-1',
          tenantId: 'tenant-1',
          data: { stepId: 'step-done', chunk: 'Ignore', index: 9 },
        },
        {
          eventId: 4,
          event: 'execution.status.changed',
          timestamp: '2025-01-01T00:00:05.000Z',
          executionId: 'exec-1',
          tenantId: 'tenant-1',
          data: { executionId: 'exec-1', status: 'running' },
        },
      ];
      mockEventBridge.getBufferedEvents.mockReturnValue(bufferedEvents);

      const client = makeSocket();
      await gateway.handleSubscribe(client as any, { executionId: 'exec-1' });

      expect(client.emit).toHaveBeenCalledTimes(3);
      expect(client.emit).toHaveBeenNthCalledWith(
        1,
        'execution.state.snapshot',
        snapshot,
      );
      expect(client.emit).toHaveBeenNthCalledWith(
        2,
        'execution.node.output-chunk',
        bufferedEvents[0],
      );
      expect(client.emit).toHaveBeenNthCalledWith(
        3,
        'execution.node.tool-call-status',
        bufferedEvents[1],
      );
    });

    it('skips snapshot when lastEventId is current', async () => {
      const snapshot = makeSnapshot();
      mockStateReplay.getExecutionSnapshot.mockResolvedValue(snapshot);
      mockEventBridge.getLastEventId.mockReturnValue(5);

      const client = makeSocket();
      await gateway.handleSubscribe(client as any, {
        executionId: 'exec-1',
        lastEventId: 5,
      });

      expect(client.emit).not.toHaveBeenCalled();
    });

    it('replays snapshot when lastEventId is behind', async () => {
      const snapshot = makeSnapshot();
      mockStateReplay.getExecutionSnapshot.mockResolvedValue(snapshot);
      mockEventBridge.getLastEventId.mockReturnValue(10);

      const client = makeSocket();
      await gateway.handleSubscribe(client as any, {
        executionId: 'exec-1',
        lastEventId: 3,
      });

      expect(client.emit).toHaveBeenCalledWith(
        'execution.state.snapshot',
        snapshot,
      );
    });

    it('handles snapshot loading failure gracefully', async () => {
      mockStateReplay.getExecutionSnapshot.mockRejectedValue(
        new Error('DB down'),
      );

      const client = makeSocket();
      await expect(
        gateway.handleSubscribe(client as any, { executionId: 'exec-1' }),
      ).rejects.toThrow('DB down');

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND error when execution not found (tenant verification)', async () => {
      mockStateReplay.getExecutionSnapshot.mockResolvedValue(null);

      const client = makeSocket();
      const result = await gateway.handleSubscribe(client as any, {
        executionId: 'exec-1',
      });

      expect(result).toEqual({
        status: 'error',
        error: 'NOT_FOUND',
        currentState: null,
      });
      expect(client.join).not.toHaveBeenCalled();
    });

    it('returns FORBIDDEN when execution exists in different tenant', async () => {
      mockStateReplay.getExecutionSnapshot.mockResolvedValue(null);
      mockStateReplay.checkExecutionExists.mockResolvedValue(true);

      const client = makeSocket();
      const result = await gateway.handleSubscribe(client as any, {
        executionId: 'exec-foreign',
      });

      expect(result).toEqual({
        status: 'error',
        error: 'FORBIDDEN',
        currentState: null,
      });
      expect(client.join).not.toHaveBeenCalled();
    });

    it('replays missed events incrementally when buffer covers the gap', async () => {
      const snapshot = makeSnapshot();
      mockStateReplay.getExecutionSnapshot.mockResolvedValue(snapshot);
      mockEventBridge.getLastEventId.mockReturnValue(5);

      const missedEvents = [
        { eventId: 4, event: 'execution.node.status-changed', data: {} },
        { eventId: 5, event: 'execution.node.output-chunk', data: {} },
      ];
      mockEventBridge.getEventsSince.mockReturnValue(missedEvents);

      const client = makeSocket();
      await gateway.handleSubscribe(client as any, {
        executionId: 'exec-1',
        lastEventId: 3,
      });

      expect(mockEventBridge.getEventsSince).toHaveBeenCalledWith('exec-1', 3);
      expect(client.emit).toHaveBeenCalledTimes(2);
      expect(client.emit).toHaveBeenCalledWith(
        'execution.node.status-changed',
        missedEvents[0],
      );
      expect(client.emit).toHaveBeenCalledWith(
        'execution.node.output-chunk',
        missedEvents[1],
      );
    });

    it('falls back to full snapshot when buffer does not cover the gap', async () => {
      const snapshot = makeSnapshot();
      mockStateReplay.getExecutionSnapshot.mockResolvedValue(snapshot);
      mockEventBridge.getLastEventId.mockReturnValue(10);
      mockEventBridge.getEventsSince.mockReturnValue(null);

      const client = makeSocket();
      await gateway.handleSubscribe(client as any, {
        executionId: 'exec-1',
        lastEventId: 3,
      });

      expect(client.emit).toHaveBeenCalledWith(
        'execution.state.snapshot',
        snapshot,
      );
    });

    it('falls back to event id zero and ignores invalid buffered step ids', async () => {
      const snapshot = makeSnapshot({
        steps: [
          {
            stepId: 'active',
            nodeId: 'node-active',
            status: 'queued',
            startedAt: null,
            completedAt: null,
          },
        ],
      });
      mockStateReplay.getExecutionSnapshot.mockResolvedValue(snapshot);
      mockEventBridge.getLastEventId.mockReturnValue(undefined);
      mockEventBridge.getEventsSince.mockReturnValue([]);
      mockEventBridge.getBufferedEvents.mockReturnValue([
        {
          eventId: 1,
          event: 'execution.node.output-chunk',
          executionId: 'exec-1',
          tenantId: 'tenant-1',
          timestamp: '2025-01-01T00:00:00.000Z',
          data: {},
        },
        {
          eventId: 2,
          event: 'execution.node.output-chunk',
          executionId: 'exec-1',
          tenantId: 'tenant-1',
          timestamp: '2025-01-01T00:00:01.000Z',
          data: { stepId: 42 },
        },
        {
          eventId: 3,
          event: 'execution.node.output-chunk',
          executionId: 'exec-1',
          tenantId: 'tenant-1',
          timestamp: '2025-01-01T00:00:02.000Z',
          data: { stepId: '' },
        },
      ]);
      const client = makeSocket();

      await gateway.handleSubscribe(client as any, {
        executionId: 'exec-1',
        lastEventId: -1,
      });

      expect(mockEventBridge.getEventsSince).toHaveBeenCalledWith('exec-1', -1);
      expect(client.emit).toHaveBeenCalledTimes(1);
      expect(client.emit).toHaveBeenCalledWith(
        'execution.state.snapshot',
        snapshot,
      );
    });

    it('does not request buffered events when no steps are active', async () => {
      const snapshot = makeSnapshot({
        steps: [
          {
            stepId: 'done',
            nodeId: 'node-done',
            status: 'completed',
            startedAt: null,
            completedAt: '2025-01-01T00:00:01.000Z',
          },
        ],
      });
      mockStateReplay.getExecutionSnapshot.mockResolvedValue(snapshot);
      const client = makeSocket();

      await gateway.handleSubscribe(client as any, { executionId: 'exec-1' });

      expect(mockEventBridge.getBufferedEvents).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledOnce();
    });
  });

  describe('handleUnsubscribe / handleLeave', () => {
    it('leaves room using JWT tenant', () => {
      const client = makeSocket();
      gateway.handleUnsubscribe(client as any, { executionId: 'exec-1' });

      expect(client.leave).toHaveBeenCalledWith('execution:tenant-1:exec-1');
    });

    it('handleLeave delegates to unsubscribe logic', () => {
      const client = makeSocket();
      gateway.handleLeave(client as any, { executionId: 'exec-1' });

      expect(client.leave).toHaveBeenCalledWith('execution:tenant-1:exec-1');
    });

    it('uses empty tenantId when no user context', () => {
      const client = makeSocket({ data: {} });
      gateway.handleUnsubscribe(client as any, {
        tenantId: 'tenant-x',
        executionId: 'exec-1',
      });

      expect(client.leave).toHaveBeenCalledWith('execution::exec-1');
    });

    it('legacy unsubscribe delegates to the same leave behavior', () => {
      const client = makeSocket();

      gateway.handleUnsubscribeLegacy(client as any, {
        executionId: 'exec-1',
      });

      expect(client.leave).toHaveBeenCalledWith('execution:tenant-1:exec-1');
    });
  });

  describe('broadcastEvent', () => {
    it('emits event to correct room', () => {
      const emitFn = vi.fn();
      mockServer.to.mockReturnValue({ emit: emitFn });

      gateway.broadcastEvent('t1', 'e1', 'test-event', { key: 'val' });

      expect(mockServer.to).toHaveBeenCalledWith('execution:t1:e1');
      expect(emitFn).toHaveBeenCalledWith('test-event', { key: 'val' });
    });
  });

  describe('broadcastTypedEvent', () => {
    it('broadcasts when throttle allows', () => {
      const emitFn = vi.fn();
      mockServer.to.mockReturnValue({ emit: emitFn });

      gateway.broadcastTypedEvent('t1', 'e1', 'execution.node.status-changed', {
        status: 'running',
      });

      expect(mockThrottle.tryConsume).toHaveBeenCalledWith('e1');
      expect(emitFn).toHaveBeenCalledWith('execution.node.status-changed', {
        status: 'running',
      });
    });

    it('queues event when rate limited (backpressure)', () => {
      vi.useFakeTimers();
      mockThrottle.tryConsume.mockReturnValue(false);
      const emitFn = vi.fn();
      mockServer.to.mockReturnValue({ emit: emitFn });

      gateway.broadcastTypedEvent('t1', 'e1', 'execution.node.status-changed', {
        status: 'running',
      });

      expect(emitFn).not.toHaveBeenCalled();

      mockThrottle.tryConsume.mockReturnValue(true);
      vi.advanceTimersByTime(150);

      expect(emitFn).toHaveBeenCalledWith('execution.node.status-changed', {
        status: 'running',
      });

      vi.useRealTimers();
    });

    it('drains queue on next successful broadcast', () => {
      vi.useFakeTimers();
      const emitFn = vi.fn();
      mockServer.to.mockReturnValue({ emit: emitFn });

      mockThrottle.tryConsume.mockReturnValue(false);
      gateway.broadcastTypedEvent('t1', 'e1', 'execution.node.status-changed', {
        status: 'queued',
      });
      expect(emitFn).not.toHaveBeenCalled();

      mockThrottle.tryConsume.mockReturnValue(true);
      gateway.broadcastTypedEvent('t1', 'e1', 'execution.node.status-changed', {
        status: 'running',
      });

      expect(emitFn).toHaveBeenCalledTimes(2);
      expect(emitFn).toHaveBeenCalledWith('execution.node.status-changed', {
        status: 'queued',
      });
      expect(emitFn).toHaveBeenCalledWith('execution.node.status-changed', {
        status: 'running',
      });

      vi.useRealTimers();
    });
  });

  describe('backpressure limits and retries', () => {
    it('retries a queued event until throttle capacity returns', () => {
      vi.useFakeTimers();
      const emitFn = vi.fn();
      mockServer.to.mockReturnValue({ emit: emitFn });
      mockThrottle.tryConsume.mockReturnValue(false);

      gateway.broadcastTypedEvent('t1', 'e1', 'execution.node.status-changed', {
        status: 'queued',
      });
      vi.advanceTimersByTime(100);
      expect(emitFn).not.toHaveBeenCalled();

      mockThrottle.tryConsume.mockReturnValue(true);
      vi.advanceTimersByTime(100);

      expect(emitFn).toHaveBeenCalledWith('execution.node.status-changed', {
        status: 'queued',
      });
      vi.useRealTimers();
    });

    it('drops the oldest event when the backpressure queue reaches its limit', () => {
      vi.useFakeTimers();
      const emitFn = vi.fn();
      mockServer.to.mockReturnValue({ emit: emitFn });
      mockThrottle.tryConsume.mockReturnValue(false);

      for (let index = 0; index <= 500; index += 1) {
        gateway.broadcastTypedEvent('t1', 'e1', 'execution.node.output-chunk', {
          index,
        });
      }
      gateway.flushExecutionQueue('t1', 'e1');

      expect(emitFn).toHaveBeenCalledTimes(500);
      expect(emitFn).not.toHaveBeenCalledWith('execution.node.output-chunk', {
        index: 0,
      });
      expect(emitFn).toHaveBeenNthCalledWith(1, 'execution.node.output-chunk', {
        index: 1,
      });
      expect(Logger.prototype.warn).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('broadcastTypedEventImmediately', () => {
    it('bypasses throttle and emits directly to the room', () => {
      const emitFn = vi.fn();
      mockServer.to.mockReturnValue({ emit: emitFn });

      gateway.broadcastTypedEventImmediately(
        't1',
        'e1',
        'execution.status.changed',
        { status: 'completed' },
      );

      expect(mockThrottle.tryConsume).not.toHaveBeenCalled();
      expect(emitFn).toHaveBeenCalledWith('execution.status.changed', {
        status: 'completed',
      });
    });
  });

  describe('flushExecutionQueue', () => {
    it('drains queued events immediately without waiting for throttle recovery', () => {
      vi.useFakeTimers();
      mockThrottle.tryConsume.mockReturnValue(false);
      const emitFn = vi.fn();
      mockServer.to.mockReturnValue({ emit: emitFn });

      gateway.broadcastTypedEvent('t1', 'e1', 'execution.node.status-changed', {
        status: 'queued',
      });
      gateway.broadcastTypedEvent('t1', 'e1', 'execution.node.output-chunk', {
        chunk: 'tail',
      });

      gateway.flushExecutionQueue('t1', 'e1');

      expect(emitFn).toHaveBeenCalledTimes(2);
      expect(emitFn).toHaveBeenNthCalledWith(
        1,
        'execution.node.status-changed',
        {
          status: 'queued',
        },
      );
      expect(emitFn).toHaveBeenNthCalledWith(2, 'execution.node.output-chunk', {
        chunk: 'tail',
      });

      vi.advanceTimersByTime(200);
      expect(emitFn).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe('empty queue flush', () => {
    it('treats an absent queue as an idempotent flush', () => {
      const emitFn = vi.fn();
      mockServer.to.mockReturnValue({ emit: emitFn });

      gateway.flushExecutionQueue('t1', 'missing');

      expect(mockServer.to).not.toHaveBeenCalled();
      expect(emitFn).not.toHaveBeenCalled();
    });
  });

  describe('clearExecutionQueue', () => {
    it('clears queue and timers for a specific execution', () => {
      vi.useFakeTimers();
      mockThrottle.tryConsume.mockReturnValue(false);
      const emitFn = vi.fn();
      mockServer.to.mockReturnValue({ emit: emitFn });

      gateway.broadcastTypedEvent('t1', 'e1', 'execution.node.status-changed', {
        status: 'running',
      });

      gateway.clearExecutionQueue('t1', 'e1');

      mockThrottle.tryConsume.mockReturnValue(true);
      vi.advanceTimersByTime(200);

      expect(emitFn).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('createAuthError', () => {
    it('creates error with code 4001 data', () => {
      gateway.afterInit(mockServer as any);
      const middleware = mockServer.use.mock.calls[0][0];

      const socket = makeSocket({
        handshake: { auth: {}, headers: {} },
      });

      const next = vi.fn();
      middleware(socket, next);

      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Authentication required');
      expect(err.data).toEqual({
        code: 4001,
        reason: 'Authentication required',
      });
    });
  });
});

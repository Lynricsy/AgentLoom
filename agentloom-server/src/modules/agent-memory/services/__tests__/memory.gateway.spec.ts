import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';

// vi.hoisted mock factory — required because ESM namespace exports are read-only
const {
  mockVerify,
  createMockConfigService,
  createMockTokenBlacklistService,
  createMockServer,
  createMockSocket,
} = vi.hoisted(() => {
  const mockVerify = vi.fn();

  const createMockConfigService = () => ({
    get: vi.fn().mockReturnValue('test-jwt-secret'),
  });

  const createMockTokenBlacklistService = () => ({
    isBlacklisted: vi.fn().mockResolvedValue(false),
  });

  const createMockServer = () => {
    const emitFn = vi.fn();
    const toFn = vi.fn().mockReturnValue({ emit: emitFn });
    return {
      use: vi.fn(),
      to: toFn,
      _emitFn: emitFn,
      _toFn: toFn,
    };
  };

  const createMockSocket = (overrides: Record<string, unknown> = {}) => {
    const socket = {
      id: 'test-socket-id',
      handshake: {
        auth: { token: 'valid-token' },
        headers: {},
        query: {},
      },
      data: {
        user: {
          sub: 'user-123',
          email: 'test@example.com',
          aud: 'authenticated',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          tenantId: 'tenant-abc',
          tenantRole: 'admin',
        },
      },
      join: vi.fn().mockResolvedValue(undefined),
      leave: vi.fn(),
      emit: vi.fn(),
      ...overrides,
    };
    return socket as unknown as Socket;
  };

  return {
    mockVerify,
    createMockConfigService,
    createMockTokenBlacklistService,
    createMockServer,
    createMockSocket,
  };
});

vi.mock('jsonwebtoken', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  const actual = (mod.default ?? mod) as Record<string, unknown>;
  mockVerify.mockImplementation((...args: unknown[]) =>
    (actual.verify as Function)(...args),
  );
  return { ...actual, default: actual, verify: mockVerify };
});

import * as jwt from 'jsonwebtoken';
import { MemoryGateway } from '../../memory.gateway';
import { TokenBlacklistService } from '../../../../common/services/token-blacklist.service';
import { UserIdentityResolverService } from '../../../../common/services/user-identity-resolver.service';

const JWT_SECRET = 'test-jwt-secret';

function createToken(payload: Record<string, unknown>): string {
  return jwt.sign(
    { aud: 'authenticated', ...payload },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

describe('MemoryGateway', () => {
  let gateway: MemoryGateway;
  let mockServer: ReturnType<typeof createMockServer>;
  let mockConfigService: ReturnType<typeof createMockConfigService>;
  let mockTokenBlacklistService: ReturnType<
    typeof createMockTokenBlacklistService
  >;

  beforeEach(async () => {
    mockVerify.mockReset();

    mockConfigService = createMockConfigService();
    mockTokenBlacklistService = createMockTokenBlacklistService();
    mockServer = createMockServer();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryGateway,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: TokenBlacklistService,
          useValue: mockTokenBlacklistService,
        },
        {
          provide: UserIdentityResolverService,
          useValue: {
            resolveAppUserId: vi.fn().mockResolvedValue('app-user-id'),
          },
        },
      ],
    }).compile();

    gateway = module.get<MemoryGateway>(MemoryGateway);
    (gateway as unknown as { server: Server }).server =
      mockServer as unknown as Server;
  });

  describe('lifecycle', () => {
    it('should register server.use middleware on afterInit', () => {
      gateway.afterInit(mockServer as unknown as Server);
      expect(mockServer.use).toHaveBeenCalledOnce();
      expect(mockServer.use).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should clear drain timers and event queue on destroy', () => {
      gateway.onModuleDestroy();
    });

    it('should log on handleConnection', () => {
      const socket = createMockSocket();
      gateway.handleConnection(socket);
    });

    it('should log on handleDisconnect', () => {
      const socket = createMockSocket();
      gateway.handleDisconnect(socket);
    });
  });

  describe('afterInit - JWT auth middleware', () => {
    let middlewareFn: (
      socket: Socket,
      next: (err?: Error) => void,
    ) => Promise<void>;

    beforeEach(() => {
      gateway.afterInit(mockServer as unknown as Server);
      middlewareFn = mockServer.use.mock.calls[0][0] as typeof middlewareFn;
    });

    it('should reject connection without token', async () => {
      const socket = createMockSocket({
        handshake: { auth: {}, headers: {}, query: {} },
      });
      const next = vi.fn();

      await middlewareFn(socket, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication required',
        }),
      );
    });

    it('should reject blacklisted token', async () => {
      mockTokenBlacklistService.isBlacklisted.mockResolvedValueOnce(true);
      const socket = createMockSocket();
      const next = vi.fn();

      await middlewareFn(socket, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Token has been revoked',
        }),
      );
    });

    it('should reject MFA pending token', async () => {
      mockVerify.mockReturnValueOnce({
        sub: 'user-123',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        type: 'mfa_pending',
      });

      const socket = createMockSocket();
      const next = vi.fn();

      await middlewareFn(socket, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'MFA verification required',
        }),
      );
    });

    it('should reject token with missing claims', async () => {
      mockVerify.mockReturnValueOnce({
        sub: 'user-123',
        // missing aud, exp, iat
      });

      const socket = createMockSocket();
      const next = vi.fn();

      await middlewareFn(socket, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid token claims',
        }),
      );
    });

    it('should accept valid token and set socket.data.user', async () => {
      mockVerify.mockReturnValueOnce({
        sub: 'user-456',
        email: 'user@test.com',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        tenantId: 'tenant-xyz',
        tenantRole: 'creator',
      });

      const socket = createMockSocket();
      const next = vi.fn();

      await middlewareFn(socket, next);

      expect(next).toHaveBeenCalledWith();
      expect(socket.data.user).toMatchObject({
        sub: 'user-456',
        email: 'user@test.com',
        tenantId: 'tenant-xyz',
        tenantRole: 'creator',
      });
    });

    it('should extract token from Bearer header', async () => {
      mockVerify.mockReturnValueOnce({
        sub: 'user-789',
        email: 'bearer@test.com',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        tenantId: 'tenant-header',
      });

      const socket = createMockSocket({
        handshake: {
          auth: {},
          headers: { authorization: 'Bearer header-token' },
          query: {},
        },
      });
      const next = vi.fn();

      await middlewareFn(socket, next);

      expect(next).toHaveBeenCalledWith();
      expect(mockVerify).toHaveBeenCalledWith(
        'header-token',
        'test-jwt-secret',
        {
          algorithms: ['HS256'],
          audience: 'authenticated',
        },
      );
    });

    it('should handle invalid/expired token', async () => {
      mockVerify.mockImplementationOnce(() => {
        throw new Error('jwt expired');
      });

      const socket = createMockSocket();
      const next = vi.fn();

      await middlewareFn(socket, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid or expired token',
        }),
      );
    });
  });

  describe('memory:subscribe', () => {
    it('should join room and return ACK on valid subscribe', async () => {
      const client = createMockSocket();
      const result = await gateway.handleSubscribe(client, {
        instanceId: 'instance-1',
      });

      expect(client.join).toHaveBeenCalledWith('memory:tenant-abc:instance-1');
      expect(result).toEqual({
        status: 'subscribed',
        instanceId: 'instance-1',
      });
    });

    it('should reject subscribe without tenantId', async () => {
      const client = createMockSocket({
        data: { user: { sub: 'user-1' } },
      });
      const result = await gateway.handleSubscribe(client, {
        instanceId: 'instance-1',
      });

      expect(result).toEqual({
        status: 'error',
        error: 'FORBIDDEN',
      });
      expect(client.join).not.toHaveBeenCalled();
    });

    it('should reject subscribe without instanceId', async () => {
      const client = createMockSocket();
      const result = await gateway.handleSubscribe(client, {
        instanceId: '',
      });

      expect(result).toEqual({
        status: 'error',
        error: 'INVALID_PAYLOAD',
      });
      expect(client.join).not.toHaveBeenCalled();
    });

    it('should replay events after lastEventId on subscribe', async () => {
      // Emit some events first to populate the event buffer
      gateway.emitNodeCreated('tenant-abc', 'instance-1', {
        nodeId: 'n1',
        type: 'concept',
      });
      gateway.emitNodeUpdated('tenant-abc', 'instance-1', {
        nodeId: 'n1',
        type: 'concept',
      });
      gateway.emitNodeDeleted('tenant-abc', 'instance-1', {
        nodeId: 'n1',
      });

      const client = createMockSocket({
        handshake: {
          auth: { token: 'valid' },
          headers: {},
          query: { lastEventId: '1' },
        },
      });

      const result = await gateway.handleSubscribe(client, {
        instanceId: 'instance-1',
      });

      expect(result).toEqual({
        status: 'subscribed',
        instanceId: 'instance-1',
      });

      // Events with eventId > 1 should be replayed (eventId 2 and 3)
      expect(client.emit).toHaveBeenCalledTimes(2);
    });

    it('should not replay if lastEventId is current', async () => {
      gateway.emitNodeCreated('tenant-abc', 'instance-1', { nodeId: 'n1' });

      const client = createMockSocket({
        handshake: {
          auth: { token: 'valid' },
          headers: {},
          query: { lastEventId: '1' },
        },
      });

      const result = await gateway.handleSubscribe(client, {
        instanceId: 'instance-1',
      });

      expect(result).toEqual({
        status: 'subscribed',
        instanceId: 'instance-1',
      });
      expect(client.emit).not.toHaveBeenCalled();
    });
  });

  describe('memory:unsubscribe', () => {
    it('should leave room and return ACK', () => {
      const client = createMockSocket();
      const result = gateway.handleUnsubscribe(client, {
        instanceId: 'instance-1',
      });

      expect(client.leave).toHaveBeenCalledWith('memory:tenant-abc:instance-1');
      expect(result).toEqual({
        status: 'unsubscribed',
        instanceId: 'instance-1',
      });
    });
  });

  describe('event emission', () => {
    it('should emit memory.node.created with typed envelope', () => {
      gateway.emitNodeCreated('tenant-abc', 'instance-1', {
        nodeId: 'node-1',
        type: 'concept',
      });

      expect(mockServer._toFn).toHaveBeenCalledWith(
        'memory:tenant-abc:instance-1',
      );
      expect(mockServer._emitFn).toHaveBeenCalledWith(
        'memory.node.created',
        expect.objectContaining({
          eventId: expect.any(Number),
          timestamp: expect.any(String),
          type: 'memory.node.created',
          data: { nodeId: 'node-1', type: 'concept' },
        }),
      );
    });

    it('should emit memory.node.updated with typed envelope', () => {
      gateway.emitNodeUpdated('tenant-abc', 'instance-1', {
        nodeId: 'node-1',
        changes: { name: 'new-name' },
      });

      expect(mockServer._emitFn).toHaveBeenCalledWith(
        'memory.node.updated',
        expect.objectContaining({
          type: 'memory.node.updated',
          data: { nodeId: 'node-1', changes: { name: 'new-name' } },
        }),
      );
    });

    it('should emit memory.node.deleted with typed envelope', () => {
      gateway.emitNodeDeleted('tenant-abc', 'instance-1', {
        nodeId: 'node-1',
      });

      expect(mockServer._emitFn).toHaveBeenCalledWith(
        'memory.node.deleted',
        expect.objectContaining({
          type: 'memory.node.deleted',
          data: { nodeId: 'node-1' },
        }),
      );
    });

    it('should emit memory.version.created with typed envelope', () => {
      gateway.emitVersionCreated('tenant-abc', 'instance-1', {
        versionId: 'v1',
        message: 'Initial snapshot',
      });

      expect(mockServer._emitFn).toHaveBeenCalledWith(
        'memory.version.created',
        expect.objectContaining({
          type: 'memory.version.created',
          data: { versionId: 'v1', message: 'Initial snapshot' },
        }),
      );
    });

    it('should emit memory.version.rollback with typed envelope', () => {
      gateway.emitVersionRollback('tenant-abc', 'instance-1', {
        targetVersionId: 'v0',
      });

      expect(mockServer._emitFn).toHaveBeenCalledWith(
        'memory.version.rollback',
        expect.objectContaining({
          type: 'memory.version.rollback',
          data: { targetVersionId: 'v0' },
        }),
      );
    });

    it('should emit memory.review.submitted with typed envelope', () => {
      gateway.emitReviewSubmitted('tenant-abc', 'instance-1', {
        reviewId: 'review-1',
        status: 'approved',
      });

      expect(mockServer._emitFn).toHaveBeenCalledWith(
        'memory.review.submitted',
        expect.objectContaining({
          type: 'memory.review.submitted',
          data: { reviewId: 'review-1', status: 'approved' },
        }),
      );
    });

    it('should increment eventId monotonically', () => {
      gateway.emitNodeCreated('tenant-abc', 'instance-1', { nodeId: 'n1' });
      gateway.emitNodeUpdated('tenant-abc', 'instance-1', { nodeId: 'n2' });
      gateway.emitNodeDeleted('tenant-abc', 'instance-1', { nodeId: 'n3' });

      const calls = mockServer._emitFn.mock.calls;
      const eventIds = calls.map(
        (call: [string, Record<string, unknown>]) =>
          (call[1] as { eventId: number }).eventId,
      );

      expect(eventIds[0]).toBeLessThan(eventIds[1]);
      expect(eventIds[1]).toBeLessThan(eventIds[2]);
    });
  });

  describe('backpressure', () => {
    it('should drop oldest event when queue reaches limit', () => {
      const queueKey = 'tenant-abc:instance-bp';
      const eventQueue = (
        gateway as unknown as {
          eventQueue: Map<
            string,
            { event: string; data: Record<string, unknown> }[]
          >;
        }
      ).eventQueue;

      // Fill queue to limit
      const fullQueue = Array.from({ length: 500 }, (_, i) => ({
        event: `test-${i}`,
        data: { index: i },
      }));
      eventQueue.set(queueKey, fullQueue);

      // Enqueue one more via the private method
      (
        gateway as unknown as {
          enqueueEvent: (
            tenantId: string,
            instanceId: string,
            queueKey: string,
            event: string,
            data: Record<string, unknown>,
          ) => void;
        }
      ).enqueueEvent(
        'tenant-abc',
        'instance-bp',
        queueKey,
        'memory.node.created',
        { overflow: true },
      );

      const queue = eventQueue.get(queueKey)!;
      // Should still be 500 (oldest dropped, new added)
      expect(queue.length).toBe(500);
      // First item should no longer be test-0
      expect(queue[0].event).toBe('test-1');
      // Last item should be the new one
      expect(queue[queue.length - 1].event).toBe('memory.node.created');
    });

    it('should flush queue on flushMemoryQueue', () => {
      const queueKey = 'tenant-abc:instance-flush';
      const eventQueue = (
        gateway as unknown as {
          eventQueue: Map<
            string,
            { event: string; data: Record<string, unknown> }[]
          >;
        }
      ).eventQueue;
      eventQueue.set(queueKey, [
        { event: 'memory.node.created', data: { nodeId: 'n1' } },
        { event: 'memory.node.updated', data: { nodeId: 'n2' } },
      ]);

      gateway.flushMemoryQueue('tenant-abc', 'instance-flush');

      // All events should have been emitted
      expect(mockServer._toFn).toHaveBeenCalledWith(
        'memory:tenant-abc:instance-flush',
      );
      expect(mockServer._emitFn).toHaveBeenCalledTimes(2);
      // Queue should be cleared
      expect(eventQueue.has(queueKey)).toBe(false);
    });

    it('should clear queue on clearMemoryQueue', () => {
      const queueKey = 'tenant-abc:instance-clear';
      const eventQueue = (
        gateway as unknown as {
          eventQueue: Map<
            string,
            { event: string; data: Record<string, unknown> }[]
          >;
        }
      ).eventQueue;
      eventQueue.set(queueKey, [{ event: 'test', data: {} }]);

      gateway.clearMemoryQueue('tenant-abc', 'instance-clear');

      expect(eventQueue.has(queueKey)).toBe(false);
    });

    it('should schedule drain timer when enqueueing', () => {
      const drainTimers = (
        gateway as unknown as {
          drainTimers: Map<string, ReturnType<typeof setTimeout>>;
        }
      ).drainTimers;

      const queueKey = 'tenant-abc:instance-timer';
      const eventQueue = (
        gateway as unknown as {
          eventQueue: Map<
            string,
            { event: string; data: Record<string, unknown> }[]
          >;
        }
      ).eventQueue;

      // Seed queue so enqueue doesn't drain immediately
      eventQueue.set(queueKey, [{ event: 'existing', data: {} }]);

      (
        gateway as unknown as {
          enqueueEvent: (
            tenantId: string,
            instanceId: string,
            queueKey: string,
            event: string,
            data: Record<string, unknown>,
          ) => void;
        }
      ).enqueueEvent(
        'tenant-abc',
        'instance-timer',
        queueKey,
        'new-event',
        {},
      );

      expect(drainTimers.has(queueKey)).toBe(true);
    });
  });

  describe('event buffer for replay', () => {
    it('should store emitted events in bounded replay buffer', () => {
      const replayBuffer = (
        gateway as unknown as {
          replayBuffer: Map<
            string,
            {
              eventId: number;
              event: string;
              data: Record<string, unknown>;
            }[]
          >;
        }
      ).replayBuffer;

      gateway.emitNodeCreated('tenant-abc', 'instance-buf', { nodeId: 'n1' });
      gateway.emitNodeUpdated('tenant-abc', 'instance-buf', { nodeId: 'n2' });

      const roomKey = 'tenant-abc:instance-buf';
      const buffer = replayBuffer.get(roomKey);
      expect(buffer).toBeDefined();
      expect(buffer!.length).toBe(2);
      expect(buffer![0].event).toBe('memory.node.created');
      expect(buffer![1].event).toBe('memory.node.updated');
    });

    it('should bound replay buffer at configured limit', () => {
      const replayBuffer = (
        gateway as unknown as {
          replayBuffer: Map<
            string,
            {
              eventId: number;
              event: string;
              data: Record<string, unknown>;
            }[]
          >;
        }
      ).replayBuffer;

      // Emit many events to exceed buffer limit (default 1000)
      for (let i = 0; i < 1050; i++) {
        gateway.emitNodeCreated('tenant-abc', 'instance-overflow', {
          nodeId: `n-${i}`,
        });
      }

      const roomKey = 'tenant-abc:instance-overflow';
      const buffer = replayBuffer.get(roomKey);
      expect(buffer).toBeDefined();
      expect(buffer!.length).toBeLessThanOrEqual(1000);
    });
  });
});

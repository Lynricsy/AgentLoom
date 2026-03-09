import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { ExecutionGateway } from '../execution.gateway';
import type { StateReplayService } from '../services/state-replay.service';
import type { ThrottleService } from '../services/throttle.service';
import type { EventBridgeService } from '../services/event-bridge.service';
import type { ConfigService } from '@nestjs/config';
import type { TokenBlacklistService } from '../../../common/services/token-blacklist.service';
import type { ExecutionStateSnapshot } from '../types/execution-event.types';

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
  let mockStateReplay: { getExecutionSnapshot: Mock };
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

  describe('handleSubscribe / handleJoin', () => {
    it('joins room with tenant from JWT', async () => {
      const client = makeSocket();
      await gateway.handleSubscribe(client as any, { executionId: 'exec-1' });

      expect(client.join).toHaveBeenCalledWith(
        'execution:tenant-1:exec-1',
      );
    });

    it('handleJoin delegates to same subscribe logic', async () => {
      const client = makeSocket();
      await gateway.handleJoin(client as any, { executionId: 'exec-1' });

      expect(client.join).toHaveBeenCalledWith(
        'execution:tenant-1:exec-1',
      );
    });

    it('throws WsException when no tenant context', async () => {
      const client = makeSocket({
        data: { user: { sub: 'u1', email: 'a@b.com' } },
      });

      await expect(
        gateway.handleSubscribe(client as any, { executionId: 'exec-1' }),
      ).rejects.toThrow(WsException);
    });

    it('throws WsException on tenant mismatch', async () => {
      const client = makeSocket();

      await expect(
        gateway.handleSubscribe(client as any, {
          tenantId: 'other-tenant',
          executionId: 'exec-1',
        }),
      ).rejects.toThrow(WsException);
    });

    it('throws WsException when executionId is missing', async () => {
      const client = makeSocket();

      await expect(
        gateway.handleSubscribe(client as any, {
          executionId: '',
        }),
      ).rejects.toThrow(WsException);
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

    it('throws WsException when execution not found (tenant verification)', async () => {
      mockStateReplay.getExecutionSnapshot.mockResolvedValue(null);

      const client = makeSocket();
      await expect(
        gateway.handleSubscribe(client as any, { executionId: 'exec-1' }),
      ).rejects.toThrow(WsException);

      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('handleUnsubscribe / handleLeave', () => {
    it('leaves room using JWT tenant', () => {
      const client = makeSocket();
      gateway.handleUnsubscribe(client as any, { executionId: 'exec-1' });

      expect(client.leave).toHaveBeenCalledWith(
        'execution:tenant-1:exec-1',
      );
    });

    it('handleLeave delegates to unsubscribe logic', () => {
      const client = makeSocket();
      gateway.handleLeave(client as any, { executionId: 'exec-1' });

      expect(client.leave).toHaveBeenCalledWith(
        'execution:tenant-1:exec-1',
      );
    });

    it('falls back to payload tenantId when no user', () => {
      const client = makeSocket({ data: {} });
      gateway.handleUnsubscribe(client as any, {
        tenantId: 'tenant-x',
        executionId: 'exec-1',
      });

      expect(client.leave).toHaveBeenCalledWith(
        'execution:tenant-x:exec-1',
      );
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
    it('checks throttle before broadcasting', () => {
      const emitFn = vi.fn();
      mockServer.to.mockReturnValue({ emit: emitFn });

      gateway.broadcastTypedEvent(
        't1',
        'e1',
        'execution.step.status-changed',
        { status: 'running' },
      );

      expect(mockThrottle.tryConsume).toHaveBeenCalledWith('e1');
      expect(emitFn).toHaveBeenCalledWith('execution.step.status-changed', {
        status: 'running',
      });
    });

    it('drops event when rate limited', () => {
      mockThrottle.tryConsume.mockReturnValue(false);
      const emitFn = vi.fn();
      mockServer.to.mockReturnValue({ emit: emitFn });

      gateway.broadcastTypedEvent(
        't1',
        'e1',
        'execution.step.status-changed',
        { status: 'running' },
      );

      expect(emitFn).not.toHaveBeenCalled();
    });
  });
});

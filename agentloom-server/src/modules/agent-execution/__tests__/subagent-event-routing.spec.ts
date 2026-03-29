import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  createSubAgentEventProxy,
  type SubAgentEventProxy,
} from '../subagent/subagent-event-proxy';
import type { AgentEvent } from '../../agent/types/agent-event.types';
import type { SubAgentEventEnvelope } from '../subagent/subagent-execution.types';

const mockConfigService = {
  get: vi.fn().mockReturnValue('test-jwt-secret'),
};

const mockThrottleService = {
  tryConsume: vi.fn().mockReturnValue(true),
  registerFlushHandler: vi.fn(),
  clearExecution: vi.fn(),
};

const mockEventBridgeService = {
  getLastEventId: vi.fn().mockReturnValue(5),
  getEventsSince: vi.fn().mockReturnValue([]),
  createEnvelope: vi.fn(),
  emitSubAgentConversationEvent: vi.fn(),
};

const mockTokenBlacklistService = {
  isBlacklisted: vi.fn().mockReturnValue(false),
};

const mockAgentExecutionService = {
  injectMessage: vi.fn().mockResolvedValue(undefined),
  cancelExecution: vi.fn().mockResolvedValue(undefined),
};

import {
  AgentConversationGateway,
  ConversationEventName,
} from '../agent-conversation.gateway';

function makeSocket(
  overrides: Partial<{
    id: string;
    tenantId: string;
    sub: string;
    join: ReturnType<typeof vi.fn>;
    leave: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
  }> = {},
): Socket {
  const {
    id = 'socket-1',
    tenantId = 'tenant-1',
    sub = 'user-1',
    join = vi.fn().mockResolvedValue(undefined),
    leave = vi.fn(),
    emit = vi.fn(),
  } = overrides;

  return {
    id,
    handshake: { auth: {}, headers: {}, query: {} },
    data: {
      user: {
        sub,
        email: 'test@example.com',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        tenantId,
        tenantRole: 'admin',
      },
    },
    join,
    leave,
    emit,
  } as unknown as Socket;
}

function makeServer(): Server {
  const emitFn = vi.fn();
  return {
    to: vi.fn().mockReturnValue({ emit: emitFn }),
    use: vi.fn(),
  } as unknown as Server;
}

function makeEnvelope(): SubAgentEventEnvelope {
  return {
    handle: 'sa_abc123def456',
    alias: 'sub-agent-1',
    depth: 1,
    parentToolCallId: 'tool-call-001',
  };
}

describe('SubAgent Event Routing', () => {
  describe('createSubAgentEventProxy', () => {
    it('should create proxy that delegates to eventBridge', () => {
      const mockBridge = {
        emitSubAgentConversationEvent: vi.fn(),
      };

      const envelope = makeEnvelope();
      const proxy: SubAgentEventProxy = createSubAgentEventProxy({
        conversationId: 'conv-1',
        tenantId: 'tenant-1',
        envelope,
        eventBridge: mockBridge,
      });

      const event: AgentEvent = {
        type: 'message_chunk',
        content: 'Hello from sub-agent',
      };

      proxy.emitEvent(event);

      expect(mockBridge.emitSubAgentConversationEvent).toHaveBeenCalledOnce();
      expect(mockBridge.emitSubAgentConversationEvent).toHaveBeenCalledWith(
        'conv-1',
        'tenant-1',
        event,
        envelope,
      );
    });

    it('should pass through all envelope fields', () => {
      const mockBridge = {
        emitSubAgentConversationEvent: vi.fn(),
      };

      const envelope: SubAgentEventEnvelope = {
        handle: 'sa_xyz789abc012',
        alias: 'deep-agent',
        depth: 3,
        parentToolCallId: 'tool-call-deep',
      };

      const proxy = createSubAgentEventProxy({
        conversationId: 'conv-2',
        tenantId: 'tenant-2',
        envelope,
        eventBridge: mockBridge,
      });

      const event: AgentEvent = { type: 'done', stopReason: 'end_turn' };
      proxy.emitEvent(event);

      const passedEnvelope =
        mockBridge.emitSubAgentConversationEvent.mock.calls[0][3];
      expect(passedEnvelope).toEqual({
        handle: 'sa_xyz789abc012',
        alias: 'deep-agent',
        depth: 3,
        parentToolCallId: 'tool-call-deep',
      });
    });

    it('should emit multiple events through same proxy', () => {
      const mockBridge = {
        emitSubAgentConversationEvent: vi.fn(),
      };

      const proxy = createSubAgentEventProxy({
        conversationId: 'conv-1',
        tenantId: 'tenant-1',
        envelope: makeEnvelope(),
        eventBridge: mockBridge,
      });

      proxy.emitEvent({ type: 'plan', title: 'Plan', content: 'thinking...' });
      proxy.emitEvent({ type: 'message_chunk', content: 'hello' });
      proxy.emitEvent({ type: 'done', stopReason: 'end_turn' });

      expect(mockBridge.emitSubAgentConversationEvent).toHaveBeenCalledTimes(3);
    });
  });

  describe('Gateway handleSubAgentEvent', () => {
    let gateway: AgentConversationGateway;
    let server: Server;

    beforeEach(async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
      vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      vi.clearAllMocks();

      gateway = new AgentConversationGateway(
        mockConfigService as any,
        mockThrottleService as any,
        mockEventBridgeService as any,
        mockTokenBlacklistService as any,
        mockAgentExecutionService as any,
      );

      server = makeServer();
      (gateway as any).server = server;

      const client = makeSocket();
      await gateway.handleSubscribe(client, { conversationId: 'conv-1' });
      vi.clearAllMocks();
      mockThrottleService.tryConsume.mockReturnValue(true);
    });

    afterEach(() => {
      gateway.onModuleDestroy();
      vi.restoreAllMocks();
    });

    it('should route message_chunk sub-agent event to AGENT_MESSAGE_CHUNK', () => {
      gateway.handleSubAgentEvent({
        conversationId: 'conv-1',
        tenantId: 'tenant-1',
        event: { type: 'message_chunk', content: 'hello' },
        subagent: makeEnvelope(),
      });

      const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
        .value.emit;
      expect(emitFn).toHaveBeenCalledWith(
        ConversationEventName.AGENT_MESSAGE_CHUNK,
        expect.objectContaining({
          conversationId: 'conv-1',
          tenantId: 'tenant-1',
        }),
      );
    });

    it('should route plan sub-agent event to AGENT_THINKING', () => {
      gateway.handleSubAgentEvent({
        conversationId: 'conv-1',
        tenantId: 'tenant-1',
        event: { type: 'plan', title: 'Plan', content: 'planning...' },
        subagent: makeEnvelope(),
      });

      const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
        .value.emit;
      expect(emitFn).toHaveBeenCalledWith(
        ConversationEventName.AGENT_THINKING,
        expect.any(Object),
      );
    });

    it('should route tool_call sub-agent event to AGENT_TOOL_CALL', () => {
      gateway.handleSubAgentEvent({
        conversationId: 'conv-1',
        tenantId: 'tenant-1',
        event: {
          type: 'tool_call',
          call: { id: 'tc-1', tool: 'search', args: {}, status: 'pending' },
        },
        subagent: makeEnvelope(),
      });

      const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
        .value.emit;
      expect(emitFn).toHaveBeenCalledWith(
        ConversationEventName.AGENT_TOOL_CALL,
        expect.any(Object),
      );
    });

    it('should route decision sub-agent event to AGENT_THINKING', () => {
      gateway.handleSubAgentEvent({
        conversationId: 'conv-1',
        tenantId: 'tenant-1',
        event: { type: 'decision', suggestedContent: 'deciding...' },
        subagent: makeEnvelope(),
      });

      const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
        .value.emit;
      expect(emitFn).toHaveBeenCalledWith(
        ConversationEventName.AGENT_THINKING,
        expect.any(Object),
      );
    });

    it('should route done sub-agent event to AGENT_DONE', () => {
      gateway.handleSubAgentEvent({
        conversationId: 'conv-1',
        tenantId: 'tenant-1',
        event: { type: 'done', stopReason: 'end_turn' },
        subagent: makeEnvelope(),
      });

      const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
        .value.emit;
      expect(emitFn).toHaveBeenCalledWith(
        ConversationEventName.AGENT_DONE,
        expect.any(Object),
      );
    });

    it('should include subagent envelope in emitted data', () => {
      const envelope = makeEnvelope();
      gateway.handleSubAgentEvent({
        conversationId: 'conv-1',
        tenantId: 'tenant-1',
        event: { type: 'message_chunk', content: 'hello' },
        subagent: envelope,
      });

      const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
        .value.emit;
      const emittedData = emitFn.mock.calls[0][1];

      expect(emittedData.subagent).toEqual(envelope);
    });

    it('应在无本地订阅记录时仍广播子代理事件，兼容 server/worker 分离部署', () => {
      gateway.handleSubAgentEvent({
        conversationId: 'no-subscribers',
        tenantId: 'tenant-1',
        event: { type: 'message_chunk', content: 'hello' },
        subagent: makeEnvelope(),
      });

      expect(server.to).toHaveBeenCalledWith(
        'conversation:tenant-1:no-subscribers',
      );
    });

    it('should include event data in emitted payload', () => {
      const event: AgentEvent = {
        type: 'message_chunk',
        content: 'sub-agent says hi',
      };

      gateway.handleSubAgentEvent({
        conversationId: 'conv-1',
        tenantId: 'tenant-1',
        event,
        subagent: makeEnvelope(),
      });

      const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
        .value.emit;
      const emittedData = emitFn.mock.calls[0][1];

      expect(emittedData.event).toEqual(event);
    });

    it('should use backpressure queue for sub-agent events when throttled', () => {
      mockThrottleService.tryConsume.mockReturnValue(false);

      gateway.handleSubAgentEvent({
        conversationId: 'conv-1',
        tenantId: 'tenant-1',
        event: { type: 'message_chunk', content: 'throttled' },
        subagent: makeEnvelope(),
      });

      const queueKey = 'tenant-1:conv-1';
      expect((gateway as any).eventQueue.get(queueKey)).toBeDefined();
      expect((gateway as any).eventQueue.get(queueKey).length).toBeGreaterThan(
        0,
      );
    });
  });

  describe('Regular event has no subagent field', () => {
    let gateway: AgentConversationGateway;
    let server: Server;

    beforeEach(async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
      vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      vi.clearAllMocks();

      gateway = new AgentConversationGateway(
        mockConfigService as any,
        mockThrottleService as any,
        mockEventBridgeService as any,
        mockTokenBlacklistService as any,
        mockAgentExecutionService as any,
      );

      server = makeServer();
      (gateway as any).server = server;

      const client = makeSocket();
      await gateway.handleSubscribe(client, { conversationId: 'conv-1' });
      vi.clearAllMocks();
      mockThrottleService.tryConsume.mockReturnValue(true);
    });

    afterEach(() => {
      gateway.onModuleDestroy();
      vi.restoreAllMocks();
    });

    it('should not include subagent field in regular events', () => {
      gateway.handleExecutionStatusChanged({
        executionId: 'conv-1',
        status: 'running',
        tenantId: 'tenant-1',
      });

      const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
        .value.emit;
      const emittedData = emitFn.mock.calls[0][1];

      expect(emittedData.subagent).toBeUndefined();
    });

    it('should not include subagent field in step agent events', () => {
      gateway.handleStepAgentEvent({
        stepId: 'step-1',
        event: { type: 'message_chunk', content: 'hello' } as any,
        tenantId: 'tenant-1',
        executionId: 'conv-1',
      });

      const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
        .value.emit;
      const emittedData = emitFn.mock.calls[0][1];

      expect(emittedData.subagent).toBeUndefined();
    });
  });

  describe('Monotonic eventId continuity', () => {
    let gateway: AgentConversationGateway;
    let server: Server;

    beforeEach(async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
      vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      vi.clearAllMocks();

      gateway = new AgentConversationGateway(
        mockConfigService as any,
        mockThrottleService as any,
        mockEventBridgeService as any,
        mockTokenBlacklistService as any,
        mockAgentExecutionService as any,
      );

      server = makeServer();
      (gateway as any).server = server;

      const client = makeSocket();
      await gateway.handleSubscribe(client, { conversationId: 'conv-1' });
      vi.clearAllMocks();
      mockThrottleService.tryConsume.mockReturnValue(true);
    });

    afterEach(() => {
      gateway.onModuleDestroy();
      vi.restoreAllMocks();
    });

    it('should use parent conversationId eventId for sub-agent events', () => {
      mockEventBridgeService.getLastEventId.mockReturnValue(10);

      gateway.handleSubAgentEvent({
        conversationId: 'conv-1',
        tenantId: 'tenant-1',
        event: { type: 'message_chunk', content: 'sub-agent msg' },
        subagent: makeEnvelope(),
      });

      const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
        .value.emit;
      const emittedData = emitFn.mock.calls[0][1];

      expect(emittedData.eventId).toBe(10);
    });

    it('should use same eventId source for both regular and sub-agent events', () => {
      mockEventBridgeService.getLastEventId.mockReturnValue(42);

      gateway.handleExecutionStatusChanged({
        executionId: 'conv-1',
        status: 'running',
        tenantId: 'tenant-1',
      });

      gateway.handleSubAgentEvent({
        conversationId: 'conv-1',
        tenantId: 'tenant-1',
        event: { type: 'message_chunk', content: 'hello' },
        subagent: makeEnvelope(),
      });

      const calls = mockEventBridgeService.getLastEventId.mock.calls;
      const regularCallArg = calls[0][0];
      const subagentCallArg = calls[1][0];

      expect(regularCallArg).toBe('conv-1');
      expect(subagentCallArg).toBe('conv-1');
      expect(regularCallArg).toBe(subagentCallArg);
    });
  });

  describe('EventBridge emitSubAgentConversationEvent', () => {
    it('should emit conversation.subagent.event via EventEmitter2', () => {
      const eventEmitter = new EventEmitter2();
      const emitSpy = vi.spyOn(eventEmitter, 'emit');

      const event: AgentEvent = {
        type: 'message_chunk',
        content: 'test',
      };
      const envelope = makeEnvelope();

      eventEmitter.emit('conversation.subagent.event', {
        conversationId: 'conv-1',
        tenantId: 'tenant-1',
        event,
        subagent: envelope,
      });

      expect(emitSpy).toHaveBeenCalledWith('conversation.subagent.event', {
        conversationId: 'conv-1',
        tenantId: 'tenant-1',
        event,
        subagent: envelope,
      });
    });
  });
});

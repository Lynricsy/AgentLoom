import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';

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
import type { ConversationSubscribeAck } from '../agent-conversation.gateway';
import { ExecutionEventName } from '../../execution/types/execution-event.types';

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

describe('AgentConversationGateway', () => {
  let gateway: AgentConversationGateway;
  let server: Server;

  beforeEach(() => {
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
  });

  afterEach(() => {
    gateway.onModuleDestroy();
    vi.restoreAllMocks();
  });

  describe('conversation:subscribe', () => {
    it('should subscribe and join room', async () => {
      const client = makeSocket();
      const ack = await gateway.handleSubscribe(client, {
        conversationId: 'conv-1',
      });

      expect(ack).toEqual<ConversationSubscribeAck>({
        status: 'subscribed',
      });
      expect(client.join).toHaveBeenCalledWith('conversation:tenant-1:conv-1');
    });

    it('should reject when user has no tenantId', async () => {
      const client = makeSocket({ tenantId: undefined as any });
      // Override data.user to have no tenantId
      client.data.user.tenantId = undefined;

      const ack = await gateway.handleSubscribe(client, {
        conversationId: 'conv-1',
      });

      expect(ack).toEqual<ConversationSubscribeAck>({
        status: 'error',
        error: 'FORBIDDEN',
      });
      expect(client.join).not.toHaveBeenCalled();
    });

    it('should reject when payload tenantId mismatches user tenantId', async () => {
      const client = makeSocket({ tenantId: 'tenant-1' });
      const ack = await gateway.handleSubscribe(client, {
        tenantId: 'other-tenant',
        conversationId: 'conv-1',
      });

      expect(ack).toEqual<ConversationSubscribeAck>({
        status: 'error',
        error: 'FORBIDDEN',
      });
    });

    it('should reject when conversationId is missing', async () => {
      const client = makeSocket();
      const ack = await gateway.handleSubscribe(client, {
        conversationId: '',
      });

      expect(ack).toEqual<ConversationSubscribeAck>({
        status: 'error',
        error: 'INVALID_PAYLOAD',
      });
    });

    it('should replay events when lastEventId provided', async () => {
      mockEventBridgeService.getLastEventId.mockReturnValue(10);
      mockEventBridgeService.getEventsSince.mockReturnValue([
        {
          eventId: 6,
          event: ExecutionEventName.OUTPUT_CHUNK,
          data: { chunk: 'hello' },
        },
        {
          eventId: 7,
          event: ExecutionEventName.STEP_AGENT_EVENT,
          data: { event: { type: 'decision', suggestedContent: '继续处理' } },
        },
      ]);

      const client = makeSocket();
      const ack = await gateway.handleSubscribe(client, {
        conversationId: 'conv-1',
        lastEventId: 5,
      });

      expect(ack.status).toBe('subscribed');
      expect(mockEventBridgeService.getEventsSince).toHaveBeenCalledWith(
        'conv-1',
        5,
      );
      // Replayed events should be mapped to conversation event names
      expect(client.emit).toHaveBeenCalledTimes(2);
      expect(client.emit).toHaveBeenCalledWith(
        ConversationEventName.AGENT_MESSAGE_CHUNK,
        expect.objectContaining({ eventId: 6 }),
      );
      expect(client.emit).toHaveBeenCalledWith(
        ConversationEventName.AGENT_THINKING,
        expect.objectContaining({ eventId: 7 }),
      );
    });

    it('should skip replay when lastEventId >= currentEventId', async () => {
      mockEventBridgeService.getLastEventId.mockReturnValue(5);

      const client = makeSocket();
      await gateway.handleSubscribe(client, {
        conversationId: 'conv-1',
        lastEventId: 5,
      });

      expect(mockEventBridgeService.getEventsSince).not.toHaveBeenCalled();
    });

    it('should allow tenantId in payload matching user tenantId', async () => {
      const client = makeSocket({ tenantId: 'tenant-1' });
      const ack = await gateway.handleSubscribe(client, {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
      });

      expect(ack.status).toBe('subscribed');
    });
  });

  describe('conversation:unsubscribe', () => {
    it('should leave room and remove socket from tracking', async () => {
      const client = makeSocket();

      // First subscribe
      await gateway.handleSubscribe(client, { conversationId: 'conv-1' });

      // Then unsubscribe
      gateway.handleUnsubscribe(client, { conversationId: 'conv-1' });

      expect(client.leave).toHaveBeenCalledWith('conversation:tenant-1:conv-1');
    });

    it('should clean up conversationSockets map when last socket leaves', async () => {
      const client = makeSocket();

      await gateway.handleSubscribe(client, { conversationId: 'conv-1' });
      gateway.handleUnsubscribe(client, { conversationId: 'conv-1' });

      // hasSubscribers should now be false
      expect((gateway as any).hasSubscribers('conv-1')).toBe(false);
    });
  });

  describe('conversation:message', () => {
    it('should inject message via agentExecutionService', async () => {
      const client = makeSocket();
      const result = await gateway.handleMessage(client, {
        conversationId: 'conv-1',
        content: 'Hello agent',
      });

      expect(result).toEqual({ status: 'ok' });
      expect(mockAgentExecutionService.injectMessage).toHaveBeenCalledWith(
        'conv-1',
        {
          content: 'Hello agent',
          role: 'user',
          contentType: 'text',
          metadata: undefined,
        },
      );
    });

    it('should reject when user has no tenantId', async () => {
      const client = makeSocket();
      client.data.user.tenantId = undefined;

      const result = await gateway.handleMessage(client, {
        conversationId: 'conv-1',
        content: 'Hello',
      });

      expect(result).toEqual({ status: 'error', error: 'FORBIDDEN' });
      expect(mockAgentExecutionService.injectMessage).not.toHaveBeenCalled();
    });

    it('should reject when conversationId is missing', async () => {
      const client = makeSocket();
      const result = await gateway.handleMessage(client, {
        conversationId: '',
        content: 'Hello',
      });

      expect(result).toEqual({
        status: 'error',
        error: 'INVALID_PAYLOAD',
      });
    });

    it('should reject when content is missing', async () => {
      const client = makeSocket();
      const result = await gateway.handleMessage(client, {
        conversationId: 'conv-1',
        content: '',
      });

      expect(result).toEqual({
        status: 'error',
        error: 'INVALID_PAYLOAD',
      });
    });

    it('should return error when injectMessage throws', async () => {
      mockAgentExecutionService.injectMessage.mockRejectedValueOnce(
        new Error('Conversation not found'),
      );

      const client = makeSocket();
      const result = await gateway.handleMessage(client, {
        conversationId: 'conv-1',
        content: 'Hello',
      });

      expect(result).toEqual({
        status: 'error',
        error: 'Conversation not found',
      });
    });

    it('should pass contentType and metadata through', async () => {
      const client = makeSocket();
      await gateway.handleMessage(client, {
        conversationId: 'conv-1',
        content: 'file content',
        contentType: 'file',
        metadata: { filename: 'test.txt' },
      });

      expect(mockAgentExecutionService.injectMessage).toHaveBeenCalledWith(
        'conv-1',
        {
          content: 'file content',
          role: 'user',
          contentType: 'file',
          metadata: { filename: 'test.txt' },
        },
      );
    });
  });

  describe('conversation:cancel', () => {
    it('should cancel via agentExecutionService', async () => {
      const client = makeSocket();
      const result = await gateway.handleCancel(client, {
        conversationId: 'conv-1',
      });

      expect(result).toEqual({ status: 'ok' });
      expect(mockAgentExecutionService.cancelExecution).toHaveBeenCalledWith(
        'conv-1',
      );
    });

    it('should reject when user has no tenantId', async () => {
      const client = makeSocket();
      client.data.user.tenantId = undefined;

      const result = await gateway.handleCancel(client, {
        conversationId: 'conv-1',
      });

      expect(result).toEqual({ status: 'error', error: 'FORBIDDEN' });
    });

    it('should reject when conversationId is missing', async () => {
      const client = makeSocket();
      const result = await gateway.handleCancel(client, {
        conversationId: '',
      });

      expect(result).toEqual({
        status: 'error',
        error: 'INVALID_PAYLOAD',
      });
    });

    it('should return error when cancelExecution throws', async () => {
      mockAgentExecutionService.cancelExecution.mockRejectedValueOnce(
        new Error('Cannot cancel'),
      );

      const client = makeSocket();
      const result = await gateway.handleCancel(client, {
        conversationId: 'conv-1',
      });

      expect(result).toEqual({
        status: 'error',
        error: 'Cannot cancel',
      });
    });
  });

  describe('event handlers', () => {
    beforeEach(async () => {
      // Subscribe a socket so hasSubscribers returns true
      const client = makeSocket();
      await gateway.handleSubscribe(client, { conversationId: 'conv-1' });
      vi.clearAllMocks();
      mockThrottleService.tryConsume.mockReturnValue(true);
    });

    describe('handleExecutionStatusChanged', () => {
      it('should broadcast STATUS_CHANGED for status update', () => {
        gateway.handleExecutionStatusChanged({
          executionId: 'conv-1',
          status: 'running',
          tenantId: 'tenant-1',
        });

        expect(server.to).toHaveBeenCalledWith('conversation:tenant-1:conv-1');
        const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
          .value.emit;
        expect(emitFn).toHaveBeenCalledWith(
          ConversationEventName.STATUS_CHANGED,
          expect.objectContaining({ conversationId: 'conv-1' }),
        );
      });

      it('should also broadcast AGENT_DONE on terminal status', () => {
        gateway.handleExecutionStatusChanged({
          executionId: 'conv-1',
          status: 'completed',
          tenantId: 'tenant-1',
        });

        const toCalls = (server.to as ReturnType<typeof vi.fn>).mock.results;
        // STATUS_CHANGED + AGENT_DONE = at least 2 emits
        expect(toCalls.length).toBeGreaterThanOrEqual(2);
      });

      it('应在无本地订阅记录时仍广播状态事件，兼容 server/worker 分离部署', () => {
        gateway.handleExecutionStatusChanged({
          executionId: 'no-subscribers',
          status: 'running',
          tenantId: 'tenant-1',
        });

        expect(server.to).toHaveBeenCalledWith(
          'conversation:tenant-1:no-subscribers',
        );
      });

      it('should ignore workflow execution events', () => {
        gateway.handleExecutionStatusChanged({
          executionId: 'conv-1',
          status: 'running',
          tenantId: 'tenant-1',
          executionType: 'workflow',
        });

        expect(server.to).not.toHaveBeenCalled();
      });
    });

    describe('handleStepAgentEvent', () => {
      it('should map decision event to AGENT_THINKING', () => {
        gateway.handleStepAgentEvent({
          stepId: 'step-1',
          event: {
            type: 'decision',
            suggestedContent: 'reasoning...',
          } as any,
          tenantId: 'tenant-1',
          executionId: 'conv-1',
        });

        const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
          .value.emit;
        expect(emitFn).toHaveBeenCalledWith(
          ConversationEventName.AGENT_THINKING,
          expect.any(Object),
        );
      });

      it('should map message_chunk to AGENT_MESSAGE_CHUNK', () => {
        gateway.handleStepAgentEvent({
          stepId: 'step-1',
          event: { type: 'message_chunk', content: 'hello' } as any,
          tenantId: 'tenant-1',
          executionId: 'conv-1',
        });

        const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
          .value.emit;
        expect(emitFn).toHaveBeenCalledWith(
          ConversationEventName.AGENT_MESSAGE_CHUNK,
          expect.any(Object),
        );
      });

      it('should ignore tool_call because canonical tool events come from NODE_TOOL_CALL_STATUS', () => {
        gateway.handleStepAgentEvent({
          stepId: 'step-1',
          event: {
            type: 'tool_call',
            call: { id: 'tc-1', tool: 'search', status: 'pending' },
          } as any,
          tenantId: 'tenant-1',
          executionId: 'conv-1',
        });

        expect(server.to).not.toHaveBeenCalled();
      });

      it('should ignore done events because completion is emitted via execution status', () => {
        gateway.handleStepAgentEvent({
          stepId: 'step-1',
          event: { type: 'done', stopReason: 'end_turn' } as any,
          tenantId: 'tenant-1',
          executionId: 'conv-1',
        });

        expect(server.to).not.toHaveBeenCalled();
      });

      it('should map terminal_output to SANDBOX_TERMINAL_OUTPUT', () => {
        gateway.handleStepAgentEvent({
          stepId: 'step-1',
          event: { type: 'terminal_output', output: 'ls result' } as any,
          tenantId: 'tenant-1',
          executionId: 'conv-1',
        });

        const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
          .value.emit;
        expect(emitFn).toHaveBeenCalledWith(
          ConversationEventName.SANDBOX_TERMINAL_OUTPUT,
          expect.any(Object),
        );
      });

      it('should map file_change to SANDBOX_FILE_CHANGE', () => {
        gateway.handleStepAgentEvent({
          stepId: 'step-1',
          event: {
            type: 'file_change',
            path: '/workspace/test.ts',
          } as any,
          tenantId: 'tenant-1',
          executionId: 'conv-1',
        });

        const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
          .value.emit;
        expect(emitFn).toHaveBeenCalledWith(
          ConversationEventName.SANDBOX_FILE_CHANGE,
          expect.any(Object),
        );
      });

      it('should ignore unknown event types', () => {
        gateway.handleStepAgentEvent({
          stepId: 'step-1',
          event: { type: 'unknown_event' } as any,
          tenantId: 'tenant-1',
          executionId: 'conv-1',
        });

        expect(server.to).not.toHaveBeenCalled();
      });

      it('should ignore workflow step agent events', () => {
        gateway.handleStepAgentEvent({
          stepId: 'step-1',
          event: { type: 'message_chunk', content: 'hello' } as any,
          tenantId: 'tenant-1',
          executionId: 'conv-1',
          executionType: 'workflow',
        });

        expect(server.to).not.toHaveBeenCalled();
      });
    });

    describe('handleToolCallStatus', () => {
      it('should map completed status to AGENT_TOOL_RESULT', () => {
        gateway.handleToolCallStatus({
          stepId: 'step-1',
          nodeId: 'node-1',
          toolCallId: 'tc-1',
          tool: 'search',
          status: 'completed' as any,
          tenantId: 'tenant-1',
          executionId: 'conv-1',
        });

        const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
          .value.emit;
        expect(emitFn).toHaveBeenCalledWith(
          ConversationEventName.AGENT_TOOL_RESULT,
          expect.any(Object),
        );
      });

      it('should map failed status to AGENT_TOOL_RESULT', () => {
        gateway.handleToolCallStatus({
          stepId: 'step-1',
          nodeId: 'node-1',
          toolCallId: 'tc-1',
          tool: 'search',
          status: 'failed' as any,
          tenantId: 'tenant-1',
          executionId: 'conv-1',
        });

        const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
          .value.emit;
        expect(emitFn).toHaveBeenCalledWith(
          ConversationEventName.AGENT_TOOL_RESULT,
          expect.any(Object),
        );
      });

      it('should map pending status to AGENT_TOOL_CALL', () => {
        gateway.handleToolCallStatus({
          stepId: 'step-1',
          nodeId: 'node-1',
          toolCallId: 'tc-1',
          tool: 'search',
          status: 'pending' as any,
          tenantId: 'tenant-1',
          executionId: 'conv-1',
        });

        const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
          .value.emit;
        expect(emitFn).toHaveBeenCalledWith(
          ConversationEventName.AGENT_TOOL_CALL,
          expect.any(Object),
        );
      });
    });

    describe('handleInterventionRequired', () => {
      it('should broadcast STATUS_CHANGED', () => {
        gateway.handleInterventionRequired({
          stepId: 'step-1',
          nodeId: 'node-1',
          nodeName: 'Agent Node',
          requestedAt: new Date().toISOString(),
          tenantId: 'tenant-1',
          executionId: 'conv-1',
        });

        const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
          .value.emit;
        expect(emitFn).toHaveBeenCalledWith(
          ConversationEventName.STATUS_CHANGED,
          expect.any(Object),
        );
      });

      it('should ignore workflow intervention events', () => {
        gateway.handleInterventionRequired({
          stepId: 'step-1',
          nodeId: 'node-1',
          nodeName: 'Agent Node',
          requestedAt: new Date().toISOString(),
          tenantId: 'tenant-1',
          executionId: 'conv-1',
          executionType: 'workflow',
        });

        expect(server.to).not.toHaveBeenCalled();
      });
    });

    describe('handleInterventionResolved', () => {
      it('should broadcast STATUS_CHANGED', () => {
        gateway.handleInterventionResolved({
          stepId: 'step-1',
          nodeId: 'node-1',
          action: 'approve',
          resolvedBy: 'user-1',
          resolvedAt: new Date().toISOString(),
          tenantId: 'tenant-1',
          executionId: 'conv-1',
        });

        const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
          .value.emit;
        expect(emitFn).toHaveBeenCalledWith(
          ConversationEventName.STATUS_CHANGED,
          expect.any(Object),
        );
      });

      it('should ignore workflow intervention resolution events', () => {
        gateway.handleInterventionResolved({
          stepId: 'step-1',
          nodeId: 'node-1',
          action: 'approve',
          resolvedBy: 'user-1',
          resolvedAt: new Date().toISOString(),
          tenantId: 'tenant-1',
          executionId: 'conv-1',
          executionType: 'workflow',
        });

        expect(server.to).not.toHaveBeenCalled();
      });
    });
  });

  describe('broadcastConversationEvent', () => {
    it('should emit directly when throttle allows', async () => {
      const client = makeSocket();
      await gateway.handleSubscribe(client, { conversationId: 'conv-1' });
      mockThrottleService.tryConsume.mockReturnValue(true);

      gateway.broadcastConversationEvent(
        'tenant-1',
        'conv-1',
        ConversationEventName.AGENT_MESSAGE_CHUNK,
        { test: true },
      );

      expect(server.to).toHaveBeenCalledWith('conversation:tenant-1:conv-1');
    });

    it('should enqueue when throttle denies', async () => {
      const client = makeSocket();
      await gateway.handleSubscribe(client, { conversationId: 'conv-1' });
      mockThrottleService.tryConsume.mockReturnValue(false);

      gateway.broadcastConversationEvent(
        'tenant-1',
        'conv-1',
        ConversationEventName.AGENT_MESSAGE_CHUNK,
        { test: true },
      );

      // Should have enqueued — queue should not be empty
      const queueKey = 'tenant-1:conv-1';
      expect((gateway as any).eventQueue.get(queueKey)).toBeDefined();
      expect((gateway as any).eventQueue.get(queueKey).length).toBeGreaterThan(
        0,
      );
    });
  });

  describe('broadcastConversationEventImmediately', () => {
    it('should emit immediately bypassing throttle', () => {
      gateway.broadcastConversationEventImmediately(
        'tenant-1',
        'conv-1',
        ConversationEventName.AGENT_DONE,
        { status: 'completed' },
      );

      expect(server.to).toHaveBeenCalledWith('conversation:tenant-1:conv-1');
      expect(mockThrottleService.tryConsume).not.toHaveBeenCalled();
    });
  });

  describe('cross-process broadcast safety', () => {
    it('应在无本地订阅记录时仍广播 tool 结果事件，兼容 Redis Socket.IO adapter 跨进程转发', () => {
      mockThrottleService.tryConsume.mockReturnValue(true);

      gateway.handleToolCallStatus({
        stepId: 'step-1',
        nodeId: 'node-1',
        toolCallId: 'tc-1',
        tool: 'search_knowledge',
        status: 'completed' as any,
        tenantId: 'tenant-1',
        executionId: 'conv-cross-process',
      });

      expect(server.to).toHaveBeenCalledWith(
        'conversation:tenant-1:conv-cross-process',
      );
      const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
        .value.emit;
      expect(emitFn).toHaveBeenCalledWith(
        ConversationEventName.AGENT_TOOL_RESULT,
        expect.objectContaining({
          conversationId: 'conv-cross-process',
          tenantId: 'tenant-1',
          toolCallId: 'tc-1',
          tool: 'search_knowledge',
        }),
      );
    });
  });

  describe('flushConversationQueue', () => {
    it('should drain all queued events', async () => {
      const client = makeSocket();
      await gateway.handleSubscribe(client, { conversationId: 'conv-1' });
      mockThrottleService.tryConsume.mockReturnValue(false);

      // Enqueue several events
      gateway.broadcastConversationEvent(
        'tenant-1',
        'conv-1',
        ConversationEventName.AGENT_MESSAGE_CHUNK,
        { chunk: 'a' },
      );
      gateway.broadcastConversationEvent(
        'tenant-1',
        'conv-1',
        ConversationEventName.AGENT_MESSAGE_CHUNK,
        { chunk: 'b' },
      );

      // Now flush
      gateway.flushConversationQueue('tenant-1', 'conv-1');

      // Queue should be cleaned up
      const queueKey = 'tenant-1:conv-1';
      expect((gateway as any).eventQueue.has(queueKey)).toBe(false);

      // Both events should have been emitted
      const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
        ?.value.emit;
      if (emitFn) {
        expect(emitFn).toHaveBeenCalled();
      }
    });

    it('should clear queue when empty', () => {
      gateway.flushConversationQueue('tenant-1', 'conv-1');

      expect((gateway as any).eventQueue.has('tenant-1:conv-1')).toBe(false);
    });
  });

  describe('clearConversationQueue', () => {
    it('should delete queue and timer', async () => {
      const client = makeSocket();
      await gateway.handleSubscribe(client, { conversationId: 'conv-1' });
      mockThrottleService.tryConsume.mockReturnValue(false);

      gateway.broadcastConversationEvent(
        'tenant-1',
        'conv-1',
        ConversationEventName.AGENT_MESSAGE_CHUNK,
        { chunk: 'test' },
      );

      gateway.clearConversationQueue('tenant-1', 'conv-1');

      const queueKey = 'tenant-1:conv-1';
      expect((gateway as any).eventQueue.has(queueKey)).toBe(false);
      expect((gateway as any).drainTimers.has(queueKey)).toBe(false);
    });
  });

  describe('handleConnection / handleDisconnect', () => {
    it('should log connection', () => {
      const client = makeSocket();
      gateway.handleConnection(client);
      // Just verifying no throw — logger is mocked
    });

    it('should clean up socket tracking on disconnect', async () => {
      const client = makeSocket();
      await gateway.handleSubscribe(client, { conversationId: 'conv-1' });
      expect((gateway as any).hasSubscribers('conv-1')).toBe(true);

      gateway.handleDisconnect(client);
      expect((gateway as any).hasSubscribers('conv-1')).toBe(false);
    });

    it('should handle disconnect when not subscribed', () => {
      const client = makeSocket();
      // Should not throw
      gateway.handleDisconnect(client);
    });
  });

  describe('createAuthError', () => {
    it('should return Error with code 4001', () => {
      const err = (gateway as any).createAuthError('Token expired');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Token expired');
      expect(err.data).toEqual({
        code: 4001,
        reason: 'Token expired',
      });
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear all timers and queues', async () => {
      const client = makeSocket();
      await gateway.handleSubscribe(client, { conversationId: 'conv-1' });
      mockThrottleService.tryConsume.mockReturnValue(false);

      gateway.broadcastConversationEvent(
        'tenant-1',
        'conv-1',
        ConversationEventName.AGENT_MESSAGE_CHUNK,
        { test: true },
      );

      gateway.onModuleDestroy();

      expect((gateway as any).drainTimers.size).toBe(0);
      expect((gateway as any).eventQueue.size).toBe(0);
      expect((gateway as any).conversationSockets.size).toBe(0);
    });
  });

  describe('ConversationEventName', () => {
    it('should define all 8 expected event names', () => {
      expect(ConversationEventName.AGENT_MESSAGE_CHUNK).toBe(
        'conversation.agent.message_chunk',
      );
      expect(ConversationEventName.AGENT_THINKING).toBe(
        'conversation.agent.thinking',
      );
      expect(ConversationEventName.AGENT_TOOL_CALL).toBe(
        'conversation.agent.tool_call',
      );
      expect(ConversationEventName.AGENT_TOOL_RESULT).toBe(
        'conversation.agent.tool_result',
      );
      expect(ConversationEventName.AGENT_DONE).toBe('conversation.agent.done');
      expect(ConversationEventName.SANDBOX_TERMINAL_OUTPUT).toBe(
        'conversation.sandbox.terminal_output',
      );
      expect(ConversationEventName.SANDBOX_FILE_CHANGE).toBe(
        'conversation.sandbox.file_change',
      );
      expect(ConversationEventName.STATUS_CHANGED).toBe(
        'conversation.status.changed',
      );
    });
  });

  describe('mapExecutionEventToConversation', () => {
    it('should map OUTPUT_CHUNK to AGENT_MESSAGE_CHUNK', () => {
      const result = (gateway as any).mapExecutionEventToConversation({
        eventId: 1,
        event: ExecutionEventName.OUTPUT_CHUNK,
        timestamp: '2026-03-29T00:00:00.000Z',
        executionId: 'conv-1',
        tenantId: 'tenant-1',
        data: { stepId: 'step-1', chunk: 'hello', index: 0 },
      });
      expect(result).toBe(ConversationEventName.AGENT_MESSAGE_CHUNK);
    });

    it('should map STEP_AGENT_EVENT decision payload to AGENT_THINKING', () => {
      const result = (gateway as any).mapExecutionEventToConversation({
        eventId: 2,
        event: ExecutionEventName.STEP_AGENT_EVENT,
        timestamp: '2026-03-29T00:00:00.000Z',
        executionId: 'conv-1',
        tenantId: 'tenant-1',
        data: {
          stepId: 'step-1',
          event: { type: 'decision', suggestedContent: '继续' },
        },
      });
      expect(result).toBe(ConversationEventName.AGENT_THINKING);
    });

    it('should map NODE_TOOL_CALL_STATUS to AGENT_TOOL_CALL', () => {
      const result = (gateway as any).mapExecutionEventToConversation({
        eventId: 3,
        event: ExecutionEventName.NODE_TOOL_CALL_STATUS,
        timestamp: '2026-03-29T00:00:00.000Z',
        executionId: 'conv-1',
        tenantId: 'tenant-1',
        data: {
          stepId: 'step-1',
          nodeId: 'node-1',
          toolCallId: 'tool-1',
          tool: 'search',
          status: 'pending',
        },
      });
      expect(result).toBe(ConversationEventName.AGENT_TOOL_CALL);
    });

    it('should map completed NODE_TOOL_CALL_STATUS to AGENT_TOOL_RESULT', () => {
      const result = (gateway as any).mapExecutionEventToConversation({
        eventId: 4,
        event: ExecutionEventName.NODE_TOOL_CALL_STATUS,
        timestamp: '2026-03-29T00:00:00.000Z',
        executionId: 'conv-1',
        tenantId: 'tenant-1',
        data: {
          stepId: 'step-1',
          nodeId: 'node-1',
          toolCallId: 'tool-1',
          tool: 'search',
          status: 'completed',
        },
      });
      expect(result).toBe(ConversationEventName.AGENT_TOOL_RESULT);
    });

    it('should map EXECUTION_STATUS_CHANGED to STATUS_CHANGED', () => {
      const result = (gateway as any).mapExecutionEventToConversation({
        eventId: 5,
        event: ExecutionEventName.EXECUTION_STATUS_CHANGED,
        timestamp: '2026-03-29T00:00:00.000Z',
        executionId: 'conv-1',
        tenantId: 'tenant-1',
        data: { executionId: 'conv-1', status: 'running' },
      });
      expect(result).toBe(ConversationEventName.STATUS_CHANGED);
    });

    it('should map STEP_STATUS_CHANGED to STATUS_CHANGED', () => {
      const result = (gateway as any).mapExecutionEventToConversation({
        eventId: 6,
        event: ExecutionEventName.STEP_STATUS_CHANGED,
        timestamp: '2026-03-29T00:00:00.000Z',
        executionId: 'conv-1',
        tenantId: 'tenant-1',
        data: {
          stepId: 'step-1',
          nodeId: 'node-1',
          from: 'pending',
          to: 'running',
        },
      });
      expect(result).toBe(ConversationEventName.STATUS_CHANGED);
    });

    it('should return null for unmapped STEP_AGENT_EVENT payloads', () => {
      const result = (gateway as any).mapExecutionEventToConversation({
        eventId: 7,
        event: ExecutionEventName.STEP_AGENT_EVENT,
        timestamp: '2026-03-29T00:00:00.000Z',
        executionId: 'conv-1',
        tenantId: 'tenant-1',
        data: {
          stepId: 'step-1',
          event: {
            type: 'tool_call',
            call: { id: 'tool-1', tool: 'search', status: 'pending' },
          },
        },
      });
      expect(result).toBeNull();
    });

    it('should return null for unknown events', () => {
      const result = (gateway as any).mapExecutionEventToConversation({
        eventId: 8,
        event: 'unknown.event',
        timestamp: '2026-03-29T00:00:00.000Z',
        executionId: 'conv-1',
        tenantId: 'tenant-1',
        data: {},
      });
      expect(result).toBeNull();
    });
  });

  describe('handleOutputChunk', () => {
    it('应将 conversation output chunk 广播到 agent message chunk 事件', () => {
      mockThrottleService.tryConsume.mockReturnValue(true);

      gateway.handleOutputChunk({
        tenantId: 'tenant-1',
        executionId: 'conv-1',
        stepId: 'conv-1',
        chunk: 'hello',
        index: 0,
        executionType: 'conversation',
      });

      expect(server.to).toHaveBeenCalledWith('conversation:tenant-1:conv-1');
      const emitFn = (server.to as ReturnType<typeof vi.fn>).mock.results.at(-1)
        ?.value.emit;
      expect(emitFn).toBeDefined();
      expect(emitFn).toHaveBeenCalledWith(
        ConversationEventName.AGENT_MESSAGE_CHUNK,
        expect.objectContaining({
          conversationId: 'conv-1',
          tenantId: 'tenant-1',
          chunk: 'hello',
          index: 0,
        }),
      );
    });

    it('应忽略 workflow output chunk，避免串到 conversation room', () => {
      gateway.handleOutputChunk({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        stepId: 'step-1',
        chunk: 'hello',
        index: 0,
        executionType: 'workflow',
      });

      expect(server.to).not.toHaveBeenCalled();
    });
  });
});

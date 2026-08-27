import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';

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
  getConversationSnapshotMessages: vi.fn().mockResolvedValue([]),
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
    authToken: string;
    authorization: string;
  }> = {},
): Socket {
  const {
    id = 'socket-1',
    tenantId = 'tenant-1',
    sub = 'user-1',
    join = vi.fn().mockResolvedValue(undefined),
    leave = vi.fn(),
    emit = vi.fn(),
    authToken = '',
    authorization = '',
  } = overrides;

  return {
    id,
    handshake: {
      auth: authToken ? { token: authToken } : {},
      headers: authorization ? { authorization } : {},
      query: {},
    },
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

    // 缓冲区仍在（返回空数组）＝客户端确已追平：既不补发也不发 snapshot。
    it('should skip replay when the live buffer reports nothing missed', async () => {
      mockEventBridgeService.getLastEventId.mockReturnValue(5);
      mockEventBridgeService.getEventsSince.mockReturnValue([]);

      const client = makeSocket();
      await gateway.handleSubscribe(client, {
        conversationId: 'conv-1',
        lastEventId: 5,
      });

      expect(mockEventBridgeService.getEventsSince).toHaveBeenCalledWith(
        'conv-1',
        5,
      );
      expect(
        mockAgentExecutionService.getConversationSnapshotMessages,
      ).not.toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalled();
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

  describe('socket authentication middleware', () => {
    function installMiddleware() {
      const use = vi.fn();
      const authServer = {
        use,
      } as unknown as Server;
      gateway.afterInit(authServer);
      const middleware = use.mock.calls[0]?.[0];
      if (typeof middleware !== 'function') {
        throw new Error('gateway auth middleware was not installed');
      }
      return middleware;
    }

    it('缺少 token 时应返回带 websocket close code 的认证错误', async () => {
      const middleware = installMiddleware();
      const next = vi.fn();

      await middleware(makeSocket(), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication required',
          data: {
            code: 4001,
            reason: 'Authentication required',
          },
        }),
      );
    });

    it('应接受 Authorization Bearer token 并兼容 snake_case 租户 claims', async () => {
      const token = jwt.sign(
        {
          sub: 'user-auth',
          aud: 'authenticated',
          email: 'auth@example.com',
          tenant_id: 'tenant-snake',
          tenant_role: 'member',
        },
        'test-jwt-secret',
        {
          algorithm: 'HS256',
          expiresIn: '1h',
        },
      );
      const middleware = installMiddleware();
      const client = makeSocket({ authorization: `Bearer ${token}` });
      const next = vi.fn();

      await middleware(client, next);

      expect(next).toHaveBeenCalledWith();
      expect(client.data.user).toMatchObject({
        sub: 'user-auth',
        email: 'auth@example.com',
        tenantId: 'tenant-snake',
        tenantRole: 'member',
      });
      expect(mockTokenBlacklistService.isBlacklisted).toHaveBeenCalledWith(
        token,
      );
    });

    it('auth token 应优先于无效 Authorization header', async () => {
      const token = jwt.sign(
        {
          sub: 'user-auth',
          aud: 'authenticated',
          tenantId: 'tenant-camel',
          tenantRole: 'admin',
        },
        'test-jwt-secret',
        {
          algorithm: 'HS256',
          expiresIn: '1h',
        },
      );
      const middleware = installMiddleware();
      const client = makeSocket({
        authToken: token,
        authorization: 'Basic invalid',
      });
      const next = vi.fn();

      await middleware(client, next);

      expect(next).toHaveBeenCalledWith();
      expect(client.data.user.tenantId).toBe('tenant-camel');
      expect(client.data.user.email).toBe('');
    });

    it('黑名单 token 应在签名校验前被拒绝', async () => {
      mockTokenBlacklistService.isBlacklisted.mockResolvedValueOnce(true);
      const middleware = installMiddleware();
      const next = vi.fn();

      await middleware(makeSocket({ authToken: 'revoked-token' }), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Token has been revoked',
          data: { code: 4001, reason: 'Token has been revoked' },
        }),
      );
    });

    it('mfa_pending token 应要求先完成 MFA 验证', async () => {
      const token = jwt.sign(
        {
          sub: 'user-auth',
          aud: 'authenticated',
          type: 'mfa_pending',
        },
        'test-jwt-secret',
        {
          algorithm: 'HS256',
          expiresIn: '1h',
        },
      );
      const middleware = installMiddleware();
      const next = vi.fn();

      await middleware(makeSocket({ authToken: token }), next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'MFA verification required',
          data: { code: 4001, reason: 'MFA verification required' },
        }),
      );
    });

    it('缺少必要 claims 或签名无效时应统一返回过期错误', async () => {
      const incompleteToken = jwt.sign(
        { aud: 'authenticated' },
        'test-jwt-secret',
        { algorithm: 'HS256', expiresIn: '1h' },
      );
      const middleware = installMiddleware();
      const incompleteNext = vi.fn();
      const invalidNext = vi.fn();

      await middleware(
        makeSocket({ authToken: incompleteToken }),
        incompleteNext,
      );
      await middleware(
        makeSocket({ authToken: `${incompleteToken}invalid` }),
        invalidNext,
      );

      expect(incompleteNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid token claims' }),
      );
      expect(invalidNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid or expired token' }),
      );
    });
  });
  describe('branch behavior', () => {
    it('tracks multiple subscribers and preserves the remaining subscriber on disconnect', async () => {
      const first = makeSocket({ id: 'socket-1' });
      const second = makeSocket({ id: 'socket-2' });

      await gateway.handleSubscribe(first, { conversationId: 'conv-shared' });
      await gateway.handleSubscribe(second, { conversationId: 'conv-shared' });

      expect((gateway as any).conversationSockets.get('conv-shared')).toEqual(
        new Set(['socket-1', 'socket-2']),
      );

      gateway.handleDisconnect(first);

      expect((gateway as any).hasSubscribers('conv-shared')).toBe(true);
      expect((gateway as any).conversationSockets.get('conv-shared')).toEqual(
        new Set(['socket-2']),
      );
    });

    it('preserves the remaining subscriber on unsubscribe', async () => {
      const first = makeSocket({ id: 'socket-1' });
      const second = makeSocket({ id: 'socket-2' });
      await gateway.handleSubscribe(first, { conversationId: 'conv-shared' });
      await gateway.handleSubscribe(second, { conversationId: 'conv-shared' });

      gateway.handleUnsubscribe(first, { conversationId: 'conv-shared' });

      expect((gateway as any).conversationSockets.get('conv-shared')).toEqual(
        new Set(['socket-2']),
      );
      expect(first.leave).toHaveBeenCalledWith(
        'conversation:tenant-1:conv-shared',
      );
    });

    it('uses an empty tenant room and tolerates unsubscribe without tracking state', () => {
      const client = makeSocket();
      client.data = {};

      gateway.handleUnsubscribe(client, { conversationId: 'not-tracked' });

      expect(client.leave).toHaveBeenCalledWith('conversation::not-tracked');
      expect((gateway as any).conversationSockets.size).toBe(0);
    });

    it('logs an unknown user when connection data is absent', () => {
      const client = makeSocket();
      client.data = {};
      const debug = vi.spyOn(Logger.prototype, 'debug');

      gateway.handleConnection(client);

      expect(debug).toHaveBeenCalledWith(
        'Client connected: socket-1 (user=unknown)',
      );
    });

    it('routes step status events with optional execution type and rejects workflows', () => {
      mockThrottleService.tryConsume.mockReturnValue(true);

      gateway.handleStepStatusChanged({
        tenantId: 'tenant-1',
        executionId: 'conv-1',
        stepId: 'step-1',
        nodeId: 'node-1',
        from: 'pending',
        to: 'running',
      });

      expect(server.to).toHaveBeenCalledWith('conversation:tenant-1:conv-1');
      vi.clearAllMocks();

      gateway.handleStepStatusChanged({
        tenantId: 'tenant-1',
        executionId: 'conv-1',
        stepId: 'step-1',
        nodeId: 'node-1',
        from: 'pending',
        to: 'running',
        executionType: 'workflow',
      });

      expect(server.to).not.toHaveBeenCalled();
    });

    it('recognizes legacy conversation chunks without executionType', () => {
      mockThrottleService.tryConsume.mockReturnValue(true);

      gateway.handleOutputChunk({
        tenantId: 'tenant-1',
        executionId: 'conv-legacy',
        stepId: 'conv-legacy',
        chunk: 'legacy chunk',
        index: 0,
      });

      const emit = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
        ?.value.emit;
      expect(emit).toHaveBeenCalledWith(
        ConversationEventName.AGENT_MESSAGE_CHUNK,
        expect.objectContaining({ chunk: 'legacy chunk' }),
      );
    });

    it.each(['thinking', 'plan'] as const)(
      'maps %s step events to thinking updates',
      (type) => {
        mockThrottleService.tryConsume.mockReturnValue(true);

        gateway.handleStepAgentEvent({
          tenantId: 'tenant-1',
          executionId: 'conv-1',
          stepId: 'step-1',
          event: { type } as any,
        });

        const emit = (server.to as ReturnType<typeof vi.fn>).mock.results.at(-1)
          ?.value.emit;
        expect(emit).toHaveBeenCalledWith(
          ConversationEventName.AGENT_THINKING,
          expect.objectContaining({ conversationId: 'conv-1' }),
        );
      },
    );

    it('rejects workflow tool events while accepting omitted executionType', () => {
      mockThrottleService.tryConsume.mockReturnValue(true);
      const base = {
        tenantId: 'tenant-1',
        executionId: 'conv-1',
        stepId: 'step-1',
        nodeId: 'node-1',
        toolCallId: 'call-1',
        tool: 'search',
        status: 'pending' as any,
      };

      gateway.handleToolCallStatus({ ...base, executionType: 'workflow' });
      expect(server.to).not.toHaveBeenCalled();

      gateway.handleToolCallStatus(base);
      expect(server.to).toHaveBeenCalledWith('conversation:tenant-1:conv-1');
    });

    it('ignores workspace changes without a conversation and emits every provided file', () => {
      mockThrottleService.tryConsume.mockReturnValue(true);
      gateway.handleWorkspaceFileChange({
        tenantId: 'tenant-1',
        changedFiles: ['ignored.ts'],
        timestamp: '2026-08-11T00:00:00.000Z',
      });
      expect(server.to).not.toHaveBeenCalled();

      gateway.handleWorkspaceFileChange({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        changedFiles: ['a.ts', 'b.ts'],
        timestamp: '2026-08-11T00:00:00.000Z',
      });

      expect(server.to).toHaveBeenCalledTimes(2);
      const emit = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
        ?.value.emit;
      const emittedPayloads = emit.mock.calls.map((call: unknown[]) => call[1]);
      expect(emittedPayloads).toEqual([
        expect.objectContaining({ path: 'a.ts', changeType: 'modified' }),
        expect.objectContaining({ path: 'b.ts', changeType: 'modified' }),
      ]);
    });

    it('maps subagent tool events without call details and unknown events', () => {
      mockThrottleService.tryConsume.mockReturnValue(true);
      const subagent = {
        handle: 'subagent-1',
        agentId: 'agent-1',
        task: 'research',
      } as any;

      gateway.handleSubAgentEvent({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        event: { type: 'tool_call' } as any,
        subagent,
      });
      gateway.handleSubAgentEvent({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        event: { type: 'unrecognized', content: 'fallback' } as any,
        subagent,
      });

      const emit = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
        ?.value.emit;
      const emittedEvents = emit.mock.calls.map((call: unknown[]) => call[0]);
      expect(emittedEvents).toEqual([
        ConversationEventName.AGENT_TOOL_CALL,
        ConversationEventName.AGENT_MESSAGE_CHUNK,
      ]);
    });

    // D-12 回归：缓冲区放不下这段区间（getEventsSince 返回 null）时，
    // 此前会静默结束，客户端永远补不回断线期间的内容。现在必须回退持久 snapshot。
    it('falls back to a persisted snapshot when the replay buffer has a gap', async () => {
      mockEventBridgeService.getLastEventId.mockReturnValue(12);
      mockEventBridgeService.getEventsSince.mockReturnValue(null);
      mockAgentExecutionService.getConversationSnapshotMessages.mockResolvedValue(
        [
          {
            messageId: 'msg-1',
            role: 'assistant',
            contentType: 'text',
            content: '断线期间产生的最终正文',
            segments: [{ type: 'thinking', text: '推理' }],
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      );
      const client = makeSocket();

      await gateway.handleSubscribe(client, {
        conversationId: 'conv-1',
        lastEventId: 3,
      });

      expect(mockEventBridgeService.getEventsSince).toHaveBeenCalledWith(
        'conv-1',
        3,
      );
      expect(
        mockAgentExecutionService.getConversationSnapshotMessages,
      ).toHaveBeenCalledWith('tenant-1', 'conv-1');
      expect(client.emit).toHaveBeenCalledWith(
        'conversation.state.snapshot',
        expect.objectContaining({
          conversationId: 'conv-1',
          lastEventId: 12,
          reason: 'replay-buffer-gap',
          messages: [
            expect.objectContaining({
              messageId: 'msg-1',
              content: '断线期间产生的最终正文',
            }),
          ],
        }),
      );
      // 禁止把聚合正文伪装成无 ID 的 message_chunk。
      expect(client.emit).not.toHaveBeenCalledWith(
        ConversationEventName.AGENT_MESSAGE_CHUNK,
        expect.anything(),
      );
    });

    // D-12 回归：终态 30s 后 clearExecution() 同时删掉 counter 与 buffer，
    // getLastEventId() 归零。旧游标 5 「大于等于」0，此前被误判为已追平而静默结束。
    it('emits a snapshot when the bridge has been cleared after the terminal state', async () => {
      mockEventBridgeService.getLastEventId.mockReturnValue(0);
      mockEventBridgeService.getEventsSince.mockReturnValue(null);
      mockAgentExecutionService.getConversationSnapshotMessages.mockResolvedValue(
        [
          {
            messageId: 'msg-final',
            role: 'assistant',
            contentType: 'text',
            content: '离线期间完成的最终回答',
            segments: null,
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      );
      const client = makeSocket();

      await gateway.handleSubscribe(client, {
        conversationId: 'conv-1',
        lastEventId: 5,
      });

      expect(client.emit).toHaveBeenCalledWith(
        'conversation.state.snapshot',
        expect.objectContaining({
          conversationId: 'conv-1',
          // 计数器已归零：snapshot 是新 epoch 的起点，客户端据此重置游标。
          lastEventId: 0,
          reason: 'replay-buffer-gap',
        }),
      );
    });

    // 同一 conversation 开启下一轮：新 buffer 从 1 重新计数，旧游标 5 落在它之后。
    // 只看 buffer 会拿到空数组而误判为已追平——必须先按计数器回退判 gap。
    it('emits a snapshot when the counter restarted for a new round', async () => {
      mockEventBridgeService.getLastEventId.mockReturnValue(3);
      mockEventBridgeService.getEventsSince.mockReturnValue([]);
      const client = makeSocket();

      await gateway.handleSubscribe(client, {
        conversationId: 'conv-1',
        lastEventId: 5,
      });

      expect(mockEventBridgeService.getEventsSince).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'conversation.state.snapshot',
        expect.objectContaining({ lastEventId: 3 }),
      );
    });

    // 零游标重连同样要能恢复：客户端在首个事件到达前断线，
    // 离线期间执行完成并清缓存，此时不发 snapshot 就永远拿不到内容。
    it('emits a snapshot for a zero-cursor reconnect after the buffer is gone', async () => {
      mockEventBridgeService.getLastEventId.mockReturnValue(0);
      mockEventBridgeService.getEventsSince.mockReturnValue(null);
      const client = makeSocket();

      await gateway.handleSubscribe(client, {
        conversationId: 'conv-1',
        lastEventId: 0,
      });

      expect(
        mockAgentExecutionService.getConversationSnapshotMessages,
      ).toHaveBeenCalledWith('tenant-1', 'conv-1');
    });

    // 竞态回归：socket 早已 join room，snapshot 查询期间到达的实时事件会先送达并
    // 推进客户端游标。snapshot 必须带查询**之后**的游标，否则客户端被回退，
    // 下次 replay 会把这批 chunk 重复追加一遍。
    it('stamps the snapshot with the cursor observed after the query resolves', async () => {
      mockEventBridgeService.getLastEventId.mockReturnValue(0);
      mockEventBridgeService.getEventsSince.mockReturnValue(null);

      // server 的 tsconfig lib 低于 es2024，拿不到 Promise.withResolvers，
      // 这里只能用 executor 形式手动挂出 resolve。
      let resolveQuery!: (messages: unknown[]) => void;
      const pendingQuery = new Promise<unknown[]>((resolve) => {
        resolveQuery = resolve;
      });
      mockAgentExecutionService.getConversationSnapshotMessages.mockReturnValue(
        pendingQuery,
      );

      const client = makeSocket();
      const subscribed = gateway.handleSubscribe(client, {
        conversationId: 'conv-1',
        lastEventId: 5,
      });

      // 查询挂起期间，新一轮事件推进了 bridge 的计数器。
      mockEventBridgeService.getLastEventId.mockReturnValue(4);
      resolveQuery([]);
      await subscribed;

      expect(client.emit).toHaveBeenCalledWith(
        'conversation.state.snapshot',
        expect.objectContaining({ lastEventId: 4 }),
      );
    });

    it('keeps the subscription alive when the snapshot query fails', async () => {
      mockEventBridgeService.getLastEventId.mockReturnValue(12);
      mockEventBridgeService.getEventsSince.mockReturnValue(null);
      mockAgentExecutionService.getConversationSnapshotMessages.mockRejectedValue(
        new Error('db unavailable'),
      );
      const client = makeSocket();

      const ack = await gateway.handleSubscribe(client, {
        conversationId: 'conv-1',
        lastEventId: 3,
      });

      expect(ack.status).toBe('subscribed');
      expect(client.emit).not.toHaveBeenCalled();
    });

    it('replays all remaining mapped event variants and skips unmapped events', async () => {
      mockEventBridgeService.getLastEventId.mockReturnValue(10);
      mockEventBridgeService.getEventsSince.mockReturnValue([
        {
          eventId: 1,
          event: ExecutionEventName.STEP_AGENT_EVENT,
          data: { event: { type: 'message_chunk' } },
        },
        {
          eventId: 2,
          event: ExecutionEventName.STEP_AGENT_EVENT,
          data: { event: { type: 'terminal_output' } },
        },
        {
          eventId: 3,
          event: ExecutionEventName.STEP_AGENT_EVENT,
          data: { event: { type: 'file_change' } },
        },
        {
          eventId: 4,
          event: ExecutionEventName.NODE_INTERVENTION_REQUIRED,
          data: {},
        },
        {
          eventId: 5,
          event: ExecutionEventName.NODE_INTERVENTION_RESOLVED,
          data: {},
        },
        {
          eventId: 6,
          event: ExecutionEventName.STEP_AGENT_EVENT,
          data: {},
        },
      ]);
      const clientEmit = vi.fn();
      const client = makeSocket({ emit: clientEmit });

      const ack = await gateway.handleSubscribe(client, {
        conversationId: 'conv-1',
        lastEventId: 0,
      });

      expect(clientEmit).toHaveBeenCalledTimes(5);
      expect(clientEmit.mock.calls.map((call: unknown[]) => call[0])).toEqual([
        ConversationEventName.AGENT_MESSAGE_CHUNK,
        ConversationEventName.SANDBOX_TERMINAL_OUTPUT,
        ConversationEventName.SANDBOX_FILE_CHANGE,
        ConversationEventName.STATUS_CHANGED,
        ConversationEventName.STATUS_CHANGED,
      ]);
      // 最后一个可映射事件是 5，但服务端已经到 10：ack 必须带真实进度，
      // 否则客户端游标卡在 5，之后每次重连都重放 6..10。
      expect(ack.lastEventId).toBe(10);
    });

    // 终态 execution 事件在 live 路径上会紧跟一条 AGENT_DONE；replay 必须同序复刻，
    // 否则客户端补回最后一段 chunk 后不会收尾，消息永久卡在 streaming。
    it('replays a terminal execution event followed by agent done', async () => {
      mockEventBridgeService.getLastEventId.mockReturnValue(8);
      mockEventBridgeService.getEventsSince.mockReturnValue([
        {
          eventId: 7,
          event: ExecutionEventName.OUTPUT_CHUNK,
          data: { chunk: '最后一段' },
        },
        {
          eventId: 8,
          event: ExecutionEventName.EXECUTION_STATUS_CHANGED,
          data: { status: 'completed' },
        },
      ]);
      const clientEmit = vi.fn();
      const client = makeSocket({ emit: clientEmit });

      const ack = await gateway.handleSubscribe(client, {
        conversationId: 'conv-1',
        lastEventId: 6,
      });

      expect(clientEmit.mock.calls.map((call: unknown[]) => call[0])).toEqual([
        ConversationEventName.AGENT_MESSAGE_CHUNK,
        ConversationEventName.STATUS_CHANGED,
        ConversationEventName.AGENT_DONE,
      ]);
      expect(ack.lastEventId).toBe(8);
    });

    // 非终态状态不得凭空补 AGENT_DONE。
    it('does not append agent done for a non-terminal status replay', async () => {
      mockEventBridgeService.getLastEventId.mockReturnValue(4);
      mockEventBridgeService.getEventsSince.mockReturnValue([
        {
          eventId: 4,
          event: ExecutionEventName.EXECUTION_STATUS_CHANGED,
          data: { status: 'running' },
        },
      ]);
      const clientEmit = vi.fn();
      const client = makeSocket({ emit: clientEmit });

      await gateway.handleSubscribe(client, {
        conversationId: 'conv-1',
        lastEventId: 3,
      });

      expect(clientEmit.mock.calls.map((call: unknown[]) => call[0])).toEqual([
        ConversationEventName.STATUS_CHANGED,
      ]);
    });

    // snapshot 路径不带 ack 游标：snapshot 事件自己是 epoch 起点；
    // 查询失败时更不能推进，否则客户端会跳过永远补不回的区间。
    it('omits the ack cursor on the snapshot path', async () => {
      mockEventBridgeService.getLastEventId.mockReturnValue(0);
      mockEventBridgeService.getEventsSince.mockReturnValue(null);
      mockAgentExecutionService.getConversationSnapshotMessages.mockRejectedValue(
        new Error('db unavailable'),
      );
      const client = makeSocket();

      const ack = await gateway.handleSubscribe(client, {
        conversationId: 'conv-1',
        lastEventId: 5,
      });

      expect(ack).toEqual({ status: 'subscribed' });
    });

    it('drops the oldest event when the backpressure queue reaches its limit', () => {
      vi.useFakeTimers();
      try {
        mockThrottleService.tryConsume.mockReturnValue(false);
        for (let index = 0; index <= 500; index += 1) {
          gateway.broadcastConversationEvent(
            'tenant-1',
            'conv-full',
            ConversationEventName.AGENT_MESSAGE_CHUNK,
            { index },
          );
        }

        const queue = (gateway as any).eventQueue.get('tenant-1:conv-full');
        expect(queue).toHaveLength(500);
        expect(queue[0].data).toEqual({ index: 1 });
        expect(queue[499].data).toEqual({ index: 500 });
        expect(Logger.prototype.warn).toHaveBeenCalledWith(
          expect.stringContaining('dropping oldest event'),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('drains queued events before broadcasting a newly admitted event', () => {
      vi.useFakeTimers();
      try {
        mockThrottleService.tryConsume
          .mockReturnValueOnce(false)
          .mockReturnValueOnce(true)
          .mockReturnValueOnce(true);

        gateway.broadcastConversationEvent(
          'tenant-1',
          'conv-1',
          ConversationEventName.AGENT_MESSAGE_CHUNK,
          { order: 1 },
        );
        gateway.broadcastConversationEvent(
          'tenant-1',
          'conv-1',
          ConversationEventName.AGENT_MESSAGE_CHUNK,
          { order: 2 },
        );

        const emit = (server.to as ReturnType<typeof vi.fn>).mock.results[0]
          ?.value.emit;
        const emitted = emit.mock.calls;
        expect(emitted.map((call: unknown[]) => call[1])).toEqual([
          { order: 1 },
          { order: 2 },
        ]);
        expect((gateway as any).eventQueue.has('tenant-1:conv-1')).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('reschedules a throttled queue and drains it when capacity returns', () => {
      vi.useFakeTimers();
      try {
        mockThrottleService.tryConsume.mockReturnValue(false);
        gateway.broadcastConversationEvent(
          'tenant-1',
          'conv-1',
          ConversationEventName.AGENT_MESSAGE_CHUNK,
          { queued: true },
        );

        vi.advanceTimersByTime(100);
        expect((gateway as any).eventQueue.get('tenant-1:conv-1')).toHaveLength(
          1,
        );
        expect((gateway as any).drainTimers.has('tenant-1:conv-1')).toBe(true);

        mockThrottleService.tryConsume.mockReturnValue(true);
        vi.advanceTimersByTime(100);

        expect((gateway as any).eventQueue.has('tenant-1:conv-1')).toBe(false);
        expect(
          (server.to as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value
            .emit,
        ).toHaveBeenCalledWith(ConversationEventName.AGENT_MESSAGE_CHUNK, {
          queued: true,
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not schedule duplicate drain timers and ignores empty synchronous drains', () => {
      vi.useFakeTimers();
      try {
        (gateway as any).scheduleDrain('tenant-1', 'conv-1', 'tenant-1:conv-1');
        const firstTimer = (gateway as any).drainTimers.get('tenant-1:conv-1');

        (gateway as any).scheduleDrain('tenant-1', 'conv-1', 'tenant-1:conv-1');
        (gateway as any).drainQueueSync(
          'tenant-1',
          'missing',
          'tenant-1:missing',
        );

        expect((gateway as any).drainTimers.get('tenant-1:conv-1')).toBe(
          firstTimer,
        );
        expect(server.to).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('authentication error propagation', () => {
    function installMiddleware() {
      const use = vi.fn();
      gateway.afterInit({ use } as unknown as Server);
      return use.mock.calls[0]?.[0] as (
        socket: Socket,
        next: (error?: Error) => void,
      ) => Promise<void>;
    }

    it.each(['MFA provider unavailable', 'token revoked upstream'])(
      'preserves an authentication error containing %s',
      async (message) => {
        const failure = new Error(message);
        mockTokenBlacklistService.isBlacklisted.mockRejectedValueOnce(failure);
        const next = vi.fn();

        await installMiddleware()(makeSocket({ authToken: 'token' }), next);

        expect(next).toHaveBeenCalledWith(failure);
      },
    );
  });
});

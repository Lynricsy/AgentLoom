import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  EventBridgeService,
  ExecutionBroadcastIntent,
} from '../services/event-bridge.service';
import { ThrottleService } from '../services/throttle.service';
import { ExecutionEventName } from '../types/execution-event.types';
import { SubAgentRunStatus } from '../../agent-execution/subagent';
import type {
  StepStatusChangedPayload,
  ExecutionStatusChangedPayload,
  StepAgentEventPayload,
  StepRetryingPayload,
  OutputChunkPayload,
  InterventionRequiredPayload,
  InterventionResolvedPayload,
  ToolCallStatusPayload,
} from '../types/execution-event.types';

const TENANT = 'tenant-1';
const EXEC = 'exec-1';

describe('EventBridgeService', () => {
  let service: EventBridgeService;
  let gateway: {
    broadcastTypedEvent: ReturnType<typeof vi.fn>;
    broadcastTypedEventImmediately: ReturnType<typeof vi.fn>;
    flushExecutionQueue: ReturnType<typeof vi.fn>;
    clearExecutionQueue: ReturnType<typeof vi.fn>;
  };
  let throttle: {
    forceFlush: ReturnType<typeof vi.fn>;
    clearExecution: ReturnType<typeof vi.fn>;
  };
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    gateway = {
      broadcastTypedEvent: vi.fn(),
      broadcastTypedEventImmediately: vi.fn(),
      flushExecutionQueue: vi.fn(),
      clearExecutionQueue: vi.fn(),
    };
    throttle = {
      forceFlush: vi.fn().mockReturnValue([]),
      clearExecution: vi.fn(),
    };
    eventEmitter = {
      emit: vi.fn(
        (
          event: string,
          payload: {
            tenantId: string;
            executionId: string;
            event?: string;
            data?: Record<string, unknown>;
          },
        ) => {
          if (event === ExecutionBroadcastIntent.BROADCAST) {
            gateway.broadcastTypedEvent(
              payload.tenantId,
              payload.executionId,
              payload.event,
              payload.data,
            );
          } else if (
            event === ExecutionBroadcastIntent.BROADCAST_IMMEDIATELY
          ) {
            gateway.broadcastTypedEventImmediately(
              payload.tenantId,
              payload.executionId,
              payload.event,
              payload.data,
            );
          } else if (event === ExecutionBroadcastIntent.FLUSH_QUEUE) {
            gateway.flushExecutionQueue(payload.tenantId, payload.executionId);
          } else if (event === ExecutionBroadcastIntent.CLEAR_QUEUE) {
            gateway.clearExecutionQueue(payload.tenantId, payload.executionId);
          }
        },
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        EventBridgeService,
        { provide: ThrottleService, useValue: throttle },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(EventBridgeService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('emitStepStatusChanged', () => {
    it('应创建标准信封并广播', () => {
      const payload: StepStatusChangedPayload = {
        stepId: 's1',
        nodeId: 'n1',
        from: 'pending',
        to: 'running',
      };

      const result = service.emitStepStatusChanged(TENANT, EXEC, payload);

      expect(result).toMatchObject({
        eventId: 1,
        event: ExecutionEventName.STEP_STATUS_CHANGED,
        executionId: EXEC,
        tenantId: TENANT,
        data: payload,
      });
      expect(result.timestamp).toBeDefined();
      expect(gateway.broadcastTypedEvent).toHaveBeenCalledWith(
        TENANT,
        EXEC,
        ExecutionEventName.STEP_STATUS_CHANGED,
        expect.objectContaining({ eventId: 1 }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ExecutionBroadcastIntent.BROADCAST,
        expect.objectContaining({
          tenantId: TENANT,
          executionId: EXEC,
          event: ExecutionEventName.STEP_STATUS_CHANGED,
          data: expect.objectContaining({ eventId: 1 }),
        }),
      );
    });

    describe('EventEmitter 集成', () => {
      it('当步骤转为 failed 时应向 EventEmitter 发出内部事件', () => {
        const payload: StepStatusChangedPayload = {
          stepId: 's1',
          nodeId: 'n1',
          from: 'running',
          to: 'failed',
          errorDetail: {
            message: '端口类型不兼容',
            type: 'https://agentloom.dev/errors/node-type-mismatch',
          },
        };

        service.emitStepStatusChanged(TENANT, EXEC, payload);

        expect(eventEmitter.emit).toHaveBeenCalledWith(
          ExecutionEventName.STEP_STATUS_CHANGED,
          {
            tenantId: TENANT,
            executionId: EXEC,
            ...payload,
          },
        );
      });

      it('当步骤转为 completed 时应向 EventEmitter 发出内部事件', () => {
        const payload: StepStatusChangedPayload = {
          stepId: 's1',
          nodeId: 'n1',
          from: 'running',
          to: 'completed',
        };

        service.emitStepStatusChanged(TENANT, EXEC, payload);

        expect(eventEmitter.emit).toHaveBeenCalledWith(
          ExecutionEventName.STEP_STATUS_CHANGED,
          {
            tenantId: TENANT,
            executionId: EXEC,
            ...payload,
          },
        );
      });

      it('当步骤状态不是 failed 或 completed 时不应向 EventEmitter 发出内部事件', () => {
        const payload: StepStatusChangedPayload = {
          stepId: 's1',
          nodeId: 'n1',
          from: 'pending',
          to: 'running',
        };

        service.emitStepStatusChanged(TENANT, EXEC, payload);

        expect(eventEmitter.emit).not.toHaveBeenCalledWith(
          ExecutionEventName.STEP_STATUS_CHANGED,
          expect.anything(),
        );
      });

      it('未注入 EventEmitter 时模块编译失败', async () => {
        await expect(
          Test.createTestingModule({
            providers: [
              EventBridgeService,
              { provide: ThrottleService, useValue: throttle },
            ],
          }).compile(),
        ).rejects.toThrow();
      });
    });
  });

  describe('emitExecutionStatusChanged', () => {
    it('非终态应创建标准信封并走常规广播', () => {
      const payload: ExecutionStatusChangedPayload = {
        executionId: EXEC,
        status: 'running',
        completedSteps: 5,
        totalSteps: 10,
      };

      const result = service.emitExecutionStatusChanged(TENANT, EXEC, payload);

      expect(result.event).toBe(ExecutionEventName.EXECUTION_STATUS_CHANGED);
      expect(result.data).toEqual(payload);
      expect(gateway.broadcastTypedEvent).toHaveBeenCalledOnce();
      expect(gateway.broadcastTypedEventImmediately).not.toHaveBeenCalled();
      expect(gateway.flushExecutionQueue).not.toHaveBeenCalled();
      expect(throttle.forceFlush).not.toHaveBeenCalled();
    });

    it('终态应先排空队列与 pending output，再立即广播并延迟清理 replay buffer', () => {
      throttle.forceFlush.mockReturnValue([
        {
          stepId: 'step-1',
          chunk: 'tail output',
          startIndex: 2,
          endIndex: 3,
        },
      ]);

      const payload: ExecutionStatusChangedPayload = {
        executionId: EXEC,
        status: 'completed',
        completedSteps: 5,
        totalSteps: 5,
      };

      const result = service.emitExecutionStatusChanged(TENANT, EXEC, payload);

      expect(gateway.flushExecutionQueue).toHaveBeenCalledWith(TENANT, EXEC);
      expect(throttle.forceFlush).toHaveBeenCalledWith(`${TENANT}:${EXEC}`);
      expect(gateway.broadcastTypedEventImmediately).toHaveBeenCalledTimes(2);

      expect(gateway.broadcastTypedEventImmediately).toHaveBeenNthCalledWith(
        1,
        TENANT,
        EXEC,
        ExecutionEventName.OUTPUT_CHUNK,
        expect.objectContaining({
          eventId: 1,
          data: {
            stepId: 'step-1',
            chunk: 'tail output',
            index: 2,
          },
        }),
      );
      expect(gateway.broadcastTypedEventImmediately).toHaveBeenNthCalledWith(
        2,
        TENANT,
        EXEC,
        ExecutionEventName.EXECUTION_STATUS_CHANGED,
        expect.objectContaining({
          eventId: 2,
          data: payload,
        }),
      );
      expect(result.eventId).toBe(2);
      expect(throttle.clearExecution).toHaveBeenCalledWith(EXEC, TENANT);
      expect(gateway.clearExecutionQueue).toHaveBeenCalledWith(TENANT, EXEC);

      expect(service.getLastEventId(EXEC)).toBe(2);
      expect(
        service.getEventsSince(EXEC, 0)?.map((event) => event.event),
      ).toEqual([
        ExecutionEventName.OUTPUT_CHUNK,
        ExecutionEventName.EXECUTION_STATUS_CHANGED,
      ]);

      vi.advanceTimersByTime(30_000);

      expect(service.getLastEventId(EXEC)).toBe(0);
      expect(service.getEventsSince(EXEC, 0)).toBeNull();
    });
  });

  describe('emitStepAgentEvent', () => {
    it('应创建标准信封并广播', () => {
      const payload: StepAgentEventPayload = {
        stepId: 's1',
        event: { type: 'done' } as StepAgentEventPayload['event'],
      };

      const result = service.emitStepAgentEvent(TENANT, EXEC, payload);

      expect(result.event).toBe(ExecutionEventName.STEP_AGENT_EVENT);
      expect(result.data.event).toEqual({ type: 'done' });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ExecutionEventName.STEP_AGENT_EVENT,
        expect.objectContaining({
          tenantId: TENANT,
          executionId: EXEC,
          stepId: payload.stepId,
        }),
      );
    });
  });

  describe('emitStepRetrying', () => {
    it('应创建标准信封并广播', () => {
      const payload: StepRetryingPayload = {
        stepId: 's1',
        attempt: 2,
        maxAttempts: 4,
        errorMessage: 'timeout',
      };

      const result = service.emitStepRetrying(TENANT, EXEC, payload);

      expect(result.event).toBe(ExecutionEventName.STEP_RETRYING);
      expect(result.data).toEqual(payload);
    });
  });

  describe('emitOutputChunk', () => {
    it('应创建标准信封并广播', () => {
      const payload: OutputChunkPayload = {
        stepId: 's1',
        chunk: 'Hello world',
        index: 0,
        executionType: 'conversation',
      };

      const result = service.emitOutputChunk(TENANT, EXEC, payload);

      expect(result.event).toBe(ExecutionEventName.OUTPUT_CHUNK);
      expect(result.data.chunk).toBe('Hello world');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ExecutionEventName.OUTPUT_CHUNK,
        expect.objectContaining({
          tenantId: TENANT,
          executionId: EXEC,
          stepId: payload.stepId,
          chunk: payload.chunk,
          index: payload.index,
          executionType: 'conversation',
        }),
      );
    });
  });

  describe('emitInterventionRequired', () => {
    it('应创建标准信封并广播', () => {
      const payload: InterventionRequiredPayload = {
        stepId: 's1',
        nodeId: 'n1',
        nodeName: 'Node 1',
        decision: {
          suggestedContent: '建议内容',
          confidence: 0.85,
          rationale: '基于上下文分析',
        },
        partialContent: '部分输出内容',
        requestedAt: '2026-03-10T10:00:00.000Z',
      };

      const result = service.emitInterventionRequired(TENANT, EXEC, payload);

      expect(result).toMatchObject({
        eventId: 1,
        event: ExecutionEventName.NODE_INTERVENTION_REQUIRED,
        executionId: EXEC,
        tenantId: TENANT,
        data: payload,
      });
      expect(result.timestamp).toBeDefined();
      expect(gateway.broadcastTypedEvent).toHaveBeenCalledWith(
        TENANT,
        EXEC,
        ExecutionEventName.NODE_INTERVENTION_REQUIRED,
        expect.objectContaining({ eventId: 1 }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ExecutionEventName.NODE_INTERVENTION_REQUIRED,
        expect.objectContaining({
          tenantId: TENANT,
          executionId: EXEC,
          stepId: payload.stepId,
          nodeId: payload.nodeId,
        }),
      );
    });
  });

  describe('emitInterventionResolved', () => {
    it('应创建标准信封并广播', () => {
      const payload: InterventionResolvedPayload = {
        stepId: 's1',
        nodeId: 'n1',
        action: 'approve',
        feedback: '批准发布',
        resolvedBy: 'user-1',
        resolvedAt: '2026-03-10T10:05:00.000Z',
      };

      const result = service.emitInterventionResolved(TENANT, EXEC, payload);

      expect(result).toMatchObject({
        eventId: 1,
        event: ExecutionEventName.NODE_INTERVENTION_RESOLVED,
        executionId: EXEC,
        tenantId: TENANT,
        data: payload,
      });
      expect(result.timestamp).toBeDefined();
      expect(gateway.broadcastTypedEvent).toHaveBeenCalledWith(
        TENANT,
        EXEC,
        ExecutionEventName.NODE_INTERVENTION_RESOLVED,
        expect.objectContaining({ eventId: 1 }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ExecutionEventName.NODE_INTERVENTION_RESOLVED,
        expect.objectContaining({
          tenantId: TENANT,
          executionId: EXEC,
          stepId: payload.stepId,
          nodeId: payload.nodeId,
        }),
      );
    });
  });

  describe('emitToolCallStatus', () => {
    it('应创建标准信封、广播并同步内部事件', () => {
      const payload: ToolCallStatusPayload = {
        stepId: 's1',
        nodeId: 'n1',
        toolCallId: 'tool-call-1',
        tool: 'bash',
        status: 'completed',
        args: { command: 'ls' },
        result: { stdout: 'file.txt' },
        permissionRequest: {
          description: '需要创建 Skill',
          category: 'skill_resource_management',
          rememberable: true,
        },
        transitions: [
          {
            to: 'completed',
            source: 'runtime',
            timestamp: '2026-03-10T10:05:00.000Z',
          },
        ],
      };

      const result = service.emitToolCallStatus(TENANT, EXEC, payload);

      expect(result).toMatchObject({
        eventId: 1,
        event: ExecutionEventName.NODE_TOOL_CALL_STATUS,
        executionId: EXEC,
        tenantId: TENANT,
        data: payload,
      });
      expect(gateway.broadcastTypedEvent).toHaveBeenCalledWith(
        TENANT,
        EXEC,
        ExecutionEventName.NODE_TOOL_CALL_STATUS,
        expect.objectContaining({ eventId: 1 }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ExecutionEventName.NODE_TOOL_CALL_STATUS,
        expect.objectContaining({
          tenantId: TENANT,
          executionId: EXEC,
          toolCallId: payload.toolCallId,
        }),
      );
    });
  });

  describe('sub-agent capture', () => {
    it('应收集子代理事件流并在完成时产出可持久化历史', () => {
      const token = service.beginSubAgentConversationCapture('conv-1');
      const subagent = {
        handle: 'sa_hist_1',
        alias: 'researcher',
        depth: 1,
        parentToolCallId: 'tool-parent',
      } as const;

      service.emitSubAgentConversationEvent(
        'conv-1',
        TENANT,
        { type: 'message_chunk', content: 'hello child' },
        subagent,
      );
      service.emitSubAgentConversationEvent(
        'conv-1',
        TENANT,
        {
          type: 'tool_call',
          call: {
            id: 'tool-1',
            tool: 'search',
            args: { q: 'history' },
            status: 'completed',
            result: { ok: true },
          },
        },
        subagent,
      );
      service.completeSubAgentConversationStream(
        'conv-1',
        TENANT,
        subagent,
        SubAgentRunStatus.COMPLETED,
      );

      const streams = service.consumeSubAgentConversationCapture(
        'conv-1',
        token,
      );

      expect(streams).toEqual({
        sa_hist_1: expect.objectContaining({
          handle: 'sa_hist_1',
          alias: 'researcher',
          status: 'completed',
          events: [
            expect.objectContaining({
              type: 'message_chunk',
              payload: { chunk: 'hello child' },
            }),
            expect.objectContaining({
              type: 'tool_result',
              payload: expect.objectContaining({
                toolCallId: 'tool-1',
                tool: 'search',
                status: 'completed',
                result: { ok: true },
              }),
            }),
            expect.objectContaining({
              type: 'status_changed',
              payload: { status: 'completed' },
            }),
          ],
        }),
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'conversation.subagent.status',
        expect.objectContaining({
          conversationId: 'conv-1',
          tenantId: TENANT,
          handle: 'sa_hist_1',
          status: 'completed',
        }),
      );
    });
  });

  describe('eventId 单调递增', () => {
    it('同一执行实例 eventId 递增', () => {
      const payload: StepStatusChangedPayload = {
        stepId: 's1',
        nodeId: 'n1',
        from: 'pending',
        to: 'running',
      };

      const e1 = service.emitStepStatusChanged(TENANT, EXEC, payload);
      const e2 = service.emitStepStatusChanged(TENANT, EXEC, payload);
      const e3 = service.emitStepStatusChanged(TENANT, EXEC, payload);

      expect(e1.eventId).toBe(1);
      expect(e2.eventId).toBe(2);
      expect(e3.eventId).toBe(3);
    });

    it('不同执行实例 eventId 独立计数', () => {
      const payload: StepStatusChangedPayload = {
        stepId: 's1',
        nodeId: 'n1',
        from: 'pending',
        to: 'running',
      };

      const e1 = service.emitStepStatusChanged(TENANT, 'exec-a', payload);
      const e2 = service.emitStepStatusChanged(TENANT, 'exec-b', payload);
      const e3 = service.emitStepStatusChanged(TENANT, 'exec-a', payload);

      expect(e1.eventId).toBe(1);
      expect(e2.eventId).toBe(1);
      expect(e3.eventId).toBe(2);
    });
  });

  describe('bridgeLegacyEvent', () => {
    it('应将 step:status-changed 映射到标准事件', () => {
      const data = {
        stepId: 's1',
        nodeId: 'n1',
        from: 'pending',
        to: 'running',
      };

      const result = service.bridgeLegacyEvent(
        TENANT,
        EXEC,
        'step:status-changed',
        data,
      );

      expect(result).not.toBeNull();
      expect(result!.event).toBe(ExecutionEventName.STEP_STATUS_CHANGED);
      expect(result!.data).toEqual(data);
    });

    it('应将 execution:running 映射到 EXECUTION_STATUS_CHANGED', () => {
      const data = { executionId: EXEC, status: 'running' };

      const result = service.bridgeLegacyEvent(
        TENANT,
        EXEC,
        'execution:running',
        data,
      );

      expect(result).not.toBeNull();
      expect(result!.event).toBe(ExecutionEventName.EXECUTION_STATUS_CHANGED);
    });

    it('应将 execution:cancelled 映射到 EXECUTION_STATUS_CHANGED', () => {
      const data = { executionId: EXEC, status: 'cancelled' };

      const result = service.bridgeLegacyEvent(
        TENANT,
        EXEC,
        'execution:cancelled',
        data,
      );

      expect(result).not.toBeNull();
      expect(result!.event).toBe(ExecutionEventName.EXECUTION_STATUS_CHANGED);
    });
  });

  describe('getLastEventId', () => {
    it('无事件时返回 0', () => {
      expect(service.getLastEventId('unknown')).toBe(0);
    });

    it('发出事件后返回最新 eventId', () => {
      const payload: StepStatusChangedPayload = {
        stepId: 's1',
        nodeId: 'n1',
        from: 'pending',
        to: 'running',
      };

      service.emitStepStatusChanged(TENANT, EXEC, payload);
      service.emitStepStatusChanged(TENANT, EXEC, payload);

      expect(service.getLastEventId(EXEC)).toBe(2);
    });
  });

  describe('setEventCounter', () => {
    it('应设置指定执行实例的计数器起点', () => {
      service.setEventCounter(EXEC, 100);

      const payload: StepStatusChangedPayload = {
        stepId: 's1',
        nodeId: 'n1',
        from: 'pending',
        to: 'running',
      };

      const result = service.emitStepStatusChanged(TENANT, EXEC, payload);

      expect(result.eventId).toBe(101);
      expect(service.getLastEventId(EXEC)).toBe(101);
    });
  });

  describe('clearExecution', () => {
    it('应清除计数器释放内存', () => {
      const payload: StepStatusChangedPayload = {
        stepId: 's1',
        nodeId: 'n1',
        from: 'pending',
        to: 'running',
      };

      service.emitStepStatusChanged(TENANT, EXEC, payload);
      expect(service.getLastEventId(EXEC)).toBe(1);

      service.clearExecution(EXEC);
      expect(service.getLastEventId(EXEC)).toBe(0);
    });

    it('清除后新事件从 1 开始计数', () => {
      const payload: StepStatusChangedPayload = {
        stepId: 's1',
        nodeId: 'n1',
        from: 'pending',
        to: 'running',
      };

      service.emitStepStatusChanged(TENANT, EXEC, payload);
      service.emitStepStatusChanged(TENANT, EXEC, payload);
      service.clearExecution(EXEC);

      const result = service.emitStepStatusChanged(TENANT, EXEC, payload);
      expect(result.eventId).toBe(1);
    });

    it('应同时清除事件缓冲区', () => {
      const payload: StepStatusChangedPayload = {
        stepId: 's1',
        nodeId: 'n1',
        from: 'pending',
        to: 'running',
      };

      service.emitStepStatusChanged(TENANT, EXEC, payload);
      service.emitStepStatusChanged(TENANT, EXEC, payload);
      service.clearExecution(EXEC);

      expect(service.getEventsSince(EXEC, 0)).toBeNull();
    });
  });

  describe('getEventsSince', () => {
    const payload: StepStatusChangedPayload = {
      stepId: 's1',
      nodeId: 'n1',
      from: 'pending',
      to: 'running',
    };

    it('缓冲区为空时返回 null', () => {
      expect(service.getEventsSince('unknown', 0)).toBeNull();
    });

    it('返回指定 eventId 之后的所有事件', () => {
      service.emitStepStatusChanged(TENANT, EXEC, payload);
      service.emitStepStatusChanged(TENANT, EXEC, payload);
      service.emitStepStatusChanged(TENANT, EXEC, payload);

      const events = service.getEventsSince(EXEC, 1);

      expect(events).not.toBeNull();
      expect(events).toHaveLength(2);
      expect(events![0].eventId).toBe(2);
      expect(events![1].eventId).toBe(3);
    });

    it('lastEventId 等于最新 eventId 时返回空数组', () => {
      service.emitStepStatusChanged(TENANT, EXEC, payload);
      service.emitStepStatusChanged(TENANT, EXEC, payload);

      const events = service.getEventsSince(EXEC, 2);

      expect(events).not.toBeNull();
      expect(events).toHaveLength(0);
    });

    it('lastEventId 超出缓冲区范围时返回 null', () => {
      service.setEventCounter(EXEC, 10);

      for (let i = 0; i < 3; i++) {
        service.emitStepStatusChanged(TENANT, EXEC, payload);
      }

      const events = service.getEventsSince(EXEC, 5);

      expect(events).toBeNull();
    });
  });
});

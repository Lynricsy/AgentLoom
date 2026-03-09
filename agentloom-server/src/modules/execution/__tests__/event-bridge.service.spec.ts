import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { EventBridgeService } from '../services/event-bridge.service';
import { ExecutionGateway } from '../execution.gateway';
import { ExecutionEventName } from '../types/execution-event.types';
import type {
  StepStatusChangedPayload,
  ExecutionStatusChangedPayload,
  StepAgentEventPayload,
  StepRetryingPayload,
  OutputChunkPayload,
} from '../types/execution-event.types';

const TENANT = 'tenant-1';
const EXEC = 'exec-1';

describe('EventBridgeService', () => {
  let service: EventBridgeService;
  let gateway: { broadcastTypedEvent: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    gateway = { broadcastTypedEvent: vi.fn() };

    const module = await Test.createTestingModule({
      providers: [
        EventBridgeService,
        { provide: ExecutionGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get(EventBridgeService);
  });

  afterEach(() => {
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
    });
  });

  describe('emitExecutionStatusChanged', () => {
    it('应创建标准信封并广播', () => {
      const payload: ExecutionStatusChangedPayload = {
        executionId: EXEC,
        status: 'completed',
        completedSteps: 5,
        totalSteps: 5,
      };

      const result = service.emitExecutionStatusChanged(TENANT, EXEC, payload);

      expect(result.event).toBe(ExecutionEventName.EXECUTION_STATUS_CHANGED);
      expect(result.data).toEqual(payload);
      expect(gateway.broadcastTypedEvent).toHaveBeenCalledOnce();
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
    });
  });

  describe('emitStepRetrying', () => {
    it('应创建标准信封并广播', () => {
      const payload: StepRetryingPayload = {
        stepId: 's1',
        attempt: 2,
        maxAttempts: 3,
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
      };

      const result = service.emitOutputChunk(TENANT, EXEC, payload);

      expect(result.event).toBe(ExecutionEventName.OUTPUT_CHUNK);
      expect(result.data.chunk).toBe('Hello world');
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
      const data = { stepId: 's1', nodeId: 'n1', from: 'pending', to: 'running' };

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
      expect(events![0]!.eventId).toBe(2);
      expect(events![1]!.eventId).toBe(3);
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

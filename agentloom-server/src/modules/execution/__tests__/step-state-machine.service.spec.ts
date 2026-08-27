import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import {
  StepStateMachineService,
  STEP_TRANSITIONS,
  type StepStatus,
} from '../step-state-machine.service';
import { EventBridgeService } from '../services/event-bridge.service';
import { InvalidStepTransitionException } from '../execution.exceptions';
import { DRIZZLE } from '../../../database/database.module';
import type { AgentEvent } from '../../agent/types/agent-event.types';

const STEP_ID = '019391d4-a000-7000-0000-000000000001';
const EXECUTION_ID = '019391d4-b000-7000-0000-000000000002';
const TENANT_ID = '019391d4-c000-7000-0000-000000000003';
const NODE_ID = 'node-1';
const NOW = new Date('2025-01-01T00:00:00Z');

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    id: STEP_ID,
    executionId: EXECUTION_ID,
    nodeId: NODE_ID,
    stepOrder: 0,
    status: 'pending' as StepStatus,
    nodeType: 'agent',
    nodeData: {},
    input: null,
    result: null,
    checkpointData: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: EXECUTION_ID,
    workflowDefinitionId: 'workflow-001',
    workflowVersionId: 'workflow-version-001',
    tenantId: TENANT_ID,
    status: 'running',
    triggerType: 'manual',
    definitionSnapshot: { nodes: [], edges: [], viewport: null, metadata: {} },
    inputParams: {},
    createdBy: 'user-001',
    completedSteps: 0,
    completedAt: null,
    failedAt: null,
    updatedAt: NOW,
    createdAt: NOW,
    ...overrides,
  };
}

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createUpdateChainReturning(result: unknown) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createUpdateChainVoid() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

describe('StepStateMachineService', () => {
  let service: StepStateMachineService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let mockEventBridge: {
    emitStepStatusChanged: ReturnType<typeof vi.fn>;
    emitExecutionStatusChanged: ReturnType<typeof vi.fn>;
    emitStepAgentEvent: ReturnType<typeof vi.fn>;
    emitStepRetrying: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
    };

    mockEventBridge = {
      emitStepStatusChanged: vi.fn(),
      emitExecutionStatusChanged: vi.fn(),
      emitStepAgentEvent: vi.fn(),
      emitStepRetrying: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        StepStateMachineService,
        { provide: DRIZZLE, useValue: db },
        { provide: EventBridgeService, useValue: mockEventBridge },
      ],
    }).compile();

    service = module.get(StepStateMachineService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('STEP_TRANSITIONS', () => {
    it('允许 pending 直接进入 running，并允许 fail-closed 的 pending → failed', () => {
      expect(STEP_TRANSITIONS.pending).toEqual(
        new Set(['queued', 'running', 'skipped', 'cancelled', 'failed']),
      );
    });

    it('允许 running 回退到 pending 以支持重试', () => {
      expect(STEP_TRANSITIONS.running).toEqual(
        new Set([
          'pending',
          'completed',
          'failed',
          'waiting_intervention',
          'cancelled',
        ]),
      );
    });
  });

  describe('updateStepStatus', () => {
    it('允许 pending → running，并在首次进入时设置 startedAt', async () => {
      const step = makeStep({ status: 'pending' });
      const updatedStep = makeStep({
        status: 'running',
        startedAt: NOW,
        updatedAt: NOW,
      });

      db.select.mockReturnValueOnce(createSelectChain([step]));
      const updateChain = createUpdateChainReturning([updatedStep]);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.updateStepStatus(
        TENANT_ID,
        STEP_ID,
        'running',
      );

      expect(result).toEqual(updatedStep);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
          startedAt: NOW,
          updatedAt: NOW,
        }),
      );
      expect(mockEventBridge.emitStepStatusChanged).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        { stepId: STEP_ID, nodeId: NODE_ID, from: 'pending', to: 'running' },
      );
    });

    it('允许 running → pending，并保留原 startedAt', async () => {
      const originalStart = new Date('2024-12-31T00:00:00Z');
      const step = makeStep({ status: 'running', startedAt: originalStart });
      const updatedStep = makeStep({
        status: 'pending',
        startedAt: originalStart,
        updatedAt: NOW,
      });

      db.select.mockReturnValueOnce(createSelectChain([step]));
      const updateChain = createUpdateChainReturning([updatedStep]);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.updateStepStatus(
        TENANT_ID,
        STEP_ID,
        'pending',
      );

      expect(result.status).toBe('pending');
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', updatedAt: NOW }),
      );
      expect(updateChain.set.mock.calls[0][0]).not.toHaveProperty(
        'completedAt',
      );
    });

    it('允许 pending → failed，使不可调度节点不会成为孤儿步骤', async () => {
      const step = makeStep({ status: 'pending' });
      const updatedStep = makeStep({
        status: 'failed',
        completedAt: NOW,
        updatedAt: NOW,
      });

      db.select.mockReturnValueOnce(createSelectChain([step]));
      const updateChain = createUpdateChainReturning([updatedStep]);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.updateStepStatus(
        TENANT_ID,
        STEP_ID,
        'failed',
        { errorMessage: { message: '端口类型不兼容', nodeId: NODE_ID } },
      );

      expect(result.status).toBe('failed');
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', completedAt: NOW }),
      );
      expect(mockEventBridge.emitStepStatusChanged).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        expect.objectContaining({ from: 'pending', to: 'failed' }),
      );
    });

    it('非法转换仍会抛出 InvalidStepTransitionException', async () => {
      const step = makeStep({ status: 'pending' });
      db.select.mockReturnValueOnce(createSelectChain([step]));

      await expect(
        service.updateStepStatus(TENANT_ID, STEP_ID, 'completed'),
      ).rejects.toThrow(InvalidStepTransitionException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('转换到 failed 时写入 completedAt 与结构化 errorMessage', async () => {
      const step = makeStep({ status: 'running' });
      const errorMessage = { message: '执行超时', stack: 'Error: timeout' };
      const updatedStep = makeStep({
        status: 'failed',
        completedAt: NOW,
        errorMessage,
        updatedAt: NOW,
      });

      db.select.mockReturnValueOnce(createSelectChain([step]));
      const updateChain = createUpdateChainReturning([updatedStep]);
      db.update.mockReturnValueOnce(updateChain);

      await service.updateStepStatus(TENANT_ID, STEP_ID, 'failed', {
        errorMessage,
      });

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          completedAt: NOW,
          errorMessage,
        }),
      );
    });

    it('转换到 completed 时会把 result 和 checkpointData 透传到实时事件', async () => {
      const step = makeStep({ status: 'running' });
      const resultPayload = {
        content: '最终输出',
        'exec-out': { triggered: true },
      };
      const checkpointData = {
        partialContent: '最终输出',
        round: 2,
      };
      const updatedStep = makeStep({
        status: 'completed',
        result: resultPayload,
        checkpointData,
        completedAt: NOW,
        updatedAt: NOW,
      });

      db.select.mockReturnValueOnce(createSelectChain([step]));
      const updateChain = createUpdateChainReturning([updatedStep]);
      db.update.mockReturnValueOnce(updateChain);

      await service.updateStepStatus(TENANT_ID, STEP_ID, 'completed', {
        result: resultPayload,
        checkpointData,
      });

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          result: resultPayload,
          checkpointData,
          completedAt: NOW,
        }),
      );
      expect(mockEventBridge.emitStepStatusChanged).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        {
          stepId: STEP_ID,
          nodeId: NODE_ID,
          from: 'running',
          to: 'completed',
          result: resultPayload,
          checkpointData,
        },
      );
    });
  });

  describe('updateExecutionStatus', () => {
    it('所有步骤完成或跳过时将 execution 标记为 completed', async () => {
      const steps = [
        makeStep({ id: 'step-1', status: 'completed' }),
        makeStep({ id: 'step-2', status: 'skipped' }),
        makeStep({ id: 'step-3', status: 'completed' }),
      ];

      db.select
        .mockReturnValueOnce(createSelectChain([makeExecution()]))
        .mockReturnValueOnce(createSelectChain(steps));
      const updateChain = createUpdateChainVoid();
      db.update.mockReturnValueOnce(updateChain);

      await service.updateExecutionStatus(EXECUTION_ID, TENANT_ID);

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          completedSteps: 3,
          completedAt: NOW,
        }),
      );
      expect(mockEventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        expect.objectContaining({
          executionId: EXECUTION_ID,
          status: 'completed',
          completedSteps: 3,
          totalSteps: 3,
        }),
      );
    });

    it('存在 waiting_intervention 且无 running/queued 时将 execution 标记为 paused', async () => {
      const steps = [
        makeStep({ id: 'step-1', status: 'completed' }),
        makeStep({ id: 'step-2', status: 'waiting_intervention' }),
        makeStep({ id: 'step-3', status: 'pending' }),
      ];

      db.select
        .mockReturnValueOnce(createSelectChain([makeExecution()]))
        .mockReturnValueOnce(createSelectChain(steps));
      const updateChain = createUpdateChainVoid();
      db.update.mockReturnValueOnce(updateChain);

      await service.updateExecutionStatus(EXECUTION_ID, TENANT_ID);

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'paused',
          completedSteps: 1,
        }),
      );
    });

    it('execution 已处于终态时直接返回，不再重算状态', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([makeExecution({ status: 'failed' })]),
      );

      await service.updateExecutionStatus(EXECUTION_ID, TENANT_ID);

      expect(db.update).not.toHaveBeenCalled();
      expect(mockEventBridge.emitExecutionStatusChanged).not.toHaveBeenCalled();
    });
  });

  describe('broadcastAgentEvent', () => {
    it('会以 step:agent-event 广播 decision 事件', () => {
      const event: AgentEvent = {
        type: 'decision',
        suggestedContent: '建议给主人展示最终摘要',
        confidence: 0.9,
      };

      service.broadcastAgentEvent(TENANT_ID, EXECUTION_ID, STEP_ID, event);

      expect(mockEventBridge.emitStepAgentEvent).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        { stepId: STEP_ID, event },
      );
    });
  });

  describe('broadcastStepRetry', () => {
    it('会广播 step:retrying 事件', () => {
      service.broadcastStepRetry(TENANT_ID, EXECUTION_ID, STEP_ID, {
        attempt: 1,
        maxAttempts: 4,
        errorMessage: 'LLM 调用失败',
      });

      expect(mockEventBridge.emitStepRetrying).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        {
          stepId: STEP_ID,
          attempt: 1,
          maxAttempts: 4,
          errorMessage: 'LLM 调用失败',
        },
      );
    });
  });

  describe('markExecutionFailed', () => {
    it('会强制将 execution 标记为 failed 并广播 execution:failed', async () => {
      const steps = [
        makeStep({ id: 'step-1', status: 'completed' }),
        makeStep({ id: 'step-2', status: 'skipped' }),
        makeStep({ id: 'step-3', status: 'failed' }),
      ];
      const updateChain = createUpdateChainVoid();

      db.select.mockReturnValueOnce(createSelectChain(steps));
      db.update.mockReturnValueOnce(updateChain);

      await service.markExecutionFailed(EXECUTION_ID, TENANT_ID, {
        message: '节点执行失败',
      });

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          completedSteps: 2,
          failedAt: NOW,
          errorMessage: { message: '节点执行失败' },
        }),
      );
      expect(mockEventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        {
          executionId: EXECUTION_ID,
          status: 'failed',
          completedSteps: 2,
          totalSteps: 3,
          errorMessage: '节点执行失败',
        },
      );
    });
  });
});

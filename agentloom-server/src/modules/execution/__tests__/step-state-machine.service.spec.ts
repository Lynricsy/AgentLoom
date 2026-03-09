import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import {
  StepStateMachineService,
  STEP_TRANSITIONS,
  type StepStatus,
} from '../step-state-machine.service';
import { ExecutionGateway } from '../execution.gateway';
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
  let mockGateway: { broadcastEvent: ReturnType<typeof vi.fn> };

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

    mockGateway = {
      broadcastEvent: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        StepStateMachineService,
        { provide: DRIZZLE, useValue: db },
        { provide: ExecutionGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get(StepStateMachineService);
  });

  describe('STEP_TRANSITIONS', () => {
    it('定义了 pending 的合法转换目标', () => {
      const targets = STEP_TRANSITIONS['pending'];
      expect(targets).toBeDefined();
      expect(targets).toEqual(new Set(['queued', 'skipped', 'cancelled']));
    });

    it('定义了 queued 的合法转换目标', () => {
      const targets = STEP_TRANSITIONS['queued'];
      expect(targets).toBeDefined();
      expect(targets).toEqual(new Set(['running', 'cancelled']));
    });

    it('定义了 running 的合法转换目标', () => {
      const targets = STEP_TRANSITIONS['running'];
      expect(targets).toBeDefined();
      expect(targets).toEqual(
        new Set(['completed', 'failed', 'waiting_intervention', 'cancelled']),
      );
    });

    it('定义了 waiting_intervention 的合法转换目标', () => {
      const targets = STEP_TRANSITIONS['waiting_intervention'];
      expect(targets).toBeDefined();
      expect(targets).toEqual(new Set(['running', 'cancelled']));
    });

    it('终态不包含合法转换目标', () => {
      const terminalStates = ['completed', 'failed', 'skipped', 'cancelled'];
      for (const state of terminalStates) {
        expect(STEP_TRANSITIONS[state]).toBeUndefined();
      }
    });
  });

  describe('updateStepStatus', () => {
    it('合法转换：pending → queued', async () => {
      const step = makeStep({ status: 'pending' });
      const updatedStep = makeStep({ status: 'queued', updatedAt: NOW });

      db.select.mockReturnValueOnce(createSelectChain([step]));
      const updateChain = createUpdateChainReturning([updatedStep]);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.updateStepStatus(
        TENANT_ID,
        STEP_ID,
        'queued',
      );

      expect(result).toEqual(updatedStep);
      expect(mockGateway.broadcastEvent).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        'step:status-changed',
        {
          stepId: STEP_ID,
          nodeId: NODE_ID,
          from: 'pending',
          to: 'queued',
        },
      );
    });

    it('非法转换：pending → running 应抛出 InvalidStepTransitionException', async () => {
      const step = makeStep({ status: 'pending' });
      db.select.mockReturnValueOnce(createSelectChain([step]));

      await expect(
        service.updateStepStatus(TENANT_ID, STEP_ID, 'running'),
      ).rejects.toThrow(InvalidStepTransitionException);

      expect(db.update).not.toHaveBeenCalled();
    });

    it('非法转换：pending → completed 应抛出异常', async () => {
      const step = makeStep({ status: 'pending' });
      db.select.mockReturnValueOnce(createSelectChain([step]));

      await expect(
        service.updateStepStatus(TENANT_ID, STEP_ID, 'completed'),
      ).rejects.toThrow(InvalidStepTransitionException);
    });

    it('终态转换应抛出 InvalidStepTransitionException', async () => {
      const terminalStatuses: StepStatus[] = [
        'completed',
        'failed',
        'skipped',
        'cancelled',
      ];

      for (const status of terminalStatuses) {
        const step = makeStep({ status });
        db.select.mockReturnValueOnce(createSelectChain([step]));

        await expect(
          service.updateStepStatus(TENANT_ID, STEP_ID, 'running'),
        ).rejects.toThrow(InvalidStepTransitionException);
      }
    });

    it('转换到 running 时应设置 startedAt', async () => {
      const step = makeStep({ status: 'queued', startedAt: null });
      const updatedStep = makeStep({
        status: 'running',
        startedAt: NOW,
        updatedAt: NOW,
      });

      db.select.mockReturnValueOnce(createSelectChain([step]));
      const updateChain = createUpdateChainReturning([updatedStep]);
      db.update.mockReturnValueOnce(updateChain);

      await service.updateStepStatus(TENANT_ID, STEP_ID, 'running');

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
          startedAt: NOW,
          updatedAt: NOW,
        }),
      );
    });

    it('重新进入 running 且已有 startedAt 时不应覆盖', async () => {
      const originalStart = new Date('2024-12-31T00:00:00Z');
      const step = makeStep({
        status: 'waiting_intervention',
        startedAt: originalStart,
      });
      const updatedStep = makeStep({
        status: 'running',
        startedAt: originalStart,
        updatedAt: NOW,
      });

      db.select.mockReturnValueOnce(createSelectChain([step]));
      const updateChain = createUpdateChainReturning([updatedStep]);
      db.update.mockReturnValueOnce(updateChain);

      await service.updateStepStatus(TENANT_ID, STEP_ID, 'running');

      const setArg = updateChain.set.mock.calls[0][0];
      expect(setArg).not.toHaveProperty('startedAt');
    });

    it('转换到 completed 时应设置 completedAt', async () => {
      const step = makeStep({ status: 'running' });
      const updatedStep = makeStep({
        status: 'completed',
        completedAt: NOW,
        updatedAt: NOW,
      });

      db.select.mockReturnValueOnce(createSelectChain([step]));
      const updateChain = createUpdateChainReturning([updatedStep]);
      db.update.mockReturnValueOnce(updateChain);

      await service.updateStepStatus(TENANT_ID, STEP_ID, 'completed');

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          completedAt: NOW,
        }),
      );
    });

    it('转换到 failed 时应设置 completedAt', async () => {
      const step = makeStep({ status: 'running' });
      const errorMsg = { message: '执行超时', stack: 'Error: ...' };
      const updatedStep = makeStep({
        status: 'failed',
        completedAt: NOW,
        errorMessage: errorMsg,
        updatedAt: NOW,
      });

      db.select.mockReturnValueOnce(createSelectChain([step]));
      const updateChain = createUpdateChainReturning([updatedStep]);
      db.update.mockReturnValueOnce(updateChain);

      await service.updateStepStatus(TENANT_ID, STEP_ID, 'failed', {
        errorMessage: errorMsg,
      });

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          completedAt: NOW,
          errorMessage: errorMsg,
        }),
      );
    });

    it('应保存额外的 result 数据', async () => {
      const step = makeStep({ status: 'running' });
      const resultData = { output: 'hello', tokens: 42 };
      const updatedStep = makeStep({
        status: 'completed',
        result: resultData,
      });

      db.select.mockReturnValueOnce(createSelectChain([step]));
      const updateChain = createUpdateChainReturning([updatedStep]);
      db.update.mockReturnValueOnce(updateChain);

      await service.updateStepStatus(TENANT_ID, STEP_ID, 'completed', {
        result: resultData,
      });

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          result: resultData,
        }),
      );
    });

    it('应保存额外的 checkpointData', async () => {
      const step = makeStep({ status: 'running' });
      const checkpoint = { sessionId: 'ses_001', cursor: 5 };
      const updatedStep = makeStep({
        status: 'waiting_intervention',
        checkpointData: checkpoint,
      });

      db.select.mockReturnValueOnce(createSelectChain([step]));
      const updateChain = createUpdateChainReturning([updatedStep]);
      db.update.mockReturnValueOnce(updateChain);

      await service.updateStepStatus(
        TENANT_ID,
        STEP_ID,
        'waiting_intervention',
        { checkpointData: checkpoint },
      );

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          checkpointData: checkpoint,
        }),
      );
    });

    it('步骤不存在时应抛出错误', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.updateStepStatus(TENANT_ID, STEP_ID, 'queued'),
      ).rejects.toThrow(`步骤 ${STEP_ID} 不存在`);
    });

    it('乐观锁失败时应抛出 InvalidStepTransitionException', async () => {
      const step = makeStep({ status: 'pending' });
      db.select.mockReturnValueOnce(createSelectChain([step]));

      const updateChain = createUpdateChainReturning([]);
      db.update.mockReturnValueOnce(updateChain);

      await expect(
        service.updateStepStatus(TENANT_ID, STEP_ID, 'queued'),
      ).rejects.toThrow(InvalidStepTransitionException);
    });

    it('合法转换：running → waiting_intervention', async () => {
      const step = makeStep({ status: 'running' });
      const updatedStep = makeStep({
        status: 'waiting_intervention',
        updatedAt: NOW,
      });

      db.select.mockReturnValueOnce(createSelectChain([step]));
      const updateChain = createUpdateChainReturning([updatedStep]);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.updateStepStatus(
        TENANT_ID,
        STEP_ID,
        'waiting_intervention',
      );

      expect(result.status).toBe('waiting_intervention');
    });

    it('合法转换：waiting_intervention → running', async () => {
      const step = makeStep({ status: 'waiting_intervention' });
      const updatedStep = makeStep({ status: 'running', updatedAt: NOW });

      db.select.mockReturnValueOnce(createSelectChain([step]));
      const updateChain = createUpdateChainReturning([updatedStep]);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.updateStepStatus(
        TENANT_ID,
        STEP_ID,
        'running',
      );

      expect(result.status).toBe('running');
    });

    it('合法转换：pending → cancelled', async () => {
      const step = makeStep({ status: 'pending' });
      const updatedStep = makeStep({ status: 'cancelled', updatedAt: NOW });

      db.select.mockReturnValueOnce(createSelectChain([step]));
      const updateChain = createUpdateChainReturning([updatedStep]);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.updateStepStatus(
        TENANT_ID,
        STEP_ID,
        'cancelled',
      );

      expect(result.status).toBe('cancelled');
    });
  });

  describe('updateExecutionStatus', () => {
    it('所有步骤完成时执行状态应为 completed', async () => {
      const steps = [
        makeStep({ id: 'step-1', status: 'completed' }),
        makeStep({ id: 'step-2', status: 'completed' }),
      ];

      db.select.mockReturnValueOnce(createSelectChain(steps));
      const updateChain = createUpdateChainVoid();
      db.update.mockReturnValueOnce(updateChain);

      await service.updateExecutionStatus(EXECUTION_ID, TENANT_ID);

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          completedSteps: 2,
          completedAt: NOW,
        }),
      );
      expect(mockGateway.broadcastEvent).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        'execution:completed',
        expect.objectContaining({
          executionId: EXECUTION_ID,
          status: 'completed',
          completedSteps: 2,
          totalSteps: 2,
        }),
      );
    });

    it('所有步骤完成或跳过时执行状态应为 completed', async () => {
      const steps = [
        makeStep({ id: 'step-1', status: 'completed' }),
        makeStep({ id: 'step-2', status: 'skipped' }),
        makeStep({ id: 'step-3', status: 'completed' }),
      ];

      db.select.mockReturnValueOnce(createSelectChain(steps));
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
    });

    it('有步骤失败且无运行中步骤时执行状态应为 failed', async () => {
      const steps = [
        makeStep({ id: 'step-1', status: 'completed' }),
        makeStep({ id: 'step-2', status: 'failed' }),
        makeStep({ id: 'step-3', status: 'pending' }),
      ];

      db.select.mockReturnValueOnce(createSelectChain(steps));
      const updateChain = createUpdateChainVoid();
      db.update.mockReturnValueOnce(updateChain);

      await service.updateExecutionStatus(EXECUTION_ID, TENANT_ID);

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          completedSteps: 1,
          failedAt: NOW,
        }),
      );
    });

    it('有步骤失败但仍有运行中步骤时执行状态应为 running', async () => {
      const steps = [
        makeStep({ id: 'step-1', status: 'failed' }),
        makeStep({ id: 'step-2', status: 'running' }),
      ];

      db.select.mockReturnValueOnce(createSelectChain(steps));
      const updateChain = createUpdateChainVoid();
      db.update.mockReturnValueOnce(updateChain);

      await service.updateExecutionStatus(EXECUTION_ID, TENANT_ID);

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
        }),
      );
    });

    it('有步骤等待干预且无运行中步骤时执行状态应为 paused', async () => {
      const steps = [
        makeStep({ id: 'step-1', status: 'completed' }),
        makeStep({ id: 'step-2', status: 'waiting_intervention' }),
        makeStep({ id: 'step-3', status: 'pending' }),
      ];

      db.select.mockReturnValueOnce(createSelectChain(steps));
      const updateChain = createUpdateChainVoid();
      db.update.mockReturnValueOnce(updateChain);

      await service.updateExecutionStatus(EXECUTION_ID, TENANT_ID);

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'paused',
        }),
      );
    });

    it('有步骤运行中时执行状态应为 running', async () => {
      const steps = [
        makeStep({ id: 'step-1', status: 'completed' }),
        makeStep({ id: 'step-2', status: 'running' }),
        makeStep({ id: 'step-3', status: 'pending' }),
      ];

      db.select.mockReturnValueOnce(createSelectChain(steps));
      const updateChain = createUpdateChainVoid();
      db.update.mockReturnValueOnce(updateChain);

      await service.updateExecutionStatus(EXECUTION_ID, TENANT_ID);

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
        }),
      );
    });

    it('有步骤在队列中时执行状态应为 running', async () => {
      const steps = [
        makeStep({ id: 'step-1', status: 'completed' }),
        makeStep({ id: 'step-2', status: 'queued' }),
      ];

      db.select.mockReturnValueOnce(createSelectChain(steps));
      const updateChain = createUpdateChainVoid();
      db.update.mockReturnValueOnce(updateChain);

      await service.updateExecutionStatus(EXECUTION_ID, TENANT_ID);

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
        }),
      );
    });

    it('应正确计算 completedSteps 数量', async () => {
      const steps = [
        makeStep({ id: 'step-1', status: 'completed' }),
        makeStep({ id: 'step-2', status: 'skipped' }),
        makeStep({ id: 'step-3', status: 'running' }),
        makeStep({ id: 'step-4', status: 'pending' }),
      ];

      db.select.mockReturnValueOnce(createSelectChain(steps));
      const updateChain = createUpdateChainVoid();
      db.update.mockReturnValueOnce(updateChain);

      await service.updateExecutionStatus(EXECUTION_ID, TENANT_ID);

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          completedSteps: 2,
        }),
      );
    });

    it('无步骤时应直接返回', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await service.updateExecutionStatus(EXECUTION_ID, TENANT_ID);

      expect(db.update).not.toHaveBeenCalled();
      expect(mockGateway.broadcastEvent).not.toHaveBeenCalled();
    });

    it('完成时不应设置 failedAt', async () => {
      const steps = [
        makeStep({ id: 'step-1', status: 'completed' }),
      ];

      db.select.mockReturnValueOnce(createSelectChain(steps));
      const updateChain = createUpdateChainVoid();
      db.update.mockReturnValueOnce(updateChain);

      await service.updateExecutionStatus(EXECUTION_ID, TENANT_ID);

      const setArg = updateChain.set.mock.calls[0][0];
      expect(setArg).not.toHaveProperty('failedAt');
      expect(setArg).toHaveProperty('completedAt');
    });

    it('失败时不应设置 completedAt', async () => {
      const steps = [
        makeStep({ id: 'step-1', status: 'failed' }),
      ];

      db.select.mockReturnValueOnce(createSelectChain(steps));
      const updateChain = createUpdateChainVoid();
      db.update.mockReturnValueOnce(updateChain);

      await service.updateExecutionStatus(EXECUTION_ID, TENANT_ID);

      const setArg = updateChain.set.mock.calls[0][0];
      expect(setArg).toHaveProperty('failedAt');
      expect(setArg).not.toHaveProperty('completedAt');
    });
  });

  describe('broadcastAgentEvent', () => {
    it('应通过 gateway 广播 agent 事件', () => {
      const event: AgentEvent = {
        type: 'message_chunk',
        content: 'Hello world',
      };

      service.broadcastAgentEvent(TENANT_ID, EXECUTION_ID, STEP_ID, event);

      expect(mockGateway.broadcastEvent).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        'step:agent-event',
        {
          stepId: STEP_ID,
          event,
        },
      );
    });

    it('应支持不同类型的 agent 事件', () => {
      const events: AgentEvent[] = [
        { type: 'plan', title: '计划', content: '步骤1' },
        { type: 'message_chunk', content: '内容' },
        { type: 'done', stopReason: 'end_turn' },
      ];

      for (const event of events) {
        mockGateway.broadcastEvent.mockClear();
        service.broadcastAgentEvent(TENANT_ID, EXECUTION_ID, STEP_ID, event);

        expect(mockGateway.broadcastEvent).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          'step:agent-event',
          { stepId: STEP_ID, event },
        );
      }
    });
  });
});

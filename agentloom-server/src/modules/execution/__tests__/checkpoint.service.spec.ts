import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { inArray } from 'drizzle-orm';
import type * as DrizzleOrm from 'drizzle-orm';
import { CheckpointService } from '../checkpoint.service';
import { DagResolverService } from '../dag-resolver.service';
import { EventBridgeService } from '../services/event-bridge.service';
import { DRIZZLE } from '../../../database/database.module';
import {
  ExecutionNotFoundException,
  ExecutionNotResumableException,
  ExecutionResumeNodeInsideContainerException,
  ExecutionResumeNodeNotFoundException,
} from '../execution.exceptions';
import type {
  ExecutionStep,
  WorkflowExecution,
} from '../../../database/schema';

// 包一层 spy 以断言被重置的步骤 id，行为仍走 drizzle 原实现
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof DrizzleOrm>();
  return { ...actual, inArray: vi.fn(actual.inArray) };
});

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const EXECUTION_ID = 'exec-0001';
const STEP_ID_1 = 'step-0001';
const STEP_ID_2 = 'step-0002';
const STEP_ID_3 = 'step-0003';
const NOW = new Date('2025-01-01T00:00:00Z');

function makeStep(overrides: Partial<ExecutionStep> = {}): ExecutionStep {
  return {
    id: STEP_ID_1,
    executionId: EXECUTION_ID,
    nodeId: 'node-1',
    stepOrder: 0,
    status: 'pending',
    nodeType: 'agent',
    nodeData: {},
    input: null,
    result: null,
    attemptCount: 0,
    checkpointData: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as ExecutionStep;
}

function makeExecution(
  overrides: Partial<WorkflowExecution> = {},
): WorkflowExecution {
  return {
    id: EXECUTION_ID,
    tenantId: TENANT_ID,
    workflowDefinitionId: 'wf-0001',
    versionNumber: 1,
    definitionSnapshot: {
      nodes: [
        { id: 'node-1', type: 'agent', data: {}, position: { x: 0, y: 0 } },
        { id: 'node-2', type: 'agent', data: {}, position: { x: 1, y: 0 } },
        { id: 'node-3', type: 'agent', data: {}, position: { x: 2, y: 0 } },
      ],
      edges: [
        {
          id: 'e1',
          source: 'node-1',
          target: 'node-2',
          sourceHandle: null,
          targetHandle: null,
        },
        {
          id: 'e2',
          source: 'node-2',
          target: 'node-3',
          sourceHandle: null,
          targetHandle: null,
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      metadata: {},
    },
    status: 'failed',
    totalSteps: 3,
    completedSteps: 1,
    errorMessage: null,
    startedAt: NOW,
    completedAt: null,
    failedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as WorkflowExecution;
}

function createSelectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createUpdateChainReturning(result: unknown[]) {
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

describe('CheckpointService', () => {
  let service: CheckpointService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let dagResolver: { resolveDag: ReturnType<typeof vi.fn> };
  let eventBridge: { emitExecutionStatusChanged: ReturnType<typeof vi.fn> };

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  beforeEach(async () => {
    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
    };

    dagResolver = { resolveDag: vi.fn() };
    eventBridge = { emitExecutionStatusChanged: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckpointService,
        { provide: DRIZZLE, useValue: db },
        { provide: DagResolverService, useValue: dagResolver },
        { provide: EventBridgeService, useValue: eventBridge },
      ],
    }).compile();

    service = module.get(CheckpointService);
    vi.clearAllMocks();
  });

  describe('saveCheckpoint', () => {
    it('应该保存带有 dagState 的检查点数据', async () => {
      const completedStep = makeStep({
        id: STEP_ID_1,
        nodeId: 'node-1',
        status: 'completed',
        result: { answer: 'hello' },
        completedAt: NOW,
        checkpointData: null,
      });
      const pendingStep = makeStep({
        id: STEP_ID_2,
        nodeId: 'node-2',
        status: 'pending',
      });

      db.select.mockReturnValue(
        createSelectChain([completedStep, pendingStep]),
      );
      db.update.mockReturnValue(createUpdateChainVoid());

      await service.saveCheckpoint(TENANT_ID, EXECUTION_ID, STEP_ID_1);

      expect(db.update).toHaveBeenCalled();
      const setArg = db.update.mock.results[0].value.set.mock.calls[0][0];
      expect(setArg.checkpointData).toEqual({
        output: { answer: 'hello' },
        completedAt: NOW.toISOString(),
        dagState: {
          completedNodes: ['node-1'],
          pendingNodes: ['node-2'],
        },
      });
    });

    it('当步骤不存在时应提前返回', async () => {
      db.select.mockReturnValue(
        createSelectChain([makeStep({ id: 'other-id', nodeId: 'node-x' })]),
      );

      await service.saveCheckpoint(TENANT_ID, EXECUTION_ID, 'non-existent');

      expect(db.update).not.toHaveBeenCalled();
    });

    it('应该合并已有的 checkpointData', async () => {
      const existingCheckpoint = { sessionId: 'sess-123', attempts: [] };
      const step = makeStep({
        id: STEP_ID_1,
        nodeId: 'node-1',
        status: 'completed',
        result: { data: 'result' },
        completedAt: NOW,
        checkpointData: existingCheckpoint,
      });

      db.select.mockReturnValue(createSelectChain([step]));
      db.update.mockReturnValue(createUpdateChainVoid());

      await service.saveCheckpoint(TENANT_ID, EXECUTION_ID, STEP_ID_1);

      const setArg = db.update.mock.results[0].value.set.mock.calls[0][0];
      expect(setArg.checkpointData).toEqual({
        sessionId: 'sess-123',
        attempts: [],
        output: { data: 'result' },
        completedAt: NOW.toISOString(),
        dagState: {
          completedNodes: ['node-1'],
          pendingNodes: [],
        },
      });
    });

    it('应将 queued 和 running 步骤归入 pendingNodes', async () => {
      const steps = [
        makeStep({
          id: STEP_ID_1,
          nodeId: 'node-1',
          status: 'completed',
          result: {},
          completedAt: NOW,
        }),
        makeStep({
          id: STEP_ID_2,
          nodeId: 'node-2',
          status: 'queued',
        }),
        makeStep({
          id: STEP_ID_3,
          nodeId: 'node-3',
          status: 'running',
        }),
      ];

      db.select.mockReturnValue(createSelectChain(steps));
      db.update.mockReturnValue(createUpdateChainVoid());

      await service.saveCheckpoint(TENANT_ID, EXECUTION_ID, STEP_ID_1);

      const setArg = db.update.mock.results[0].value.set.mock.calls[0][0];
      expect(setArg.checkpointData.dagState).toEqual({
        completedNodes: ['node-1'],
        pendingNodes: ['node-2', 'node-3'],
      });
    });

    it('当 completedAt 为 null 时应使用当前时间', async () => {
      const step = makeStep({
        id: STEP_ID_1,
        nodeId: 'node-1',
        status: 'completed',
        result: {},
        completedAt: null,
      });

      db.select.mockReturnValue(createSelectChain([step]));
      db.update.mockReturnValue(createUpdateChainVoid());

      await service.saveCheckpoint(TENANT_ID, EXECUTION_ID, STEP_ID_1);

      const setArg = db.update.mock.results[0].value.set.mock.calls[0][0];
      expect(setArg.checkpointData.completedAt).toBe(NOW.toISOString());
    });
  });

  describe('resumeExecution', () => {
    it('应该重置所有 failed/cancelled 步骤为 pending（无 fromNodeId）', async () => {
      const execution = makeExecution();
      const steps = [
        makeStep({
          id: STEP_ID_1,
          nodeId: 'node-1',
          status: 'completed',
          result: { out: 1 },
        }),
        makeStep({
          id: STEP_ID_2,
          nodeId: 'node-2',
          status: 'failed',
          attemptCount: 3,
          errorMessage: { message: 'boom' },
        }),
        makeStep({
          id: STEP_ID_3,
          nodeId: 'node-3',
          status: 'cancelled',
        }),
      ];
      const updatedExecution = makeExecution({
        status: 'running',
        failedAt: null,
      });

      db.select
        .mockReturnValueOnce(createSelectChain([execution]))
        .mockReturnValueOnce(createSelectChain(steps));
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainReturning([updatedExecution]));

      const result = await service.resumeExecution(TENANT_ID, EXECUTION_ID);

      expect(result.status).toBe('running');
      expect(db.update).toHaveBeenCalledTimes(2);

      const stepResetSetArg =
        db.update.mock.results[0].value.set.mock.calls[0][0];
      expect(stepResetSetArg).toMatchObject({
        status: 'pending',
        attemptCount: 0,
        errorMessage: null,
      });

      expect(eventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        expect.objectContaining({
          executionId: EXECUTION_ID,
          status: 'running',
        }),
      );
    });

    it('应该在有 fromNodeId 时重置目标节点及下游', async () => {
      const execution = makeExecution();
      const steps = [
        makeStep({
          id: STEP_ID_1,
          nodeId: 'node-1',
          status: 'completed',
          result: { out: 1 },
        }),
        makeStep({
          id: STEP_ID_2,
          nodeId: 'node-2',
          status: 'failed',
          errorMessage: { message: 'err' },
        }),
        makeStep({
          id: STEP_ID_3,
          nodeId: 'node-3',
          status: 'cancelled',
        }),
      ];
      const updatedExecution = makeExecution({
        status: 'running',
        failedAt: null,
      });

      // DAG: node-1 → node-2 → node-3
      const adjacencyMap = new Map([
        ['node-1', ['node-2']],
        ['node-2', ['node-3']],
        ['node-3', []],
      ]);
      dagResolver.resolveDag.mockReturnValue({
        layers: [['node-1'], ['node-2'], ['node-3']],
        adjacencyMap,
        inDegreeMap: new Map([
          ['node-1', 0],
          ['node-2', 1],
          ['node-3', 1],
        ]),
      });

      db.select
        .mockReturnValueOnce(createSelectChain([execution]))
        .mockReturnValueOnce(createSelectChain(steps));
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainReturning([updatedExecution]));

      const result = await service.resumeExecution(
        TENANT_ID,
        EXECUTION_ID,
        'node-2',
      );

      expect(result.status).toBe('running');
      expect(db.update).toHaveBeenCalledTimes(3);
      expect(dagResolver.resolveDag).toHaveBeenCalled();
    });

    it('应在 fromNodeId 重置已完成下游后重新计算 completedSteps', async () => {
      const execution = makeExecution({ completedSteps: 3 });
      const steps = [
        makeStep({
          id: STEP_ID_1,
          nodeId: 'node-1',
          status: 'completed',
          result: { out: 1 },
        }),
        makeStep({
          id: STEP_ID_2,
          nodeId: 'node-2',
          status: 'completed',
          result: { out: 2 },
        }),
        makeStep({
          id: STEP_ID_3,
          nodeId: 'node-3',
          status: 'skipped',
          result: { out: 3 },
        }),
      ];
      const updatedExecution = makeExecution({
        status: 'running',
        failedAt: null,
        completedSteps: 1,
      });

      const adjacencyMap = new Map([
        ['node-1', ['node-2']],
        ['node-2', ['node-3']],
        ['node-3', []],
      ]);
      dagResolver.resolveDag.mockReturnValue({
        layers: [['node-1'], ['node-2'], ['node-3']],
        adjacencyMap,
        inDegreeMap: new Map([
          ['node-1', 0],
          ['node-2', 1],
          ['node-3', 1],
        ]),
      });

      db.select
        .mockReturnValueOnce(createSelectChain([execution]))
        .mockReturnValueOnce(createSelectChain(steps));
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainReturning([updatedExecution]));

      await service.resumeExecution(TENANT_ID, EXECUTION_ID, 'node-2');

      const executionSetArg =
        db.update.mock.results[2].value.set.mock.calls[0][0];
      expect(executionSetArg).toMatchObject({
        status: 'running',
        completedSteps: 1,
        failedAt: null,
      });
      expect(eventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        {
          executionId: EXECUTION_ID,
          status: 'running',
          completedSteps: 1,
          totalSteps: 3,
        },
      );
    });

    it('当执行不存在时应抛出 ExecutionNotFoundException', async () => {
      db.select.mockReturnValue(createSelectChain([]));

      await expect(
        service.resumeExecution(TENANT_ID, 'non-existent'),
      ).rejects.toThrow(ExecutionNotFoundException);
    });

    it('当执行状态为 paused 时应抛出 409 ExecutionNotResumableException', async () => {
      const execution = makeExecution({ status: 'paused' });
      db.select.mockReturnValue(createSelectChain([execution]));

      await expect(
        service.resumeExecution(TENANT_ID, EXECUTION_ID),
      ).rejects.toThrow(ExecutionNotResumableException);
    });

    it('当执行状态为 running 时应抛出 ExecutionNotResumableException', async () => {
      const execution = makeExecution({ status: 'running' });
      db.select.mockReturnValue(createSelectChain([execution]));

      await expect(
        service.resumeExecution(TENANT_ID, EXECUTION_ID),
      ).rejects.toThrow(ExecutionNotResumableException);
    });

    it('当执行状态为 completed 时应抛出 ExecutionNotResumableException', async () => {
      const execution = makeExecution({ status: 'completed' });
      db.select.mockReturnValue(createSelectChain([execution]));

      await expect(
        service.resumeExecution(TENANT_ID, EXECUTION_ID),
      ).rejects.toThrow(ExecutionNotResumableException);
    });

    it('当没有需要重置的步骤时应抛 409，且不把执行改回 running', async () => {
      const execution = makeExecution();
      const steps = [
        makeStep({
          id: STEP_ID_1,
          nodeId: 'node-1',
          status: 'completed',
          result: { out: 1 },
        }),
      ];

      db.select
        .mockReturnValueOnce(createSelectChain([execution]))
        .mockReturnValueOnce(createSelectChain(steps));

      await expect(
        service.resumeExecution(TENANT_ID, EXECUTION_ID),
      ).rejects.toThrow(ExecutionNotResumableException);
      expect(db.update).not.toHaveBeenCalled();
      expect(eventBridge.emitExecutionStatusChanged).not.toHaveBeenCalled();
    });

    it('fromNodeId 不在执行快照中时应抛 422，且不把执行改回 running', async () => {
      const execution = makeExecution();
      db.select
        .mockReturnValueOnce(createSelectChain([execution]))
        .mockReturnValueOnce(
          createSelectChain([
            makeStep({ id: STEP_ID_2, nodeId: 'node-2', status: 'failed' }),
          ]),
        );

      const error = await service
        .resumeExecution(TENANT_ID, EXECUTION_ID, 'ghost')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ExecutionResumeNodeNotFoundException);
      expect((error as ExecutionResumeNodeNotFoundException).getStatus()).toBe(
        422,
      );
      expect(dagResolver.resolveDag).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('fromNodeId 也重置失败级联取消的兄弟分支，避免执行永久 running（D-154）', async () => {
      // trig → src → gate → outA；src → outB。gate 失败时 outB 被级联取消
      const node = (id: string) => ({
        id,
        type: 'tool',
        data: {},
        position: { x: 0, y: 0 },
      });
      const edge = (source: string, target: string) => ({
        id: `${source}-${target}`,
        source,
        target,
        sourceHandle: null,
        targetHandle: null,
      });
      const execution = makeExecution({
        definitionSnapshot: {
          nodes: ['trig', 'src', 'gate', 'outA', 'outB'].map(node),
          edges: [
            edge('trig', 'src'),
            edge('src', 'gate'),
            edge('gate', 'outA'),
            edge('src', 'outB'),
          ],
          viewport: { x: 0, y: 0, zoom: 1 },
          metadata: {},
        } as unknown as WorkflowExecution['definitionSnapshot'],
        totalSteps: 5,
        completedSteps: 2,
      });
      const steps = [
        makeStep({ id: 's-trig', nodeId: 'trig', status: 'completed' }),
        makeStep({ id: 's-src', nodeId: 'src', status: 'completed' }),
        makeStep({ id: 's-gate', nodeId: 'gate', status: 'failed' }),
        makeStep({ id: 's-outA', nodeId: 'outA', status: 'cancelled' }),
        makeStep({ id: 's-outB', nodeId: 'outB', status: 'cancelled' }),
      ];
      dagResolver.resolveDag.mockReturnValue({
        layers: [['trig'], ['src'], ['gate', 'outB'], ['outA']],
        adjacencyMap: new Map([
          ['trig', ['src']],
          ['src', ['gate', 'outB']],
          ['gate', ['outA']],
          ['outA', []],
          ['outB', []],
        ]),
        inDegreeMap: new Map(),
      });
      db.select
        .mockReturnValueOnce(createSelectChain([execution]))
        .mockReturnValueOnce(createSelectChain(steps));
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainReturning([execution]));

      await service.resumeExecution(TENANT_ID, EXECUTION_ID, 'gate');

      const resetIds = vi.mocked(inArray).mock.calls[0][1] as string[];
      expect([...resetIds].sort()).toEqual(['s-gate', 's-outA', 's-outB']);
      expect(eventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        {
          executionId: EXECUTION_ID,
          status: 'running',
          completedSteps: 2,
          totalSteps: 5,
        },
      );
    });

    it('fromNodeId 是容器内部节点时抛 422 并指明所属顶层容器（D-155）', async () => {
      const execution = makeExecution({
        definitionSnapshot: {
          nodes: [
            {
              id: 'iter',
              type: 'control',
              data: { nodeType: 'iteration' },
              position: { x: 0, y: 0 },
            },
            {
              id: 'inner-loop',
              type: 'control',
              parentId: 'iter',
              data: { nodeType: 'loop' },
              position: { x: 0, y: 0 },
            },
            {
              id: 'val',
              type: 'tool',
              parentId: 'inner-loop',
              data: { nodeType: 'code-tool' },
              position: { x: 0, y: 0 },
            },
          ],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
          metadata: {},
        } as unknown as WorkflowExecution['definitionSnapshot'],
      });
      db.select
        .mockReturnValueOnce(createSelectChain([execution]))
        .mockReturnValueOnce(
          createSelectChain([
            makeStep({ id: STEP_ID_1, nodeId: 'iter', status: 'failed' }),
          ]),
        );

      const error = await service
        .resumeExecution(TENANT_ID, EXECUTION_ID, 'val')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ExecutionResumeNodeInsideContainerException);
      const exception = error as ExecutionResumeNodeInsideContainerException;
      expect(exception.getStatus()).toBe(422);
      expect(exception.type).toBe(
        'https://agentloom.dev/errors/execution-resume-node-inside-container',
      );
      expect(exception.extensions).toEqual({
        nodeId: 'val',
        containerNodeId: 'iter',
      });
      expect(exception.detail).toContain('请从容器节点 iter 恢复');
      expect(db.update).not.toHaveBeenCalled();
    });

    it('resume 计数只统计顶层步骤，与执行实体口径一致（D-156）', async () => {
      const internal = {
        __execution: { isCompoundInternal: true, compoundParentId: 'node-1' },
      };
      const execution = makeExecution();
      const steps = [
        makeStep({ id: STEP_ID_1, nodeId: 'node-1', status: 'completed' }),
        makeStep({ id: STEP_ID_2, nodeId: 'node-2', status: 'failed' }),
        makeStep({ id: STEP_ID_3, nodeId: 'node-3', status: 'skipped' }),
        makeStep({
          id: 'inner-1',
          nodeId: 'inner-1',
          status: 'completed',
          nodeData: internal,
        }),
        makeStep({
          id: 'inner-2',
          nodeId: 'inner-2',
          status: 'completed',
          nodeData: internal,
        }),
      ];
      db.select
        .mockReturnValueOnce(createSelectChain([execution]))
        .mockReturnValueOnce(createSelectChain(steps));
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainReturning([execution]));

      await service.resumeExecution(TENANT_ID, EXECUTION_ID);

      expect(db.update.mock.results[1].value.set.mock.calls[0][0]).toMatchObject(
        { completedSteps: 2, totalSteps: 3 },
      );
      expect(eventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        {
          executionId: EXECUTION_ID,
          status: 'running',
          completedSteps: 2,
          totalSteps: 3,
        },
      );
    });

    it('应发布执行状态变更事件，包含正确的 completedSteps 计数', async () => {
      const execution = makeExecution();
      const steps = [
        makeStep({
          id: STEP_ID_1,
          nodeId: 'node-1',
          status: 'completed',
        }),
        makeStep({
          id: STEP_ID_2,
          nodeId: 'node-2',
          status: 'failed',
        }),
      ];
      const updatedExecution = makeExecution({ status: 'running' });

      db.select
        .mockReturnValueOnce(createSelectChain([execution]))
        .mockReturnValueOnce(createSelectChain(steps));
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainReturning([updatedExecution]));

      await service.resumeExecution(TENANT_ID, EXECUTION_ID);

      expect(eventBridge.emitExecutionStatusChanged).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        {
          executionId: EXECUTION_ID,
          status: 'running',
          completedSteps: 1,
          totalSteps: 2,
        },
      );
    });
  });
});

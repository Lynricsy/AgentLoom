import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ExecutionService } from '../execution.service';
import { ExecutionGateway } from '../execution.gateway';
import {
  ExecutionNotFoundException,
  WorkflowNotPublishedException,
  ExecutionNotCancellableException,
  WorkflowArchivedException,
} from '../execution.exceptions';
import { EXECUTION_QUEUE } from '../execution.constants';
import { DRIZZLE } from '../../../database/database.module';

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';
const USER_ID = '019391d4-b000-7000-0000-000000000002';
const WORKFLOW_ID = '019391d4-c000-7000-0000-000000000003';
const EXECUTION_ID = '019391d4-d000-7000-0000-000000000004';
const VERSION_ID = '019391d4-e000-7000-0000-000000000005';

const NOW = new Date('2025-01-01T00:00:00Z');

const mockSnapshot = {
  nodes: [
    {
      id: 'node-1',
      type: 'trigger',
      data: { label: 'Start' },
      position: { x: 0, y: 0 },
    },
    {
      id: 'node-2',
      type: 'action',
      data: { label: 'Process' },
      position: { x: 100, y: 0 },
    },
  ],
  edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
  viewport: { x: 0, y: 0, zoom: 1 },
  metadata: { nodeCount: 2, edgeCount: 1, createdFromVersion: 1 },
};

const mockPublishedWorkflow = {
  id: WORKFLOW_ID,
  tenantId: TENANT_ID,
  status: 'published' as const,
  publishedVersionId: VERSION_ID,
  name: 'Test Workflow',
};

const mockVersion = {
  id: VERSION_ID,
  snapshot: mockSnapshot,
};

const mockExecution = {
  id: EXECUTION_ID,
  workflowDefinitionId: WORKFLOW_ID,
  workflowVersionId: VERSION_ID,
  tenantId: TENANT_ID,
  status: 'pending' as const,
  triggerType: 'manual' as const,
  inputParams: {},
  definitionSnapshot: mockSnapshot,
  totalSteps: 0,
  completedSteps: 0,
  createdBy: USER_ID,
  startedAt: null,
  completedAt: null,
  failedAt: null,
  cancelledAt: null,
  errorMessage: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const txDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  execute: vi.fn(),
};

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createSelectChainWithOrderBy(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createSelectChainPaginated(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
    }),
  };
}

function createInsertChainReturning(result: unknown) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createInsertChainVoid() {
  return {
    values: vi.fn().mockResolvedValue(undefined),
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

const db = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(async (callback: (tx: typeof txDb) => Promise<unknown>) =>
    callback(txDb),
  ),
};

const mockQueue: Record<string, Mock> = {
  add: vi.fn(),
  getJobs: vi.fn(),
  getJob: vi.fn(),
};

const mockGateway: Record<string, Mock> = {
  broadcastEvent: vi.fn(),
};

describe('ExecutionService', () => {
  let service: ExecutionService;

  beforeEach(async () => {
    vi.clearAllMocks();
    db.select.mockReset();
    db.insert.mockReset();
    db.update.mockReset();
    db.delete.mockReset();
    db.execute.mockReset();
    db.transaction.mockReset();
    txDb.select.mockReset();
    txDb.insert.mockReset();
    txDb.update.mockReset();
    txDb.delete.mockReset();
    txDb.execute.mockReset();
    mockQueue.add.mockReset();
    mockQueue.getJobs.mockReset();
    mockQueue.getJob.mockReset();
    mockGateway.broadcastEvent.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    txDb.execute.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        ExecutionService,
        { provide: DRIZZLE, useValue: db },
        { provide: getQueueToken(EXECUTION_QUEUE), useValue: mockQueue },
        { provide: ExecutionGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get(ExecutionService);
  });

  describe('runWorkflow', () => {
    it('应为已发布的工作流创建执行并添加队列任务', async () => {
      db.select
        .mockReturnValueOnce(createSelectChain([mockPublishedWorkflow]))
        .mockReturnValueOnce(createSelectChain([mockVersion]));
      db.insert.mockReturnValueOnce(
        createInsertChainReturning([mockExecution]),
      );
      mockQueue.add.mockResolvedValue(undefined);

      const result = await service.runWorkflow(
        WORKFLOW_ID,
        { inputParams: { source: 'manual-trigger' } },
        TENANT_ID,
        USER_ID,
      );

      expect(result).toEqual(mockExecution);
      expect(db.select).toHaveBeenCalledTimes(2);
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'execute',
        {
          executionId: EXECUTION_ID,
          tenantId: TENANT_ID,
        },
        {
          jobId: EXECUTION_ID,
        },
      );
    });

    it('应拒绝草稿工作流 (WorkflowNotPublishedException)', async () => {
      const draftWorkflow = {
        ...mockPublishedWorkflow,
        status: 'draft',
        publishedVersionId: null,
      };
      db.select.mockReturnValueOnce(createSelectChain([draftWorkflow]));

      await expect(
        service.runWorkflow(WORKFLOW_ID, undefined, TENANT_ID, USER_ID),
      ).rejects.toThrow(WorkflowNotPublishedException);
    });

    it('应拒绝已归档的工作流', async () => {
      const archivedWorkflow = {
        ...mockPublishedWorkflow,
        status: 'archived',
        publishedVersionId: null,
      };
      db.select.mockReturnValueOnce(createSelectChain([archivedWorkflow]));

      await expect(
        service.runWorkflow(WORKFLOW_ID, undefined, TENANT_ID, USER_ID),
      ).rejects.toThrow(WorkflowArchivedException);
    });

    it('应在工作流不存在时抛出异常', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.runWorkflow(WORKFLOW_ID, undefined, TENANT_ID, USER_ID),
      ).rejects.toThrow(WorkflowNotPublishedException);
    });
  });

  describe('getExecution', () => {
    it('应返回执行详情和步骤列表', async () => {
      const mockSteps = [
        {
          id: 'step-1',
          executionId: EXECUTION_ID,
          nodeId: 'node-1',
          stepOrder: 0,
          status: 'pending',
        },
        {
          id: 'step-2',
          executionId: EXECUTION_ID,
          nodeId: 'node-2',
          stepOrder: 1,
          status: 'pending',
        },
      ];
      db.select
        .mockReturnValueOnce(createSelectChain([mockExecution]))
        .mockReturnValueOnce(createSelectChainWithOrderBy(mockSteps));

      const result = await service.getExecution(EXECUTION_ID);

      expect(result).toEqual({ ...mockExecution, steps: mockSteps });
      expect(db.select).toHaveBeenCalledTimes(2);
    });

    it('应在执行不存在时抛出 ExecutionNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(service.getExecution(EXECUTION_ID)).rejects.toThrow(
        ExecutionNotFoundException,
      );
    });
  });

  describe('listExecutions', () => {
    it('应返回分页的执行列表', async () => {
      const executions = [mockExecution];
      db.select
        .mockReturnValueOnce(createSelectChainPaginated(executions))
        .mockReturnValueOnce(createSelectChain([{ count: 1 }]));

      const result = await service.listExecutions(WORKFLOW_ID, 1, 20);

      expect(result).toEqual({
        data: executions,
        meta: { total: 1, page: 1, limit: 20, pageSize: 20, totalPages: 1 },
      });
    });

    it('应在没有结果时返回空列表', async () => {
      db.select
        .mockReturnValueOnce(createSelectChainPaginated([]))
        .mockReturnValueOnce(createSelectChain([{ count: 0 }]));

      const result = await service.listExecutions(WORKFLOW_ID, 1, 20);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });

    it('应支持通过状态过滤', async () => {
      db.select
        .mockReturnValueOnce(createSelectChainPaginated([]))
        .mockReturnValueOnce(createSelectChain([{ count: 0 }]));

      const result = await service.listExecutions(
        WORKFLOW_ID,
        1,
        20,
        'running',
      );

      expect(result.data).toEqual([]);
      expect(db.select).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancelExecution', () => {
    it('应取消运行中的执行', async () => {
      const runningExecution = { ...mockExecution, status: 'running' as const };
      const cancelledExecution = {
        ...mockExecution,
        status: 'cancelled' as const,
        cancelledAt: NOW,
      };
      db.select.mockReturnValueOnce(createSelectChain([runningExecution]));
      db.update
        .mockReturnValueOnce(createUpdateChainReturning([cancelledExecution]))
        .mockReturnValueOnce(createUpdateChainVoid());
      mockQueue.getJob.mockResolvedValue(null);
      mockQueue.getJobs.mockResolvedValue([]);

      const result = await service.cancelExecution(EXECUTION_ID, TENANT_ID);

      expect(result.status).toBe('cancelled');
      expect(mockGateway.broadcastEvent).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        'execution:cancelled',
        expect.objectContaining({
          executionId: EXECUTION_ID,
          status: 'cancelled',
          type: 'execution.cancelled',
        }),
      );
    });

    it('应取消 pending 状态的执行', async () => {
      const pendingExecution = { ...mockExecution, status: 'pending' as const };
      const cancelledExecution = {
        ...mockExecution,
        status: 'cancelled' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([pendingExecution]));
      db.update
        .mockReturnValueOnce(createUpdateChainReturning([cancelledExecution]))
        .mockReturnValueOnce(createUpdateChainVoid());
      mockQueue.getJob.mockResolvedValue(null);
      mockQueue.getJobs.mockResolvedValue([]);

      const result = await service.cancelExecution(EXECUTION_ID, TENANT_ID);

      expect(result.status).toBe('cancelled');
    });

    it('应移除匹配的 BullMQ 任务', async () => {
      const runningExecution = { ...mockExecution, status: 'running' as const };
      const cancelledExecution = {
        ...mockExecution,
        status: 'cancelled' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([runningExecution]));
      db.update
        .mockReturnValueOnce(createUpdateChainReturning([cancelledExecution]))
        .mockReturnValueOnce(createUpdateChainVoid());

      const mockRemove = vi.fn().mockResolvedValue(undefined);
      const matchingJob = {
        remove: mockRemove,
        getState: vi.fn().mockResolvedValue('waiting'),
      };
      mockQueue.getJob.mockResolvedValue(matchingJob);

      await service.cancelExecution(EXECUTION_ID, TENANT_ID);

      expect(mockRemove).toHaveBeenCalled();
      expect(mockQueue.getJobs).not.toHaveBeenCalled();
    });

    it('应在 getJob 回退时扫描 prioritized 队列任务', async () => {
      const runningExecution = { ...mockExecution, status: 'running' as const };
      const cancelledExecution = {
        ...mockExecution,
        status: 'cancelled' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([runningExecution]));
      db.update
        .mockReturnValueOnce(createUpdateChainReturning([cancelledExecution]))
        .mockReturnValueOnce(createUpdateChainVoid());

      const mockRemove = vi.fn().mockResolvedValue(undefined);
      mockQueue.getJob.mockResolvedValue(null);
      mockQueue.getJobs.mockResolvedValue([
        {
          data: { executionId: EXECUTION_ID },
          remove: mockRemove,
        },
      ]);

      await service.cancelExecution(EXECUTION_ID, TENANT_ID);

      expect(mockQueue.getJobs).toHaveBeenCalledWith([
        'waiting',
        'delayed',
        'prioritized',
      ]);
      expect(mockRemove).toHaveBeenCalled();
    });

    it('应跳过移除 active 状态的 BullMQ 任务', async () => {
      const runningExecution = { ...mockExecution, status: 'running' as const };
      const cancelledExecution = {
        ...mockExecution,
        status: 'cancelled' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([runningExecution]));
      db.update
        .mockReturnValueOnce(createUpdateChainReturning([cancelledExecution]))
        .mockReturnValueOnce(createUpdateChainVoid());

      const mockRemove = vi.fn().mockResolvedValue(undefined);
      const activeJob = {
        remove: mockRemove,
        getState: vi.fn().mockResolvedValue('active'),
      };
      mockQueue.getJob.mockResolvedValue(activeJob);

      await service.cancelExecution(EXECUTION_ID, TENANT_ID);

      expect(mockRemove).not.toHaveBeenCalled();
    });

    it('应在执行不存在时抛出 ExecutionNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.cancelExecution(EXECUTION_ID, TENANT_ID),
      ).rejects.toThrow(ExecutionNotFoundException);
    });

    it('应在执行已完成时抛出 ExecutionNotCancellableException', async () => {
      const completedExecution = {
        ...mockExecution,
        status: 'completed' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([completedExecution]));

      await expect(
        service.cancelExecution(EXECUTION_ID, TENANT_ID),
      ).rejects.toThrow(ExecutionNotCancellableException);
    });

    it('应在执行已失败时抛出 ExecutionNotCancellableException', async () => {
      const failedExecution = { ...mockExecution, status: 'failed' as const };
      db.select.mockReturnValueOnce(createSelectChain([failedExecution]));

      await expect(
        service.cancelExecution(EXECUTION_ID, TENANT_ID),
      ).rejects.toThrow(ExecutionNotCancellableException);
    });
  });

  describe('initializeSteps', () => {
    it('应从快照节点创建步骤并将执行准备为 running', async () => {
      db.select.mockReturnValueOnce(createSelectChain([mockExecution]));
      txDb.select
        .mockReturnValueOnce(createSelectChain([mockExecution]))
        .mockReturnValueOnce(createSelectChain([]));
      txDb.update.mockReturnValueOnce(
        createUpdateChainReturning([{ status: 'running' }]),
      );
      txDb.insert.mockReturnValueOnce(createInsertChainVoid());

      await service.initializeSteps(EXECUTION_ID);

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(txDb.execute).toHaveBeenCalledTimes(2);
      expect(txDb.update).toHaveBeenCalledTimes(1);
      expect(txDb.insert).toHaveBeenCalledTimes(1);
      expect(mockGateway.broadcastEvent).not.toHaveBeenCalled();
    });

    it('应在执行不存在时抛出 ExecutionNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(service.initializeSteps(EXECUTION_ID)).rejects.toThrow(
        ExecutionNotFoundException,
      );
    });

    it('应在没有节点时跳过步骤插入并直接完成 execution', async () => {
      const emptyExecution = {
        ...mockExecution,
        definitionSnapshot: { ...mockSnapshot, nodes: [] },
      };
      db.select.mockReturnValueOnce(createSelectChain([emptyExecution]));
      txDb.select
        .mockReturnValueOnce(createSelectChain([emptyExecution]))
        .mockReturnValueOnce(createSelectChain([]));
      txDb.update.mockReturnValueOnce(
        createUpdateChainReturning([{ status: 'completed' }]),
      );

      await service.initializeSteps(EXECUTION_ID);

      expect(txDb.insert).not.toHaveBeenCalled();
      expect(mockGateway.broadcastEvent).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        'execution:completed',
        { executionId: EXECUTION_ID, status: 'completed', totalSteps: 0 },
      );
    });

    it('应在执行已 running 且缺少步骤时补建步骤而不重复切换状态', async () => {
      const runningExecution = {
        ...mockExecution,
        status: 'running' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([runningExecution]));
      txDb.select
        .mockReturnValueOnce(createSelectChain([runningExecution]))
        .mockReturnValueOnce(createSelectChain([]));
      txDb.insert.mockReturnValueOnce(createInsertChainVoid());

      await service.initializeSteps(EXECUTION_ID);

      expect(txDb.update).not.toHaveBeenCalled();
      expect(txDb.insert).toHaveBeenCalledTimes(1);
      expect(mockGateway.broadcastEvent).not.toHaveBeenCalled();
    });

    it('应在执行已 running 且已有步骤时保持幂等', async () => {
      const runningExecution = {
        ...mockExecution,
        status: 'running' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([runningExecution]));
      txDb.select
        .mockReturnValueOnce(createSelectChain([runningExecution]))
        .mockReturnValueOnce(
          createSelectChain([{ executionId: EXECUTION_ID, nodeId: 'node-1' }]),
        );

      await service.initializeSteps(EXECUTION_ID);

      expect(txDb.update).not.toHaveBeenCalled();
      expect(txDb.insert).not.toHaveBeenCalled();
      expect(mockGateway.broadcastEvent).not.toHaveBeenCalled();
    });

    it('应在执行已取消时跳过步骤初始化', async () => {
      const cancelledExecution = {
        ...mockExecution,
        status: 'cancelled' as const,
      };
      db.select.mockReturnValueOnce(createSelectChain([cancelledExecution]));
      txDb.select.mockReturnValueOnce(createSelectChain([cancelledExecution]));

      await service.initializeSteps(EXECUTION_ID);

      expect(txDb.update).not.toHaveBeenCalled();
      expect(txDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('markFailed', () => {
    it('应标记执行为失败并广播事件', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([{ tenantId: TENANT_ID }]),
      );
      txDb.update.mockReturnValueOnce(
        createUpdateChainReturning([{ id: EXECUTION_ID }]),
      );

      const error = new Error('执行失败');
      await service.markFailed(EXECUTION_ID, error);

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(txDb.execute).toHaveBeenCalledTimes(2);
      expect(txDb.update).toHaveBeenCalledTimes(1);
      expect(mockGateway.broadcastEvent).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        'execution:failed',
        { executionId: EXECUTION_ID, status: 'failed', error: '执行失败' },
      );
    });

    it('应在执行已取消时跳过失败覆盖', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([{ tenantId: TENANT_ID }]),
      );
      txDb.update.mockReturnValueOnce(createUpdateChainReturning([]));
      txDb.select.mockReturnValueOnce(createSelectChain([{ status: 'cancelled' }]));

      const error = new Error('执行失败');
      await service.markFailed(EXECUTION_ID, error);

      expect(txDb.update).toHaveBeenCalledTimes(1);
      expect(txDb.select).toHaveBeenCalledTimes(1);
      expect(mockGateway.broadcastEvent).not.toHaveBeenCalled();
    });

    it('应在执行不存在时不广播事件', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      const error = new Error('执行失败');
      await service.markFailed(EXECUTION_ID, error);

      expect(db.transaction).not.toHaveBeenCalled();
      expect(mockGateway.broadcastEvent).not.toHaveBeenCalled();
    });
  });
});

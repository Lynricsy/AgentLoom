import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ExecutionController } from '../execution.controller';
import { ExecutionService } from '../execution.service';

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';
const USER_ID = '019391d4-b000-7000-0000-000000000002';
const WORKFLOW_ID = '019391d4-c000-7000-0000-000000000003';
const EXECUTION_ID = '019391d4-d000-7000-0000-000000000004';

const mockExecution = {
  id: EXECUTION_ID,
  workflowDefinitionId: WORKFLOW_ID,
  workflowVersionId: '019391d4-e000-7000-0000-000000000005',
  tenantId: TENANT_ID,
  status: 'pending' as const,
  triggerType: 'manual' as const,
  inputParams: {},
  definitionSnapshot: {
    nodes: [],
    edges: [],
    viewport: null,
    metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 },
  },
  createdBy: USER_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockService: Record<string, ReturnType<typeof vi.fn>> = {
  runWorkflow: vi.fn(),
  getExecution: vi.fn(),
  listExecutions: vi.fn(),
  cancelExecution: vi.fn(),
};

describe('ExecutionController', () => {
  let controller: ExecutionController;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [ExecutionController],
      providers: [{ provide: ExecutionService, useValue: mockService }],
    }).compile();

    controller = module.get(ExecutionController);
  });

  describe('runWorkflow', () => {
    it('应启动工作流执行并返回 { data }', async () => {
      mockService.runWorkflow.mockResolvedValue(mockExecution);
      const dto = { inputParams: { source: 'manual' } };

      const result = await controller.runWorkflow(
        WORKFLOW_ID,
        dto,
        TENANT_ID,
        USER_ID,
      );

      expect(result).toEqual({
        data: { ...mockExecution, workflowId: WORKFLOW_ID },
      });
      expect(mockService.runWorkflow).toHaveBeenCalledWith(
        WORKFLOW_ID,
        dto,
        TENANT_ID,
        USER_ID,
      );
    });
  });

  describe('getExecution', () => {
    it('应返回执行详情 { data }', async () => {
      const executionWithSteps = { ...mockExecution, steps: [] };
      mockService.getExecution.mockResolvedValue(executionWithSteps);

      const result = await controller.getExecution(EXECUTION_ID);

      expect(result).toEqual({
        data: { ...executionWithSteps, workflowId: WORKFLOW_ID },
      });
      expect(mockService.getExecution).toHaveBeenCalledWith(EXECUTION_ID);
    });
  });

  describe('listExecutions', () => {
    it('应返回分页执行列表 { data, meta }', async () => {
      const paginatedResult = {
        data: [mockExecution],
        meta: { total: 1, page: 1, limit: 20, pageSize: 20, totalPages: 1 },
      };
      mockService.listExecutions.mockResolvedValue(paginatedResult);

      const result = await controller.listExecutions(WORKFLOW_ID, {
        page: 1,
        limit: 20,
        status: undefined,
      });

      expect(result).toEqual({
        ...paginatedResult,
        data: [{ ...mockExecution, workflowId: WORKFLOW_ID }],
      });
      expect(mockService.listExecutions).toHaveBeenCalledWith(
        WORKFLOW_ID,
        1,
        20,
        undefined,
      );
    });

    it('应支持状态过滤', async () => {
      const paginatedResult = {
        data: [{ ...mockExecution, status: 'running' }],
        meta: { total: 1, page: 1, limit: 20, pageSize: 20, totalPages: 1 },
      };
      mockService.listExecutions.mockResolvedValue(paginatedResult);

      const result = await controller.listExecutions(WORKFLOW_ID, {
        page: 1,
        limit: 20,
        status: 'running',
      });

      expect(result).toEqual({
        ...paginatedResult,
        data: [
          { ...mockExecution, status: 'running', workflowId: WORKFLOW_ID },
        ],
      });
      expect(mockService.listExecutions).toHaveBeenCalledWith(
        WORKFLOW_ID,
        1,
        20,
        'running',
      );
    });
  });

  describe('cancelExecution', () => {
    it('应取消执行并返回 { data }', async () => {
      const cancelledExecution = {
        ...mockExecution,
        status: 'cancelled' as const,
      };
      mockService.cancelExecution.mockResolvedValue(cancelledExecution);

      const result = await controller.cancelExecution(EXECUTION_ID, TENANT_ID);

      expect(result).toEqual({
        data: { ...cancelledExecution, workflowId: WORKFLOW_ID },
      });
      expect(mockService.cancelExecution).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
      );
    });
  });
});

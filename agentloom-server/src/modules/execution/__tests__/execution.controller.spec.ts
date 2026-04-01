import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ExecutionController } from '../execution.controller';
import { ExecutionService } from '../execution.service';
import { NodeSchedulerService } from '../node-scheduler.service';
import { CheckpointService } from '../checkpoint.service';
import { EXECUTION_QUEUE } from '../execution.constants';
import { InterventionPermissionDeniedException } from '../execution.exceptions';
import { SandboxAgentAdapter } from '../../agent/sandbox-agent.adapter';
import { WorkspaceIntegrationService } from '../../agent-execution/workspace-integration.service';

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';
const USER_ID = '019391d4-b000-7000-0000-000000000002';
const WORKFLOW_ID = '019391d4-c000-7000-0000-000000000003';
const EXECUTION_ID = '019391d4-d000-7000-0000-000000000004';
const STEP_ID = '019391d4-f000-7000-0000-000000000006';
const TOOL_CALL_ID = '019391d4-a100-7000-0000-000000000007';

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
  getDeadLetterJobs: vi.fn(),
  retryDeadLetterJob: vi.fn(),
  discardDeadLetterJob: vi.fn(),
};

const mockNodeScheduler: Record<string, ReturnType<typeof vi.fn>> = {
  resolveIntervention: vi.fn(),
  resolveToolPermission: vi.fn(),
  resumeScheduling: vi.fn(),
};

const mockCheckpointService: Record<string, ReturnType<typeof vi.fn>> = {
  resumeExecution: vi.fn(),
};

const mockExecutionQueue: Record<string, ReturnType<typeof vi.fn>> = {
  add: vi.fn(),
};

const mockSandboxAgentAdapter: Record<string, ReturnType<typeof vi.fn>> = {
  listPtySessions: vi.fn(),
  ptyBufferDump: vi.fn(),
  ptyWrite: vi.fn(),
};

const mockWorkspaceIntegrationService: Record<
  string,
  ReturnType<typeof vi.fn>
> = {
  getExecutionStepFileTree: vi.fn(),
  getExecutionStepFileContent: vi.fn(),
};

function createMockReply() {
  return {
    code: vi.fn().mockReturnThis(),
  };
}

describe('ExecutionController', () => {
  let controller: ExecutionController;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [ExecutionController],
      providers: [
        { provide: ExecutionService, useValue: mockService },
        { provide: NodeSchedulerService, useValue: mockNodeScheduler },
        { provide: CheckpointService, useValue: mockCheckpointService },
        {
          provide: getQueueToken(EXECUTION_QUEUE),
          useValue: mockExecutionQueue,
        },
        { provide: SandboxAgentAdapter, useValue: mockSandboxAgentAdapter },
        {
          provide: WorkspaceIntegrationService,
          useValue: mockWorkspaceIntegrationService,
        },
      ],
    }).compile();

    controller = module.get(ExecutionController);
  });

  describe('runWorkflow', () => {
    it('应启动工作流执行并返回 { data }', async () => {
      mockService.runWorkflow.mockResolvedValue(mockExecution);
      const dto = {
        inputParams: { source: 'manual' },
        launchSource: undefined,
        schemaVersion: undefined,
      };

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

  describe('resumeExecution', () => {
    it('应恢复失败的执行并返回 202 { data }', async () => {
      const resumedExecution = {
        ...mockExecution,
        status: 'running' as const,
      };
      mockCheckpointService.resumeExecution.mockResolvedValue(resumedExecution);
      mockExecutionQueue.add.mockResolvedValue(undefined);

      const result = await controller.resumeExecution(
        EXECUTION_ID,
        {},
        TENANT_ID,
      );

      expect(result).toEqual({
        data: { ...resumedExecution, workflowId: WORKFLOW_ID },
      });
      expect(mockCheckpointService.resumeExecution).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        undefined,
      );
      expect(mockExecutionQueue.add).toHaveBeenCalledWith('resume-execution', {
        executionId: EXECUTION_ID,
        tenantId: TENANT_ID,
      });
    });

    it('应支持 fromNodeId 参数', async () => {
      const resumedExecution = {
        ...mockExecution,
        status: 'running' as const,
      };
      mockCheckpointService.resumeExecution.mockResolvedValue(resumedExecution);
      mockExecutionQueue.add.mockResolvedValue(undefined);

      const result = await controller.resumeExecution(
        EXECUTION_ID,
        { fromNodeId: 'node-2' },
        TENANT_ID,
      );

      expect(result).toEqual({
        data: { ...resumedExecution, workflowId: WORKFLOW_ID },
      });
      expect(mockCheckpointService.resumeExecution).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        'node-2',
      );
      expect(mockExecutionQueue.add).toHaveBeenCalledWith('resume-execution', {
        executionId: EXECUTION_ID,
        tenantId: TENANT_ID,
      });
    });
  });

  describe('workflow agent workspace', () => {
    it('应返回指定 step 的工作区文件树', async () => {
      const expected = [{ name: 'src', type: 'directory', path: 'src' }];
      mockWorkspaceIntegrationService.getExecutionStepFileTree.mockResolvedValue(
        expected,
      );

      await expect(
        controller.getStepWorkspaceTree(EXECUTION_ID, STEP_ID, TENANT_ID),
      ).resolves.toEqual(expected);

      expect(
        mockWorkspaceIntegrationService.getExecutionStepFileTree,
      ).toHaveBeenCalledWith(EXECUTION_ID, STEP_ID, TENANT_ID);
    });

    it('应返回指定 step 的工作区文件内容', async () => {
      const expected = {
        path: 'src/main.ts',
        content: 'console.log("hi")',
        size: 17,
        encoding: 'utf-8',
      };
      mockWorkspaceIntegrationService.getExecutionStepFileContent.mockResolvedValue(
        expected,
      );

      await expect(
        controller.getStepWorkspaceFile(
          EXECUTION_ID,
          STEP_ID,
          'src/main.ts',
          TENANT_ID,
        ),
      ).resolves.toEqual(expected);

      expect(
        mockWorkspaceIntegrationService.getExecutionStepFileContent,
      ).toHaveBeenCalledWith(EXECUTION_ID, STEP_ID, TENANT_ID, 'src/main.ts');
    });
  });

  describe('interveneStep', () => {
    it('应调用 resolveIntervention 并返回 202 数据', async () => {
      mockNodeScheduler.resolveIntervention.mockResolvedValue(undefined);
      const resolution = {
        action: 'approve' as const,
        feedback: '请继续执行该操作',
      };

      const result = await controller.interveneStep(
        EXECUTION_ID,
        STEP_ID,
        resolution,
        TENANT_ID,
        USER_ID,
      );

      expect(result).toEqual({
        data: {
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          status: 'intervention_accepted',
        },
      });
      expect(mockNodeScheduler.resolveIntervention).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
        USER_ID,
        resolution,
      );
    });

    it('当角色无权干预时应返回精确 403 载荷', async () => {
      const reply = createMockReply();
      mockNodeScheduler.resolveIntervention.mockRejectedValue(
        new InterventionPermissionDeniedException(),
      );

      await expect(
        controller.interveneStep(
          EXECUTION_ID,
          STEP_ID,
          { action: 'approve' },
          TENANT_ID,
          USER_ID,
          reply as never,
        ),
      ).resolves.toEqual({
        error: 'INTERVENTION_NOT_ALLOWED',
        message: 'Your role does not have permission to intervene on this node',
      });

      expect(reply.code).toHaveBeenCalledWith(403);
    });
  });

  describe('resolveToolPermission', () => {
    it('应调用 resolveToolPermission 并返回 202 数据 (approve)', async () => {
      mockNodeScheduler.resolveToolPermission.mockResolvedValue(undefined);

      const result = await controller.resolveToolPermission(
        EXECUTION_ID,
        STEP_ID,
        TOOL_CALL_ID,
        { action: 'approve' as const },
        TENANT_ID,
      );

      expect(result).toEqual({
        data: {
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          toolCallId: TOOL_CALL_ID,
          status: 'permission_resolved',
        },
      });
      expect(mockNodeScheduler.resolveToolPermission).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TOOL_CALL_ID,
        TENANT_ID,
        { toolCallId: TOOL_CALL_ID, action: 'approve' },
      );
    });

    it('应调用 resolveToolPermission 并返回 202 数据 (deny)', async () => {
      mockNodeScheduler.resolveToolPermission.mockResolvedValue(undefined);

      const result = await controller.resolveToolPermission(
        EXECUTION_ID,
        STEP_ID,
        TOOL_CALL_ID,
        { action: 'deny' as const },
        TENANT_ID,
      );

      expect(result).toEqual({
        data: {
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          toolCallId: TOOL_CALL_ID,
          status: 'permission_resolved',
        },
      });
      expect(mockNodeScheduler.resolveToolPermission).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TOOL_CALL_ID,
        TENANT_ID,
        { toolCallId: TOOL_CALL_ID, action: 'deny' },
      );
    });
  });

  describe('DLQ endpoints', () => {
    it('应返回死信队列中的失败任务列表', async () => {
      const dlqResult = {
        data: [
          {
            jobId: 'job-1',
            name: 'agent-task',
            data: { executionId: EXECUTION_ID, stepId: STEP_ID },
            failedReason: 'LLM 调用失败',
            attemptsMade: 4,
            timestamp: Date.now(),
            finishedOn: Date.now(),
            processedOn: Date.now(),
          },
        ],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      mockService.getDeadLetterJobs.mockResolvedValue(dlqResult);

      const result = await controller.listDeadLetterJobs(TENANT_ID, 1, 20);

      expect(result).toEqual(dlqResult);
      expect(mockService.getDeadLetterJobs).toHaveBeenCalledWith(
        TENANT_ID,
        1,
        20,
      );
    });

    it('应重试死信队列中的任务并返回 202', async () => {
      mockService.retryDeadLetterJob.mockResolvedValue(undefined);

      const result = await controller.retryDeadLetterJob('job-1', TENANT_ID);

      expect(result).toEqual({ data: { jobId: 'job-1', status: 'retrying' } });
      expect(mockService.retryDeadLetterJob).toHaveBeenCalledWith(
        TENANT_ID,
        'job-1',
      );
    });

    it('应丢弃死信队列中的任务并返回 200', async () => {
      mockService.discardDeadLetterJob.mockResolvedValue(undefined);

      const result = await controller.discardDeadLetterJob('job-1', TENANT_ID);

      expect(result).toEqual({
        data: { jobId: 'job-1', status: 'discarded' },
      });
      expect(mockService.discardDeadLetterJob).toHaveBeenCalledWith(
        TENANT_ID,
        'job-1',
      );
    });
  });

  describe('listPtySessions', () => {
    it('应代理获取 PTY 会话列表并返回 { data }', async () => {
      const sessions = [{ id: 'pty-1', title: 'bash' }];
      mockSandboxAgentAdapter.listPtySessions.mockResolvedValue(sessions);

      const result = await controller.listPtySessions(EXECUTION_ID, TENANT_ID);

      expect(result).toEqual({ data: sessions });
      expect(mockSandboxAgentAdapter.listPtySessions).toHaveBeenCalledWith(
        { executionId: EXECUTION_ID },
        TENANT_ID,
      );
    });

    it('沙箱不可用时应抛出 503', async () => {
      mockSandboxAgentAdapter.listPtySessions.mockRejectedValue(
        new Error('sandbox connection failed'),
      );

      await expect(
        controller.listPtySessions(EXECUTION_ID, TENANT_ID),
      ).rejects.toThrow(HttpException);

      try {
        await controller.listPtySessions(EXECUTION_ID, TENANT_ID);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(
          HttpStatus.SERVICE_UNAVAILABLE,
        );
        expect((e as HttpException).getResponse()).toEqual({
          error: 'SANDBOX_UNAVAILABLE',
          message: 'sandbox connection failed',
        });
      }
    });

    it('沙箱会话未找到时应返回空列表', async () => {
      mockSandboxAgentAdapter.listPtySessions.mockRejectedValue(
        new Error('sandbox session not found'),
      );

      await expect(
        controller.listPtySessions(EXECUTION_ID, TENANT_ID),
      ).resolves.toEqual({ data: [] });
    });

    it('沙箱已停止时也应返回空列表', async () => {
      mockSandboxAgentAdapter.listPtySessions.mockRejectedValue(
        new Error('Sandbox session sandbox-001 is stopped'),
      );

      await expect(
        controller.listPtySessions(EXECUTION_ID, TENANT_ID),
      ).resolves.toEqual({ data: [] });
    });
  });

  describe('ptyBufferDump', () => {
    it('应代理获取 PTY buffer 数据并返回 { data }', async () => {
      const bufferData = { lines: ['$ echo hello', 'hello'], totalLines: 2 };
      mockSandboxAgentAdapter.ptyBufferDump.mockResolvedValue(bufferData);

      const body = { sessionId: 'pty-1', offset: 0, limit: 100 };
      const result = await controller.ptyBufferDump(
        EXECUTION_ID,
        body,
        TENANT_ID,
      );

      expect(result).toEqual({ data: bufferData });
      expect(mockSandboxAgentAdapter.ptyBufferDump).toHaveBeenCalledWith(
        { executionId: EXECUTION_ID },
        TENANT_ID,
        'pty-1',
        { offset: 0, limit: 100 },
      );
    });

    it('应支持 pattern 参数', async () => {
      const bufferData = { lines: ['error: crash'], totalLines: 1 };
      mockSandboxAgentAdapter.ptyBufferDump.mockResolvedValue(bufferData);

      const body = { sessionId: 'pty-1', pattern: 'error' };
      const result = await controller.ptyBufferDump(
        EXECUTION_ID,
        body,
        TENANT_ID,
      );

      expect(result).toEqual({ data: bufferData });
      expect(mockSandboxAgentAdapter.ptyBufferDump).toHaveBeenCalledWith(
        { executionId: EXECUTION_ID },
        TENANT_ID,
        'pty-1',
        { pattern: 'error' },
      );
    });

    it('沙箱不可用时应抛出 503', async () => {
      mockSandboxAgentAdapter.ptyBufferDump.mockRejectedValue(
        new Error('container unavailable'),
      );

      await expect(
        controller.ptyBufferDump(
          EXECUTION_ID,
          { sessionId: 'pty-1' },
          TENANT_ID,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('ptyWrite', () => {
    it('应代理向 PTY 写入数据并返回 { data }', async () => {
      const writeResult = { success: true };
      mockSandboxAgentAdapter.ptyWrite.mockResolvedValue(writeResult);

      const body = { sessionId: 'pty-1', data: 'ls -la\n' };
      const result = await controller.ptyWrite(EXECUTION_ID, body, TENANT_ID);

      expect(result).toEqual({ data: writeResult });
      expect(mockSandboxAgentAdapter.ptyWrite).toHaveBeenCalledWith(
        { executionId: EXECUTION_ID },
        TENANT_ID,
        'pty-1',
        'ls -la\n',
      );
    });

    it('沙箱未找到时应抛出 404', async () => {
      mockSandboxAgentAdapter.ptyWrite.mockRejectedValue(
        new Error('sandbox session not found for execution'),
      );

      try {
        await controller.ptyWrite(
          EXECUTION_ID,
          { sessionId: 'pty-1', data: 'cmd' },
          TENANT_ID,
        );
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('沙箱不可用时应抛出 503', async () => {
      mockSandboxAgentAdapter.ptyWrite.mockRejectedValue(
        new Error('container timeout'),
      );

      try {
        await controller.ptyWrite(
          EXECUTION_ID,
          { sessionId: 'pty-1', data: 'cmd' },
          TENANT_ID,
        );
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    });
  });
});

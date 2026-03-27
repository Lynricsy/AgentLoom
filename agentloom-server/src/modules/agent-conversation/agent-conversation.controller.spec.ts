import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentConversationController } from './agent-conversation.controller';
import { SandboxAgentAdapter } from '../agent/sandbox-agent.adapter';
import { AgentConversationService } from './agent-conversation.service';
import { WorkspaceIntegrationService } from '../agent-execution/workspace-integration.service';

const mockService = {
  create: vi.fn(),
  listByAgent: vi.fn(),
  getDetail: vi.fn(),
  sendMessage: vi.fn(),
  cancel: vi.fn(),
  end: vi.fn(),
};

const mockWorkspaceIntegrationService = {
  getFileTree: vi.fn(),
  getFileContent: vi.fn(),
};

const mockSandboxAgentAdapter = {
  awaitToolPermission: vi.fn(),
  resolveConversationToolPermission: vi.fn(),
  ptyWrite: vi.fn(),
};

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const AGENT_ID = '33333333-3333-4333-8333-333333333333';
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';

describe('AgentConversationController', () => {
  let module: TestingModule;
  let controller: AgentConversationController;

  beforeEach(async () => {
    vi.clearAllMocks();

    module = await Test.createTestingModule({
      controllers: [AgentConversationController],
      providers: [
        { provide: AgentConversationService, useValue: mockService },
        {
          provide: WorkspaceIntegrationService,
          useValue: mockWorkspaceIntegrationService,
        },
        { provide: SandboxAgentAdapter, useValue: mockSandboxAgentAdapter },
      ],
    }).compile();

    controller = module.get(AgentConversationController);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('create', () => {
    it('应调用 service.create 并返回结果', async () => {
      const expected = { data: { id: CONVERSATION_ID } };
      mockService.create.mockResolvedValueOnce(expected);

      const result = await controller.create(AGENT_ID, TENANT_ID, USER_ID, {
        title: '新对话',
      } as any);

      expect(mockService.create).toHaveBeenCalledWith(
        AGENT_ID,
        TENANT_ID,
        USER_ID,
        { title: '新对话' },
      );
      expect(result).toEqual(expected);
    });

    it('service 抛出异常时应透传', async () => {
      mockService.create.mockRejectedValueOnce(
        new NotFoundException('Not found'),
      );

      await expect(
        controller.create(AGENT_ID, TENANT_ID, USER_ID, {} as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('应调用 service.listByAgent 并返回分页结果', async () => {
      const expected = {
        data: [],
        meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
      };
      mockService.listByAgent.mockResolvedValueOnce(expected);

      const query = { page: 1, limit: 20 } as any;
      const result = await controller.list(AGENT_ID, query);

      expect(mockService.listByAgent).toHaveBeenCalledWith(AGENT_ID, query);
      expect(result).toEqual(expected);
    });
  });

  describe('getDetail', () => {
    it('应调用 service.getDetail 并透传分页参数', async () => {
      const expected = { data: { id: CONVERSATION_ID, messages: {} } };
      mockService.getDetail.mockResolvedValueOnce(expected);

      const result = await controller.getDetail(CONVERSATION_ID, '2', '10');

      expect(mockService.getDetail).toHaveBeenCalledWith(
        CONVERSATION_ID,
        2,
        10,
      );
      expect(result).toEqual(expected);
    });

    it('分页参数为空时应传 undefined', async () => {
      const expected = { data: { id: CONVERSATION_ID } };
      mockService.getDetail.mockResolvedValueOnce(expected);

      await controller.getDetail(CONVERSATION_ID);

      expect(mockService.getDetail).toHaveBeenCalledWith(
        CONVERSATION_ID,
        undefined,
        undefined,
      );
    });
  });

  describe('sendMessage', () => {
    it('应调用 service.sendMessage', async () => {
      const expected = { data: { id: 'msg-1', content: '你好' } };
      mockService.sendMessage.mockResolvedValueOnce(expected);

      const dto = { content: '你好' } as any;
      const result = await controller.sendMessage(
        CONVERSATION_ID,
        TENANT_ID,
        dto,
      );

      expect(mockService.sendMessage).toHaveBeenCalledWith(
        CONVERSATION_ID,
        TENANT_ID,
        dto,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('cancel', () => {
    it('应调用 service.cancel', async () => {
      const expected = { data: { id: CONVERSATION_ID, status: 'ended' } };
      mockService.cancel.mockResolvedValueOnce(expected);

      const result = await controller.cancel(CONVERSATION_ID);

      expect(mockService.cancel).toHaveBeenCalledWith(CONVERSATION_ID);
      expect(result).toEqual(expected);
    });
  });

  describe('end', () => {
    it('应调用 service.end', async () => {
      mockService.end.mockResolvedValueOnce(undefined);

      await expect(controller.end(CONVERSATION_ID)).resolves.toBeUndefined();

      expect(mockService.end).toHaveBeenCalledWith(CONVERSATION_ID);
    });
  });

  describe('requestToolPermission', () => {
    it('应调用 sandbox adapter 等待权限结果', async () => {
      mockSandboxAgentAdapter.awaitToolPermission.mockResolvedValueOnce({
        allowed: true,
      });

      const dto = {
        toolCallId: 'tool-1',
        toolName: 'fs/write_text_file',
        input: { path: '/workspace/a.txt' },
      };

      const result = await controller.requestToolPermission(
        CONVERSATION_ID,
        dto,
      );

      expect(mockSandboxAgentAdapter.awaitToolPermission).toHaveBeenCalledWith(
        CONVERSATION_ID,
        dto,
      );
      expect(result).toEqual({ allowed: true });
    });
  });

  describe('resolveToolPermission', () => {
    it('应调用 sandbox adapter 解析权限并返回 accepted payload', async () => {
      mockSandboxAgentAdapter.resolveConversationToolPermission.mockResolvedValueOnce(
        undefined,
      );

      const result = await controller.resolveToolPermission(
        CONVERSATION_ID,
        'tool-1',
        { action: 'approve' } as any,
        TENANT_ID,
      );

      expect(
        mockSandboxAgentAdapter.resolveConversationToolPermission,
      ).toHaveBeenCalledWith(CONVERSATION_ID, 'tool-1', 'approve');
      expect(result).toEqual({
        data: {
          conversationId: CONVERSATION_ID,
          toolCallId: 'tool-1',
          status: 'permission_resolved',
        },
      });
    });
  });

  describe('ptyWrite', () => {
    it('应代理向对话关联沙箱的 PTY 写入数据并返回 { data }', async () => {
      const writeResult = { success: true };
      mockSandboxAgentAdapter.ptyWrite.mockResolvedValue(writeResult);

      const body = { sessionId: 'pty-1', data: 'ls -la\n' };
      const result = await controller.ptyWrite(
        CONVERSATION_ID,
        body,
        TENANT_ID,
      );

      expect(result).toEqual({ data: writeResult });
      expect(mockSandboxAgentAdapter.ptyWrite).toHaveBeenCalledWith(
        { agentConversationId: CONVERSATION_ID },
        TENANT_ID,
        'pty-1',
        'ls -la\n',
      );
    });

    it('沙箱会话未找到时应抛出 404', async () => {
      mockSandboxAgentAdapter.ptyWrite.mockRejectedValue(
        new Error('sandbox session not found'),
      );

      try {
        await controller.ptyWrite(
          CONVERSATION_ID,
          { sessionId: 'pty-1', data: 'cmd' },
          TENANT_ID,
        );
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect((e as HttpException).getResponse()).toEqual({
          error: 'SANDBOX_NOT_FOUND',
          message: 'sandbox session not found',
        });
      }
    });

    it('沙箱不可用时应抛出 503', async () => {
      mockSandboxAgentAdapter.ptyWrite.mockRejectedValue(
        new Error('container timeout'),
      );

      try {
        await controller.ptyWrite(
          CONVERSATION_ID,
          { sessionId: 'pty-1', data: 'cmd' },
          TENANT_ID,
        );
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(
          HttpStatus.SERVICE_UNAVAILABLE,
        );
        expect((e as HttpException).getResponse()).toEqual({
          error: 'SANDBOX_UNAVAILABLE',
          message: 'container timeout',
        });
      }
    });
  });
});

import type { AgentApiRun } from '@agentloom/contracts';
import { describe, expect, it, vi } from 'vitest';

import { AgentApiConversationNotFoundException } from '../../agent-api/agent-api.exceptions';
import type { AgentApiKeyContext } from '../../agent-api/agent-api.types';
import { A2aAgentNotFoundException, A2aRpcError } from '../a2a.exceptions';
import { A2aService } from '../a2a.service';
import {
  A2A_BLOCKING_WAIT_SECONDS,
  A2A_ERRORS,
  JSON_RPC_ERRORS,
  type SendMessageParams,
} from '../a2a.types';

const AGENT_ID = '019391d4-c000-7000-8000-000000000003';
const CONVERSATION_ID = '019391d4-e000-7000-8000-000000000005';
const RUN_ID = '019391d4-f000-7000-8000-000000000007';

const KEY: AgentApiKeyContext = {
  keyId: '019391d4-d000-7000-8000-000000000004',
  tenantId: '019391d4-a000-7000-8000-000000000001',
  agentDefinitionId: AGENT_ID,
  keyPrefix: 'alak_1a2b3c4d',
  maxConcurrentRuns: 5,
  rateLimitPerMinute: null,
};

function runDto(status: AgentApiRun['status']): AgentApiRun {
  return {
    id: RUN_ID,
    conversationId: CONVERSATION_ID,
    status,
    agentVersionId: null,
    input: {
      messageId: '019391d4-f000-7000-8000-000000000008',
      content: '你好',
    },
    output:
      status === 'completed'
        ? {
            messageId: '019391d4-f000-7000-8000-000000000009',
            content: '你好！',
            toolCalls: [],
          }
        : null,
    stopReason: status === 'completed' ? 'end_turn' : null,
    error: null,
    createdAt: '2026-10-01T08:00:00.000Z',
    startedAt: null,
    completedAt: null,
  };
}

function params(
  message: Partial<SendMessageParams['message']> = {},
  configuration?: SendMessageParams['configuration'],
): SendMessageParams {
  return {
    message: {
      messageId: 'm-1',
      role: 'ROLE_USER',
      parts: [{ text: '你好' }, { text: '请介绍一下自己' }],
      ...message,
    },
    ...(configuration ? { configuration } : {}),
  };
}

function createService(cardRows: unknown[] = []) {
  const chain = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(async () => cardRows),
  };
  const db = { select: vi.fn(() => chain) };
  const agentApi = {
    createConversation: vi.fn(async () => ({ id: CONVERSATION_ID })),
    getConversation: vi.fn(async () => ({ id: CONVERSATION_ID })),
    createRun: vi.fn(async () => ({ run: runDto('queued'), replayed: false })),
    waitForRun: vi.fn(async () => runDto('completed')),
    findRunById: vi.fn(async () => runDto('running')),
    cancelRun: vi.fn(async () => runDto('cancelled')),
  };
  const service = new A2aService(db as never, agentApi as never);
  return { service, agentApi, db };
}

describe('A2aService', () => {
  describe('getAgentCard', () => {
    it('已发布 Agent 返回 Agent Card，版本号取已发布版本', async () => {
      const { service } = createService([
        {
          name: '客服助手',
          description: '回答订单问题',
          versionNumber: 7,
          organizationName: 'Acme',
        },
      ]);

      const card = await service.getAgentCard(
        AGENT_ID,
        'https://agentloom.example.com',
      );

      expect(card.version).toBe('7');
      expect(card.supportedInterfaces[0]?.url).toBe(
        `https://agentloom.example.com/api/v1/a2a/agents/${AGENT_ID}/rpc`,
      );
    });

    it('不存在或未发布时 404，非法 id 不查库', async () => {
      const { service, db } = createService([]);
      await expect(
        service.getAgentCard(AGENT_ID, 'https://x.test'),
      ).rejects.toBeInstanceOf(A2aAgentNotFoundException);

      db.select.mockClear();
      await expect(
        service.getAgentCard('not-a-uuid', 'https://x.test'),
      ).rejects.toBeInstanceOf(A2aAgentNotFoundException);
      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('无 contextId 时新建对话，文本 parts 以换行拼接，messageId 作为幂等键并阻塞等待', async () => {
      const { service, agentApi } = createService();

      const result = await service.sendMessage(KEY, params());

      expect(agentApi.createConversation).toHaveBeenCalledWith(KEY, {});
      expect(agentApi.createRun).toHaveBeenCalledWith(KEY, CONVERSATION_ID, {
        body: { input: { content: '你好\n请介绍一下自己' } },
        idempotencyKey: 'a2a:m-1',
      });
      expect(agentApi.waitForRun).toHaveBeenCalledWith(
        KEY,
        runDto('queued'),
        A2A_BLOCKING_WAIT_SECONDS,
        undefined,
      );
      expect(result.task.status.state).toBe('TASK_STATE_COMPLETED');
      expect(result.task.artifacts[0]?.parts[0]?.text).toBe('你好！');
    });

    it('带 contextId 时复用该对话', async () => {
      const { service, agentApi } = createService();

      await service.sendMessage(KEY, params({ contextId: CONVERSATION_ID }));

      expect(agentApi.getConversation).toHaveBeenCalledWith(
        KEY,
        CONVERSATION_ID,
      );
      expect(agentApi.createConversation).not.toHaveBeenCalled();
    });

    it('contextId 不存在时报 -32602', async () => {
      const { service, agentApi } = createService();
      agentApi.getConversation.mockRejectedValueOnce(
        new AgentApiConversationNotFoundException(CONVERSATION_ID),
      );

      await expect(
        service.sendMessage(KEY, params({ contextId: CONVERSATION_ID })),
      ).rejects.toMatchObject({ code: JSON_RPC_ERRORS.InvalidParams });
    });

    it('returnImmediately 时不等待，直接返回 SUBMITTED', async () => {
      const { service, agentApi } = createService();

      const result = await service.sendMessage(
        KEY,
        params({}, { returnImmediately: true }),
      );

      expect(agentApi.waitForRun).not.toHaveBeenCalled();
      expect(result.task.status.state).toBe('TASK_STATE_SUBMITTED');
    });

    it('拒绝 taskId 续写、非文本 part 与非用户角色', async () => {
      const { service, agentApi } = createService();

      await expect(
        service.sendMessage(KEY, params({ taskId: RUN_ID })),
      ).rejects.toMatchObject({ code: A2A_ERRORS.UnsupportedOperation });
      await expect(
        service.sendMessage(
          KEY,
          params({ parts: [{ text: 'a' }, { url: 'https://x.test/f.png' }] }),
        ),
      ).rejects.toMatchObject({ code: A2A_ERRORS.ContentTypeNotSupported });
      await expect(
        service.sendMessage(KEY, params({ role: 'ROLE_AGENT' })),
      ).rejects.toBeInstanceOf(A2aRpcError);
      await expect(
        service.sendMessage(KEY, params({ parts: [{ text: '' }] })),
      ).rejects.toMatchObject({ code: JSON_RPC_ERRORS.InvalidParams });
      expect(agentApi.createRun).not.toHaveBeenCalled();
    });
  });

  describe('getTask / cancelTask / loadSubscribableRun', () => {
    it('按 run id 读取任务并按 historyLength 截断', async () => {
      const { service, agentApi } = createService();

      const task = await service.getTask(KEY, RUN_ID, 0);

      expect(agentApi.findRunById).toHaveBeenCalledWith(KEY, RUN_ID);
      expect(task.status.state).toBe('TASK_STATE_WORKING');
      expect(task.history).toBeUndefined();
    });

    it('取消时用 run 所属对话调用 cancelRun', async () => {
      const { service, agentApi } = createService();

      const task = await service.cancelTask(KEY, RUN_ID);

      expect(agentApi.cancelRun).toHaveBeenCalledWith(
        KEY,
        CONVERSATION_ID,
        RUN_ID,
      );
      expect(task.status.state).toBe('TASK_STATE_CANCELED');
    });

    it('终态任务不可订阅', async () => {
      const { service, agentApi } = createService();
      agentApi.findRunById.mockResolvedValueOnce(runDto('completed'));

      await expect(
        service.loadSubscribableRun(KEY, RUN_ID),
      ).rejects.toMatchObject({ code: A2A_ERRORS.UnsupportedOperation });
      await expect(service.loadSubscribableRun(KEY, RUN_ID)).resolves.toEqual(
        runDto('running'),
      );
    });
  });
});

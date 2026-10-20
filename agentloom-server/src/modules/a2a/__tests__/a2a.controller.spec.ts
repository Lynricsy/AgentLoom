import { EventEmitter } from 'node:events';

import type { FastifyReply } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { INVALID_JSON_BODY } from '../../../common/http/body-parsers';
import {
  ConcurrencyLimitExceededException,
  IdempotencyKeyReusedException,
  RunNotCancellableException,
} from '../../agent-api/agent-api.exceptions';
import type { AgentApiKeyContext } from '../../agent-api/agent-api.types';
import { A2aController } from '../a2a.controller';

const AGENT_ID = '019391d4-c000-7000-8000-000000000003';
const RUN_ID = '019391d4-f000-7000-8000-000000000007';

const KEY: AgentApiKeyContext = {
  keyId: '019391d4-d000-7000-8000-000000000004',
  tenantId: '019391d4-a000-7000-8000-000000000001',
  agentDefinitionId: AGENT_ID,
  keyPrefix: 'alak_1a2b3c4d',
  maxConcurrentRuns: 5,
  rateLimitPerMinute: null,
};

const TASK = { id: RUN_ID, status: { state: 'TASK_STATE_COMPLETED' } };

function createReply() {
  const sent: {
    status?: number;
    headers: Record<string, string>;
    body?: unknown;
  } = { headers: {} };
  const raw = Object.assign(new EventEmitter(), {
    headersSent: false,
    writableEnded: false,
  });
  const reply = {
    raw,
    sent: false,
    status(code: number) {
      sent.status = code;
      return reply;
    },
    header(name: string, value: string) {
      sent.headers[name] = value;
      return reply;
    },
    headers(values: Record<string, string>) {
      Object.assign(sent.headers, values);
      return reply;
    },
    send(body: unknown) {
      sent.body = body;
      return reply;
    },
  };
  return { reply: reply as unknown as FastifyReply, sent };
}

function createController(
  publicBaseUrl?: string,
  frontendUrl = 'https://studio.example.com',
) {
  const service = {
    getAgentCard: vi.fn(async () => ({ name: 'card' })),
    sendMessage: vi.fn(async () => ({ task: TASK })),
    startMessageRun: vi.fn(),
    getTask: vi.fn(async () => TASK),
    cancelTask: vi.fn(async () => TASK),
    loadSubscribableRun: vi.fn(),
  };
  const env: Record<string, string | undefined> = {
    APP_PUBLIC_BASE_URL: publicBaseUrl,
    APP_FRONTEND_URL: frontendUrl,
  };
  const config = { get: vi.fn((key: string) => env[key]) };
  const controller = new A2aController(
    service as never,
    {} as never,
    config as never,
  );
  return { controller, service };
}

function rpcBody(method: string, params?: unknown) {
  return { jsonrpc: '2.0', id: 'req-1', method, params };
}

async function call(
  body: unknown,
  options: { version?: string; agentId?: string; publicBaseUrl?: string } = {},
) {
  const { controller, service } = createController(options.publicBaseUrl);
  const { reply, sent } = createReply();
  await controller.rpc(
    KEY,
    options.agentId ?? AGENT_ID,
    options.version,
    body,
    reply,
  );
  return { sent, service };
}

describe('A2aController', () => {
  describe('getAgentCard', () => {
    it('优先使用 APP_PUBLIC_BASE_URL，去掉末尾斜杠', async () => {
      const { controller, service } = createController(
        'https://agentloom.example.com/',
      );

      await controller.getAgentCard(AGENT_ID);

      expect(service.getAgentCard).toHaveBeenCalledWith(
        AGENT_ID,
        'https://agentloom.example.com',
      );
    });

    it.each([
      ['未设置', undefined],
      // Compose 把未设置的变量注入为空串，ConfigService 会回落到 process.env 取回原值
      ['空串', ''],
      ['空白', '  '],
    ])(
      'APP_PUBLIC_BASE_URL %s时取 APP_FRONTEND_URL 的 origin，得到绝对地址',
      async (_label, publicBaseUrl) => {
        const { controller, service } = createController(
          publicBaseUrl,
          'https://agentloom.example.com/studio/',
        );

        await controller.getAgentCard(AGENT_ID);

        expect(service.getAgentCard).toHaveBeenCalledWith(
          AGENT_ID,
          'https://agentloom.example.com',
        );
      },
    );
  });

  describe('rpc', () => {
    it('SendMessage 返回 JSON-RPC result 并回显 id', async () => {
      const params = {
        message: {
          messageId: 'm-1',
          role: 'ROLE_USER',
          parts: [{ text: 'hi' }],
        },
      };
      const { sent, service } = await call(rpcBody('SendMessage', params), {
        version: '1.0',
      });

      expect(service.sendMessage).toHaveBeenCalledWith(
        KEY,
        params,
        expect.any(AbortSignal),
      );
      expect(sent).toEqual({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { jsonrpc: '2.0', id: 'req-1', result: { task: TASK } },
      });
    });

    it('GetTask / CancelTask 分派到对应服务方法', async () => {
      const get = await call(
        rpcBody('GetTask', { id: RUN_ID, historyLength: 1 }),
      );
      expect(get.service.getTask).toHaveBeenCalledWith(KEY, RUN_ID, 1);
      expect(get.sent.body).toEqual({
        jsonrpc: '2.0',
        id: 'req-1',
        result: TASK,
      });

      const cancel = await call(rpcBody('CancelTask', { id: RUN_ID }));
      expect(cancel.service.cancelTask).toHaveBeenCalledWith(KEY, RUN_ID);
    });

    it('A2A-Version 不是 1.0 时返回 -32009', async () => {
      const { sent, service } = await call(rpcBody('GetTask', { id: RUN_ID }), {
        version: '0.3',
      });

      expect(sent.status).toBe(200);
      expect(sent.body).toMatchObject({
        id: 'req-1',
        error: { code: -32009 },
      });
      expect(service.getTask).not.toHaveBeenCalled();
    });

    it('Key 不属于路径中的 Agent 时返回 -32600', async () => {
      const { sent } = await call(rpcBody('GetTask', { id: RUN_ID }), {
        agentId: '019391d4-c000-7000-8000-0000000000ff',
      });

      expect(sent.body).toMatchObject({
        error: {
          code: -32600,
          message: 'API key does not belong to this agent',
        },
      });
    });

    it('请求体不是 JSON-RPC 2.0 时返回 -32600，仍回显可识别的 id', async () => {
      const { sent } = await call({ id: 9, method: 'GetTask' });

      expect(sent.body).toEqual({
        jsonrpc: '2.0',
        id: 9,
        error: { code: -32600, message: 'Invalid Request' },
      });
    });

    it('请求体不是合法 JSON 时返回 -32700 Parse error（id 为 null，HTTP 200）', async () => {
      const { sent } = await call(INVALID_JSON_BODY);

      expect(sent.status).toBe(200);
      expect(sent.body).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      });
    });

    it('messageId 复用于不同内容时返回 -32602，文案指向 messageId 而非 Idempotency-Key', async () => {
      const { controller, service } = createController();
      service.sendMessage.mockRejectedValueOnce(
        new IdempotencyKeyReusedException(),
      );
      const { reply, sent } = createReply();

      await controller.rpc(
        KEY,
        AGENT_ID,
        undefined,
        rpcBody('SendMessage', {
          message: {
            messageId: 'm-1',
            role: 'ROLE_USER',
            parts: [{ text: 'other content' }],
          },
        }),
        reply,
      );

      expect(sent.body).toEqual({
        jsonrpc: '2.0',
        id: 'req-1',
        error: {
          code: -32602,
          message:
            'messageId was already used with different content or contextId',
        },
      });
    });

    it('params 校验失败返回 -32602 与 BadRequest 字段违规', async () => {
      const { sent } = await call(rpcBody('GetTask', {}));

      expect(sent.body).toMatchObject({
        error: {
          code: -32602,
          data: [
            {
              '@type': 'type.googleapis.com/google.rpc.BadRequest',
              fieldViolations: [expect.objectContaining({ field: 'id' })],
            },
          ],
        },
      });
    });

    it('不支持的方法：ListTasks -32004，推送配置 -32003，未知方法 -32601', async () => {
      expect((await call(rpcBody('ListTasks', {}))).sent.body).toMatchObject({
        error: { code: -32004 },
      });
      expect(
        (await call(rpcBody('GetExtendedAgentCard', {}))).sent.body,
      ).toMatchObject({ error: { code: -32004 } });
      expect(
        (await call(rpcBody('CreateTaskPushNotificationConfig', {}))).sent.body,
      ).toMatchObject({ error: { code: -32003 } });
      expect((await call(rpcBody('message/send', {}))).sent.body).toMatchObject(
        { error: { code: -32601 } },
      );
    });

    it('服务层领域异常映射为 A2A 错误码', async () => {
      const { controller, service } = createController();
      service.cancelTask.mockRejectedValueOnce(
        new RunNotCancellableException(RUN_ID),
      );
      const { reply, sent } = createReply();

      await controller.rpc(
        KEY,
        AGENT_ID,
        undefined,
        rpcBody('CancelTask', { id: RUN_ID }),
        reply,
      );

      expect(sent.status).toBe(200);
      expect(sent.body).toMatchObject({ error: { code: -32002 } });
    });

    it('并发超限返回 HTTP 429 与 Retry-After', async () => {
      const { controller, service } = createController();
      service.sendMessage.mockRejectedValueOnce(
        new ConcurrencyLimitExceededException(5),
      );
      const { reply, sent } = createReply();

      await controller.rpc(
        KEY,
        AGENT_ID,
        undefined,
        rpcBody('SendMessage', {
          message: {
            messageId: 'm-1',
            role: 'ROLE_USER',
            parts: [{ text: 'hi' }],
          },
        }),
        reply,
      );

      expect(sent.status).toBe(429);
      expect(sent.headers['Retry-After']).toBe('5');
      expect(sent.body).toMatchObject({ error: { code: -32004 } });
    });
  });
});

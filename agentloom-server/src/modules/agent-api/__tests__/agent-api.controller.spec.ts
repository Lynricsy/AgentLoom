import { EventEmitter } from 'node:events';

import type { AgentApiRun } from '@agentloom/contracts';
import type { FastifyReply } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { AgentApiController } from '../agent-api.controller';
import type { AgentApiKeyContext } from '../agent-api.types';

const CONVERSATION_ID = '019391d4-e000-7000-8000-000000000005';
const RUN_ID = '019391d4-f000-7000-8000-000000000007';
const RUN_LOCATION = `/api/v1/agent-api/conversations/${CONVERSATION_ID}/runs/${RUN_ID}`;

const KEY: AgentApiKeyContext = {
  keyId: '019391d4-d000-7000-8000-000000000004',
  tenantId: '019391d4-a000-7000-8000-000000000001',
  agentDefinitionId: '019391d4-c000-7000-8000-000000000003',
  keyPrefix: 'alak_1a2b3c4d',
  maxConcurrentRuns: 5,
  rateLimitPerMinute: null,
};

const BODY = { input: { content: '我的订单还没发货' } };

function runDto(status: AgentApiRun['status']): AgentApiRun {
  return {
    id: RUN_ID,
    conversationId: CONVERSATION_ID,
    status,
    agentVersionId: null,
    input: {
      messageId: '019391d4-f000-7000-8000-000000000008',
      content: BODY.input.content,
    },
    output: null,
    stopReason: null,
    error: null,
    createdAt: '2026-10-01T08:00:00.000Z',
    startedAt: null,
    completedAt: null,
  };
}

function createReply() {
  const sent: {
    status?: number;
    headers: Record<string, string>;
    body?: unknown;
  } = { headers: {} };
  const reply = {
    raw: new EventEmitter(),
    status(code: number) {
      sent.status = code;
      return reply;
    },
    header(name: string, value: string) {
      sent.headers[name] = value;
      return reply;
    },
    send(body: unknown) {
      sent.body = body;
      return reply;
    },
  };
  return { reply: reply as unknown as FastifyReply, sent };
}

function createController() {
  const service = {
    createRun: vi.fn(async () => ({ run: runDto('queued'), replayed: false })),
    waitForRun: vi.fn(async () => runDto('queued')),
    getRun: vi.fn(async () => runDto('running')),
  };
  const controller = new AgentApiController(service as never, {} as never);
  return { controller, service };
}

describe('AgentApiController', () => {
  describe('createRun', () => {
    it('默认返回 202，Location 指向 run 并带 Retry-After', async () => {
      const { controller } = createController();
      const { reply, sent } = createReply();

      await controller.createRun(
        KEY,
        CONVERSATION_ID,
        BODY,
        'application/json',
        undefined,
        undefined,
        reply,
      );

      expect(sent).toEqual({
        status: 202,
        headers: { Location: RUN_LOCATION, 'Retry-After': '2' },
        body: { data: runDto('queued') },
      });
    });

    it('Prefer wait 期内结束时返回 200 与 Preference-Applied', async () => {
      const { controller, service } = createController();
      service.waitForRun.mockResolvedValueOnce(runDto('completed'));
      const { reply, sent } = createReply();

      await controller.createRun(
        KEY,
        CONVERSATION_ID,
        BODY,
        undefined,
        'wait=30',
        undefined,
        reply,
      );

      expect(service.waitForRun).toHaveBeenCalledWith(
        KEY,
        runDto('queued'),
        30,
        expect.any(AbortSignal),
      );
      expect(sent).toEqual({
        status: 200,
        headers: { 'Preference-Applied': 'wait=30' },
        body: { data: runDto('completed') },
      });
    });

    it('Prefer wait 超时仍未结束时退回 202', async () => {
      const { controller, service } = createController();
      service.waitForRun.mockResolvedValueOnce(runDto('running'));
      const { reply, sent } = createReply();

      await controller.createRun(
        KEY,
        CONVERSATION_ID,
        BODY,
        undefined,
        'respond-async, wait=5',
        undefined,
        reply,
      );

      expect(sent.status).toBe(202);
      expect(sent.headers).toEqual({
        Location: RUN_LOCATION,
        'Retry-After': '2',
      });
      expect(sent.body).toEqual({ data: runDto('running') });
    });

    it.each(['wait=0', 'wait=61', 'wait=abc'])(
      '%s 返回 422 且不创建 run',
      async (prefer) => {
        const { controller, service } = createController();
        const { reply } = createReply();

        await expect(
          controller.createRun(
            KEY,
            CONVERSATION_ID,
            BODY,
            undefined,
            prefer,
            undefined,
            reply,
          ),
        ).rejects.toMatchObject({
          type: 'https://agentloom.dev/errors/validation-error',
          status: 422,
        });
        expect(service.createRun).not.toHaveBeenCalled();
      },
    );

    it('超长 Idempotency-Key 返回 422 且不创建 run', async () => {
      const { controller, service } = createController();
      const { reply } = createReply();

      await expect(
        controller.createRun(
          KEY,
          CONVERSATION_ID,
          BODY,
          undefined,
          undefined,
          'k'.repeat(256),
          reply,
        ),
      ).rejects.toMatchObject({ status: 422 });
      expect(service.createRun).not.toHaveBeenCalled();
    });
  });

  describe('getRun', () => {
    it.each([
      ['running', '2'],
      ['completed', undefined],
    ] as const)('%s 时 Retry-After=%s', async (status, retryAfter) => {
      const { controller, service } = createController();
      service.getRun.mockResolvedValueOnce(runDto(status));
      const { reply, sent } = createReply();

      await expect(
        controller.getRun(KEY, CONVERSATION_ID, RUN_ID, reply),
      ).resolves.toEqual({ data: runDto(status) });
      expect(sent.headers['Retry-After']).toBe(retryAfter);
    });
  });
});

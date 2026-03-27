import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';
import type { RawBodyRequest } from '@nestjs/common';

import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import { WebhookController } from '../webhook.controller';
import {
  TriggerNotFoundException,
  WebhookVerificationFailedException,
} from '../trigger.exceptions';

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: vi.fn(
    async (
      db: unknown,
      _tenantId: string,
      operation: (tenantDb: unknown) => Promise<unknown>,
    ) => operation(db),
  ),
}));

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';
const WORKFLOW_ID = '019391d4-b000-7000-0000-000000000002';
const TRIGGER_ID = '019391d4-c000-7000-0000-000000000003';
const EXECUTION_ID = '019391d4-d000-7000-0000-000000000004';

const webhookTrigger = {
  id: TRIGGER_ID,
  workflowDefinitionId: WORKFLOW_ID,
  tenantId: TENANT_ID,
  name: 'Webhook',
  description: null,
  type: 'webhook' as const,
  config: {
    token: 'webhook-token',
    secret: 'webhook-secret',
    ipWhitelist: ['127.0.0.1'],
  },
  isEnabled: true,
  lastTriggeredAt: null,
  nextFireAt: null,
  triggerCount: 0,
  createdBy: '019391d4-e000-7000-0000-000000000005',
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
};

function createMockRequest(
  overrides: Partial<RawBodyRequest<FastifyRequest>> = {},
): RawBodyRequest<FastifyRequest> {
  return {
    rawBody: Buffer.from('{"hello":"world"}'),
    body: { hello: 'world' },
    headers: {
      'x-agentloom-signature': 'signature',
      'x-agentloom-timestamp': '1735689600',
    },
    ip: '127.0.0.1',
    ...overrides,
  } as RawBodyRequest<FastifyRequest>;
}

function createMockReply() {
  return {
    code: vi.fn().mockReturnThis(),
  };
}

describe('WebhookController', () => {
  const db = {};
  const webhookService = {
    findTriggerByToken: vi.fn(),
    verifySignature: vi.fn(),
    checkIpWhitelist: vi.fn(),
  };
  const executionService = {
    runWorkflow: vi.fn(),
  };
  const triggerHistoryService = {
    record: vi.fn(),
  };
  const triggerService = {
    markTriggered: vi.fn(),
  };

  let controller: WebhookController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new WebhookController(
      db as never,
      webhookService as never,
      executionService as never,
      triggerHistoryService as never,
      triggerService as never,
    );
  });

  it('应处理 webhook 并返回 executionId', async () => {
    const reply = createMockReply();

    webhookService.findTriggerByToken.mockResolvedValue(webhookTrigger);
    executionService.runWorkflow.mockResolvedValue({ id: EXECUTION_ID });
    triggerHistoryService.record.mockResolvedValue(undefined);
    triggerService.markTriggered.mockResolvedValue(undefined);

    await expect(
      controller.handleWebhook(
        'webhook-token',
        createMockRequest(),
        reply as never,
      ),
    ).resolves.toEqual({
      executionId: EXECUTION_ID,
      status: 'accepted',
    });

    expect(webhookService.verifySignature).toHaveBeenCalled();
    expect(webhookService.checkIpWhitelist).toHaveBeenCalledWith(
      webhookTrigger,
      '127.0.0.1',
    );
    expect(runInTenantTransaction).toHaveBeenCalledWith(
      db,
      TENANT_ID,
      expect.any(Function),
    );
    expect(executionService.runWorkflow).toHaveBeenCalledWith(
      WORKFLOW_ID,
      {
        inputParams: { hello: 'world' },
        launchSource: 'webhook-trigger',
        triggerType: 'webhook',
      },
      TENANT_ID,
      '00000000-0000-0000-0000-000000000000',
    );
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('成功入队后即使 bookkeeping 失败也应继续返回 accepted', async () => {
    const reply = createMockReply();

    webhookService.findTriggerByToken.mockResolvedValue(webhookTrigger);
    executionService.runWorkflow.mockResolvedValue({ id: EXECUTION_ID });
    triggerHistoryService.record.mockRejectedValue(new Error('history failed'));

    await expect(
      controller.handleWebhook(
        'webhook-token',
        createMockRequest(),
        reply as never,
      ),
    ).resolves.toEqual({
      executionId: EXECUTION_ID,
      status: 'accepted',
    });

    expect(triggerHistoryService.record).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        triggerId: TRIGGER_ID,
        status: 'success',
        executionId: EXECUTION_ID,
      }),
    );
    expect(triggerService.markTriggered).not.toHaveBeenCalled();
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('应在触发器禁用时返回 404', async () => {
    const reply = createMockReply();

    webhookService.findTriggerByToken.mockResolvedValue({
      ...webhookTrigger,
      isEnabled: false,
    });

    await expect(
      controller.handleWebhook(
        'webhook-token',
        createMockRequest(),
        reply as never,
      ),
    ).rejects.toThrow(TriggerNotFoundException);

    expect(executionService.runWorkflow).not.toHaveBeenCalled();
    expect(triggerHistoryService.record).not.toHaveBeenCalled();
  });

  it('应在签名验证失败时返回精确 401 JSON 并记录 signature_failed 历史', async () => {
    const reply = createMockReply();

    webhookService.findTriggerByToken.mockResolvedValue(webhookTrigger);
    webhookService.verifySignature.mockImplementation(() => {
      throw new WebhookVerificationFailedException('签名验证失败');
    });
    triggerHistoryService.record.mockResolvedValue(undefined);

    await expect(
      controller.handleWebhook(
        'webhook-token',
        createMockRequest(),
        reply as never,
      ),
    ).resolves.toEqual({
      error: 'INVALID_SIGNATURE',
      message: 'Webhook signature verification failed',
    });

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(triggerHistoryService.record).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        triggerId: TRIGGER_ID,
        status: 'signature_failed',
      }),
    );
    expect(executionService.runWorkflow).not.toHaveBeenCalled();
    expect(triggerService.markTriggered).not.toHaveBeenCalled();
  });

  it('应为 webhook 路由声明 Public 元数据', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      WebhookController.prototype,
      'handleWebhook',
    );

    expect(descriptor?.value).toBeDefined();
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, descriptor?.value as object),
    ).toBe(true);
  });
});

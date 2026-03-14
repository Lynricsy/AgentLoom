import { createHmac } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import {
  TriggerNotFoundException,
  WebhookVerificationFailedException,
} from '../trigger.exceptions';
import { WebhookService } from '../webhook.service';

const mocks = vi.hoisted(() => ({
  createMockDb: () => ({
    select: vi.fn(),
  }),
}));

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';
const WORKFLOW_ID = '019391d4-b000-7000-0000-000000000002';
const TRIGGER_ID = '019391d4-c000-7000-0000-000000000003';
const NOW = new Date('2025-01-01T00:00:00.000Z');

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
  createdBy: '019391d4-d000-7000-0000-000000000004',
  createdAt: NOW,
  updatedAt: NOW,
};

function createSelectWhereResolved(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

describe('WebhookService', () => {
  let service: WebhookService;
  let db: ReturnType<typeof mocks.createMockDb>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    db = mocks.createMockDb();

    const module = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    service = module.get(WebhookService);
  });

  it('应通过有效的 webhook 签名验证', () => {
    const rawBody = Buffer.from('{"hello":"world"}');
    const timestamp = String(Math.floor(NOW.getTime() / 1000));
    const signature = createHmac('sha256', 'secret')
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');

    expect(() =>
      service.verifySignature('secret', rawBody, signature, timestamp),
    ).not.toThrow();
  });

  it('应在签名错误时抛出异常', () => {
    const rawBody = Buffer.from('{"hello":"world"}');
    const timestamp = String(Math.floor(NOW.getTime() / 1000));

    expect(() =>
      service.verifySignature('secret', rawBody, 'invalid-signature', timestamp),
    ).toThrow(WebhookVerificationFailedException);
  });

  it('应在时间戳过期时抛出异常', () => {
    const rawBody = Buffer.from('{"hello":"world"}');
    const expiredTimestamp = String(Math.floor(NOW.getTime() / 1000) - 1000);

    expect(() =>
      service.verifySignature(
        'secret',
        rawBody,
        'invalid-signature',
        expiredTimestamp,
      ),
    ).toThrow(WebhookVerificationFailedException);
  });

  it('应根据 token 查询 webhook 触发器', async () => {
    db.select.mockReturnValue(createSelectWhereResolved([webhookTrigger]));

    await expect(service.findTriggerByToken('webhook-token')).resolves.toEqual(
      webhookTrigger,
    );
  });

  it('查询不到 token 时应抛出异常', async () => {
    db.select.mockReturnValue(createSelectWhereResolved([]));

    await expect(service.findTriggerByToken('missing-token')).rejects.toThrow(
      TriggerNotFoundException,
    );
  });

  it('应校验 IP 白名单并兼容 IPv6 映射地址', () => {
    expect(() =>
      service.checkIpWhitelist(webhookTrigger, '::ffff:127.0.0.1'),
    ).not.toThrow();

    expect(() =>
      service.checkIpWhitelist(webhookTrigger, '10.0.0.1'),
    ).toThrow(WebhookVerificationFailedException);
  });
});

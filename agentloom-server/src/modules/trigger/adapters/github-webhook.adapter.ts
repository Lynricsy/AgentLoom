import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

import type { ApiEventTriggerConfig } from '../../../database/schema/workflow-triggers.schema';
import type { EventPayload, EventSourceAdapter } from './event-source.adapter';

@Injectable()
export class GithubWebhookAdapter implements EventSourceAdapter {
  private readonly logger = new Logger(GithubWebhookAdapter.name);

  readonly name = 'github';

  validateEvent(
    payload: EventPayload,
    config?: ApiEventTriggerConfig,
  ): boolean {
    const headers = payload.data.headers as
      | Record<string, string | undefined>
      | undefined;

    if (!headers) {
      this.logger.warn('GitHub 事件载荷缺少 headers');
      return false;
    }

    const signatureHeader =
      headers['x-hub-signature-256'] ?? headers['X-Hub-Signature-256'];

    if (!signatureHeader) {
      this.logger.warn('GitHub 事件缺少 X-Hub-Signature-256 请求头');
      return false;
    }

    // secret 来自 ApiEventTriggerConfig，复用 filterExpression 存储
    const secret = (config as Record<string, unknown> | undefined)?.[
      'secret'
    ] as string | undefined;
    if (!secret) {
      this.logger.warn('GitHub adapter 未配置 secret');
      return false;
    }

    const rawBody = payload.data.rawBody as string | undefined;
    if (!rawBody) {
      this.logger.warn('GitHub 事件载荷缺少 rawBody');
      return false;
    }

    const expectedSignature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const providedBuffer = Buffer.from(signatureHeader, 'utf8');

    if (expectedBuffer.length !== providedBuffer.length) {
      this.logger.warn('GitHub webhook 签名长度不匹配');
      return false;
    }

    if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
      this.logger.warn('GitHub webhook 签名验证失败');
      return false;
    }

    return true;
  }

  matchesTrigger(
    payload: EventPayload,
    triggerConfig: ApiEventTriggerConfig,
  ): boolean {
    if (!triggerConfig.eventType) {
      return true;
    }

    return (
      payload.type.toLowerCase() === triggerConfig.eventType.toLowerCase()
    );
  }
}

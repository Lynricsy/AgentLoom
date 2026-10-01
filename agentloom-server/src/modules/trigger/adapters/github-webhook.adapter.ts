import { Injectable, Logger } from '@nestjs/common';

import type { ApiEventTriggerConfig } from '../../../database/schema/workflow-triggers.schema';
import { isValidGithubSignature } from '../github-signature.util';
import { GITHUB_SIGNATURE_HEADER } from '../trigger.constants';
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
      Record<string, string | undefined> | undefined;

    if (!headers) {
      this.logger.warn('GitHub 事件载荷缺少 headers');
      return false;
    }

    const signatureHeader =
      headers[GITHUB_SIGNATURE_HEADER] ?? headers['X-Hub-Signature-256'];

    if (!signatureHeader) {
      this.logger.warn('GitHub 事件缺少 X-Hub-Signature-256 请求头');
      return false;
    }

    const secret = config?.secret;
    if (!secret) {
      this.logger.warn('GitHub adapter 未配置 secret');
      return false;
    }

    const rawBody = payload.data.rawBody as string | undefined;
    if (!rawBody) {
      this.logger.warn('GitHub 事件载荷缺少 rawBody');
      return false;
    }

    if (!isValidGithubSignature(secret, rawBody, signatureHeader)) {
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

    return payload.type.toLowerCase() === triggerConfig.eventType.toLowerCase();
  }
}

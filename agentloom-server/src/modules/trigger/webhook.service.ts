import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { WorkflowTrigger } from '../../database/schema/workflow-triggers.schema';
import { WebhookConfigSchema } from './dto/trigger.dto';
import { isIpAllowed } from './ip-allowlist.util';
import { WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS } from './trigger.constants';
import {
  TriggerNotFoundException,
  WebhookIpNotAllowedException,
  WebhookVerificationFailedException,
} from './trigger.exceptions';

@Injectable()
export class WebhookService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  verifySignature(
    secret: string,
    rawBody: Buffer,
    signatureHeader: string | undefined,
    timestampHeader: string | undefined,
  ): void {
    if (!signatureHeader || !timestampHeader) {
      throw new WebhookVerificationFailedException('缺少签名或时间戳请求头');
    }

    const timestamp = Number.parseInt(timestampHeader, 10);
    if (Number.isNaN(timestamp)) {
      throw new WebhookVerificationFailedException('Webhook 时间戳无效');
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (
      Math.abs(currentTimestamp - timestamp) >
      WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS
    ) {
      throw new WebhookVerificationFailedException('Webhook 时间戳已过期');
    }

    const expectedSignature = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const providedBuffer = Buffer.from(signatureHeader, 'utf8');

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new WebhookVerificationFailedException();
    }
  }

  async findTriggerByToken(token: string): Promise<WorkflowTrigger> {
    const [trigger] = await this.db
      .select()
      .from(schema.workflowTriggers)
      .where(
        and(
          eq(schema.workflowTriggers.type, 'webhook'),
          sql`${schema.workflowTriggers.config} ->> 'token' = ${token}`,
        ),
      );

    if (!trigger) {
      throw new TriggerNotFoundException(token);
    }

    return trigger;
  }

  checkIpWhitelist(
    trigger: WorkflowTrigger,
    clientIp: string | undefined,
  ): void {
    const config = WebhookConfigSchema.parse(trigger.config);

    if (!isIpAllowed(config.ipWhitelist, clientIp)) {
      throw new WebhookIpNotAllowedException(clientIp);
    }
  }
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { WorkflowTrigger } from '../../database/schema/workflow-triggers.schema';
import { WebhookConfigSchema } from './dto/trigger.dto';
import { isValidGithubSignature } from './github-signature.util';
import { isIpAllowed } from './ip-allowlist.util';
import {
  GITHUB_DELIVERY_DEDUP_TTL_SECONDS,
  WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
} from './trigger.constants';
import {
  TriggerNotFoundException,
  WebhookIpNotAllowedException,
  WebhookVerificationFailedException,
} from './trigger.exceptions';

@Injectable()
export class WebhookService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

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

  /** authMode 'github'：GitHub 不发送时间戳，只校验 `X-Hub-Signature-256: sha256=<hex>`。 */
  verifyGithubSignature(
    secret: string,
    rawBody: Buffer,
    signatureHeader: string | undefined,
  ): void {
    if (!signatureHeader) {
      throw new WebhookVerificationFailedException(
        '缺少 X-Hub-Signature-256 请求头',
      );
    }

    if (!isValidGithubSignature(secret, rawBody, signatureHeader)) {
      throw new WebhookVerificationFailedException();
    }
  }

  /**
   * 以 X-GitHub-Delivery 为幂等键占位：SET NX EX 是原子操作，并发的同一投递只有一个能拿到。
   * 返回 false 表示窗口内已处理（或正在处理）过该投递。
   */
  async claimGithubDelivery(
    triggerId: string,
    deliveryId: string,
  ): Promise<boolean> {
    const result = await this.redis.set(
      this.githubDeliveryKey(triggerId, deliveryId),
      '1',
      'EX',
      GITHUB_DELIVERY_DEDUP_TTL_SECONDS,
      'NX',
    );

    return result === 'OK';
  }

  /** 启动执行失败时释放占位，使 GitHub 的 Redeliver 可以重试。 */
  async releaseGithubDelivery(
    triggerId: string,
    deliveryId: string,
  ): Promise<void> {
    await this.redis.del(this.githubDeliveryKey(triggerId, deliveryId));
  }

  private githubDeliveryKey(triggerId: string, deliveryId: string): string {
    return `webhook:github-delivery:${triggerId}:${deliveryId}`;
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

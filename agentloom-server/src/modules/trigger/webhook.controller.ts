import { Inject, Logger, Res } from '@nestjs/common';
import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import { Public } from '../../common/decorators/public.decorator';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { ExecutionService } from '../execution/execution.service';
import { WebhookConfigSchema } from './dto/trigger.dto';
import { TriggerHistoryService } from './trigger-history.service';
import { TriggerService } from './trigger.service';
import {
  GITHUB_DELIVERY_HEADER,
  GITHUB_EVENT_HEADER,
  GITHUB_SIGNATURE_HEADER,
  SYSTEM_TRIGGER_USER_ID,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from './trigger.constants';
import {
  TriggerNotFoundException,
  WebhookIpNotAllowedException,
  WebhookVerificationFailedException,
} from './trigger.exceptions';
import { WebhookService } from './webhook.service';

type WebhookRequest = {
  rawBody?: Buffer;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
};

const INVALID_SIGNATURE_RESPONSE = {
  error: 'INVALID_SIGNATURE',
  message: 'Webhook signature verification failed',
} as const;

type WebhookAcceptedResponse = {
  executionId: string;
  status: 'accepted';
};

type WebhookSkippedResponse = {
  status: 'skipped';
  reason: 'github-ping' | 'duplicate-delivery';
};

/** authMode 'github' 下随请求进入启动参数与历史记录的 GitHub 投递元数据 */
type GithubDelivery = {
  event: string | undefined;
  deliveryId: string | undefined;
};

@ApiTags('Triggers')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly webhookService: WebhookService,
    private readonly executionService: ExecutionService,
    private readonly triggerHistoryService: TriggerHistoryService,
    private readonly triggerService: TriggerService,
  ) {}

  @Post(':token')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '接收公开 webhook 触发请求' })
  @ApiResponse({ status: 202, description: 'Webhook 已接受处理' })
  @ApiResponse({
    status: 200,
    description:
      'authMode=github：ping 事件或窗口内重复的 X-GitHub-Delivery，已验签但不启动执行',
  })
  @ApiResponse({ status: 401, description: 'Webhook 签名验证失败' })
  @ApiResponse({ status: 403, description: '来源 IP 不在白名单中' })
  async handleWebhook(
    @Param('token') token: string,
    @Req() request: WebhookRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<
    | WebhookAcceptedResponse
    | WebhookSkippedResponse
    | typeof INVALID_SIGNATURE_RESPONSE
  > {
    const trigger = await this.webhookService.findTriggerByToken(token);
    const rawBody = request.rawBody;
    // request.ip 由 Fastify trustProxy（APP_TRUST_PROXY_HOPS）解析；不得直接读取
    // X-Forwarded-For 首项——它由客户端任意填写，nginx 只会在末尾追加真实来源。
    const clientIp = request.ip;
    const requestBody = this.parseRequestBody(request);

    if (!trigger.isEnabled) {
      throw new TriggerNotFoundException(token);
    }

    try {
      this.webhookService.checkIpWhitelist(trigger, clientIp);
    } catch (error) {
      if (error instanceof WebhookIpNotAllowedException) {
        await runInTenantTransaction(this.db, trigger.tenantId, async () => {
          await this.triggerHistoryService.record(trigger.tenantId, {
            triggerId: trigger.id,
            status: 'ip_rejected',
            errorMessage: this.getErrorMessage(error),
            payload: this.buildPayload(clientIp, requestBody),
          });
        });
      }

      throw error;
    }

    let github: GithubDelivery | null = null;

    try {
      const webhookConfig = WebhookConfigSchema.parse(trigger.config);
      // 向后兼容：已有的 webhook 无 authMode 字段时视为 'signed'
      const authMode = webhookConfig.authMode ?? 'signed';

      if (authMode === 'signed') {
        if (!rawBody) {
          throw new WebhookVerificationFailedException('缺少原始请求体');
        }

        const signatureHeader = this.getHeaderValue(
          request.headers[WEBHOOK_SIGNATURE_HEADER],
        );
        const timestampHeader = this.getHeaderValue(
          request.headers[WEBHOOK_TIMESTAMP_HEADER],
        );

        this.webhookService.verifySignature(
          webhookConfig.secret,
          rawBody,
          signatureHeader,
          timestampHeader,
        );
      } else if (authMode === 'github') {
        if (!rawBody) {
          throw new WebhookVerificationFailedException('缺少原始请求体');
        }

        this.webhookService.verifyGithubSignature(
          webhookConfig.secret,
          rawBody,
          this.getHeaderValue(request.headers[GITHUB_SIGNATURE_HEADER]),
        );

        github = {
          event: this.getHeaderValue(request.headers[GITHUB_EVENT_HEADER]),
          deliveryId: this.getHeaderValue(
            request.headers[GITHUB_DELIVERY_HEADER],
          ),
        };
      }
    } catch (error) {
      if (error instanceof WebhookVerificationFailedException) {
        await runInTenantTransaction(this.db, trigger.tenantId, async () => {
          await this.triggerHistoryService.record(trigger.tenantId, {
            triggerId: trigger.id,
            status: 'signature_failed',
            errorMessage: this.getErrorMessage(error),
            payload: this.buildPayload(clientIp, requestBody),
          });
        });

        reply.code(HttpStatus.UNAUTHORIZED);

        return INVALID_SIGNATURE_RESPONSE;
      }

      throw error;
    }

    if (github) {
      const delivery = github;
      const skipReason = await this.resolveGithubSkipReason(
        trigger.id,
        delivery,
      );

      if (skipReason) {
        await runInTenantTransaction(this.db, trigger.tenantId, async () => {
          await this.triggerHistoryService.record(trigger.tenantId, {
            triggerId: trigger.id,
            status: 'skipped',
            errorMessage:
              skipReason === 'github-ping'
                ? 'GitHub ping 事件，不启动执行'
                : `重复的 GitHub 投递 ${delivery.deliveryId}，不再启动执行`,
            payload: this.buildPayload(
              clientIp,
              requestBody,
              this.githubPayloadMeta(delivery),
            ),
          });
        });

        reply.code(HttpStatus.OK);

        return { status: 'skipped', reason: skipReason };
      }
    }

    let execution: Awaited<ReturnType<ExecutionService['runWorkflow']>>;

    try {
      execution = await this.executionService.runWorkflow(
        trigger.workflowDefinitionId,
        {
          inputParams: this.buildInputParams(requestBody, github),
          launchSource: 'webhook-trigger',
          triggerType: 'webhook',
        },
        trigger.tenantId,
        SYSTEM_TRIGGER_USER_ID,
      );
    } catch (error) {
      if (github?.deliveryId) {
        await this.webhookService.releaseGithubDelivery(
          trigger.id,
          github.deliveryId,
        );
      }

      await this.recordFailedWebhookTrigger(
        trigger.tenantId,
        trigger.id,
        clientIp,
        requestBody,
        error,
      );
      throw error;
    }

    await this.recordSuccessfulWebhookTrigger(
      trigger.tenantId,
      trigger.id,
      execution.id,
      clientIp,
      requestBody,
      github,
    );

    this.logger.log(
      JSON.stringify({
        action: 'workflow_webhook_triggered',
        triggerId: trigger.id,
        executionId: execution.id,
        tenantId: trigger.tenantId,
      }),
    );

    return {
      executionId: execution.id,
      status: 'accepted',
    };
  }

  /**
   * GitHub 创建 webhook 时会先投递 `ping`，不应启动工作流；
   * 带 X-GitHub-Delivery 的投递在去重窗口内只启动一次（GitHub 总会发送该头，缺失时不去重）。
   */
  private async resolveGithubSkipReason(
    triggerId: string,
    github: GithubDelivery,
  ): Promise<WebhookSkippedResponse['reason'] | null> {
    if (github.event === 'ping') {
      return 'github-ping';
    }

    if (
      github.deliveryId &&
      !(await this.webhookService.claimGithubDelivery(
        triggerId,
        github.deliveryId,
      ))
    ) {
      return 'duplicate-delivery';
    }

    return null;
  }

  private githubPayloadMeta(
    github: GithubDelivery | null,
  ): Record<string, unknown> {
    if (!github) {
      return {};
    }

    return {
      githubEvent: github.event ?? null,
      githubDelivery: github.deliveryId ?? null,
    };
  }

  private async recordSuccessfulWebhookTrigger(
    tenantId: string,
    triggerId: string,
    executionId: string,
    clientIp: string | undefined,
    requestBody: unknown,
    github: GithubDelivery | null,
  ): Promise<void> {
    try {
      await runInTenantTransaction(this.db, tenantId, async () => {
        await this.triggerHistoryService.record(tenantId, {
          triggerId,
          status: 'success',
          executionId,
          payload: this.buildPayload(
            clientIp,
            requestBody,
            this.githubPayloadMeta(github),
          ),
        });

        await this.triggerService.markTriggered(tenantId, triggerId);
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          action: 'workflow_webhook_success_bookkeeping_failed',
          triggerId,
          executionId,
          tenantId,
          error: this.getErrorMessage(error),
        }),
      );
    }
  }

  private async recordFailedWebhookTrigger(
    tenantId: string,
    triggerId: string,
    clientIp: string | undefined,
    requestBody: unknown,
    error: unknown,
  ): Promise<void> {
    try {
      await runInTenantTransaction(this.db, tenantId, async () => {
        await this.triggerHistoryService.record(tenantId, {
          triggerId,
          status: 'failed',
          errorMessage: this.getErrorMessage(error),
          payload: this.buildPayload(clientIp, requestBody),
        });

        await this.triggerService.markTriggered(tenantId, triggerId);
      });
    } catch (bookkeepingError) {
      this.logger.error(
        JSON.stringify({
          action: 'workflow_webhook_failure_bookkeeping_failed',
          triggerId,
          tenantId,
          originalError: this.getErrorMessage(error),
          bookkeepingError: this.getErrorMessage(bookkeepingError),
        }),
      );
    }
  }

  private getHeaderValue(
    value: string | string[] | undefined,
  ): string | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }

    return value;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return '未知错误';
  }

  private parseRequestBody(request: WebhookRequest): unknown {
    if (request.body !== undefined) {
      return request.body;
    }

    if (!request.rawBody) {
      return null;
    }

    const rawBodyText = request.rawBody.toString('utf8');

    try {
      return JSON.parse(rawBodyText);
    } catch {
      return rawBodyText;
    }
  }

  private buildInputParams(
    body: unknown,
    github: GithubDelivery | null,
  ): Record<string, unknown> {
    const params = this.isRecord(body)
      ? { ...body }
      : { payload: body ?? null };

    if (!github) {
      return params;
    }

    // 与 API 事件触发器（api-event-ingestion.service）的 _eventSource/_eventType 约定一致
    return {
      ...params,
      _eventSource: 'github',
      ...(github.event ? { _eventType: github.event } : {}),
      ...(github.deliveryId ? { _deliveryId: github.deliveryId } : {}),
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private buildPayload(
    clientIp: string | undefined,
    requestBody: unknown,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      source: 'webhook',
      clientIp: clientIp ?? null,
      requestBody,
      ...extra,
    };
  }
}

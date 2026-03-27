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
import { WebhookConfigSchema } from './trigger-dto.compat';
import { TriggerHistoryService } from './trigger-history.service';
import { TriggerService } from './trigger.service';
import {
  SYSTEM_TRIGGER_USER_ID,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from './trigger.constants';
import {
  TriggerNotFoundException,
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
  @ApiResponse({ status: 401, description: 'Webhook 验证失败' })
  async handleWebhook(
    @Param('token') token: string,
    @Req() request: WebhookRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<WebhookAcceptedResponse | typeof INVALID_SIGNATURE_RESPONSE> {
    const trigger = await this.webhookService.findTriggerByToken(token);
    const rawBody = request.rawBody;
    const clientIp = this.getClientIp(request);
    const requestBody = this.parseRequestBody(request);

    if (!trigger.isEnabled) {
      throw new TriggerNotFoundException(token);
    }

    try {
      if (!rawBody) {
        throw new WebhookVerificationFailedException('缺少原始请求体');
      }

      const webhookConfig = WebhookConfigSchema.parse(trigger.config);
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
      this.webhookService.checkIpWhitelist(trigger, clientIp);
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

    let execution: Awaited<ReturnType<ExecutionService['runWorkflow']>>;

    try {
      execution = await this.executionService.runWorkflow(
        trigger.workflowDefinitionId,
        {
          inputParams: this.buildInputParams(requestBody),
          launchSource: 'webhook-trigger',
          triggerType: 'webhook',
        },
        trigger.tenantId,
        SYSTEM_TRIGGER_USER_ID,
      );
    } catch (error) {
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

  private async recordSuccessfulWebhookTrigger(
    tenantId: string,
    triggerId: string,
    executionId: string,
    clientIp: string | undefined,
    requestBody: unknown,
  ): Promise<void> {
    try {
      await runInTenantTransaction(this.db, tenantId, async () => {
        await this.triggerHistoryService.record(tenantId, {
          triggerId,
          status: 'success',
          executionId,
          payload: this.buildPayload(clientIp, requestBody),
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

  private getClientIp(request: WebhookRequest): string | undefined {
    const forwardedFor = request.headers['x-forwarded-for'];
    const headerValue = this.getHeaderValue(forwardedFor);

    if (headerValue) {
      return headerValue.split(',')[0]?.trim();
    }

    return request.ip;
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

  private buildInputParams(body: unknown): Record<string, unknown> {
    if (this.isRecord(body)) {
      return { ...body };
    }

    return {
      payload: body ?? null,
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

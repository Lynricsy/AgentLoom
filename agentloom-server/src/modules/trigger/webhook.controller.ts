import { Inject, Logger } from '@nestjs/common';
import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

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
import { WebhookVerificationFailedException } from './trigger.exceptions';
import { WebhookService } from './webhook.service';

type WebhookRequest = {
  rawBody?: Buffer;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '接收公开 webhook 触发请求' })
  @ApiResponse({ status: 200, description: 'Webhook 已接收' })
  @ApiResponse({ status: 401, description: 'Webhook 验证失败' })
  async handleWebhook(
    @Param('token') token: string,
    @Req() request: WebhookRequest,
  ): Promise<{ received: boolean; executionId: string | null }> {
    const trigger = await this.webhookService.findTriggerByToken(token);
    const rawBody = request.rawBody;

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
    const clientIp = this.getClientIp(request);

    this.webhookService.verifySignature(
      webhookConfig.secret,
      rawBody,
      signatureHeader,
      timestampHeader,
    );
    this.webhookService.checkIpWhitelist(trigger, clientIp);

    if (!trigger.isEnabled) {
      await runInTenantTransaction(this.db, trigger.tenantId, async () => {
        await this.triggerHistoryService.record(trigger.tenantId, {
          triggerId: trigger.id,
          status: 'skipped',
          payload: this.buildPayload(clientIp, { reason: 'trigger_disabled' }),
        });
      });

      return { received: true, executionId: null };
    }

    return runInTenantTransaction(this.db, trigger.tenantId, async () => {
      try {
        const execution = await this.executionService.runWorkflow(
          trigger.workflowDefinitionId,
          undefined,
          trigger.tenantId,
          SYSTEM_TRIGGER_USER_ID,
        );

        await this.triggerHistoryService.record(trigger.tenantId, {
          triggerId: trigger.id,
          status: 'success',
          executionId: execution.id,
          payload: this.buildPayload(clientIp),
        });

        await this.triggerService.markTriggered(trigger.tenantId, trigger.id);

        this.logger.log(
          JSON.stringify({
            action: 'workflow_webhook_triggered',
            triggerId: trigger.id,
            executionId: execution.id,
            tenantId: trigger.tenantId,
          }),
        );

        return {
          received: true,
          executionId: execution.id,
        };
      } catch (error) {
        await this.triggerHistoryService.record(trigger.tenantId, {
          triggerId: trigger.id,
          status: 'failed',
          errorMessage: this.getErrorMessage(error),
          payload: this.buildPayload(clientIp),
        });

        await this.triggerService.markTriggered(trigger.tenantId, trigger.id);

        throw error;
      }
    });
  }

  private getHeaderValue(value: string | string[] | undefined): string | undefined {
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

  private buildPayload(
    clientIp: string | undefined,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      source: 'webhook',
      clientIp: clientIp ?? null,
      ...extra,
    };
  }
}

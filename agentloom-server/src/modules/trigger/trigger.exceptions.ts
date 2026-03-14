import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';

export class TriggerNotFoundException extends DomainException {
  constructor(triggerId: string) {
    super({
      type: 'https://agentloom.dev/errors/trigger-not-found',
      title: '触发器不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `触发器 ${triggerId} 不存在`,
    });
  }
}

export class TriggerLimitExceededException extends DomainException {
  constructor(workflowId: string, limit: number) {
    super({
      type: 'https://agentloom.dev/errors/trigger-limit-exceeded',
      title: '触发器数量超限',
      status: HttpStatus.CONFLICT,
      detail: `工作流 ${workflowId} 的触发器数量已达上限 (${limit})`,
      extensions: {
        limit,
        workflowId,
      },
    });
  }
}

export class TriggerTypePreviewOnlyException extends DomainException {
  constructor(triggerType: 'api_event') {
    super({
      type: 'https://agentloom.dev/errors/trigger-type-preview-only',
      title: '触发器类型仅预览',
      status: HttpStatus.CONFLICT,
      detail: `触发器类型 ${triggerType} 当前仅支持预览，暂不允许创建、编辑或启用`,
      extensions: {
        triggerType,
      },
    });
  }
}

export class WebhookVerificationFailedException extends DomainException {
  constructor(reason: string = '签名验证失败') {
    super({
      type: 'https://agentloom.dev/errors/webhook-verification-failed',
      title: 'Webhook 验证失败',
      status: HttpStatus.UNAUTHORIZED,
      detail: reason,
    });
  }
}

export class WorkflowNotPublishedException extends DomainException {
  constructor(workflowId: string) {
    super({
      type: 'https://agentloom.dev/errors/workflow-not-published',
      title: '工作流未发布',
      status: HttpStatus.CONFLICT,
      detail: `工作流 ${workflowId} 未发布，无法创建触发器`,
      extensions: {
        workflowId,
      },
    });
  }
}

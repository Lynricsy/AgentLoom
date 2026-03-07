import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class WorkflowArchivedException extends DomainException {
  constructor(workflowId: string) {
    super({
      type: 'https://agentloom.dev/errors/workflow-archived',
      title: '工作流已归档',
      status: HttpStatus.CONFLICT,
      detail: `工作流 ${workflowId} 已归档，无法执行此操作`,
    });
  }
}

export class WorkflowPublishValidationException extends DomainException {
  constructor(reason: string) {
    super({
      type: 'https://agentloom.dev/errors/workflow-publish-validation',
      title: '工作流发布验证失败',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: reason,
    });
  }
}

export class InvalidStatusTransitionException extends DomainException {
  constructor(currentStatus: string, targetStatus: string) {
    super({
      type: 'https://agentloom.dev/errors/invalid-status-transition',
      title: '无效的状态转换',
      status: HttpStatus.CONFLICT,
      detail: `无法从 ${currentStatus} 转换为 ${targetStatus}`,
    });
  }
}

export class WorkflowNotFoundException extends DomainException {
  constructor(workflowId: string) {
    super({
      type: 'https://agentloom.dev/errors/workflow-not-found',
      title: '工作流不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `工作流 ${workflowId} 不存在`,
    });
  }
}

export class WorkflowVersionNotFoundException extends DomainException {
  constructor(versionId: string) {
    super({
      type: 'https://agentloom.dev/errors/workflow-version-not-found',
      title: '工作流版本不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `工作流版本 ${versionId} 不存在`,
    });
  }
}

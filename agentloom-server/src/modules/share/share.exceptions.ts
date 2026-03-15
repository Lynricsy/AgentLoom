import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';

export class ShareNotFoundException extends DomainException {
  constructor(identifier: string) {
    super({
      type: 'https://agentloom.dev/errors/share-not-found',
      title: '分享链接不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `分享链接 ${identifier} 不存在或无权访问`,
    });
  }
}

export class ShareExpiredException extends DomainException {
  constructor(token: string) {
    super({
      type: 'https://agentloom.dev/errors/share-expired',
      title: '分享链接已过期',
      status: HttpStatus.GONE,
      detail: `分享链接 ${token} 已过期，无法继续访问`,
    });
  }
}

export class ShareRevokedException extends DomainException {
  constructor(token: string) {
    super({
      type: 'https://agentloom.dev/errors/share-revoked',
      title: '分享链接已撤销',
      status: HttpStatus.GONE,
      detail: `分享链接 ${token} 已被撤销，无法继续访问`,
    });
  }
}

export class ShareWorkflowNotPublishedException extends DomainException {
  constructor(workflowDefinitionId: string) {
    super({
      type: 'https://agentloom.dev/errors/share-workflow-not-published',
      title: '工作流尚未发布',
      status: HttpStatus.CONFLICT,
      detail: `工作流 ${workflowDefinitionId} 尚未发布，无法创建或访问分享链接`,
    });
  }
}

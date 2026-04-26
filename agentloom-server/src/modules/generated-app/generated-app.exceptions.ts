import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';

export class GeneratedAppNotFoundException extends DomainException {
  constructor(idOrToken: string) {
    super({
      type: 'https://agentloom.dev/errors/generated-app-not-found',
      title: '生成应用不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `生成应用 ${idOrToken} 不存在或无权访问`,
    });
  }
}

export class GeneratedAppPublicShareNotReadyException extends DomainException {
  constructor(id: string, reason: string) {
    super({
      type: 'https://agentloom.dev/errors/generated-app-public-share-not-ready',
      title: '生成应用尚不可发布',
      status: HttpStatus.CONFLICT,
      detail: `生成应用 ${id} 尚未满足正式公开链接门槛：${reason}`,
    });
  }
}

export class GeneratedAppGateDefinitionNotFoundException extends DomainException {
  constructor(gateId: string) {
    super({
      type: 'https://agentloom.dev/errors/generated-app-gate-definition-not-found',
      title: '生成应用门禁定义不存在',
      status: HttpStatus.BAD_REQUEST,
      detail: `生成应用门禁 ${gateId} 不是当前支持的 Gate 0-7 门禁`,
    });
  }
}

export class GeneratedAppSubmissionNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: 'https://agentloom.dev/errors/generated-app-submission-not-found',
      title: '生成应用提交记录不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `生成应用提交记录 ${id} 不存在、已删除或无权访问`,
    });
  }
}

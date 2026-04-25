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

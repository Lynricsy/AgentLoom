import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';

export class PlatformApiTokenNotFoundException extends DomainException {
  constructor(identifier: string) {
    super({
      type: 'https://agentloom.dev/errors/platform-api-token-not-found',
      title: 'API Token 不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `API Token ${identifier} 不存在或无权访问`,
    });
  }
}

export class PlatformApiTokenAlreadyRevokedException extends DomainException {
  constructor(tokenId: string) {
    super({
      type: 'https://agentloom.dev/errors/platform-api-token-already-revoked',
      title: 'API Token 已撤销',
      status: HttpStatus.CONFLICT,
      detail: `API Token ${tokenId} 已经被撤销`,
    });
  }
}

export class PlatformApiTokenExpiredException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/platform-api-token-expired',
      title: 'API Token 已过期',
      status: HttpStatus.UNAUTHORIZED,
      detail: 'API Token 已过期，请创建新的 Token',
    });
  }
}

export class PlatformApiTokenInvalidException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/platform-api-token-invalid',
      title: 'API Token 无效',
      status: HttpStatus.UNAUTHORIZED,
      detail: '无效的 API Token',
    });
  }
}

export class PlatformApiTokenLimitExceededException extends DomainException {
  constructor(limit: number) {
    super({
      type: 'https://agentloom.dev/errors/platform-api-token-limit-exceeded',
      title: 'API Token 数量超限',
      status: HttpStatus.CONFLICT,
      detail: `每个用户在同一租户下最多创建 ${limit} 个 API Token`,
    });
  }
}

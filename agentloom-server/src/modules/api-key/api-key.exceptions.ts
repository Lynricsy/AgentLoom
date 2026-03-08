import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class ApiKeyNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: 'https://agentloom.dev/errors/api-key-not-found',
      title: 'API 密钥未找到',
      status: HttpStatus.NOT_FOUND,
      detail: `ID 为 ${id} 的 API 密钥不存在`,
    });
  }
}

export class ApiKeyRevokedException extends DomainException {
  constructor(id: string) {
    super({
      type: 'https://agentloom.dev/errors/api-key-revoked',
      title: 'API 密钥已撤销',
      status: HttpStatus.GONE,
      detail: `ID 为 ${id} 的 API 密钥已被撤销`,
    });
  }
}

export class DefaultApiKeyNotConfiguredException extends DomainException {
  constructor(provider: string) {
    super({
      type: 'https://agentloom.dev/errors/api-key-default-not-configured',
      title: '默认 API 密钥未配置',
      status: HttpStatus.NOT_FOUND,
      detail: `未找到提供商 ${provider} 的默认 API 密钥`,
    });
  }
}

export class InvalidProviderException extends DomainException {
  constructor(provider: string) {
    super({
      type: 'https://agentloom.dev/errors/invalid-provider',
      title: '无效的 LLM 提供商',
      status: HttpStatus.BAD_REQUEST,
      detail: `提供商 "${provider}" 不是有效的 LLM 提供商`,
    });
  }
}

export class ApiKeyLimitExceededException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/api-key-limit-exceeded',
      title: 'API 密钥数量超限',
      status: HttpStatus.CONFLICT,
      detail: '已达到 API 密钥数量上限',
    });
  }
}

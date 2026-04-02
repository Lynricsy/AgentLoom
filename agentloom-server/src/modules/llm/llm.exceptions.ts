import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';

export class LlmModelConfigNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: 'https://agentloom.dev/errors/llm/config-not-found',
      title: 'LLM 模型配置未找到',
      status: HttpStatus.NOT_FOUND,
      detail: `未找到 ID 为 ${id} 的 LLM 模型配置`,
    });
  }
}

export class LlmModelConfigConflictException extends DomainException {
  constructor(name: string) {
    super({
      type: 'https://agentloom.dev/errors/llm/config-name-conflict',
      title: 'LLM 模型配置名称冲突',
      status: HttpStatus.CONFLICT,
      detail: `组织中已存在名称为 "${name}" 的 LLM 模型配置`,
    });
  }
}

export class LlmTimeoutException extends DomainException {
  constructor(provider: string, detail?: string) {
    super({
      type: 'https://agentloom.dev/errors/llm/timeout',
      title: 'LLM 提供商请求超时',
      status: HttpStatus.GATEWAY_TIMEOUT,
      detail: detail ?? `LLM 提供商 ${provider} 请求超时`,
    });
  }
}

export class LlmModelConfigValidationException extends DomainException {
  constructor(detail: string) {
    super({
      type: 'https://agentloom.dev/errors/llm/config-validation',
      title: 'LLM 模型配置验证失败',
      status: HttpStatus.BAD_REQUEST,
      detail,
    });
  }
}

export class LlmProviderException extends DomainException {
  constructor(
    provider: string,
    detail?: string,
    extensions?: Record<string, unknown>,
  ) {
    super({
      type: 'https://agentloom.dev/errors/llm/provider-error',
      title: 'LLM 提供商错误',
      status: HttpStatus.BAD_GATEWAY,
      detail: detail ?? `LLM 提供商 ${provider} 返回错误`,
      extensions,
    });
  }
}

export class LlmProviderNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: 'https://agentloom.dev/errors/llm/provider-not-found',
      title: 'LLM 提供商未找到',
      status: HttpStatus.NOT_FOUND,
      detail: `未找到 ID 为 ${id} 的 LLM 提供商`,
    });
  }
}

export class LlmProviderSlugConflictException extends DomainException {
  constructor(slug: string) {
    super({
      type: 'https://agentloom.dev/errors/llm/provider-slug-conflict',
      title: 'LLM 提供商标识冲突',
      status: HttpStatus.CONFLICT,
      detail: `组织中已存在标识为 "${slug}" 的 LLM 提供商`,
    });
  }
}

export class LlmProviderDeletionForbiddenException extends DomainException {
  constructor(slug: string) {
    super({
      type: 'https://agentloom.dev/errors/llm/provider-deletion-forbidden',
      title: '内置提供商不可删除',
      status: HttpStatus.FORBIDDEN,
      detail: `内置提供商 "${slug}" 不可删除，只能禁用`,
    });
  }
}

import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';

export class SandboxCreationException extends DomainException {
  constructor(reason: string) {
    super({
      type: 'https://agentloom.dev/errors/sandbox-creation-failed',
      title: '沙箱容器创建失败',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: `Failed to create sandbox container: ${reason}`,
    });
  }
}

export class SandboxTimeoutException extends DomainException {
  constructor(timeout: number) {
    super({
      type: 'https://agentloom.dev/errors/sandbox-timeout',
      title: '沙箱容器超时',
      status: HttpStatus.GATEWAY_TIMEOUT,
      detail: `Sandbox container exceeded timeout: ${timeout}h`,
    });
  }
}

export class SandboxDestroyException extends DomainException {
  constructor(reason: string) {
    super({
      type: 'https://agentloom.dev/errors/sandbox-destroy-failed',
      title: '沙箱容器销毁失败',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: `Failed to destroy sandbox container: ${reason}`,
    });
  }
}

export class SandboxConfigValidationException extends DomainException {
  constructor(details: string) {
    super({
      type: 'https://agentloom.dev/errors/sandbox-config-validation',
      title: '沙箱配置验证失败',
      status: HttpStatus.BAD_REQUEST,
      detail: `Invalid sandbox configuration: ${details}`,
    });
  }
}

export class SandboxNotFoundException extends DomainException {
  constructor(executionId: string) {
    super({
      type: 'https://agentloom.dev/errors/sandbox-not-found',
      title: '沙箱会话未找到',
      status: HttpStatus.NOT_FOUND,
      detail: `Sandbox session not found for execution: ${executionId}`,
    });
  }
}

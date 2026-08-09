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

export class SandboxContainerNotFoundException extends SandboxCreationException {
  constructor(containerId: string) {
    super(`Container ${containerId} not found`);
  }
}

export class SandboxTimeoutException extends DomainException {
  constructor(timeoutLabel: string) {
    super({
      type: 'https://agentloom.dev/errors/sandbox-timeout',
      title: '沙箱容器超时',
      status: HttpStatus.GATEWAY_TIMEOUT,
      detail: `Sandbox container exceeded timeout: ${timeoutLabel}`,
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

export class SandboxNotPersistentException extends DomainException {
  constructor(sessionId: string) {
    super({
      type: 'https://agentloom.dev/errors/sandbox-not-persistent',
      title: '沙箱不是持久类型',
      status: HttpStatus.BAD_REQUEST,
      detail: `Sandbox session ${sessionId} is not a persistent sandbox`,
    });
  }
}

export class SandboxInvalidStateException extends DomainException {
  constructor(sessionId: string, currentStatus: string, action: string) {
    super({
      type: 'https://agentloom.dev/errors/sandbox-invalid-state',
      title: '沙箱状态不允许此操作',
      status: HttpStatus.CONFLICT,
      detail: `Cannot ${action} sandbox ${sessionId}: current status is ${currentStatus}`,
    });
  }
}

export class SandboxStatsUnavailableException extends DomainException {
  constructor(sessionId: string) {
    super({
      type: 'https://agentloom.dev/errors/sandbox-stats-unavailable',
      title: '沙箱统计信息不可用',
      status: HttpStatus.CONFLICT,
      detail: `Container stats unavailable for sandbox ${sessionId}: container is not running`,
    });
  }
}

export class SandboxProcessesUnavailableException extends DomainException {
  constructor(sessionId: string) {
    super({
      type: 'https://agentloom.dev/errors/sandbox-processes-unavailable',
      title: '沙箱进程列表不可用',
      status: HttpStatus.CONFLICT,
      detail: `Container process list unavailable for sandbox ${sessionId}: container is not running`,
    });
  }
}

export class SandboxMaintenanceException extends DomainException {
  constructor(action: 'create' | 'start' | 'execute') {
    super({
      type: 'https://agentloom.dev/errors/sandbox-maintenance',
      title: '沙箱运行时正在维护',
      status: HttpStatus.SERVICE_UNAVAILABLE,
      detail: `Cannot ${action} sandbox while runtime maintenance mode is enabled`,
    });
  }
}

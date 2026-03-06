import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class TenantRequiredException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/tenant-required',
      title: '租户上下文缺失',
      status: HttpStatus.BAD_REQUEST,
      detail: '请求缺少租户上下文，请先选择组织后重试',
    });
  }
}

export class InvalidTenantContextException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/tenant-context-invalid',
      title: '租户上下文无效',
      status: HttpStatus.BAD_REQUEST,
      detail: '请求中的租户上下文无效，请重新选择组织后重试',
    });
  }
}

export class InsufficientPermissionsException extends DomainException {
  constructor(requiredRoles: string[], currentRole?: string) {
    const detail = currentRole
      ? `当前角色 "${currentRole}" 无权执行此操作，需要角色：${requiredRoles.join(', ')}`
      : `无权执行此操作，需要角色：${requiredRoles.join(', ')}`;

    super({
      type: 'https://agentloom.dev/errors/insufficient-permissions',
      title: '权限不足',
      status: HttpStatus.FORBIDDEN,
      detail,
    });
  }
}

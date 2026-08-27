import { DomainException } from '../../../common/exceptions/domain.exception';

export class TenantKeyNotFoundException extends DomainException {
  constructor(keyId: string) {
    super({
      type: 'https://agentloom.dev/errors/tenant-key-not-found',
      title: '租户密钥不存在',
      status: 404,
      detail: `未找到 ID 为 ${keyId} 的租户加密密钥`,
    });
  }
}

// 租户未关联组织属于可预期的领域状态，不能泄漏为数据库参数错误 500。
export class TenantOrganizationNotFoundException extends DomainException {
  constructor(tenantId: string) {
    super({
      type: 'https://agentloom.dev/errors/tenant-organization-not-found',
      title: '租户组织不存在',
      status: 404,
      detail: `租户 ${tenantId} 未关联组织，无法管理租户密钥`,
    });
  }
}

export class TenantKeyAlreadyExistsException extends DomainException {
  constructor(orgId: string) {
    super({
      type: 'https://agentloom.dev/errors/tenant-key-already-exists',
      title: '租户密钥已存在',
      status: 409,
      detail: `组织 ${orgId} 已存在活跃的加密密钥，请使用轮换功能更新密钥`,
    });
  }
}

export class TenantKeyInvalidException extends DomainException {
  constructor(reason: string) {
    super({
      type: 'https://agentloom.dev/errors/tenant-key-invalid',
      title: '无效的加密密钥',
      status: 400,
      detail: reason,
    });
  }
}

export class TenantKeyRevokedException extends DomainException {
  constructor(keyId: string) {
    super({
      type: 'https://agentloom.dev/errors/tenant-key-revoked',
      title: '密钥已被撤销',
      status: 409,
      detail: `密钥 ${keyId} 已被撤销，无法执行此操作`,
    });
  }
}

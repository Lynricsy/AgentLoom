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

export class OAuthProviderNotSupportedException extends DomainException {
  constructor(provider: string) {
    super({
      type: 'https://agentloom.dev/errors/unsupported-oauth-provider',
      title: 'OAuth 提供商不支持',
      status: HttpStatus.BAD_REQUEST,
      detail: `不支持的 OAuth 提供商：${provider}`,
    });
  }
}

export class OAuthCallbackException extends DomainException {
  constructor(detail?: string) {
    super({
      type: 'https://agentloom.dev/errors/oauth-callback-failed',
      title: 'OAuth 回调失败',
      status: HttpStatus.BAD_REQUEST,
      detail: detail ?? 'OAuth 回调处理失败，请重试',
    });
  }
}

export class MfaEnrollmentException extends DomainException {
  constructor(detail?: string) {
    super({
      type: 'https://agentloom.dev/errors/mfa-enrollment-failed',
      title: 'MFA 注册失败',
      status: HttpStatus.BAD_REQUEST,
      detail: detail ?? 'MFA TOTP 注册失败，请重试',
    });
  }
}

export class MfaVerificationException extends DomainException {
  constructor(detail?: string) {
    super({
      type: 'https://agentloom.dev/errors/mfa-verification-failed',
      title: 'MFA 验证失败',
      status: HttpStatus.UNAUTHORIZED,
      detail: detail ?? 'MFA 验证码无效或已过期',
    });
  }
}

export class MfaRequiredException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/mfa-required',
      title: '需要 MFA 验证',
      status: HttpStatus.FORBIDDEN,
      detail: '此账号已启用多因素认证，请提供 MFA 验证码',
    });
  }
}

export class MfaNotEnrolledException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/mfa-not-enrolled',
      title: 'MFA 未注册',
      status: HttpStatus.BAD_REQUEST,
      detail: '当前账号未注册 MFA，请先完成 MFA 注册',
    });
  }
}

export class MfaAlreadyEnrolledException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/mfa-already-enrolled',
      title: 'MFA 已注册',
      status: HttpStatus.CONFLICT,
      detail: '当前账号已注册 MFA，如需重新注册请先禁用现有 MFA',
    });
  }
}

export class OAuthInitiationException extends DomainException {
  constructor(provider: string, detail?: string) {
    super({
      type: 'https://agentloom.dev/errors/oauth-initiation-failed',
      title: 'OAuth 发起失败',
      status: HttpStatus.BAD_GATEWAY,
      detail: detail ?? `发起 ${provider} OAuth 授权流程失败`,
    });
  }
}

export class MfaFactorNotFoundException extends DomainException {
  constructor(factorId: string, detail?: string) {
    super({
      type: 'https://agentloom.dev/errors/mfa-factor-not-found',
      title: 'MFA 因子未找到',
      status: HttpStatus.NOT_FOUND,
      detail: detail ?? `未找到 MFA 因子：${factorId}`,
    });
  }
}

export class MfaDisableException extends DomainException {
  constructor(detail?: string) {
    super({
      type: 'https://agentloom.dev/errors/mfa-disable-failed',
      title: 'MFA 禁用失败',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: detail ?? '禁用 MFA 因子失败，请重试',
    });
  }
}

export class Aal2RequiredException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/aal2-required',
      title: '需要 AAL2 认证',
      status: HttpStatus.FORBIDDEN,
      detail: '此操作需要 AAL2 认证级别，请先完成 MFA 验证',
    });
  }
}

export class MfaTokenExpiredException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/mfa-token-expired',
      title: 'MFA 令牌已过期',
      status: HttpStatus.UNAUTHORIZED,
      detail: 'MFA 临时令牌已过期，请重新登录',
    });
  }
}

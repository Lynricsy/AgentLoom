import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class OrganizationNotFoundException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/organization-not-found',
      title: '组织未找到',
      status: HttpStatus.NOT_FOUND,
      detail: '指定的组织不存在或已被删除',
    });
  }
}

export class OrganizationSlugConflictException extends DomainException {
  constructor(slug: string) {
    super({
      type: 'https://agentloom.dev/errors/organization-slug-conflict',
      title: '组织标识冲突',
      status: HttpStatus.CONFLICT,
      detail: `组织标识 "${slug}" 已被使用`,
    });
  }
}

export class InsufficientOrganizationPermissionException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/insufficient-organization-permission',
      title: '权限不足',
      status: HttpStatus.FORBIDDEN,
      detail: '您没有执行此操作的权限',
    });
  }
}

export class InvitationNotFoundException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/invitation-not-found',
      title: '邀请未找到',
      status: HttpStatus.NOT_FOUND,
      detail: '指定的邀请不存在',
    });
  }
}

export class InvitationExpiredOrUsedException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/invitation-expired-or-used',
      title: '邀请已过期或已使用',
      status: HttpStatus.GONE,
      detail: '该邀请链接已过期或已被使用',
    });
  }
}

export class PendingInvitationExistsException extends DomainException {
  constructor(email: string) {
    super({
      type: 'https://agentloom.dev/errors/pending-invitation-exists',
      title: '重复邀请',
      status: HttpStatus.CONFLICT,
      detail: `该邮箱 "${email}" 已有待处理的邀请`,
    });
  }
}

export class AlreadyOrganizationMemberException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/already-organization-member',
      title: '已是组织成员',
      status: HttpStatus.CONFLICT,
      detail: '该用户已经是此组织的成员',
    });
  }
}

export class SoleOwnerConstraintException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/sole-owner-constraint',
      title: '唯一所有者约束',
      status: HttpStatus.CONFLICT,
      detail: '无法移除或降级组织的唯一所有者，请先转让所有权',
    });
  }
}

export class AdminCannotInviteOwnerException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/admin-cannot-invite-owner',
      title: '权限不足',
      status: HttpStatus.FORBIDDEN,
      detail: '管理员不能邀请用户为所有者角色',
    });
  }
}

export class AdminCannotRemoveOwnerException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/admin-cannot-remove-owner',
      title: '权限不足',
      status: HttpStatus.FORBIDDEN,
      detail: '管理员不能移除或修改所有者的角色',
    });
  }
}

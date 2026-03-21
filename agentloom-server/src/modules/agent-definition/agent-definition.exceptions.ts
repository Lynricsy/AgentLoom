import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class AgentNotFoundException extends DomainException {
  constructor(agentId: string) {
    super({
      type: 'https://agentloom.dev/errors/agent-not-found',
      title: 'Agent 不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `Agent ${agentId} 不存在`,
    });
  }
}

export class AgentArchivedException extends DomainException {
  constructor(agentId: string) {
    super({
      type: 'https://agentloom.dev/errors/agent-archived',
      title: 'Agent 已归档',
      status: HttpStatus.CONFLICT,
      detail: `Agent ${agentId} 已归档，无法执行此操作`,
    });
  }
}

export class AgentVersionConflictException extends DomainException {
  constructor(agentId: string, currentVersion: number) {
    super({
      type: 'https://agentloom.dev/errors/agent-version-conflict',
      title: '版本冲突',
      status: HttpStatus.CONFLICT,
      detail: `Agent ${agentId} 已被其他用户修改，请刷新后重试`,
      extensions: {
        currentVersion,
      },
      errors: [
        {
          field: 'version',
          message: `当前版本为 ${currentVersion}`,
        },
      ],
    });
  }
}

export class AgentVersionNotFoundException extends DomainException {
  constructor(versionId: string) {
    super({
      type: 'https://agentloom.dev/errors/agent-version-not-found',
      title: 'Agent 版本不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `Agent 版本 ${versionId} 不存在`,
    });
  }
}

export class AgentPublishValidationException extends DomainException {
  constructor(reasons: string | string[]) {
    const validationReasons = Array.isArray(reasons) ? reasons : [reasons];

    super({
      type: 'https://agentloom.dev/errors/agent-publish-validation',
      title: 'Agent 发布验证失败',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: validationReasons[0] ?? 'Agent 发布校验失败',
      errors: validationReasons.map((message) => ({
        field: 'agent',
        message,
      })),
    });
  }
}

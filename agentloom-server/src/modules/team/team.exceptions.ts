import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';
import { problemType } from '../../common/exceptions/problem-type';

/** 团队节点配置在运行时校验失败（成员 Agent 未发布、版本不匹配等） */
export class TeamConfigInvalidException extends DomainException {
  constructor(detail: string) {
    super({
      type: problemType('team/config-invalid'),
      title: '团队配置无效',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail,
    });
  }
}

export class TeamRunNotFoundException extends DomainException {
  constructor(teamRunId: string) {
    super({
      type: problemType('team/run-not-found'),
      title: '团队运行不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `团队运行 ${teamRunId} 不存在`,
    });
  }
}

/** 成员越权操作（通信矩阵不允许、非 lead 提交结果）；工具内部转为错误文本返回给模型 */
export class TeamMemberNotAllowedException extends DomainException {
  constructor(detail: string) {
    super({
      type: problemType('team/member-not-allowed'),
      title: '成员无权执行该操作',
      status: HttpStatus.FORBIDDEN,
      detail,
    });
  }
}

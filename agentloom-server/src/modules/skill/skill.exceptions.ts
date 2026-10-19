import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

// 文件名拒绝属于调用方输入错误，使用稳定的领域异常避免泄露为通用 500。
export class SkillFileNameInvalidException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/skill-file-name-invalid',
      title: 'Skill 文件名无效',
      status: HttpStatus.BAD_REQUEST,
      detail: '文件名无效',
    });
  }
}

export class SkillFileNameConflictException extends DomainException {
  constructor(fileName: string) {
    super({
      type: 'https://agentloom.dev/errors/skill-file-name-conflict',
      title: 'Skill 文件路径重复',
      status: HttpStatus.CONFLICT,
      detail: `同一次上传中出现重复的文件路径「${fileName}」`,
    });
  }
}

export class SkillNotFoundException extends DomainException {
  constructor(skillId: string) {
    super({
      type: 'https://agentloom.dev/errors/skill-not-found',
      title: 'Skill 不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `Skill ${skillId} 不存在`,
    });
  }
}

export class SkillFileNotFoundException extends DomainException {
  constructor(fileName: string) {
    super({
      type: 'https://agentloom.dev/errors/skill-file-not-found',
      title: 'Skill 文件不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `文件「${fileName}」不存在`,
    });
  }
}

export class SkillBuiltinReadonlyException extends DomainException {
  constructor(skillId: string) {
    super({
      type: 'https://agentloom.dev/errors/skill-builtin-readonly',
      title: '内置 Skill 不可修改',
      status: HttpStatus.FORBIDDEN,
      detail: `Skill ${skillId} 是内置 Skill，不能修改、归档、删除或变更文件`,
    });
  }
}

export class SkillNameConflictException extends DomainException {
  constructor(name: string) {
    super({
      type: 'https://agentloom.dev/errors/skill-name-conflict',
      title: 'Skill 名称已存在',
      status: HttpStatus.CONFLICT,
      detail: `当前组织已存在名为「${name}」的 Skill`,
    });
  }
}

export class SkillVersionConflictException extends DomainException {
  constructor(skillId: string) {
    super({
      type: 'https://agentloom.dev/errors/skill-version-conflict',
      title: 'Skill 版本冲突',
      status: HttpStatus.CONFLICT,
      detail: `Skill ${skillId} 版本冲突，请刷新后重试`,
    });
  }
}

export class SkillAlreadyArchivedException extends DomainException {
  constructor(skillId: string) {
    super({
      type: 'https://agentloom.dev/errors/skill-already-archived',
      title: 'Skill 已归档',
      status: HttpStatus.CONFLICT,
      detail: `Skill ${skillId} 已处于归档状态`,
    });
  }
}

export class SkillMultipartRequiredException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/skill-multipart-required',
      title: '请求必须为 multipart/form-data',
      status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      detail:
        'Skill 创建、更新与文件上传只接受 multipart/form-data：元数据放在 metadata 字段（JSON 字符串），文件放在文件字段',
    });
  }
}

export class SkillFileRequiredException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/skill-file-required',
      title: '缺少上传文件',
      status: HttpStatus.BAD_REQUEST,
      detail: 'multipart 中至少需要一个文件字段',
    });
  }
}

export class SkillFileTooLargeException extends DomainException {
  constructor(sizeBytes: number, maxBytes: number) {
    super({
      type: 'https://agentloom.dev/errors/skill-file-too-large',
      title: 'Skill 文件过大',
      status: HttpStatus.BAD_REQUEST,
      detail: `文件大小 (${(sizeBytes / (1024 * 1024)).toFixed(2)}MB) 超过单文件限制 ${maxBytes / (1024 * 1024)}MB`,
    });
  }
}

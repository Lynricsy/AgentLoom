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

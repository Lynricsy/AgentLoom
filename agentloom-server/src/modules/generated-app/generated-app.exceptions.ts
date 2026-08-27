import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';
import type { FieldError } from '../../common/types/problem-details.type';

export class GeneratedAppNotFoundException extends DomainException {
  constructor(idOrToken: string) {
    super({
      type: 'https://agentloom.dev/errors/generated-app-not-found',
      title: '生成应用不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `生成应用 ${idOrToken} 不存在或无权访问`,
    });
  }
}

export class GeneratedAppPublicShareNotReadyException extends DomainException {
  constructor(id: string, reason: string) {
    super({
      type: 'https://agentloom.dev/errors/generated-app-public-share-not-ready',
      title: '生成应用尚不可发布',
      status: HttpStatus.CONFLICT,
      detail: `生成应用 ${id} 尚未满足正式公开链接门槛：${reason}`,
    });
  }
}

export class GeneratedAppGateDefinitionNotFoundException extends DomainException {
  constructor(gateId: string) {
    super({
      type: 'https://agentloom.dev/errors/generated-app-gate-definition-not-found',
      title: '生成应用门禁定义不存在',
      status: HttpStatus.BAD_REQUEST,
      detail: `生成应用门禁 ${gateId} 不是当前支持的 Gate 0-7 门禁`,
    });
  }
}

export class GeneratedAppGenerationRunNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: 'https://agentloom.dev/errors/generated-app-generation-run-not-found',
      title: '生成应用运行台账不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `生成应用运行台账 ${id} 不存在或无权访问`,
    });
  }
}

export class GeneratedAppRepairAttemptNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: 'https://agentloom.dev/errors/generated-app-repair-attempt-not-found',
      title: '生成应用修复尝试不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `生成应用修复尝试 ${id} 不存在或无权访问`,
    });
  }
}

export class GeneratedAppSubmissionNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: 'https://agentloom.dev/errors/generated-app-submission-not-found',
      title: '生成应用提交记录不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `生成应用提交记录 ${id} 不存在、已删除或无权访问`,
    });
  }
}

export class GeneratedAppArtifactNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: 'https://agentloom.dev/errors/generated-app-artifact-not-found',
      title: '生成应用交付物不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `生成应用交付物 ${id} 不存在、尚未物化或无权访问`,
    });
  }
}

export class GeneratedAppArtifactTooLargeException extends DomainException {
  constructor(id: string, maxBytes: number) {
    super({
      type: 'https://agentloom.dev/errors/generated-app-artifact-too-large',
      title: '生成应用交付物过大',
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      detail: `生成应用交付物 ${id} 超过 ${maxBytes} 字节，不能以内联文本方式读取`,
    });
  }
}

/**
 * 公开提交入参未通过运行时表单契约校验。
 *
 * 公开面此前完全不校验 `input`：DTO 只有 `z.unknown()`，evaluator 又把超长字符串
 * 静默截断，于是任意结构都会落一条 submission 并返回 201，创建者拿到的是被悄悄
 * 改写过的数据。校验失败必须 fail-closed：不插 submission、不触发 Workflow。
 */
export class GeneratedAppPublicSubmissionValidationException extends DomainException {
  constructor(errors: FieldError[]) {
    super({
      type: 'https://agentloom.dev/errors/generated-app-public-submission-invalid',
      title: '公开提交内容校验失败',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: '提交内容未通过该应用的运行时表单契约校验，请修正后重试',
      errors,
    });
  }
}

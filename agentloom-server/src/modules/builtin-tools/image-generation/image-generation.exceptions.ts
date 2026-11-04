import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../../common/exceptions/domain.exception';
import { problemType } from '../../../common/exceptions/problem-type';

/** 图像模型请求失败（非 2xx、响应无图片、网络错误） */
export class ImageGenerationFailedException extends DomainException {
  constructor(detail: string) {
    super({
      type: problemType('image-generation-failed'),
      title: '图像生成失败',
      status: HttpStatus.BAD_GATEWAY,
      detail,
    });
  }
}

/** 默认 image 模型所在 provider 的协议不支持图像生成 */
export class ImageGenerationUnsupportedProtocolException extends DomainException {
  constructor(protocol: string) {
    super({
      type: problemType('image-generation-unsupported-protocol'),
      title: '图像模型协议不支持',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `默认图像模型的提供商协议 ${protocol} 不支持图像生成：仅支持 OpenAI 兼容（openai_chat / openai_responses）与 Gemini（google）协议`,
    });
  }
}

import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class StorageKeyInvalidException extends DomainException {
  constructor() {
    super({
      type: 'storage/invalid-key',
      title: '无效的存储键',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: '请求的存储键为空或无效。',
    });
  }
}

export class StorageObjectNotFoundException extends DomainException {
  constructor(key: string) {
    super({
      type: 'storage/object-not-found',
      title: '存储对象不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `对象存储中未找到该对象: ${key}`,
    });
  }
}

export class StorageUnavailableException extends DomainException {
  constructor(operation: string, key: string, error: unknown) {
    const rawMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '未知错误';

    super({
      type: 'storage/unavailable',
      title: '对象存储暂不可用',
      status: HttpStatus.SERVICE_UNAVAILABLE,
      detail: `执行 ${operation} 失败 (key=${key}): ${rawMessage}`,
    });
  }
}

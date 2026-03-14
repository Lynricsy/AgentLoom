import { HttpStatus } from '@nestjs/common';
import { ZodError } from 'zod';

import { DomainException } from '../../common/exceptions/domain.exception';

function formatField(path: PropertyKey[]) {
  const normalizedPath = path.filter(
    (segment): segment is string | number =>
      typeof segment === 'string' || typeof segment === 'number',
  );

  if (normalizedPath.length === 0) {
    return 'definition';
  }

  return ['definition', ...normalizedPath.map(String)].join('.');
}

export class ReusableBlockNotFoundException extends DomainException {
  constructor(blockId: string) {
    super({
      type: 'https://agentloom.dev/errors/reusable-block-not-found',
      title: '可复用块不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `可复用块 ${blockId} 不存在`,
    });
  }
}

export class ReusableBlockConflictException extends DomainException {
  constructor(blockId: string, currentVersion: number) {
    super({
      type: 'https://agentloom.dev/errors/reusable-block-conflict',
      title: '可复用块版本冲突',
      status: HttpStatus.CONFLICT,
      detail: `可复用块 ${blockId} 已被其他用户修改，请刷新后重试`,
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

export class InvalidBlockDefinitionException extends DomainException {
  constructor(error: ZodError | string) {
    if (typeof error === 'string') {
      super({
        type: 'https://agentloom.dev/errors/invalid-block-definition',
        title: '可复用块定义无效',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: error,
        errors: [
          {
            field: 'definition',
            message: error,
          },
        ],
      });
      return;
    }

    const errors = error.issues.map((issue) => ({
      field: formatField(issue.path),
      message: issue.message,
    }));

    super({
      type: 'https://agentloom.dev/errors/invalid-block-definition',
      title: '可复用块定义无效',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: errors[0]?.message ?? '可复用块定义校验失败',
      errors,
    });
  }
}

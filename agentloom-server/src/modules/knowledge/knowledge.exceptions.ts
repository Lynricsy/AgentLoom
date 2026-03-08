import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class KnowledgeBaseNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: 'knowledge-base/not-found',
      title: '知识库不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `未找到 ID 为 ${id} 的知识库`,
    });
  }
}

export class UnsupportedFileTypeException extends DomainException {
  constructor(fileName: string) {
    super({
      type: 'document/unsupported-file-type',
      title: '不支持的文件类型',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `文件 "${fileName}" 的类型不受支持`,
    });
  }
}

export class FileTooLargeException extends DomainException {
  constructor(maxSizeMB: number) {
    super({
      type: 'document/file-too-large',
      title: '文件过大',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `文件大小超过最大限制 ${maxSizeMB}MB`,
    });
  }
}

export class EmptyFileException extends DomainException {
  constructor() {
    super({
      type: 'document/empty-file',
      title: '空文件',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: '不允许上传空文件',
    });
  }
}

export class DocumentParseException extends DomainException {
  constructor(fileName: string, reason: string) {
    super({
      type: 'document/parse-failed',
      title: '文档解析失败',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `文件 "${fileName}" 解析失败: ${reason}`,
    });
  }
}

export class DocumentChunkException extends DomainException {
  constructor(documentId: string, reason: string) {
    super({
      type: 'document/chunk-failed',
      title: '文档分块失败',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: `文档 ${documentId} 分块失败: ${reason}`,
    });
  }
}

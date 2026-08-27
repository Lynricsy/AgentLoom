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

export class DocumentNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: 'document/not-found',
      title: '文档不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `未找到 ID 为 ${id} 的文档`,
    });
  }
}

export class DocumentContentNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: 'document/content-not-found',
      title: '文档内容不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `未找到 ID 为 ${id} 的文档内容（可能已被删除或尚未完成上传）`,
    });
  }
}

export class DocumentContentUnavailableException extends DomainException {
  constructor(id: string, reason: string) {
    super({
      type: 'document/content-unavailable',
      title: '文档内容暂不可用',
      status: HttpStatus.SERVICE_UNAVAILABLE,
      detail: `获取文档 ${id} 的内容失败: ${reason}`,
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

/**
 * 租户没有可用的 Embedding 模型配置。
 *
 * 此前这种情况会静默回退到硬编码的 `https://api.openai.com/v1/embeddings` 加一个
 * 并不存在的凭据，于是索引失败被表现为「网络错误」，运维完全看不出真正原因是
 * 没配模型。配置缺失必须在发出任何网络请求之前显式失败。
 */
export class KnowledgeEmbeddingModelNotConfiguredException extends DomainException {
  constructor(context?: string) {
    super({
      type: 'knowledge-base/embedding-model-not-configured',
      title: '缺少可用的 Embedding 模型配置',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `当前租户没有可用的 Embedding 模型配置${
        context ? `（${context}）` : ''
      }；请先在模型管理中设置默认 Embedding 模型，或为知识库显式绑定 Embedding 模型配置`,
    });
  }
}

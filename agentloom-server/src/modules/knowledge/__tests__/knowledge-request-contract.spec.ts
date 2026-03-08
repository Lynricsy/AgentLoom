import type { ArgumentMetadata } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  CreateKnowledgeBaseDto,
  ListDocumentsQueryDto,
  ListKnowledgeBasesQueryDto,
  UpdateKnowledgeBaseSettingsDto,
} from '../dto';

const pipe = new ZodValidationPipe();

function transformWithDto<T>(
  value: unknown,
  metatype: new (...args: never[]) => T,
  type: ArgumentMetadata['type'],
): T {
  return pipe.transform(value, {
    type,
    metatype,
    data: undefined,
  }) as T;
}

describe('Knowledge request contracts', () => {
  it('create DTO 应同时接受 snake_case 和 camelCase 设置字段', async () => {
    expect(
      transformWithDto(
        {
          name: '研发规范库',
          chunk_size: 1024,
          chunk_overlap: 128,
          embedding_model: 'text-embedding-3-large',
        },
        CreateKnowledgeBaseDto,
        'body',
      ),
    ).toEqual({
      name: '研发规范库',
      description: undefined,
      visibility: 'private',
      chunkSize: 1024,
      chunkOverlap: 128,
      embeddingModel: 'text-embedding-3-large',
    });

    expect(
      transformWithDto(
        {
          name: '研发规范库',
          chunkSize: 2048,
          chunkOverlap: 256,
          embeddingModel: 'text-embedding-3-small',
        },
        CreateKnowledgeBaseDto,
        'body',
      ),
    ).toEqual({
      name: '研发规范库',
      description: undefined,
      visibility: 'private',
      chunkSize: 2048,
      chunkOverlap: 256,
      embeddingModel: 'text-embedding-3-small',
    });
  });

  it('settings DTO 应把 snake_case 归一化为 camelCase', async () => {
    expect(
      transformWithDto(
        {
          chunk_size: 2048,
          chunk_overlap: 256,
          embedding_model: 'text-embedding-3-large',
        },
        UpdateKnowledgeBaseSettingsDto,
        'body',
      ),
    ).toEqual({
      chunkSize: 2048,
      chunkOverlap: 256,
      embeddingModel: 'text-embedding-3-large',
    });
  });

  it('knowledge base 列表 query 应支持 page_size', async () => {
    expect(
      transformWithDto(
        {
          page: '2',
          page_size: '100',
        },
        ListKnowledgeBasesQueryDto,
        'query',
      ),
    ).toEqual({
      page: 2,
      pageSize: 100,
    });
  });

  it('document 列表 query 应支持 page_size 和逗号分隔 status', async () => {
    expect(
      transformWithDto(
        {
          page: '3',
          page_size: '50',
          status: 'uploaded,ready',
        },
        ListDocumentsQueryDto,
        'query',
      ),
    ).toEqual({
      page: 3,
      pageSize: 50,
      status: ['uploaded', 'ready'],
    });
  });
});

import type { ArgumentMetadata } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  CreateKnowledgeBaseDto,
  ListDocumentsQueryDto,
  ListKnowledgeBasesQueryDto,
  RebuildKnowledgeBaseDto,
  TestKnowledgeSearchDto,
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
  it('create DTO 应同时接受 snake_case 和 camelCase 策略字段', async () => {
    expect(
      transformWithDto(
        {
          name: '研发规范库',
          embedding_model: 'text-embedding-3-large',
          chunking_strategy: {
            type: 'sentence',
            chunk_size: 1024,
            chunk_overlap: 128,
          },
          retrieval_strategy: {
            top_k: 12,
            similarity_threshold: 0.61,
          },
          reranking_strategy: {
            type: 'cohere',
            top_n: 6,
          },
          query_orchestration: {
            type: 'hyde',
            model_config_id: null,
            prompt_template: 'query={{query}}',
          },
        },
        CreateKnowledgeBaseDto,
        'body',
      ),
    ).toEqual({
      name: '研发规范库',
      description: undefined,
      visibility: 'private',
      embeddingModel: 'text-embedding-3-large',
      embeddingModelConfigId: undefined,
      chunkingStrategy: {
        type: 'sentence',
        chunkSize: 1024,
        chunkOverlap: 128,
      },
      retrievalStrategy: {
        topK: 12,
        similarityThreshold: 0.61,
      },
      rerankingStrategy: {
        type: 'cohere',
        model: 'rerank-english-v2.0',
        topN: 6,
        apiKeyId: null,
        baseUrl: null,
        timeoutMs: null,
      },
      queryOrchestration: {
        type: 'hyde',
        modelConfigId: null,
        promptTemplate: 'query={{query}}',
      },
    });

    expect(
      transformWithDto(
        {
          name: '研发规范库',
          chunkingStrategy: {
            type: 'sentence_window',
            windowSize: 5,
          },
          retrievalStrategy: {
            topK: 9,
          },
          rerankingStrategy: {
            type: 'none',
          },
          queryOrchestration: {
            type: 'none',
          },
        },
        CreateKnowledgeBaseDto,
        'body',
      ),
    ).toEqual({
      name: '研发规范库',
      description: undefined,
      visibility: 'private',
      embeddingModel: undefined,
      embeddingModelConfigId: undefined,
      chunkingStrategy: {
        type: 'sentence_window',
        windowSize: 5,
      },
      retrievalStrategy: {
        topK: 9,
        similarityThreshold: null,
      },
      rerankingStrategy: {
        type: 'none',
      },
      queryOrchestration: {
        type: 'none',
      },
    });
  });

  it('settings DTO 应把 snake_case 策略结构归一化为 camelCase', async () => {
    expect(
      transformWithDto(
        {
          embedding_model: 'text-embedding-3-large',
          chunking_strategy: {
            type: 'sentence',
            chunk_size: 2048,
            chunk_overlap: 256,
          },
          retrieval_strategy: {
            top_k: 16,
            similarity_threshold: 0.42,
          },
          reranking_strategy: {
            type: 'cohere',
            top_n: 5,
          },
        },
        UpdateKnowledgeBaseSettingsDto,
        'body',
      ),
    ).toEqual({
      embeddingModel: 'text-embedding-3-large',
      embeddingModelConfigId: undefined,
      chunkingStrategy: {
        type: 'sentence',
        chunkSize: 2048,
        chunkOverlap: 256,
      },
      retrievalStrategy: {
        topK: 16,
        similarityThreshold: 0.42,
      },
      rerankingStrategy: {
        type: 'cohere',
        model: 'rerank-english-v2.0',
        topN: 5,
        apiKeyId: null,
        baseUrl: null,
        timeoutMs: null,
      },
      queryOrchestration: undefined,
    });
  });

  it('test-search DTO 应支持 top_k', async () => {
    expect(
      transformWithDto(
        {
          query: '如何接入 MCP？',
          top_k: 7,
        },
        TestKnowledgeSearchDto,
        'body',
      ),
    ).toEqual({
      query: '如何接入 MCP？',
      topK: 7,
    });
  });

  it('rebuild DTO 默认 force=true', async () => {
    expect(transformWithDto({}, RebuildKnowledgeBaseDto, 'body')).toEqual({
      force: true,
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

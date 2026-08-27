import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { DecryptionBoundaryService } from '../../api-key/decryption-boundary.service';
import { LlmService } from '../../llm/llm.service';
import { EMBEDDING_MODEL } from '../../knowledge/knowledge.constants';
import {
  DEFAULT_EMBEDDING_CONFIG,
  type EmbeddingConfig,
} from './embedding.types';

const EMBEDDING_CONFIG_TOKEN = 'EMBEDDING_INTEGRATION_CONFIG';

interface CacheEntry {
  vector: number[];
  expiresAt: number;
}

interface EmbeddingApiResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

@Injectable()
export class EmbeddingIntegrationService {
  private readonly logger = new Logger(EmbeddingIntegrationService.name);
  private readonly config: EmbeddingConfig;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly decryptionBoundaryService: DecryptionBoundaryService,
    private readonly llmService: LlmService,
    @Optional()
    @Inject(EMBEDDING_CONFIG_TOKEN)
    config?: EmbeddingConfig,
  ) {
    this.config = config ?? DEFAULT_EMBEDDING_CONFIG;
  }

  async generateEmbedding(
    text: string,
    tenantId: string,
  ): Promise<number[] | null> {
    if (!text) {
      return null;
    }

    const cacheKey = this.computeCacheKey(text);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const vector = await this.callEmbeddingApi(text, tenantId);
      if (vector) {
        this.putInCache(cacheKey, vector);
      }
      return vector;
    } catch {
      return null;
    }
  }

  /**
   * 用租户默认 Embedding 模型配置解析 provider endpoint / 凭据 / 模型名。
   *
   * 此前这里固定打 `https://api.openai.com/v1/embeddings`，并且用
   * `apiKeyId: null` + `provider: 'openai'` 去要凭据——租户如果用的是自建网关或
   * 非 OpenAI 提供商，请求必然打到错误地址。没有默认 Embedding 模型时保持
   * best-effort 的 `null` 语义（智能路由的语义嵌入是可选增强，缺失时降级即可，
   * 与知识库索引的显式异常语义不同）。
   */
  private async callEmbeddingApi(
    text: string,
    tenantId: string,
  ): Promise<number[] | null> {
    const embeddingModel = await this.llmService.findDefaultByType(
      tenantId,
      'embedding',
    );

    if (!embeddingModel) {
      this.logger.warn(
        `Tenant ${tenantId} has no default embedding model; skipping semantic embedding`,
      );
      return null;
    }

    const baseUrl =
      embeddingModel.provider.baseUrl ??
      embeddingModel.provider.defaultBaseUrl ??
      null;
    if (!baseUrl) {
      this.logger.warn(
        `Embedding provider ${embeddingModel.provider.slug} has no base URL; skipping semantic embedding`,
      );
      return null;
    }

    const apiKey = await this.decryptionBoundaryService.decryptConfiguredApiKey(
      {
        apiKeyId: embeddingModel.provider.apiKeyId,
        organizationId: embeddingModel.provider.orgId,
        tenantId,
        provider: embeddingModel.provider.slug,
      },
      'EmbeddingIntegrationService.callEmbeddingApi',
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/v1/embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model:
              this.config.modelId ?? embeddingModel.modelId ?? EMBEDDING_MODEL,
            input: text,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(
          `Embedding API error ${response.status}: ${body.slice(0, 200)}`,
        );
        return null;
      }

      const json = (await response.json()) as EmbeddingApiResponse;
      return json.data[0]?.embedding ?? null;
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.logger.warn(
          `Embedding API timeout after ${this.config.timeoutMs}ms`,
        );
      } else {
        this.logger.warn(
          `Embedding API call failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private computeCacheKey(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  private getFromCache(key: string): number[] | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.vector;
  }

  private putInCache(key: string, vector: number[]): void {
    if (this.cache.size >= this.config.cacheMaxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      vector,
      expiresAt: Date.now() + this.config.cacheTtlMs,
    });
  }
}

export { EMBEDDING_CONFIG_TOKEN };

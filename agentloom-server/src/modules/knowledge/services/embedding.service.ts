import { Injectable, Logger } from '@nestjs/common';
import { DecryptionBoundaryService } from '../../api-key/decryption-boundary.service';
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_MAX_RETRIES,
} from '../knowledge.constants';

interface EmbeddingApiResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

class EmbeddingApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'EmbeddingApiError';
  }
}

export interface EmbeddingRuntimeConfig {
  organizationId: string;
  tenantId: string;
  provider: 'openai' | 'private_cloud';
  modelName: string;
  apiKeyId?: string | null;
  endpointUrl?: string | null;
  authMethod?: string | null;
  dimensions?: number | null;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly decryptionBoundaryService: DecryptionBoundaryService,
  ) {}

  async generateEmbeddings(
    texts: string[],
    config: EmbeddingRuntimeConfig,
  ): Promise<number[][]> {
    if (texts.length === 0) return [];

    const apiKey = await this.resolveApiKey(config);

    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
      const embeddings = await this.callEmbeddingApiWithRetry(batch, config, apiKey);
      allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
  }

  private async callEmbeddingApiWithRetry(
    texts: string[],
    config: EmbeddingRuntimeConfig,
    apiKey?: string,
  ): Promise<number[][]> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= EMBEDDING_MAX_RETRIES; attempt++) {
      try {
        return await this.callEmbeddingApi(texts, config, apiKey);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const shouldRetry =
          attempt < EMBEDDING_MAX_RETRIES && this.isRetryableError(lastError);

        if (!shouldRetry) {
          break;
        }

        const delay = this.getRetryDelay(lastError, attempt);
        this.logger.warn(
          `Embedding API attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`,
        );
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private async callEmbeddingApi(
    texts: string[],
    config: EmbeddingRuntimeConfig,
    apiKey?: string,
  ): Promise<number[][]> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const body: Record<string, unknown> = {
      model: config.modelName,
      input: texts,
    };
    if (config.dimensions) {
      body.dimensions = config.dimensions;
    }

    const response = await fetch(this.resolveEmbeddingEndpoint(config), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new EmbeddingApiError(
        response.status,
        `Embedding API error ${response.status}: ${body}`,
        this.parseRetryAfterMs(response.headers.get('retry-after')),
      );
    }

    const json = (await response.json()) as EmbeddingApiResponse;

    const embeddings = json.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);

    if (
      config.dimensions &&
      embeddings.some((embedding) => embedding.length !== config.dimensions)
    ) {
      throw new Error(
        `Embedding API 返回的向量维度与配置不一致，期望 ${config.dimensions}`,
      );
    }

    return embeddings;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableError(error: Error): boolean {
    if (!(error instanceof EmbeddingApiError)) {
      return true;
    }

    return error.status === 429 || error.status >= 500;
  }

  private getRetryDelay(error: Error, attempt: number): number {
    if (
      error instanceof EmbeddingApiError &&
      error.retryAfterMs !== undefined
    ) {
      return error.retryAfterMs;
    }

    return 1000 * 2 ** attempt;
  }

  private parseRetryAfterMs(value: string | null): number | undefined {
    if (!value) {
      return undefined;
    }

    const retryAfterSeconds = Number(value);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return retryAfterSeconds * 1000;
    }

    const retryAfterDate = Date.parse(value);
    if (Number.isNaN(retryAfterDate)) {
      return undefined;
    }

    const retryAfterMs = retryAfterDate - Date.now();
    return retryAfterMs > 0 ? retryAfterMs : undefined;
  }

  private async resolveApiKey(
    config: EmbeddingRuntimeConfig,
  ): Promise<string | undefined> {
    if (
      config.provider === 'private_cloud' &&
      config.authMethod &&
      config.authMethod !== 'api_key'
    ) {
      return undefined;
    }

    return this.decryptionBoundaryService.decryptConfiguredApiKey(
      {
        apiKeyId: config.apiKeyId ?? null,
        organizationId: config.organizationId,
        tenantId: config.tenantId,
        provider: config.provider,
      },
      'EmbeddingService.generateEmbeddings',
    );
  }

  private resolveEmbeddingEndpoint(config: EmbeddingRuntimeConfig): string {
    if (config.provider === 'openai') {
      return 'https://api.openai.com/v1/embeddings';
    }

    if (!config.endpointUrl) {
      throw new Error('私有云 Embedding 模型缺少 endpointUrl');
    }

    const normalizedBase = config.endpointUrl.replace(/\/+$/, '');
    const url = new URL(normalizedBase);
    const normalizedPath = url.pathname.replace(/\/+$/, '');

    if (!normalizedPath || normalizedPath === '/') {
      return `${normalizedBase}/v1/embeddings`;
    }

    if (normalizedPath.endsWith('/v1')) {
      return `${normalizedBase}/embeddings`;
    }

    return `${normalizedBase}/embeddings`;
  }
}

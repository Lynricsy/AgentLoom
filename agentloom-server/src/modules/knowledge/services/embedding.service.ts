import { Injectable, Logger } from '@nestjs/common';
import { DecryptionBoundaryService } from '../../api-key/decryption-boundary.service';
import {
  EMBEDDING_MODEL,
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

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly decryptionBoundaryService: DecryptionBoundaryService,
  ) {}

  async generateEmbeddings(
    texts: string[],
    organizationId: string,
    tenantId: string,
  ): Promise<number[][]> {
    if (texts.length === 0) return [];

    const apiKey = await this.decryptionBoundaryService.decryptConfiguredApiKey(
      {
        apiKeyId: null,
        organizationId,
        tenantId,
        provider: 'openai',
      },
      'EmbeddingService.generateEmbeddings',
    );

    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
      const embeddings = await this.callEmbeddingApiWithRetry(batch, apiKey);
      allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
  }

  private async callEmbeddingApiWithRetry(
    texts: string[],
    apiKey: string,
  ): Promise<number[][]> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= EMBEDDING_MAX_RETRIES; attempt++) {
      try {
        return await this.callEmbeddingApi(texts, apiKey);
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
    apiKey: string,
  ): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new EmbeddingApiError(
        response.status,
        `OpenAI Embedding API error ${response.status}: ${body}`,
        this.parseRetryAfterMs(response.headers.get('retry-after')),
      );
    }

    const json = (await response.json()) as EmbeddingApiResponse;

    return json.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
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
    if (error instanceof EmbeddingApiError && error.retryAfterMs !== undefined) {
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
}

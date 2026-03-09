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
        if (attempt < EMBEDDING_MAX_RETRIES) {
          const delay = 1000 * (attempt + 1);
          this.logger.warn(
            `Embedding API attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`,
          );
          await this.sleep(delay);
        }
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
      throw new Error(
        `OpenAI Embedding API error ${response.status}: ${body}`,
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
}

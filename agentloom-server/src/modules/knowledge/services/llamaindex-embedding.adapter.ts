import { BaseEmbedding } from '@llamaindex/core/embeddings';

import type { EmbeddingRuntimeConfig } from './embedding.service';
import { EmbeddingService } from './embedding.service';

export class LlamaIndexEmbeddingAdapter extends BaseEmbedding {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly runtimeConfig: EmbeddingRuntimeConfig,
  ) {
    super();
  }

  async getTextEmbedding(text: string): Promise<number[]> {
    const [embedding] = await this.embeddingService.generateEmbeddings(
      [text],
      this.runtimeConfig,
    );
    return embedding ?? [];
  }

  getTextEmbeddings = async (texts: string[]): Promise<number[][]> => {
    return this.embeddingService.generateEmbeddings(texts, this.runtimeConfig);
  };
}

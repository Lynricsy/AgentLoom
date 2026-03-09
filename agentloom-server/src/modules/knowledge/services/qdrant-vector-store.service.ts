import { Injectable, Inject, Logger } from '@nestjs/common';
import type { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_CLIENT } from '../qdrant.provider';
import { EMBEDDING_DIMENSIONS } from '../knowledge.constants';
import type {
  VectorStore,
  VectorPoint,
  VectorSearchResult,
  VectorSearchOptions,
  VectorFilter,
  VectorFilterCondition,
} from '../interfaces/vector-store.interface';

@Injectable()
export class QdrantVectorStoreService implements VectorStore {
  private readonly logger = new Logger(QdrantVectorStoreService.name);

  constructor(
    @Inject(QDRANT_CLIENT)
    private readonly client: QdrantClient,
  ) {}

  async createCollection(
    name: string,
    vectorSize: number = EMBEDDING_DIMENSIONS,
  ): Promise<void> {
    const exists = await this.collectionExists(name);
    if (exists) {
      this.logger.debug(
        `Collection "${name}" already exists, skipping creation`,
      );
      return;
    }

    await this.client.createCollection(name, {
      vectors: {
        size: vectorSize,
        distance: 'Cosine',
      },
    });
    this.logger.log(`Created collection "${name}"`);
  }

  async collectionExists(name: string): Promise<boolean> {
    const { exists } = await this.client.collectionExists(name);
    return exists;
  }

  async upsert(collectionName: string, points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;

    await this.client.upsert(collectionName, {
      wait: true,
      points: points.map((p) => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload,
      })),
    });
    this.logger.debug(
      `Upserted ${points.length} points into "${collectionName}"`,
    );
  }

  async search(options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    const {
      collectionName,
      vector,
      limit = 10,
      scoreThreshold,
      filter,
    } = options;

    const results = await this.client.search(collectionName, {
      vector,
      limit,
      score_threshold: scoreThreshold,
      filter: filter ? this.toQdrantFilter(filter) : undefined,
    });

    return results.map((r) => ({
      id: typeof r.id === 'string' ? r.id : String(r.id),
      score: r.score,
      payload: r.payload ?? {},
    }));
  }

  async deleteByFilter(
    collectionName: string,
    filter: VectorFilter,
  ): Promise<void> {
    await this.client.delete(collectionName, {
      wait: true,
      filter: this.toQdrantFilter(filter),
    });
    this.logger.debug(`Deleted points by filter from "${collectionName}"`);
  }

  async deleteCollection(name: string): Promise<void> {
    const exists = await this.collectionExists(name);
    if (!exists) {
      this.logger.debug(
        `Collection "${name}" does not exist, skipping deletion`,
      );
      return;
    }

    await this.client.deleteCollection(name);
    this.logger.log(`Deleted collection "${name}"`);
  }

  private toQdrantFilter(filter: VectorFilter): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (filter.must) {
      result.must = filter.must.map((c) => this.toQdrantCondition(c));
    }
    if (filter.should) {
      result.should = filter.should.map((c) => this.toQdrantCondition(c));
    }
    if (filter.must_not) {
      result.must_not = filter.must_not.map((c) => this.toQdrantCondition(c));
    }

    return result;
  }

  private toQdrantCondition(
    condition: VectorFilterCondition,
  ): Record<string, unknown> {
    if (condition.match) {
      return {
        key: condition.key,
        match: { value: condition.match.value },
      };
    }
    if (condition.range) {
      return {
        key: condition.key,
        range: condition.range,
      };
    }
    return { key: condition.key };
  }
}

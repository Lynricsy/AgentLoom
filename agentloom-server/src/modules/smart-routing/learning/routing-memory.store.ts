/**
 * 路由记忆（Qdrant routing_memory 集合）的读写入口。
 *
 * 与知识库集合一致：集合在首次写入时按实际向量维度创建（并建 payload 索引），
 * 读取前确认集合存在；尚无任何路由记忆（集合不存在）时检索返回空，由 knn / memory_bank 走冷启动回退。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { QdrantClient } from '@qdrant/js-client-rest';

import { QDRANT_CLIENT } from '../../knowledge/qdrant.provider';
import { ROUTING_MEMORY_COLLECTION } from './routing-learning.types';

type RoutingMemoryClient = Pick<
  QdrantClient,
  | 'collectionExists'
  | 'createCollection'
  | 'createPayloadIndex'
  | 'search'
  | 'upsert'
>;

const ROUTING_MEMORY_PAYLOAD_INDEXES = [
  { fieldName: 'tenant_id', fieldSchema: 'keyword' },
  { fieldName: 'task_category', fieldSchema: 'keyword' },
  { fieldName: 'model_id', fieldSchema: 'keyword' },
  { fieldName: 'performance_score', fieldSchema: 'float' },
  { fieldName: 'token_count', fieldSchema: 'integer' },
  { fieldName: 'created_at', fieldSchema: 'datetime' },
] as const;

export interface RoutingMemorySearchParams {
  tenantId: string;
  vector: number[];
  limit: number;
  scoreThreshold?: number;
}

export interface RoutingMemoryPoint {
  id: string | number;
  score: number;
  payload?: Record<string, unknown> | null;
}

export interface RoutingMemoryRecord {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

@Injectable()
export class RoutingMemoryStore {
  private readonly logger = new Logger(RoutingMemoryStore.name);
  /** 集合一旦确认存在就不再探测；不存在时每次都探测（其他实例可能已建好） */
  private collectionReady = false;
  private creating: Promise<void> | undefined;

  constructor(
    @Inject(QDRANT_CLIENT) private readonly client: RoutingMemoryClient,
  ) {}

  /** 按租户检索相似路由记忆；集合不存在时返回空，其他存储错误照常抛出 */
  async search(
    params: RoutingMemorySearchParams,
  ): Promise<RoutingMemoryPoint[]> {
    if (!(await this.collectionExists())) {
      return [];
    }

    return this.client.search(ROUTING_MEMORY_COLLECTION, {
      vector: params.vector,
      limit: params.limit,
      score_threshold: params.scoreThreshold,
      filter: {
        must: [{ key: 'tenant_id', match: { value: params.tenantId } }],
      },
      with_payload: true,
    });
  }

  /** 写入一条路由记忆；集合不存在时按该向量维度先建集合 */
  async upsert(record: RoutingMemoryRecord): Promise<void> {
    if (!(await this.collectionExists())) {
      this.creating ??= this.createCollection(record.vector.length).finally(
        () => {
          this.creating = undefined;
        },
      );
      await this.creating;
    }

    await this.client.upsert(ROUTING_MEMORY_COLLECTION, {
      wait: false,
      points: [record],
    });
  }

  private async collectionExists(): Promise<boolean> {
    if (!this.collectionReady) {
      const { exists } = await this.client.collectionExists(
        ROUTING_MEMORY_COLLECTION,
      );
      this.collectionReady = exists;
    }
    return this.collectionReady;
  }

  private async createCollection(vectorSize: number): Promise<void> {
    try {
      await this.client.createCollection(ROUTING_MEMORY_COLLECTION, {
        vectors: { size: vectorSize, distance: 'Cosine' },
      });
    } catch (error) {
      // 并发实例可能已先建好集合（及其索引）
      if (await this.collectionExists()) {
        return;
      }
      throw error;
    }

    for (const index of ROUTING_MEMORY_PAYLOAD_INDEXES) {
      await this.client.createPayloadIndex(ROUTING_MEMORY_COLLECTION, {
        wait: true,
        field_name: index.fieldName,
        field_schema: index.fieldSchema,
      });
    }
    this.collectionReady = true;
    this.logger.log(
      `Created Qdrant collection "${ROUTING_MEMORY_COLLECTION}" (vector size ${vectorSize})`,
    );
  }
}

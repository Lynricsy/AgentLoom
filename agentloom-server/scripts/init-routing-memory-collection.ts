import { QdrantClient } from '@qdrant/js-client-rest';

import { EMBEDDING_DIMENSIONS } from '../src/modules/knowledge/knowledge.constants';

export const ROUTING_MEMORY_COLLECTION = 'routing_memory';
export const DEFAULT_ROUTING_MEMORY_VECTOR_SIZE = EMBEDDING_DIMENSIONS;

type RoutingMemoryPayloadSchema = 'keyword' | 'integer' | 'float' | 'datetime';

interface RoutingMemoryPayloadIndex {
  fieldName: string;
  fieldSchema: RoutingMemoryPayloadSchema;
}

export const ROUTING_MEMORY_PAYLOAD_INDEXES: RoutingMemoryPayloadIndex[] = [
  { fieldName: 'tenant_id', fieldSchema: 'keyword' },
  { fieldName: 'task_category', fieldSchema: 'keyword' },
  { fieldName: 'model_id', fieldSchema: 'keyword' },
  { fieldName: 'performance_score', fieldSchema: 'float' },
  { fieldName: 'token_count', fieldSchema: 'integer' },
  { fieldName: 'created_at', fieldSchema: 'datetime' },
];

function resolveVectorSize(): number {
  const configuredSize = process.env.APP_ROUTING_MEMORY_VECTOR_SIZE;
  if (!configuredSize) {
    return DEFAULT_ROUTING_MEMORY_VECTOR_SIZE;
  }

  const parsed = Number.parseInt(configuredSize, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      'APP_ROUTING_MEMORY_VECTOR_SIZE must be a positive integer when provided.',
    );
  }

  return parsed;
}

async function ensurePayloadIndexes(client: QdrantClient): Promise<void> {
  for (const payloadIndex of ROUTING_MEMORY_PAYLOAD_INDEXES) {
    await client.createPayloadIndex(ROUTING_MEMORY_COLLECTION, {
      wait: true,
      field_name: payloadIndex.fieldName,
      field_schema: payloadIndex.fieldSchema,
    });

    console.log(
      'Ensured payload index %s (%s).',
      payloadIndex.fieldName,
      payloadIndex.fieldSchema,
    );
  }
}

async function main() {
  const qdrantUrl = process.env.APP_QDRANT_URL;
  if (!qdrantUrl) {
    console.error('APP_QDRANT_URL is required.');
    process.exit(1);
  }

  const client = new QdrantClient({ url: qdrantUrl });
  const vectorSize = resolveVectorSize();
  const { exists } = await client.collectionExists(ROUTING_MEMORY_COLLECTION);

  if (!exists) {
    await client.createCollection(ROUTING_MEMORY_COLLECTION, {
      vectors: {
        size: vectorSize,
        distance: 'Cosine',
      },
    });

    console.log(
      'Created Qdrant collection %s with vector size %d.',
      ROUTING_MEMORY_COLLECTION,
      vectorSize,
    );
  } else {
    console.log('Qdrant collection %s already exists.', ROUTING_MEMORY_COLLECTION);
  }

  await ensurePayloadIndexes(client);

  console.log('Routing memory collection initialization complete.');
}

main().catch((error: unknown) => {
  console.error('Failed to initialize routing memory collection:', error);
  process.exit(1);
});

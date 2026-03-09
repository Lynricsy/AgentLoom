export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface VectorFilterCondition {
  key: string;
  match?: { value: string | number | boolean };
  range?: {
    gte?: number;
    lte?: number;
    gt?: number;
    lt?: number;
  };
}

export interface VectorFilter {
  must?: VectorFilterCondition[];
  should?: VectorFilterCondition[];
  must_not?: VectorFilterCondition[];
}

export interface VectorSearchOptions {
  collectionName: string;
  vector: number[];
  limit?: number;
  scoreThreshold?: number;
  filter?: VectorFilter;
}

export interface VectorStore {
  createCollection(
    name: string,
    vectorSize: number,
  ): Promise<void>;

  collectionExists(name: string): Promise<boolean>;

  upsert(
    collectionName: string,
    points: VectorPoint[],
  ): Promise<void>;

  search(options: VectorSearchOptions): Promise<VectorSearchResult[]>;

  deleteByFilter(
    collectionName: string,
    filter: VectorFilter,
  ): Promise<void>;

  deleteCollection(name: string): Promise<void>;
}

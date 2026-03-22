export interface EmbeddingConfig {
  /** 为空时回退到 knowledge 模块默认模型 */
  modelId?: string;
  timeoutMs: number;
  cacheTtlMs: number;
  cacheMaxSize: number;
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  timeoutMs: 2000,
  cacheTtlMs: 3_600_000,
  cacheMaxSize: 10_000,
};

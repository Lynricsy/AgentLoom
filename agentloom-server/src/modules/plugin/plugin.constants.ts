export const PLUGIN_EXECUTION_QUEUE = 'plugin-execution';
export const MAX_PLUGIN_FILE_SIZE = 50 * 1024 * 1024;

export const pluginExecutionQueueDefaultJobOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
};

/** WASM 沙箱默认配置 */
export const DEFAULT_SANDBOX_CONFIG = {
  /** 最大内存页数 (1页=64KB, 4096页=256MB) */
  maxMemoryPages: 4096,
  /** 执行超时 (毫秒) */
  timeoutMs: 30_000,
  /** 允许的 HTTP 主机列表 (空=无网络) */
  allowedHosts: [] as string[],
  /** 允许的文件路径映射 (空=无文件系统) */
  allowedPaths: {} as Record<string, string>,
  /** 是否启用 WASI */
  useWasi: false,
} as const;

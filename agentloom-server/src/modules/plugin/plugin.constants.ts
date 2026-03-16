export const PLUGIN_EXECUTION_QUEUE = 'plugin-execution';
export const MAX_PLUGIN_FILE_SIZE = 50 * 1024 * 1024;

export const pluginExecutionQueueDefaultJobOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
};

import type { AgentApiRunError } from '@agentloom/contracts';

/** run 终态后事件流保留时长：过期后 `GET …/events` 返回 410 */
export const AGENT_API_RUN_EVENTS_TTL_SECONDS = 3600;

/** 单个 run 事件流的近似长度上限（`XADD MAXLEN ~`） */
export const AGENT_API_RUN_EVENTS_MAXLEN = 5000;

/** 多路复用 `XREAD` 的阻塞时长：新订阅最迟在一个周期后加入读取 */
export const AGENT_API_STREAM_READ_BLOCK_MS = 1000;

/** 单次 `XREAD` 每个流最多返回的条目数 */
export const AGENT_API_STREAM_READ_BATCH = 500;

/** `XREAD` 出错（连接抖动等）后的重试间隔 */
export const AGENT_API_STREAM_READ_RETRY_MS = 1000;

export const AGENT_API_MAINTENANCE_QUEUE = 'agent-api-maintenance';
export const AGENT_API_MAINTENANCE_JOB_NAME = 'sweep-agent-api-runs';
export const AGENT_API_MAINTENANCE_JOB_ID = 'agent-api-maintenance-sweep';
export const AGENT_API_MAINTENANCE_INTERVAL_MS = 5 * 60_000;

export const AGENT_API_MAINTENANCE_QUEUE_DEFAULT_JOB_OPTIONS = {
  removeOnComplete: 100,
  removeOnFail: 500,
  attempts: 1,
} as const;

/** 大于沙箱单次 prompt 超时（1h），超过即视为执行进程已丢失 */
export const AGENT_API_STALE_RUN_HOURS = 2;

/** 幂等记录保留时长，之后清空 `idempotency_key` / `request_hash` */
export const AGENT_API_IDEMPOTENCY_RETENTION_HOURS = 24;

export const AGENT_API_RUN_WORKER_LOST_ERROR: AgentApiRunError = {
  type: 'https://agentloom.dev/errors/run-worker-lost',
  title: 'Run worker lost',
};

export function buildAgentApiRunFailedError(detail?: string): AgentApiRunError {
  return {
    type: 'https://agentloom.dev/errors/run-failed',
    title: 'Run failed',
    ...(detail ? { detail } : {}),
  };
}

export function buildAgentApiRunEventsKey(runId: string): string {
  return `agentloom:agent-api:run:${runId}:events`;
}

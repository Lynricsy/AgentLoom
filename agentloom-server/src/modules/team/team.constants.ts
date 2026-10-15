/** 团队运行时队列：截止时间延迟任务与周期清扫共用 */
export const TEAM_RUNTIME_QUEUE = 'team-runtime';

/** 截止时间延迟任务；jobId 为 `team-deadline-${teamRunId}` */
export const TEAM_DEADLINE_JOB_NAME = 'team-deadline';

/** 周期清扫任务（邮箱重投、未消费唤醒、过期、空闲催办） */
export const TEAM_SWEEP_JOB_NAME = 'team-sweep';
export const TEAM_SWEEP_JOB_ID = 'team-sweep';
export const TEAM_SWEEP_INTERVAL_MS = 30_000;

/** pending 超过该时长仍未投递（提交后投递丢失）即由清扫重投 */
export const TEAM_PENDING_REDELIVER_AFTER_MS = 10_000;

/** delivered 超过该时长仍未被消费，清扫重新派发接收者对话 */
export const TEAM_UNCONSUMED_REDISPATCH_AFTER_MS = 60_000;

/** 全体成员空闲且无在途消息超过该时长，催办 lead */
export const TEAM_IDLE_NUDGE_AFTER_MS = 60_000;

/** 催办次数上限，超过后以 no_result 失败 */
export const TEAM_MAX_NUDGES = 2;

/** 结果不符合输出 Schema 的提交次数上限，达到后以 schema_invalid 失败 */
export const TEAM_MAX_SCHEMA_INVALID = 3;

/** 结果已提交但 lead 提交回合迟迟未落库（结算事件丢失）且 lead 不在运行：超过该时长由清扫兜底结算 */
export const TEAM_SUBMITTED_SETTLE_AFTER_MS = 60_000;

/** 成员启动后超过该时长仍无落库回合且未在运行（启动派发丢失）：清扫重新派发 */
export const TEAM_START_REDISPATCH_AFTER_MS = 60_000;

/**
 * 团队终态超过该时长而步骤仍 running（推进步骤失败或进程在推进前退出）、或成员对话仍 active：
 * 清扫幂等重做步骤终态与调度、结束成员对话
 */
export const TEAM_FINALIZE_RECOVERY_AFTER_MS = 15_000;

export const TEAM_MESSAGE_CONTENT_MAX = 32_000;

/** context-in 输入序列化后的大小上限，超过时截断 */
export const TEAM_CONTEXT_MAX_BYTES = 16 * 1024;

export const TEAM_RUNTIME_QUEUE_DEFAULT_JOB_OPTIONS = {
  removeOnComplete: 500,
  removeOnFail: 1000,
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
} as const;

export function buildTeamDeadlineJobId(teamRunId: string): string {
  return `team-deadline-${teamRunId}`;
}

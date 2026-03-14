import type { JobsOptions } from 'bullmq';

export const TRIGGER_QUEUE = 'trigger-scheduler';

export const TRIGGER_CRON_JOB = 'trigger-cron-execution';

export const TRIGGER_QUEUE_DEFAULT_JOB_OPTIONS: JobsOptions = {
  removeOnComplete: 100,
  removeOnFail: 500,
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
};

export const MAX_TRIGGERS_PER_WORKFLOW = 10;

export const SYSTEM_TRIGGER_USER_ID = '00000000-0000-0000-0000-000000000000';

export const WEBHOOK_TOKEN_LENGTH = 32;
export const WEBHOOK_SECRET_LENGTH = 48;
export const WEBHOOK_SIGNATURE_HEADER = 'x-agentloom-signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-agentloom-timestamp';
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

import { describe, expect, it } from 'vitest';
import {
  AGENT_TASK_QUEUE_DEFAULT_JOB_OPTIONS,
  EXECUTION_QUEUE_DEFAULT_JOB_OPTIONS,
} from '../execution.constants';

describe('execution.constants', () => {
  it('应锁定执行队列默认 job 配置', () => {
    expect(EXECUTION_QUEUE_DEFAULT_JOB_OPTIONS).toEqual({
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 1,
    });
  });

  it('应锁定 agent-task 队列的指数退避配置', () => {
    expect(AGENT_TASK_QUEUE_DEFAULT_JOB_OPTIONS).toEqual({
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 4,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });
  });
});

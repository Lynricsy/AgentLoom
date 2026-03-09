import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { SandboxConfig } from '../../../database/schema';

const mockQueue = {
  add: vi.fn().mockResolvedValue({ id: 'job-1' }),
};

vi.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => {},
}));

import { SandboxLifecycleProducer } from '../sandbox-lifecycle.producer';

const DEFAULT_CONFIG: SandboxConfig = {
  cpu: 2,
  memory: 1024,
  disk: 5,
  timeout: 4,
};

describe('SandboxLifecycleProducer', () => {
  let producer: SandboxLifecycleProducer;

  beforeEach(() => {
    vi.clearAllMocks();
    producer = new SandboxLifecycleProducer(mockQueue as any);
  });

  it('addCreateTask 应使用正确的 jobType 和 config 入队', async () => {
    const result = await producer.addCreateTask({
      sessionId: 's1',
      executionId: 'e1',
      config: DEFAULT_CONFIG,
      tenantId: 't1',
    });

    expect(result).toEqual({ id: 'job-1' });
    expect(mockQueue.add).toHaveBeenCalledWith('sandbox-create', {
      sessionId: 's1',
      executionId: 'e1',
      tenantId: 't1',
      jobType: 'create',
      config: DEFAULT_CONFIG,
    });
  });

  it('addDestroyTask 应使用正确的 jobType 和 containerId 入队', async () => {
    await producer.addDestroyTask({
      sessionId: 's1',
      executionId: 'e1',
      containerId: 'c1',
      tenantId: 't1',
    });

    expect(mockQueue.add).toHaveBeenCalledWith('sandbox-destroy', {
      sessionId: 's1',
      executionId: 'e1',
      tenantId: 't1',
      jobType: 'destroy',
      containerId: 'c1',
    });
  });

  it('addTimeoutCheckTask 应使用 delay 选项入队', async () => {
    await producer.addTimeoutCheckTask({
      sessionId: 's1',
      executionId: 'e1',
      tenantId: 't1',
      delayMs: 14_400_000,
    });

    expect(mockQueue.add).toHaveBeenCalledWith(
      'sandbox-timeout-check',
      {
        sessionId: 's1',
        executionId: 'e1',
        tenantId: 't1',
        jobType: 'timeout_check',
      },
      { delay: 14_400_000 },
    );
  });
});

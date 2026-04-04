import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { SandboxConfig } from '../../../database/schema';

const mockTimeoutJob = {
  remove: vi.fn().mockResolvedValue(undefined),
};

const mockQueue = {
  add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  getJob: vi.fn().mockResolvedValue(mockTimeoutJob),
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

  it('addCreateTask 应支持 conversation 绑定入队', async () => {
    await producer.addCreateTask({
      sessionId: 's-conv',
      agentConversationId: 'c1',
      config: DEFAULT_CONFIG,
      tenantId: 't1',
    });

    expect(mockQueue.add).toHaveBeenCalledWith('sandbox-create', {
      sessionId: 's-conv',
      agentConversationId: 'c1',
      tenantId: 't1',
      jobType: 'create',
      config: DEFAULT_CONFIG,
    });
  });

  it('addStartTask 应使用正确的 jobType 和 containerId 入队', async () => {
    await producer.addStartTask({
      sessionId: 's1',
      executionId: 'e1',
      containerId: 'c1',
      config: DEFAULT_CONFIG,
      tenantId: 't1',
    });

    expect(mockQueue.add).toHaveBeenCalledWith('sandbox-start', {
      sessionId: 's1',
      executionId: 'e1',
      tenantId: 't1',
      jobType: 'start',
      containerId: 'c1',
      config: DEFAULT_CONFIG,
    });
  });

  it('addStopTask 应使用正确的 jobType 和 config 入队', async () => {
    await producer.addStopTask({
      sessionId: 's1',
      executionId: 'e1',
      containerId: 'c1',
      config: DEFAULT_CONFIG,
      tenantId: 't1',
    });

    expect(mockQueue.add).toHaveBeenCalledWith('sandbox-stop', {
      sessionId: 's1',
      executionId: 'e1',
      tenantId: 't1',
      jobType: 'stop',
      containerId: 'c1',
      config: DEFAULT_CONFIG,
    });
  });

  it('addDestroyTask 应使用正确的 jobType 和 containerId 入队', async () => {
    await producer.addDestroyTask({
      sessionId: 's1',
      executionId: 'e1',
      containerId: 'c1',
      persistencePath: 'tenants/t1/sandboxes/e1',
      tenantId: 't1',
    });

    expect(mockQueue.add).toHaveBeenCalledWith('sandbox-destroy', {
      sessionId: 's1',
      executionId: 'e1',
      tenantId: 't1',
      jobType: 'destroy',
      containerId: 'c1',
      persistencePath: 'tenants/t1/sandboxes/e1',
    });
  });

  it('addDestroyTask 应支持 conversation 绑定入队', async () => {
    await producer.addDestroyTask({
      sessionId: 's-conv',
      agentConversationId: 'c1',
      containerId: 'c1',
      tenantId: 't1',
    });

    expect(mockQueue.add).toHaveBeenCalledWith('sandbox-destroy', {
      sessionId: 's-conv',
      agentConversationId: 'c1',
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
      {
        attempts: 1,
        delay: 14_400_000,
        jobId: 'sandbox-timeout-s1',
      },
    );
  });

  it('addTimeoutCheckTask 应支持 conversation 绑定入队', async () => {
    await producer.addTimeoutCheckTask({
      sessionId: 's-conv',
      agentConversationId: 'c1',
      tenantId: 't1',
      delayMs: 5_000,
    });

    expect(mockQueue.add).toHaveBeenCalledWith(
      'sandbox-timeout-check',
      {
        sessionId: 's-conv',
        agentConversationId: 'c1',
        tenantId: 't1',
        jobType: 'timeout_check',
      },
      {
        attempts: 1,
        delay: 5_000,
        jobId: 'sandbox-timeout-s-conv',
      },
    );
  });

  it('addConversationIdleEndCheckTask 应使用 delay 选项入队并覆盖同 session 旧任务', async () => {
    await producer.addConversationIdleEndCheckTask({
      sessionId: 's-conv',
      tenantId: 't1',
      delayMs: 600_000,
    });

    expect(mockQueue.getJob).toHaveBeenCalledWith(
      'sandbox-conversation-idle-end-s-conv',
    );
    expect(mockTimeoutJob.remove).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'sandbox-conversation-idle-end-check',
      {
        sessionId: 's-conv',
        tenantId: 't1',
        jobType: 'conversation_idle_end_check',
      },
      {
        attempts: 1,
        delay: 600_000,
        jobId: 'sandbox-conversation-idle-end-s-conv',
      },
    );
  });

  it('removeTimeoutCheckTask 命中已有任务时应移除', async () => {
    await producer.removeTimeoutCheckTask('s1');

    expect(mockQueue.getJob).toHaveBeenCalledWith('sandbox-timeout-s1');
    expect(mockTimeoutJob.remove).toHaveBeenCalledTimes(1);
  });

  it('removeTimeoutCheckTask 未命中任务时应跳过', async () => {
    mockQueue.getJob.mockResolvedValueOnce(null);

    await producer.removeTimeoutCheckTask('missing');

    expect(mockQueue.getJob).toHaveBeenCalledWith('sandbox-timeout-missing');
    expect(mockTimeoutJob.remove).not.toHaveBeenCalled();
  });

  it('removeConversationIdleEndCheckTask 命中已有任务时应移除', async () => {
    await producer.removeConversationIdleEndCheckTask('s1');

    expect(mockQueue.getJob).toHaveBeenCalledWith(
      'sandbox-conversation-idle-end-s1',
    );
    expect(mockTimeoutJob.remove).toHaveBeenCalledTimes(1);
  });
});

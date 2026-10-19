import { Logger } from '@nestjs/common';
import { WorkerHost } from '@nestjs/bullmq';
import type { DiscoveryService } from '@nestjs/core';
import type { Job, Worker } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QueueWorkerShutdownService } from '../queue-worker-shutdown.service';

class FakeHost extends WorkerHost {
  constructor(private readonly fakeWorker?: Pick<Worker, 'close' | 'name'>) {
    super();
  }

  override get worker(): Worker {
    if (!this.fakeWorker) {
      throw new Error('"Worker" has not yet been initialized');
    }
    return this.fakeWorker as Worker;
  }

  async process(_job: Job): Promise<void> {}
}

function createService(instances: unknown[]): QueueWorkerShutdownService {
  const discoveryService = {
    getProviders: () => instances.map((instance) => ({ instance })),
  };
  return new QueueWorkerShutdownService(
    discoveryService as unknown as DiscoveryService,
  );
}

describe('QueueWorkerShutdownService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  it('关闭时等待全部队列 worker 的 close（进行中任务结束）后才返回', async () => {
    let finishJob!: () => void;
    const slowWorker = {
      name: 'agent-conversation-execution',
      close: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishJob = resolve;
          }),
      ),
    };
    const fastWorker = { name: 'notification', close: vi.fn(async () => {}) };
    const service = createService([
      new FakeHost(slowWorker),
      new FakeHost(fastWorker),
      { notAWorker: true },
      undefined,
    ]);

    let settled = false;
    const destroying = service.onModuleDestroy().then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(slowWorker.close).toHaveBeenCalledTimes(1));
    expect(fastWorker.close).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(settled).toBe(false);

    finishJob();
    await destroying;
    expect(settled).toBe(true);
  });

  it('未初始化的 worker 与关闭失败都不会中断关闭流程', async () => {
    const failingWorker = {
      name: 'workflow-execution',
      close: vi.fn(async () => {
        throw new Error('redis gone');
      }),
    };
    const service = createService([
      new FakeHost(),
      new FakeHost(failingWorker),
    ]);

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(failingWorker.close).toHaveBeenCalledTimes(1);
  });
});

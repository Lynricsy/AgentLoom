import { WorkerHost } from '@nestjs/bullmq';
import type { DiscoveryService } from '@nestjs/core';
import type { Worker } from 'bullmq';

/**
 * 收集容器中已创建的全部 BullMQ worker（`@Processor` 类都继承 `WorkerHost`）。
 * 供关闭流程与健康检查共用。
 */
export function collectQueueWorkers(
  discoveryService: DiscoveryService,
): Worker[] {
  return discoveryService.getProviders().flatMap((wrapper): Worker[] => {
    const instance: unknown = wrapper.instance;
    if (!(instance instanceof WorkerHost)) {
      return [];
    }
    try {
      return [instance.worker];
    } catch {
      // worker 尚未创建（启动失败或 manualRegistration）
      return [];
    }
  });
}

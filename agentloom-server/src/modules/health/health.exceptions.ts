import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';
import type { ReadinessChecks } from './health.service';

/** readiness 未通过：PostgreSQL、Redis 或队列 worker 至少一项不可用，编排层应暂停向本实例转发流量 */
export class ServiceNotReadyException extends DomainException {
  constructor(checks: ReadinessChecks) {
    const failed = Object.entries(checks)
      .filter(([, check]) => check.status === 'down')
      .map(([name]) => name);
    super({
      type: 'https://agentloom.dev/errors/service-not-ready',
      title: '服务暂不可用',
      status: HttpStatus.SERVICE_UNAVAILABLE,
      detail: `依赖检查未通过: ${failed.join(', ')}`,
      extensions: { checks },
    });
  }
}

/** liveness 未通过：Redis 可用但有队列 worker 长时间无法取任务，进程需要重启才能恢复 */
export class ServiceUnhealthyException extends DomainException {
  constructor(stalledWorkers: number, stalledForSeconds: number) {
    super({
      type: 'https://agentloom.dev/errors/service-unhealthy',
      title: '服务需要重启',
      status: HttpStatus.SERVICE_UNAVAILABLE,
      detail: `Redis 可用，但 ${stalledWorkers} 个队列 worker 已持续 ${stalledForSeconds} 秒无法取任务`,
      extensions: { stalledWorkers },
    });
  }
}

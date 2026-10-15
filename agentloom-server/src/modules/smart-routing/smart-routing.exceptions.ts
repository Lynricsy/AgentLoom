import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';
import { problemType } from '../../common/exceptions/problem-type';

export class AllModelsFallbackExhaustedException extends DomainException {
  constructor(routingNodeId: string) {
    super({
      type: 'https://agentloom.dev/errors/routing/fallback-exhausted',
      title: '所有模型已耗尽',
      status: HttpStatus.SERVICE_UNAVAILABLE,
      detail: `路由节点 ${routingNodeId} 的所有备选模型均已失败`,
    });
  }
}

/** 健康过滤与上下文窗口过滤后没有可选模型 */
export class NoEligibleCandidateException extends DomainException {
  constructor(counts: { total: number; healthy: number; inputTokenCount: number }) {
    super({
      type: problemType('routing/no-eligible-candidate'),
      title: '没有满足条件的候选模型',
      status: HttpStatus.SERVICE_UNAVAILABLE,
      detail: `候选模型共 ${counts.total} 个，健康 ${counts.healthy} 个，其中上下文窗口不小于输入 ${counts.inputTokenCount} tokens 的为 0 个`,
    });
  }
}

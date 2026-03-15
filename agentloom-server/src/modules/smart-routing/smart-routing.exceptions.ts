import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';

export class InvalidRoutingStrategyException extends DomainException {
  constructor(strategy: string) {
    super({
      type: 'https://agentloom.dev/errors/routing/invalid-strategy',
      title: '无效的路由策略',
      status: HttpStatus.BAD_REQUEST,
      detail: `不支持的路由策略: ${strategy}`,
    });
  }
}

export class InsufficientModelsException extends DomainException {
  constructor(count: number) {
    super({
      type: 'https://agentloom.dev/errors/routing/insufficient-models',
      title: '模型数量不足',
      status: HttpStatus.BAD_REQUEST,
      detail: `智能路由至少需要 2 个模型配置，当前仅有 ${count} 个`,
    });
  }
}

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

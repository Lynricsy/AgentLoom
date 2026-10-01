import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import type { AgentApiKeyContext } from './agent-api.types';

/**
 * 读取 AgentApiKeyGuard 挂在 `request.agentApiKey` 上的调用方上下文。
 * 只能用于同时声明了 `@UseGuards(AgentApiKeyGuard)` 的路由。
 */
export const CurrentAgentApiKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AgentApiKeyContext | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<FastifyRequest & { agentApiKey?: AgentApiKeyContext }>();
    return request.agentApiKey;
  },
);

import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { AgentApiKeyInvalidException } from './agent-api.exceptions';
import { AgentApiKeyService } from './agent-api-key.service';
import {
  AGENT_API_KEY_PREFIX,
  type AgentApiKeyContext,
} from './agent-api.types';

const BEARER_PREFIX = 'Bearer ';

/**
 * 对外接口（`/agent-api/**`）专用认证：解析 `Authorization: Bearer alak_…`。
 *
 * 只设置 `request.agentApiKey`，刻意不设置 `request.user`：
 * TenantTransactionInterceptor 因此直接放行（对外接口自行管理短事务），
 * 全局 RolesGuard/TenantGuard 也不会把 Key 当作用户身份。
 * 使用方需同时声明 `@Public()` 与 `@UseGuards(AgentApiKeyGuard)`。
 */
@Injectable()
export class AgentApiKeyGuard implements CanActivate {
  constructor(private readonly agentApiKeyService: AgentApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { agentApiKey?: AgentApiKeyContext }>();
    const authorization = request.headers.authorization;

    if (
      typeof authorization !== 'string' ||
      !authorization.startsWith(`${BEARER_PREFIX}${AGENT_API_KEY_PREFIX}`)
    ) {
      throw new AgentApiKeyInvalidException();
    }

    request.agentApiKey = await this.agentApiKeyService.validate(
      authorization.slice(BEARER_PREFIX.length).trim(),
    );
    return true;
  }
}

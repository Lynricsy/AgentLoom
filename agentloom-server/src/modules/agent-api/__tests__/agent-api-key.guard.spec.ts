import type { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentApiKeyInvalidException } from '../agent-api.exceptions';
import { AgentApiKeyGuard } from '../agent-api-key.guard';
import type { AgentApiKeyService } from '../agent-api-key.service';
import type { AgentApiKeyContext } from '../agent-api.types';

const RAW_KEY = `alak_${'ab'.repeat(32)}`;
const KEY_CONTEXT: AgentApiKeyContext = {
  keyId: '019391d4-d000-7000-8000-000000000004',
  tenantId: '019391d4-a000-7000-8000-000000000001',
  agentDefinitionId: '019391d4-c000-7000-8000-000000000003',
  keyPrefix: RAW_KEY.slice(0, 13),
  maxConcurrentRuns: 5,
  rateLimitPerMinute: null,
};

type GuardRequest = {
  headers: Record<string, string | undefined>;
  agentApiKey?: AgentApiKeyContext;
  user?: unknown;
};

function createContext(request: GuardRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AgentApiKeyGuard', () => {
  const validate = vi.fn();
  const guard = new AgentApiKeyGuard({
    validate,
  } as unknown as AgentApiKeyService);

  beforeEach(() => {
    validate.mockReset();
  });

  it.each([
    ['缺少 Authorization', undefined],
    ['JWT Bearer', 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.sig'],
    ['平台 Token', `Bearer al_${'ab'.repeat(32)}`],
    ['非 Bearer 方案', `Basic ${RAW_KEY}`],
  ])('%s 时返回 401 且不查库', async (_label, authorization) => {
    const request: GuardRequest = { headers: { authorization } };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(AgentApiKeyInvalidException);
    expect(validate).not.toHaveBeenCalled();
    expect(request.agentApiKey).toBeUndefined();
  });

  it('Key 校验失败时向上抛出 401', async () => {
    validate.mockRejectedValueOnce(new AgentApiKeyInvalidException());

    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: `Bearer ${RAW_KEY}` } }),
      ),
    ).rejects.toBeInstanceOf(AgentApiKeyInvalidException);
  });

  it('有效 Key 只挂 agentApiKey 上下文，不伪造 request.user', async () => {
    validate.mockResolvedValueOnce(KEY_CONTEXT);
    const request: GuardRequest = {
      headers: { authorization: `Bearer ${RAW_KEY}` },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(validate).toHaveBeenCalledWith(RAW_KEY);
    expect(request.agentApiKey).toEqual(KEY_CONTEXT);
    expect(request).not.toHaveProperty('user');
  });
});

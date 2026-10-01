import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as jwt from 'jsonwebtoken';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector, type ModuleRef } from '@nestjs/core';
import type {
  ThrottlerModuleOptions,
  ThrottlerRequest,
  ThrottlerStorage,
} from '@nestjs/throttler';

import { CustomThrottlerGuard } from '../custom-throttler.guard';
import { PlatformApiTokenService } from '../../../modules/platform-api-token/platform-api-token.service';
import { AgentApiKeyService } from '../../../modules/agent-api/agent-api-key.service';
import {
  AgentApiKeyInvalidException,
  RateLimitExceededException,
} from '../../../modules/agent-api/agent-api.exceptions';
import { ResourceGovernanceService } from '../../../modules/resource-governance/resource-governance.service';
import type { ResourceGovernanceStateResponseDto } from '../../../modules/resource-governance/dto/resource-governance-response.dto';
import { ResourceGovernanceDecisionBlockedException } from '../../../modules/resource-governance/resource-governance.exceptions';

const TENANT_ID = '019391d4-a000-7000-8000-000000000001';
const USER_ID = '019391d4-b000-7000-8000-000000000002';
const ORGANIZATION_ID = '019391d4-c000-7000-8000-000000000003';

type GuardRequest = {
  headers?: Record<string, string | string[] | undefined>;
  authMethod?: string;
  tenantId?: string;
  user?: {
    sub?: string;
  };
  apiKeyPrefix?: string;
  ip?: string;
  apiTokenUserId?: string;
  raw?: {
    tenantId?: string;
    headers?: Record<string, string | string[] | undefined>;
  };
};

type HeaderWriter = {
  header: Mock;
};

type PlatformApiTokenServiceLike = Pick<
  PlatformApiTokenService,
  'validateToken'
>;
type ResourceGovernanceServiceLike = Pick<
  ResourceGovernanceService,
  | 'resolveRuntimeStateForTenant'
  | 'buildBlockedDecision'
  | 'recordBlockedDecision'
>;

class ExposedCustomThrottlerGuard extends CustomThrottlerGuard {
  public getTrackerForTest(req: GuardRequest): Promise<string> {
    return this.getTracker(req);
  }

  public handleRequestForTest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    return this.handleRequest(requestProps);
  }
}

const throttlerOptions: ThrottlerModuleOptions = [
  { name: 'default', ttl: 60_000, limit: 100 },
];

const storageService = {
  increment: vi.fn(),
};

const platformApiTokenService: Record<string, Mock> = {
  validateToken: vi.fn(),
};

const resourceGovernanceService: Record<string, Mock> = {
  resolveRuntimeStateForTenant: vi.fn(),
  buildBlockedDecision: vi.fn(),
  recordBlockedDecision: vi.fn(),
};

const agentApiKeyService: Record<string, Mock> = {
  validate: vi.fn(),
};

const AGENT_RAW_KEY = `alak_${'cd'.repeat(32)}`;
const AGENT_KEY_PREFIX = AGENT_RAW_KEY.slice(0, 13);

function createAgentKeyContext(rateLimitPerMinute: number | null) {
  return {
    keyId: '019391d4-e000-7000-8000-000000000005',
    tenantId: TENANT_ID,
    agentDefinitionId: '019391d4-f000-7000-8000-000000000006',
    keyPrefix: AGENT_KEY_PREFIX,
    maxConcurrentRuns: 5,
    rateLimitPerMinute,
  };
}

const moduleRef = {
  get: vi.fn((token: unknown) => {
    if (token === PlatformApiTokenService) {
      return platformApiTokenService as unknown as PlatformApiTokenServiceLike;
    }

    if (token === ResourceGovernanceService) {
      return resourceGovernanceService as unknown as ResourceGovernanceServiceLike;
    }

    if (token === AgentApiKeyService) {
      return agentApiKeyService;
    }
    throw new Error(`Unexpected provider token: ${String(token)}`);
  }),
};

function createRuntimeState(
  overrides: Partial<ResourceGovernanceStateResponseDto['quota']> = {},
): ResourceGovernanceStateResponseDto {
  return {
    organizationId: ORGANIZATION_ID,
    quota: {
      organizationId: ORGANIZATION_ID,
      tenantId: TENANT_ID,
      apiRateLimitPerMinute: 100,
      maxConcurrentExecutions: null,
      dailyExecutionLimit: null,
      dailyApiCallLimit: null,
      storageQuotaMb: null,
      maxSandboxCpuPercent: null,
      maxSandboxMemoryMb: null,
      version: 0,
      ...overrides,
    },
    governance: {
      organizationId: ORGANIZATION_ID,
      tenantId: TENANT_ID,
      tenantControl: {
        scope: 'tenant',
        targetId: TENANT_ID,
        status: 'active',
        reason: null,
        updatedAt: null,
        updatedBy: null,
      },
      workflowControls: [],
      version: 0,
    },
  };
}

function createResponse(): HeaderWriter {
  return {
    header: vi.fn(),
  };
}

function createRequestProps(
  req: GuardRequest,
  res: HeaderWriter,
  overrides: Partial<Pick<ThrottlerRequest, 'getTracker' | 'generateKey'>> = {},
): ThrottlerRequest {
  const context = {
    req,
    res,
  } as unknown as ExecutionContext;

  return {
    context,
    limit: 100,
    ttl: 60_000,
    blockDuration: 60_000,
    throttler: { name: 'default', limit: 100, ttl: 60_000 },
    getTracker: overrides.getTracker ?? vi.fn().mockResolvedValue('jwt:user-1'),
    generateKey: overrides.generateKey ?? vi.fn().mockReturnValue('minute-key'),
  } as unknown as ThrottlerRequest;
}

function createGuard(): ExposedCustomThrottlerGuard {
  const guard = new ExposedCustomThrottlerGuard(
    throttlerOptions,
    storageService as unknown as ThrottlerStorage,
    new Reflector(),
    moduleRef as unknown as ModuleRef,
  );

  Object.assign(guard, {
    commonOptions: {},
    getRequestResponse: vi.fn((context: ThrottlerRequest['context']) => {
      const requestContext = context as unknown as {
        req: GuardRequest;
        res: HeaderWriter;
      };
      return {
        req: requestContext.req,
        res: requestContext.res,
      };
    }),
  });

  return guard;
}

describe('CustomThrottlerGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resourceGovernanceService.resolveRuntimeStateForTenant.mockResolvedValue(
      null,
    );
    resourceGovernanceService.recordBlockedDecision.mockResolvedValue(
      undefined,
    );
    resourceGovernanceService.buildBlockedDecision.mockImplementation(
      (input) => ({
        decision: 'blocked',
        action: input.action,
        category: input.category,
        scope: input.scope,
        reason: input.reason,
        effectiveState: {
          organizationId: input.organizationId,
          tenantControl: input.tenantControl,
          workflowControl: input.workflowControl ?? null,
        },
        blockedAt: '2026-03-18T00:00:00.000Z',
        metadata: input.metadata,
      }),
    );
  });

  it('应优先从原始请求头读取 API key prefix 作为限流 tracker', async () => {
    const guard = createGuard();

    await expect(
      guard.getTrackerForTest({
        headers: {
          'x-api-key': 'al_testpref1234567890',
        },
        user: { sub: 'user-1' },
        ip: '127.0.0.1',
      }),
    ).resolves.toBe('apikey:al_testpref');
  });

  it('应优先从 Bearer token 解码 JWT sub 作为限流 tracker', async () => {
    const guard = createGuard();
    const token = jwt.sign({ sub: 'user-2' }, 'test-secret');

    await expect(
      guard.getTrackerForTest({
        headers: {
          authorization: `Bearer ${token}`,
        },
        ip: '127.0.0.1',
      }),
    ).resolves.toBe('jwt:user-2');
  });

  it('在缺少原始请求头时应回退到认证上下文', async () => {
    const guard = createGuard();

    await expect(
      guard.getTrackerForTest({
        authMethod: 'api_key',
        apiKeyPrefix: 'al_ctxpref',
        user: { sub: 'user-3' },
      }),
    ).resolves.toBe('apikey:al_ctxpref');

    await expect(
      guard.getTrackerForTest({
        authMethod: 'jwt',
        user: { sub: 'user-4' },
      }),
    ).resolves.toBe('jwt:user-4');
  });

  it('缺少认证上下文时应回退到 IP 或 unknown', async () => {
    const guard = createGuard();

    await expect(
      guard.getTrackerForTest({
        ip: '10.0.0.8',
      }),
    ).resolves.toBe('10.0.0.8');

    await expect(guard.getTrackerForTest({})).resolves.toBe('unknown');
  });

  it('应使用租户分钟配额作为 API rate limit 并返回 429 explain', async () => {
    const guard = createGuard();
    const req: GuardRequest = {
      tenantId: TENANT_ID,
      user: { sub: USER_ID },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();
    const requestProps = createRequestProps(req, res);

    resourceGovernanceService.resolveRuntimeStateForTenant.mockResolvedValueOnce(
      createRuntimeState({ apiRateLimitPerMinute: 5 }),
    );
    storageService.increment.mockResolvedValueOnce({
      totalHits: 6,
      timeToExpire: 12,
      isBlocked: true,
      timeToBlockExpire: 12,
    });

    try {
      await guard.handleRequestForTest(requestProps);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ResourceGovernanceDecisionBlockedException);
      expect(
        (error as ResourceGovernanceDecisionBlockedException).block,
      ).toMatchObject({
        category: 'api_rate_limit',
        scope: 'api',
      });
      expect(
        (error as ResourceGovernanceDecisionBlockedException).getStatus(),
      ).toBe(429);
    }

    expect(storageService.increment).toHaveBeenCalledWith(
      'minute-key',
      60_000,
      5,
      60_000,
      'default',
    );
    expect(res.header).toHaveBeenCalledWith('Retry-After', 12);
    expect(res.header).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
    expect(res.header).toHaveBeenCalledWith('X-RateLimit-Remaining', 0);
    expect(res.header).toHaveBeenCalledWith('X-RateLimit-Reset', 12);
    expect(
      resourceGovernanceService.recordBlockedDecision,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: USER_ID,
        actorType: 'user',
        block: expect.objectContaining({
          metadata: expect.objectContaining({
            metric: 'apiRateLimitPerMinute',
          }),
        }),
      }),
    );
  });

  it('应在每日 API 配额超限时返回 409 且不再进入分钟限流', async () => {
    const guard = createGuard();
    const req: GuardRequest = {
      tenantId: TENANT_ID,
      user: { sub: USER_ID },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();
    const requestProps = createRequestProps(req, res);

    resourceGovernanceService.resolveRuntimeStateForTenant.mockResolvedValueOnce(
      createRuntimeState({ dailyApiCallLimit: 2, apiRateLimitPerMinute: 5 }),
    );
    storageService.increment.mockResolvedValueOnce({
      totalHits: 3,
      timeToExpire: 86_400_000,
      isBlocked: true,
      timeToBlockExpire: 86_400_000,
    });

    try {
      await guard.handleRequestForTest(requestProps);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ResourceGovernanceDecisionBlockedException);
      expect(
        (error as ResourceGovernanceDecisionBlockedException).getStatus(),
      ).toBe(409);
      expect(
        (error as ResourceGovernanceDecisionBlockedException).block.metadata,
      ).toMatchObject({
        metric: 'dailyApiCallLimit',
        limit: 2,
        currentValue: 3,
      });
    }

    expect(storageService.increment).toHaveBeenCalledTimes(1);
    expect(res.header).not.toHaveBeenCalledWith(
      'Retry-After',
      expect.anything(),
    );
    expect(
      resourceGovernanceService.recordBlockedDecision,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: USER_ID,
        actorType: 'user',
        block: expect.objectContaining({
          metadata: expect.objectContaining({
            metric: 'dailyApiCallLimit',
          }),
        }),
      }),
    );
  });

  it('应在 API key 请求中懒加载 tenant 并使用租户分钟配额', async () => {
    const guard = createGuard();
    const req: GuardRequest = {
      headers: {
        'x-api-key': 'al_testpref1234567890',
      },
      ip: '127.0.0.1',
    };
    const res = createResponse();
    const requestProps = createRequestProps(req, res);

    platformApiTokenService.validateToken.mockResolvedValueOnce({
      tokenId: '019391d4-d000-7000-0000-000000000004',
      tokenPrefix: 'al_testpref',
      tenantId: TENANT_ID,
      userId: USER_ID,
      tenantRole: 'admin',
    });
    resourceGovernanceService.resolveRuntimeStateForTenant.mockResolvedValueOnce(
      createRuntimeState({ apiRateLimitPerMinute: 7 }),
    );
    storageService.increment.mockResolvedValueOnce({
      totalHits: 1,
      timeToExpire: 60_000,
      isBlocked: false,
      timeToBlockExpire: 0,
    });

    await expect(guard.handleRequestForTest(requestProps)).resolves.toBe(true);

    expect(platformApiTokenService.validateToken).toHaveBeenCalledWith(
      'al_testpref1234567890',
    );
    expect(
      resourceGovernanceService.resolveRuntimeStateForTenant,
    ).toHaveBeenCalledWith(TENANT_ID);
    expect(req.tenantId).toBe(TENANT_ID);
    expect(req.apiKeyPrefix).toBe('al_testpref');
    expect(requestProps.generateKey).toHaveBeenCalledWith(
      requestProps.context,
      `tenant:${TENANT_ID}`,
      'default',
    );
    expect(storageService.increment).toHaveBeenCalledWith(
      'minute-key',
      60_000,
      7,
      60_000,
      'default',
    );
  });

  it('应让同一租户下不同身份共享同一分钟限流桶', async () => {
    const guard = createGuard();
    const generateKey = vi.fn((_, tracker: string) => `minute:${tracker}`);
    const reqFromJwt: GuardRequest = {
      tenantId: TENANT_ID,
      user: { sub: 'jwt-user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const reqFromApiKey: GuardRequest = {
      tenantId: TENANT_ID,
      apiKeyPrefix: 'al_testpref',
      authMethod: 'api_key',
      headers: {},
      ip: '127.0.0.2',
    };
    const jwtRequestProps = createRequestProps(reqFromJwt, createResponse(), {
      getTracker: vi.fn().mockResolvedValue('jwt:jwt-user'),
      generateKey,
    });
    const apiKeyRequestProps = createRequestProps(
      reqFromApiKey,
      createResponse(),
      {
        getTracker: vi.fn().mockResolvedValue('apikey:al_testpref'),
        generateKey,
      },
    );

    resourceGovernanceService.resolveRuntimeStateForTenant.mockResolvedValue(
      createRuntimeState({ apiRateLimitPerMinute: 7 }),
    );
    storageService.increment
      .mockResolvedValueOnce({
        totalHits: 1,
        timeToExpire: 60_000,
        isBlocked: false,
        timeToBlockExpire: 0,
      })
      .mockResolvedValueOnce({
        totalHits: 2,
        timeToExpire: 60_000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

    await expect(guard.handleRequestForTest(jwtRequestProps)).resolves.toBe(
      true,
    );
    await expect(guard.handleRequestForTest(apiKeyRequestProps)).resolves.toBe(
      true,
    );

    expect(generateKey).toHaveBeenNthCalledWith(
      1,
      jwtRequestProps.context,
      `tenant:${TENANT_ID}`,
      'default',
    );
    expect(generateKey).toHaveBeenNthCalledWith(
      2,
      apiKeyRequestProps.context,
      `tenant:${TENANT_ID}`,
      'default',
    );
    expect(storageService.increment).toHaveBeenNthCalledWith(
      1,
      `minute:tenant:${TENANT_ID}`,
      60_000,
      7,
      60_000,
      'default',
    );
    expect(storageService.increment).toHaveBeenNthCalledWith(
      2,
      `minute:tenant:${TENANT_ID}`,
      60_000,
      7,
      60_000,
      'default',
    );
  });

  it('supports array headers and ignores malformed authentication headers', async () => {
    const guard = createGuard();
    const token = jwt.sign({ sub: 'array-user' }, 'test-secret');

    await expect(
      guard.getTrackerForTest({
        headers: { authorization: [`Bearer ${token}`] },
      }),
    ).resolves.toBe('jwt:array-user');
    await expect(
      guard.getTrackerForTest({
        headers: {
          'x-api-key': 'wrong-prefix',
          authorization: 'Bearer malformed',
        },
        ip: '10.0.0.9',
      }),
    ).resolves.toBe('10.0.0.9');
    await expect(
      guard.getTrackerForTest({
        headers: { authorization: 'Basic credentials' },
      }),
    ).resolves.toBe('unknown');
  });

  it('uses a JWT tenant claim without validating an API token', async () => {
    const guard = createGuard();
    const token = jwt.sign({ sub: USER_ID, tenant_id: TENANT_ID }, 'secret');
    const req: GuardRequest = {
      headers: { authorization: `Bearer ${token}` },
    };
    const res = createResponse();
    const props = createRequestProps(req, res);
    storageService.increment.mockResolvedValueOnce({
      totalHits: 1,
      timeToExpire: 21,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    resourceGovernanceService.resolveRuntimeStateForTenant.mockResolvedValueOnce(
      createRuntimeState({ apiRateLimitPerMinute: 9 }),
    );

    await expect(guard.handleRequestForTest(props)).resolves.toBe(true);

    expect(req.tenantId).toBe(TENANT_ID);
    expect(platformApiTokenService.validateToken).not.toHaveBeenCalled();
    expect(props.generateKey).toHaveBeenCalledWith(
      props.context,
      `tenant:${TENANT_ID}`,
      'default',
    );
  });

  it('prefers the raw adapter tenant and writes named-throttler headers', async () => {
    const guard = createGuard();
    const req: GuardRequest = {
      raw: { tenantId: TENANT_ID },
      headers: {},
    };
    const res = createResponse();
    const props = createRequestProps(req, res);
    Object.assign(props, {
      throttler: {
        name: 'uploads',
        ttl: 60_000,
        limit: 100,
        setHeaders: true,
      },
    });
    storageService.increment.mockResolvedValueOnce({
      totalHits: 3,
      timeToExpire: 44,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    resourceGovernanceService.resolveRuntimeStateForTenant.mockResolvedValueOnce(
      createRuntimeState({ apiRateLimitPerMinute: 10 }),
    );

    await expect(guard.handleRequestForTest(props)).resolves.toBe(true);

    expect(req.tenantId).toBe(TENANT_ID);
    expect(res.header).toHaveBeenCalledWith('X-RateLimit-Limit-uploads', 10);
    expect(res.header).toHaveBeenCalledWith('X-RateLimit-Remaining-uploads', 7);
    expect(res.header).toHaveBeenCalledWith('X-RateLimit-Reset-uploads', 44);
  });

  it('honors disabled headers on a blocked tenant request', async () => {
    const guard = createGuard();
    const req: GuardRequest = { tenantId: TENANT_ID, headers: {} };
    const res = createResponse();
    const props = createRequestProps(req, res);
    Object.assign(props, {
      throttler: {
        name: 'quiet',
        ttl: 60_000,
        limit: 100,
        setHeaders: false,
      },
    });
    resourceGovernanceService.resolveRuntimeStateForTenant.mockResolvedValueOnce(
      createRuntimeState({ apiRateLimitPerMinute: 2 }),
    );
    storageService.increment.mockResolvedValueOnce({
      totalHits: 3,
      timeToExpire: 11,
      isBlocked: true,
      timeToBlockExpire: 11,
    });

    await expect(guard.handleRequestForTest(props)).rejects.toBeInstanceOf(
      ResourceGovernanceDecisionBlockedException,
    );
    expect(res.header).not.toHaveBeenCalled();
  });

  it('匿名请求超限时返回 rate-limit-exceeded 429 并带 Retry-After', async () => {
    const guard = createGuard();
    const req: GuardRequest = { headers: {}, ip: '192.0.2.1' };
    const res = createResponse();
    const props = createRequestProps(req, res);
    storageService.increment.mockResolvedValueOnce({
      totalHits: 101,
      timeToExpire: 8,
      isBlocked: true,
      timeToBlockExpire: 8,
    });

    const error = await guard
      .handleRequestForTest(props)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitExceededException);
    expect((error as RateLimitExceededException).getStatus()).toBe(429);
    expect((error as RateLimitExceededException).type).toBe(
      'https://agentloom.dev/errors/rate-limit-exceeded',
    );
    expect((error as RateLimitExceededException).headers).toEqual({
      'Retry-After': '8',
    });
    expect(res.header).toHaveBeenCalledWith('Retry-After', 8);
  });

  describe('Agent API Key（Bearer alak_）', () => {
    function createAgentKeyRequest(): GuardRequest {
      return {
        headers: { authorization: `Bearer ${AGENT_RAW_KEY}` },
        ip: '198.51.100.7',
      };
    }

    function createTrackerAwareProps(req: GuardRequest, res: HeaderWriter) {
      const guard = createGuard();
      const props = createRequestProps(req, res, {
        getTracker: vi.fn((request: GuardRequest) =>
          guard.getTrackerForTest(request),
        ),
        generateKey: vi.fn((_, tracker: string) => `minute:${tracker}`),
      });
      return { guard, props };
    }

    it('按 Key 独立计数，Key 自身限额优先于租户分钟配额', async () => {
      const req = createAgentKeyRequest();
      const { guard, props } = createTrackerAwareProps(req, createResponse());
      agentApiKeyService.validate.mockResolvedValueOnce(
        createAgentKeyContext(30),
      );
      resourceGovernanceService.resolveRuntimeStateForTenant.mockResolvedValueOnce(
        createRuntimeState({ apiRateLimitPerMinute: 500 }),
      );
      storageService.increment.mockResolvedValueOnce({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      await expect(guard.handleRequestForTest(props)).resolves.toBe(true);

      expect(agentApiKeyService.validate).toHaveBeenCalledWith(AGENT_RAW_KEY);
      expect(storageService.increment).toHaveBeenCalledWith(
        `minute:agentkey:${AGENT_KEY_PREFIX}`,
        60_000,
        30,
        60_000,
        'default',
      );
      expect(platformApiTokenService.validateToken).not.toHaveBeenCalled();
    });

    it('Key 未配置限额时使用 Key 所属租户的分钟配额，并计入租户日配额', async () => {
      const req = createAgentKeyRequest();
      const { guard, props } = createTrackerAwareProps(req, createResponse());
      agentApiKeyService.validate.mockResolvedValueOnce(
        createAgentKeyContext(null),
      );
      resourceGovernanceService.resolveRuntimeStateForTenant.mockResolvedValueOnce(
        createRuntimeState({
          apiRateLimitPerMinute: 12,
          dailyApiCallLimit: 1000,
        }),
      );
      storageService.increment
        .mockResolvedValueOnce({
          totalHits: 3,
          timeToExpire: 86_400,
          isBlocked: false,
          timeToBlockExpire: 0,
        })
        .mockResolvedValueOnce({
          totalHits: 1,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        });

      await expect(guard.handleRequestForTest(props)).resolves.toBe(true);

      expect(
        resourceGovernanceService.resolveRuntimeStateForTenant,
      ).toHaveBeenCalledWith(TENANT_ID);
      expect(storageService.increment).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(`resource-governance:daily-api:${TENANT_ID}:`),
        expect.any(Number),
        1000,
        expect.any(Number),
        'default-daily-api-quota',
      );
      expect(storageService.increment).toHaveBeenNthCalledWith(
        2,
        `minute:agentkey:${AGENT_KEY_PREFIX}`,
        60_000,
        12,
        60_000,
        'default',
      );
    });

    it('无效 alak_ Key 不让节流器抛错，回退按 IP 计数', async () => {
      const req = createAgentKeyRequest();
      const { guard, props } = createTrackerAwareProps(req, createResponse());
      agentApiKeyService.validate.mockRejectedValueOnce(
        new AgentApiKeyInvalidException(),
      );
      storageService.increment.mockResolvedValueOnce({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      await expect(guard.handleRequestForTest(props)).resolves.toBe(true);

      expect(storageService.increment).toHaveBeenCalledWith(
        'minute:198.51.100.7',
        60_000,
        100,
        60_000,
        'default',
      );
      expect(
        resourceGovernanceService.resolveRuntimeStateForTenant,
      ).not.toHaveBeenCalled();
    });

    it('Key 超限时返回 rate-limit-exceeded 并以 service 身份记录拦截', async () => {
      const req = createAgentKeyRequest();
      const res = createResponse();
      const { guard, props } = createTrackerAwareProps(req, res);
      agentApiKeyService.validate.mockResolvedValueOnce(
        createAgentKeyContext(2),
      );
      resourceGovernanceService.resolveRuntimeStateForTenant.mockResolvedValueOnce(
        createRuntimeState({ apiRateLimitPerMinute: 100 }),
      );
      storageService.increment.mockResolvedValueOnce({
        totalHits: 3,
        timeToExpire: 40,
        isBlocked: true,
        timeToBlockExpire: 40,
      });

      const error = await guard
        .handleRequestForTest(props)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RateLimitExceededException);
      expect((error as RateLimitExceededException).headers).toEqual({
        'Retry-After': '40',
      });
      expect(res.header).toHaveBeenCalledWith('X-RateLimit-Limit', 2);
      expect(
        resourceGovernanceService.recordBlockedDecision,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorId: null,
          actorType: 'service',
          metadata: {
            apiKeyPrefix: AGENT_KEY_PREFIX,
            tracker: `agentkey:${AGENT_KEY_PREFIX}`,
          },
        }),
      );
    });
  });

  it('short-circuits matching ignored user agents before tenant or storage work', async () => {
    const guard = createGuard();
    Object.assign(guard, {
      commonOptions: { ignoreUserAgents: [/health-probe/] },
    });
    const req: GuardRequest = {
      headers: { 'user-agent': 'internal-health-probe/1.0' },
      tenantId: TENANT_ID,
    };
    const props = createRequestProps(req, createResponse());

    await expect(guard.handleRequestForTest(props)).resolves.toBe(true);

    expect(storageService.increment).not.toHaveBeenCalled();
    expect(
      resourceGovernanceService.resolveRuntimeStateForTenant,
    ).not.toHaveBeenCalled();
  });

  it('records API-token users as actors for daily quota blocks', async () => {
    const guard = createGuard();
    const req: GuardRequest = {
      headers: { 'x-api-key': 'al_servicep123456789' },
    };
    const props = createRequestProps(req, createResponse(), {
      getTracker: vi.fn().mockResolvedValue('apikey:al_servicep'),
    });
    platformApiTokenService.validateToken.mockResolvedValueOnce({
      tokenId: 'token-id',
      tokenPrefix: 'al_servicep',
      tenantId: TENANT_ID,
      userId: USER_ID,
      tenantRole: 'admin',
    });
    resourceGovernanceService.resolveRuntimeStateForTenant.mockResolvedValueOnce(
      createRuntimeState({ dailyApiCallLimit: 1 }),
    );
    storageService.increment.mockResolvedValueOnce({
      totalHits: 2,
      timeToExpire: 100,
      isBlocked: true,
      timeToBlockExpire: 100,
    });

    await expect(guard.handleRequestForTest(props)).rejects.toBeInstanceOf(
      ResourceGovernanceDecisionBlockedException,
    );

    expect(
      resourceGovernanceService.recordBlockedDecision,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: USER_ID,
        actorType: 'user',
        metadata: expect.objectContaining({
          apiKeyPrefix: 'al_servicep',
          tracker: 'apikey:al_servicep',
        }),
      }),
    );
  });

  it('records a pre-resolved API key without a user as a service actor', async () => {
    const guard = createGuard();
    const req: GuardRequest = {
      tenantId: TENANT_ID,
      apiKeyPrefix: 'al_servicep',
      headers: {},
    };
    const props = createRequestProps(req, createResponse());
    resourceGovernanceService.resolveRuntimeStateForTenant.mockResolvedValueOnce(
      createRuntimeState({ apiRateLimitPerMinute: 1 }),
    );
    storageService.increment.mockResolvedValueOnce({
      totalHits: 2,
      timeToExpire: 4,
      isBlocked: true,
      timeToBlockExpire: 4,
    });

    await expect(guard.handleRequestForTest(props)).rejects.toBeInstanceOf(
      ResourceGovernanceDecisionBlockedException,
    );
    expect(
      resourceGovernanceService.recordBlockedDecision,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        actorType: 'service',
      }),
    );
  });

  it('falls back to system actor when a tenant has no authenticated identity', async () => {
    const guard = createGuard();
    const req: GuardRequest = { tenantId: TENANT_ID, headers: {} };
    const props = createRequestProps(req, createResponse());
    resourceGovernanceService.resolveRuntimeStateForTenant.mockResolvedValueOnce(
      createRuntimeState({ apiRateLimitPerMinute: 1 }),
    );
    storageService.increment.mockResolvedValueOnce({
      totalHits: 2,
      timeToExpire: 4,
      isBlocked: true,
      timeToBlockExpire: 4,
    });

    await expect(guard.handleRequestForTest(props)).rejects.toBeInstanceOf(
      ResourceGovernanceDecisionBlockedException,
    );
    expect(
      resourceGovernanceService.recordBlockedDecision,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        actorType: 'system',
      }),
    );
  });
});

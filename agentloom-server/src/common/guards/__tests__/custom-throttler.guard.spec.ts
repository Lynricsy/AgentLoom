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

const moduleRef = {
  get: vi.fn((token: unknown) => {
    if (token === PlatformApiTokenService) {
      return platformApiTokenService as unknown as PlatformApiTokenServiceLike;
    }

    if (token === ResourceGovernanceService) {
      return resourceGovernanceService as unknown as ResourceGovernanceServiceLike;
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

  it('delegates anonymous rate-limit failures to the base throttling exception', async () => {
    const guard = createGuard();
    const req: GuardRequest = { headers: {}, ip: '192.0.2.1' };
    const res = createResponse();
    const props = createRequestProps(req, res);
    const throttled = new Error('base throttled');
    const throwThrottlingException = vi.fn().mockRejectedValue(throttled);
    Object.assign(guard, { throwThrottlingException });
    storageService.increment.mockResolvedValueOnce({
      totalHits: 101,
      timeToExpire: 8,
      isBlocked: true,
      timeToBlockExpire: 8,
    });

    await expect(guard.handleRequestForTest(props)).rejects.toBe(throttled);

    expect(throwThrottlingException).toHaveBeenCalledWith(
      props.context,
      expect.objectContaining({
        tracker: 'jwt:user-1',
        totalHits: 101,
        isBlocked: true,
      }),
    );
    expect(res.header).toHaveBeenCalledWith('Retry-After', 8);
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

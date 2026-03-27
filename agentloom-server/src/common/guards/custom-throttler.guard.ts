import { Injectable } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
  type ThrottlerRequest,
} from '@nestjs/throttler';
import * as jwt from 'jsonwebtoken';
import { validate as isUuid } from 'uuid';
import { PlatformApiTokenService } from '../../modules/platform-api-token/platform-api-token.service';
import { ResourceGovernanceService } from '../../modules/resource-governance/resource-governance.service';
import { ResourceGovernanceDecisionBlockedException } from '../../modules/resource-governance/resource-governance.exceptions';

const RAW_TOKEN_PREFIX = 'al_';
const TOKEN_PREFIX_LENGTH = RAW_TOKEN_PREFIX.length + 8;

type RequestHeaders = Record<string, string | string[] | undefined>;

type TrackerRequest = Record<string, unknown> & {
  authMethod?: string;
  tenantId?: string;
  apiTokenUserId?: string;
  raw?: {
    tenantId?: string;
    headers?: RequestHeaders;
  };
  user?: {
    sub?: string;
  };
  apiKeyPrefix?: string;
  ip?: string;
  headers?: RequestHeaders;
};

type ThrottlerResponse = {
  header: (name: string, value: number | string) => unknown;
};

function hasHeaderWriter(response: unknown): response is ThrottlerResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'header' in response &&
    typeof response.header === 'function'
  );
}

function getThrottlerSuffix(name: string): string {
  return name === 'default' ? '' : `-${name}`;
}

function writeRateLimitHeaders(
  response: unknown,
  throttlerName: string,
  headerPrefix: string,
  limit: number,
  remaining: number,
  reset: number,
): void {
  if (!hasHeaderWriter(response)) {
    return;
  }

  const suffix = getThrottlerSuffix(throttlerName);

  response.header(`${headerPrefix}-Limit${suffix}`, limit);
  response.header(`${headerPrefix}-Remaining${suffix}`, remaining);
  response.header(`${headerPrefix}-Reset${suffix}`, reset);
}

function writeRetryAfterHeader(
  response: unknown,
  throttlerName: string,
  retryAfter: number,
): void {
  if (!hasHeaderWriter(response)) {
    return;
  }

  response.header(
    `Retry-After${getThrottlerSuffix(throttlerName)}`,
    retryAfter,
  );
}

function getSingleHeaderValue(
  headers: RequestHeaders | undefined,
  name: string,
): string | undefined {
  const headerValue = headers?.[name];

  if (typeof headerValue === 'string' && headerValue.length > 0) {
    return headerValue;
  }

  if (Array.isArray(headerValue) && typeof headerValue[0] === 'string') {
    return headerValue[0];
  }

  return undefined;
}

function extractApiKeyPrefix(
  headers: RequestHeaders | undefined,
): string | undefined {
  const apiKey = getSingleHeaderValue(headers, 'x-api-key');

  if (!apiKey || !apiKey.startsWith(RAW_TOKEN_PREFIX)) {
    return undefined;
  }

  return apiKey.slice(0, TOKEN_PREFIX_LENGTH);
}

function extractJwtSub(
  headers: RequestHeaders | undefined,
): string | undefined {
  const authorization = getSingleHeaderValue(headers, 'authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return undefined;
  }

  const decoded = jwt.decode(authorization.slice('Bearer '.length));

  if (
    decoded &&
    typeof decoded === 'object' &&
    typeof decoded.sub === 'string' &&
    decoded.sub.length > 0
  ) {
    return decoded.sub;
  }

  return undefined;
}

function extractJwtTenantId(
  headers: RequestHeaders | undefined,
): string | undefined {
  const authorization = getSingleHeaderValue(headers, 'authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return undefined;
  }

  try {
    const payloadPart = authorization.slice('Bearer '.length).split('.')[1];

    if (!payloadPart) {
      return undefined;
    }

    const payload = JSON.parse(
      Buffer.from(payloadPart, 'base64url').toString(),
    ) as {
      tenantId?: string;
      tenant_id?: string;
    };
    const tenantId = payload.tenantId ?? payload.tenant_id;

    return tenantId && isUuid(tenantId) ? tenantId : undefined;
  } catch {
    return undefined;
  }
}

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  private platformApiTokenService?: PlatformApiTokenService;
  private resourceGovernanceService?: ResourceGovernanceService;

  constructor(
    @InjectThrottlerOptions()
    options: ThrottlerModuleOptions,
    @InjectThrottlerStorage()
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {
    super(options, storageService, reflector);
  }

  protected override async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const {
      context,
      limit,
      ttl,
      throttler,
      blockDuration,
      getTracker,
      generateKey,
    } = requestProps;
    const { req, res } = this.getRequestResponse(context);
    const throttlerName = throttler.name ?? 'default';
    const ignoreUserAgents =
      throttler.ignoreUserAgents ?? this.commonOptions.ignoreUserAgents;

    if (Array.isArray(ignoreUserAgents)) {
      const userAgentHeader = req.headers['user-agent'];

      for (const pattern of ignoreUserAgents) {
        if (
          typeof userAgentHeader === 'string' &&
          pattern.test(userAgentHeader)
        ) {
          return true;
        }
      }
    }

    const tracker = await getTracker(req, context);
    const tenantId = await this.resolveTenantId(req);
    const resourceGovernanceService = this.getResourceGovernanceService();
    const runtimeState = tenantId
      ? await resourceGovernanceService.resolveRuntimeStateForTenant(tenantId)
      : null;
    const effectiveLimit = runtimeState?.quota.apiRateLimitPerMinute ?? limit;
    const rateLimitTracker = tenantId ? `tenant:${tenantId}` : tracker;

    if (
      tenantId &&
      runtimeState &&
      runtimeState.quota.dailyApiCallLimit !== null
    ) {
      const { organizationId } = runtimeState;
      const { tenantControl } = runtimeState.governance;
      const dailyApiCallLimit = runtimeState.quota.dailyApiCallLimit;
      const dailyQuotaTtl = this.getDailyQuotaTtlMs(new Date());
      const dailyQuotaKey = this.buildDailyQuotaKey(tenantId);
      const dailyQuotaResult = await this.storageService.increment(
        dailyQuotaKey,
        dailyQuotaTtl,
        dailyApiCallLimit,
        dailyQuotaTtl,
        `${throttlerName}-daily-api-quota`,
      );

      if (dailyQuotaResult.isBlocked) {
        const block = resourceGovernanceService.buildBlockedDecision({
          action: 'api_request',
          category: 'api_rate_limit',
          scope: 'api',
          reason: 'tenant daily API quota has been exceeded',
          organizationId,
          tenantControl,
          metadata: {
            metric: 'dailyApiCallLimit',
            limit: dailyApiCallLimit,
            currentValue: dailyQuotaResult.totalHits,
            retryAfterSeconds: dailyQuotaResult.timeToBlockExpire,
          },
        });
        const actor = this.resolveBlockedDecisionActor(req);
        await resourceGovernanceService.recordBlockedDecision({
          tenantId,
          actorId: actor.actorId,
          actorType: actor.actorType,
          block,
          metadata: {
            apiKeyPrefix: req.apiKeyPrefix ?? null,
            tracker,
          },
        });
        throw new ResourceGovernanceDecisionBlockedException(block);
      }
    }

    const key = generateKey(context, rateLimitTracker, throttlerName);
    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(
        key,
        ttl,
        effectiveLimit,
        blockDuration,
        throttlerName,
      );
    const setHeaders =
      throttler.setHeaders ?? this.commonOptions.setHeaders ?? true;

    if (isBlocked) {
      if (setHeaders) {
        writeRetryAfterHeader(res, throttlerName, timeToBlockExpire);
        writeRateLimitHeaders(
          res,
          throttlerName,
          this.headerPrefix,
          effectiveLimit,
          0,
          timeToBlockExpire,
        );
      }

      if (tenantId && runtimeState) {
        const block = resourceGovernanceService.buildBlockedDecision({
          action: 'api_request',
          category: 'api_rate_limit',
          scope: 'api',
          reason: 'tenant API minute rate limit has been exceeded',
          organizationId: runtimeState.organizationId,
          tenantControl: runtimeState.governance.tenantControl,
          metadata: {
            metric: 'apiRateLimitPerMinute',
            limit: effectiveLimit,
            currentValue: totalHits,
            retryAfterSeconds: timeToBlockExpire,
          },
        });
        const actor = this.resolveBlockedDecisionActor(req);
        await resourceGovernanceService.recordBlockedDecision({
          tenantId,
          actorId: actor.actorId,
          actorType: actor.actorType,
          block,
          metadata: {
            apiKeyPrefix: req.apiKeyPrefix ?? null,
            tracker,
          },
        });
        throw new ResourceGovernanceDecisionBlockedException(block);
      }

      const throttlerLimitDetail: ThrottlerLimitDetail = {
        ttl,
        limit: effectiveLimit,
        key,
        tracker: rateLimitTracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      };

      await this.throwThrottlingException(context, throttlerLimitDetail);
    }

    if (setHeaders) {
      writeRateLimitHeaders(
        res,
        throttlerName,
        this.headerPrefix,
        effectiveLimit,
        Math.max(0, effectiveLimit - totalHits),
        timeToExpire,
      );
    }

    return true;
  }

  protected override async getTracker(req: TrackerRequest): Promise<string> {
    const apiKeyPrefix = extractApiKeyPrefix(req.headers) ?? req.apiKeyPrefix;

    if (typeof apiKeyPrefix === 'string' && apiKeyPrefix.length > 0) {
      return `apikey:${apiKeyPrefix}`;
    }

    const jwtSub = extractJwtSub(req.headers) ?? req.user?.sub;

    if (typeof jwtSub === 'string' && jwtSub.length > 0) {
      return `jwt:${jwtSub}`;
    }

    return typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : 'unknown';
  }

  private getPlatformApiTokenService(): PlatformApiTokenService {
    if (!this.platformApiTokenService) {
      this.platformApiTokenService = this.moduleRef.get(
        PlatformApiTokenService,
        {
          strict: false,
        },
      );
    }

    return this.platformApiTokenService;
  }

  private getResourceGovernanceService(): ResourceGovernanceService {
    if (!this.resourceGovernanceService) {
      this.resourceGovernanceService = this.moduleRef.get(
        ResourceGovernanceService,
        { strict: false },
      );
    }

    return this.resourceGovernanceService;
  }

  private async resolveTenantId(req: TrackerRequest): Promise<string | null> {
    if (typeof req.tenantId === 'string' && req.tenantId.length > 0) {
      return req.tenantId;
    }

    if (typeof req.raw?.tenantId === 'string' && req.raw.tenantId.length > 0) {
      req.tenantId = req.raw.tenantId;
      return req.raw.tenantId;
    }

    const jwtTenantId =
      extractJwtTenantId(req.headers) ?? extractJwtTenantId(req.raw?.headers);

    if (jwtTenantId) {
      req.tenantId = jwtTenantId;
      return jwtTenantId;
    }

    const apiKey = getSingleHeaderValue(req.headers, 'x-api-key');

    if (!apiKey) {
      return null;
    }

    const validated =
      await this.getPlatformApiTokenService().validateToken(apiKey);
    req.tenantId = validated.tenantId;
    req.apiKeyPrefix = validated.tokenPrefix;
    req.apiTokenUserId = validated.userId;
    return validated.tenantId;
  }

  private resolveBlockedDecisionActor(req: TrackerRequest): {
    actorId: string | null;
    actorType: 'user' | 'system' | 'service';
  } {
    if (typeof req.user?.sub === 'string' && req.user.sub.length > 0) {
      return {
        actorId: req.user.sub,
        actorType: 'user',
      };
    }

    if (
      typeof req.apiTokenUserId === 'string' &&
      req.apiTokenUserId.length > 0
    ) {
      return {
        actorId: req.apiTokenUserId,
        actorType: 'user',
      };
    }

    if (typeof req.apiKeyPrefix === 'string' && req.apiKeyPrefix.length > 0) {
      return {
        actorId: null,
        actorType: 'service',
      };
    }

    return {
      actorId: null,
      actorType: 'system',
    };
  }

  private buildDailyQuotaKey(tenantId: string): string {
    const dayBucket = new Date().toISOString().slice(0, 10);
    return `resource-governance:daily-api:${tenantId}:${dayBucket}`;
  }

  private getDailyQuotaTtlMs(now: Date): number {
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    return Math.max(1, tomorrow.getTime() - now.getTime());
  }
}

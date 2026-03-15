import { Injectable } from '@nestjs/common';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerRequest,
} from '@nestjs/throttler';
import * as jwt from 'jsonwebtoken';

const RAW_TOKEN_PREFIX = 'al_';
const TOKEN_PREFIX_LENGTH = RAW_TOKEN_PREFIX.length + 8;

type RequestHeaders = Record<string, string | string[] | undefined>;

type TrackerRequest = Record<string, unknown> & {
  authMethod?: string;
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

  response.header(`Retry-After${getThrottlerSuffix(throttlerName)}`, retryAfter);
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

function extractApiKeyPrefix(headers: RequestHeaders | undefined): string | undefined {
  const apiKey = getSingleHeaderValue(headers, 'x-api-key');

  if (!apiKey || !apiKey.startsWith(RAW_TOKEN_PREFIX)) {
    return undefined;
  }

  return apiKey.slice(0, TOKEN_PREFIX_LENGTH);
}

function extractJwtSub(headers: RequestHeaders | undefined): string | undefined {
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

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
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
    const key = generateKey(context, tracker, throttlerName);
    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    const setHeaders = throttler.setHeaders ?? this.commonOptions.setHeaders ?? true;

    if (isBlocked) {
      if (setHeaders) {
        writeRetryAfterHeader(res, throttlerName, timeToBlockExpire);
        writeRateLimitHeaders(
          res,
          throttlerName,
          this.headerPrefix,
          limit,
          0,
          timeToBlockExpire,
        );
      }

      const throttlerLimitDetail: ThrottlerLimitDetail = {
        ttl,
        limit,
        key,
        tracker,
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
        limit,
        Math.max(0, limit - totalHits),
        timeToExpire,
      );
    }

    return true;
  }

  protected override async getTracker(
    req: TrackerRequest,
  ): Promise<string> {
    const apiKeyPrefix = extractApiKeyPrefix(req.headers) ?? req.apiKeyPrefix;

    if (
      typeof apiKeyPrefix === 'string' &&
      apiKeyPrefix.length > 0
    ) {
      return `apikey:${apiKeyPrefix}`;
    }

    const jwtSub = extractJwtSub(req.headers) ?? req.user?.sub;

    if (typeof jwtSub === 'string' && jwtSub.length > 0) {
      return `jwt:${jwtSub}`;
    }

    return typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : 'unknown';
  }
}

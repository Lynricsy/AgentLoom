import { describe, expect, it } from 'vitest';
import * as jwt from 'jsonwebtoken';

import { CustomThrottlerGuard } from '../custom-throttler.guard';

type GuardRequest = {
  headers?: Record<string, string | string[] | undefined>;
  authMethod?: string;
  user?: {
    sub?: string;
  };
  apiKeyPrefix?: string;
  ip?: string;
};

class ExposedCustomThrottlerGuard extends CustomThrottlerGuard {
  public getTrackerForTest(req: GuardRequest): Promise<string> {
    return this.getTracker(req);
  }
}

function createGuard(): ExposedCustomThrottlerGuard {
  return Object.create(
    ExposedCustomThrottlerGuard.prototype,
  ) as ExposedCustomThrottlerGuard;
}

describe('CustomThrottlerGuard', () => {
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
});

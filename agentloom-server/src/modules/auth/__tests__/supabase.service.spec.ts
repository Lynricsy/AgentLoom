import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthUnavailableException } from '../../../common/exceptions/auth.exceptions';

/**
 * 不 mock supabase-js：真实 auth-js client 打到一个 fetch 桩实现的 GoTrue，
 * 这样 client 内部状态（会话存储、refresh 单飞、commit guard）都按真实行为参与。
 */

const SUPABASE_URL = 'https://example.supabase.co';
const CONFIG = {
  APP_DEPLOYMENT_MODE: 'saas',
  APP_SUPABASE_URL: `${SUPABASE_URL}/`,
  APP_SUPABASE_ANON_KEY: 'anon-key',
  APP_SUPABASE_SERVICE_KEY: 'service-key',
};

interface Account {
  id: string;
  email: string;
  password: string;
  refreshToken: string;
}

const ALICE: Account = {
  id: 'user-alice',
  email: 'alice@example.com',
  password: 'Alice-Pass-1',
  refreshToken: 'rt-alice',
};
const BOB: Account = {
  id: 'user-bob',
  email: 'bob@example.com',
  password: 'Bob-Pass-1',
  refreshToken: 'rt-bob',
};
const CAROL: Account = {
  id: 'user-carol',
  email: 'carol@example.com',
  password: 'Carol-Pass-1',
  refreshToken: 'rt-carol',
};
const ACCOUNTS = [ALICE, BOB, CAROL];

function createMockConfigService(values: Record<string, string | undefined>) {
  return {
    get: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

const TokenRequestSchema = z.object({
  refresh_token: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
});
const JwtClaimsSchema = z.object({ sub: z.string().optional() });

function fakeJwt(claims: Record<string, unknown>) {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  // auth-js 校验每段都是合法 base64url（不验签）
  return `${header}.${payload}.${Buffer.from('signature').toString('base64url')}`;
}

function userBody(account: Account) {
  return {
    id: account.id,
    aud: 'authenticated',
    email: account.email,
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    factors: [
      {
        id: `${account.id}-totp`,
        factor_type: 'totp',
        status: 'verified',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
  };
}

function sessionBody(account: Account) {
  return {
    access_token: fakeJwt({ sub: account.id, aal: 'aal1' }),
    refresh_token: `${account.refreshToken}-rotated`,
    token_type: 'bearer',
    expires_in: 3600,
    user: userBody(account),
  };
}

interface RecordedRequest {
  method: string;
  path: string;
  grantType: string | null;
  headers: Headers;
}

/** 按凭据返回对应账号会话的 GoTrue 桩；latency 让并发请求在网络上真正重叠。 */
function stubGoTrue(latencyMs: { password?: number; refresh?: number } = {}) {
  const requests: RecordedRequest[] = [];

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? 'GET';
      const headers = new Headers(init.headers);
      const grantType = url.searchParams.get('grant_type');
      requests.push({ method, path: url.pathname, grantType, headers });

      const body = TokenRequestSchema.parse(
        init.body ? JSON.parse(String(init.body)) : {},
      );

      if (method === 'POST' && url.pathname === '/auth/v1/token') {
        const account =
          grantType === 'refresh_token'
            ? ACCOUNTS.find((a) => a.refreshToken === body.refresh_token)
            : ACCOUNTS.find(
                (a) => a.email === body.email && a.password === body.password,
              );
        await delay(
          (grantType === 'refresh_token'
            ? latencyMs.refresh
            : latencyMs.password) ?? 0,
        );
        return account
          ? Response.json(sessionBody(account))
          : Response.json(
              { error: 'invalid_grant', error_description: 'Invalid grant' },
              { status: 400 },
            );
      }

      if (method === 'GET' && url.pathname === '/auth/v1/user') {
        const token = headers.get('authorization')?.replace(/^Bearer /, '');
        const { sub } = JwtClaimsSchema.parse(
          token
            ? JSON.parse(
                Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
              )
            : {},
        );
        const account = ACCOUNTS.find((a) => a.id === sub);
        return account
          ? Response.json(userBody(account))
          : Response.json({ msg: 'invalid JWT' }, { status: 401 });
      }

      if (method === 'POST' && url.pathname === '/auth/v1/logout') {
        return new Response(null, { status: 204 });
      }

      return Response.json({ msg: 'not found' }, { status: 404 });
    },
  );

  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, requests };
}

describe('SupabaseService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('private 模式缺少 APP_SUPABASE_* 时调用显式报不可用，不发请求', async () => {
    const { fetchMock } = stubGoTrue();
    const service = new SupabaseService(
      createMockConfigService({
        APP_DEPLOYMENT_MODE: 'private',
      }),
    );

    await expect(
      service.signIn('test@example.com', 'Password123'),
    ).rejects.toBeInstanceOf(AuthUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('会话隔离：服务端 client 不持有用户会话', () => {
    it('两个账号并发 refresh 各自拿到自己的会话，各发一次 GoTrue 请求', async () => {
      const { requests } = stubGoTrue({ refresh: 20 });
      const service = new SupabaseService(createMockConfigService(CONFIG));

      const [aliceResult, bobResult] = await Promise.all([
        service.refreshToken(ALICE.refreshToken),
        service.refreshToken(BOB.refreshToken),
      ]);

      expect(aliceResult.user?.id).toBe(ALICE.id);
      expect(aliceResult.session?.refresh_token).toBe('rt-alice-rotated');
      expect(bobResult.user?.id).toBe(BOB.id);
      expect(bobResult.session?.refresh_token).toBe('rt-bob-rotated');
      expect(
        requests.filter((r) => r.grantType === 'refresh_token'),
      ).toHaveLength(2);
    });

    it('并发 refresh 中任一方失败不影响另一方', async () => {
      stubGoTrue({ refresh: 20 });
      const service = new SupabaseService(createMockConfigService(CONFIG));

      const [invalid, bobResult] = await Promise.allSettled([
        service.refreshToken('rt-revoked'),
        service.refreshToken(BOB.refreshToken),
      ]);

      expect(invalid.status).toBe('rejected');
      expect(bobResult).toMatchObject({
        status: 'fulfilled',
        value: { user: { id: BOB.id } },
      });
    });

    it('他人登录与 refresh 并发时 refresh 不被丢弃', async () => {
      stubGoTrue({ refresh: 20, password: 0 });
      const service = new SupabaseService(createMockConfigService(CONFIG));
      await service.signIn(CAROL.email, CAROL.password);

      const [bobResult, aliceLogin] = await Promise.all([
        service.refreshToken(BOB.refreshToken),
        service.signIn(ALICE.email, ALICE.password),
      ]);

      expect(bobResult.user?.id).toBe(BOB.id);
      expect(bobResult.session?.refresh_token).toBe('rt-bob-rotated');
      expect(aliceLogin.user?.id).toBe(ALICE.id);
    });

    it('会话类调用用 service key，admin signOut 携带目标用户 JWT', async () => {
      const { requests } = stubGoTrue();
      const service = new SupabaseService(createMockConfigService(CONFIG));

      await service.signIn(ALICE.email, ALICE.password);
      await service.signOut('alice-jwt');

      const [login, logout] = requests;
      expect(login).toMatchObject({
        path: '/auth/v1/token',
        grantType: 'password',
      });
      expect(login!.headers.get('apikey')).toBe('service-key');
      expect(logout).toMatchObject({ method: 'POST', path: '/auth/v1/logout' });
      expect(logout!.headers.get('apikey')).toBe('service-key');
      expect(logout!.headers.get('authorization')).toBe('Bearer alice-jwt');
    });
  });

  describe('MFA user client', () => {
    it('以 anon key + 用户 JWT 查询因子', async () => {
      const { requests } = stubGoTrue();
      const service = new SupabaseService(createMockConfigService(CONFIG));
      const jwt = fakeJwt({ sub: BOB.id, aal: 'aal1' });

      const factors = await service.listFactors(jwt);

      expect(factors.totp.map((f) => f.id)).toEqual([`${BOB.id}-totp`]);
      expect(requests).toHaveLength(1);
      expect(requests[0]!.headers.get('apikey')).toBe('anon-key');
      expect(requests[0]!.headers.get('authorization')).toBe(`Bearer ${jwt}`);
    });

    it('查询 AAL 时显式传入 JWT（user client 无持久会话）', async () => {
      stubGoTrue();
      const service = new SupabaseService(createMockConfigService(CONFIG));

      await expect(
        service.getAuthenticatorAssuranceLevel(
          fakeJwt({ sub: ALICE.id, aal: 'aal2' }),
        ),
      ).resolves.toMatchObject({ currentLevel: 'aal2', nextLevel: 'aal2' });
    });
  });

  describe('updatePasswordForSession', () => {
    it('以当前会话的 JWT 调用 GoTrue PUT /user（不走 admin API，保留当前会话）', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      const service = new SupabaseService(createMockConfigService(CONFIG));

      await service.updatePasswordForSession('session-jwt', 'NewPass123');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.supabase.co/auth/v1/user',
        {
          method: 'PUT',
          headers: {
            apikey: 'anon-key',
            Authorization: 'Bearer session-jwt',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password: 'NewPass123' }),
        },
      );
    });

    it('GoTrue 返回错误时抛出 AuthApiError', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              msg: 'weak password',
              error_code: 'weak_password',
            }),
            { status: 422 },
          ),
        ),
      );
      const service = new SupabaseService(createMockConfigService(CONFIG));

      await expect(
        service.updatePasswordForSession('session-jwt', 'weak'),
      ).rejects.toMatchObject({
        name: 'AuthApiError',
        status: 422,
        code: 'weak_password',
      });
    });
  });
});

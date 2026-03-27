import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { AuthGuard } from '../auth.guard';
import { DomainException } from '../../exceptions/domain.exception';
import { TokenBlacklistService } from '../../services/token-blacklist.service';
import { UserIdentityResolverService } from '../../services/user-identity-resolver.service';
import { PlatformApiTokenService } from '../../../modules/platform-api-token/platform-api-token.service';

const TEST_JWT_SECRET = 'test-secret-key-for-unit-tests';
const TEST_USER_SUB = 'user-uuid-12345';
const TEST_APP_USER_ID = 'app-user-uuid-67890';
const TEST_USER_EMAIL = 'test@example.com';
const TEST_TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TEST_API_KEY = 'al_test_platform_api_key';
const TEST_API_TOKEN_ID = '22222222-2222-4222-8222-222222222222';
const TEST_API_KEY_PREFIX = 'al_testpref';

type ValidatedPlatformApiToken = Awaited<
  ReturnType<PlatformApiTokenService['validateToken']>
>;

function createValidToken(extraClaims: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      sub: TEST_USER_SUB,
      email: TEST_USER_EMAIL,
      aud: 'authenticated',
      ...extraClaims,
    },
    TEST_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

function createExpiredToken(): string {
  return jwt.sign(
    {
      sub: TEST_USER_SUB,
      email: TEST_USER_EMAIL,
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) - 3600, // 1時間前に期限切れ
    },
    TEST_JWT_SECRET,
    { algorithm: 'HS256' },
  );
}

function createInvalidSignatureToken(): string {
  return jwt.sign(
    {
      sub: TEST_USER_SUB,
      email: TEST_USER_EMAIL,
      aud: 'authenticated',
    },
    'wrong-secret-key',
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

function createValidatedApiKeyResult(
  overrides: Partial<ValidatedPlatformApiToken> = {},
): ValidatedPlatformApiToken {
  return {
    userId: TEST_USER_SUB,
    tenantId: TEST_TENANT_ID,
    scopes: null,
    tokenId: TEST_API_TOKEN_ID,
    tokenPrefix: TEST_API_KEY_PREFIX,
    tenantRole: 'owner',
    ...overrides,
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function createMockExecutionContext(
  authorizationHeader?: string,
  apiKeyHeader?: string,
): {
  context: ReturnType<typeof vi.fn> & {
    switchToHttp: ReturnType<typeof vi.fn>;
    getHandler: ReturnType<typeof vi.fn>;
    getClass: ReturnType<typeof vi.fn>;
  };
  request: Record<string, unknown>;
} {
  const request: Record<string, unknown> = {
    headers: {
      authorization: authorizationHeader,
      'x-api-key': apiKeyHeader,
    },
  };

  const context = {
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: vi.fn().mockReturnValue(request),
    }),
    getHandler: vi.fn(),
    getClass: vi.fn(),
  };

  return {
    context: context as ReturnType<typeof vi.fn> & typeof context,
    request,
  };
}

describe('AuthGuard', () => {
  let authGuard: AuthGuard;
  let reflector: Reflector;
  let tokenBlacklist: TokenBlacklistService;
  let platformApiTokenService: PlatformApiTokenService;
  let userIdentityResolver: { resolveAppUserId: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: vi.fn().mockReturnValue(false),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue(TEST_JWT_SECRET),
          },
        },
        {
          provide: TokenBlacklistService,
          useValue: {
            isBlacklisted: vi.fn().mockResolvedValue(false),
          },
        },
        {
          provide: PlatformApiTokenService,
          useValue: {
            validateToken: vi.fn(),
            updateLastUsedAt: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: UserIdentityResolverService,
          useValue: {
            resolveAppUserId: vi.fn().mockResolvedValue(TEST_APP_USER_ID),
          },
        },
      ],
    }).compile();

    authGuard = module.get(AuthGuard);
    reflector = module.get(Reflector);
    tokenBlacklist = module.get(TokenBlacklistService);
    platformApiTokenService = module.get(PlatformApiTokenService);
    userIdentityResolver = module.get(UserIdentityResolverService);
  });

  it('有効なトークンでアクセスを許可し、request.user を設定する', async () => {
    const token = createValidToken();
    const { context, request } = createMockExecutionContext(`Bearer ${token}`);

    const result = await authGuard.canActivate(context as never);

    expect(result).toBe(true);
    expect(request.user).toBeDefined();
    const user = request.user as {
      sub: string;
      email: string;
      supabaseUserId?: string;
    };
    expect(user.sub).toBe(TEST_APP_USER_ID);
    expect(user.email).toBe(TEST_USER_EMAIL);
    expect(user.supabaseUserId).toBe(TEST_USER_SUB);
  });

  it('snake_case claims を request.user の camelCase に正規化する', async () => {
    const token = createValidToken({
      tenant_id: TEST_TENANT_ID,
      tenant_role: 'owner',
    });
    const { context, request } = createMockExecutionContext(`Bearer ${token}`);

    const result = await authGuard.canActivate(context as never);

    expect(result).toBe(true);
    const user = request.user as {
      sub?: string;
      tenantId?: string;
      tenantRole?: string;
    };
    expect(user.sub).toBe(TEST_APP_USER_ID);
    expect(user.tenantId).toBe(TEST_TENANT_ID);
    expect(user.tenantRole).toBe('owner');
  });

  it('@Public() ルートはトークン検証をスキップする', async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(true);
    const { context } = createMockExecutionContext(); // ヘッダー無し

    const result = await authGuard.canActivate(context as never);

    expect(result).toBe(true);
  });

  it('Authorization ヘッダーが無い場合: token-missing で 401', async () => {
    const { context } = createMockExecutionContext(); // ヘッダー無し

    try {
      await authGuard.canActivate(context as never);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      const de = error as DomainException;
      expect(de.getStatus()).toBe(401);
      expect(de.type).toBe('https://agentloom.dev/errors/token-missing');
    }
  });

  it('トークンが期限切れの場合: token-expired で 401', async () => {
    const token = createExpiredToken();
    const { context } = createMockExecutionContext(`Bearer ${token}`);

    try {
      await authGuard.canActivate(context as never);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      const de = error as DomainException;
      expect(de.getStatus()).toBe(401);
      expect(de.type).toBe('https://agentloom.dev/errors/token-expired');
    }
  });

  it('トークン署名が不正な場合: token-invalid で 401', async () => {
    const token = createInvalidSignatureToken();
    const { context } = createMockExecutionContext(`Bearer ${token}`);

    try {
      await authGuard.canActivate(context as never);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      const de = error as DomainException;
      expect(de.getStatus()).toBe(401);
      expect(de.type).toBe('https://agentloom.dev/errors/token-invalid');
    }
  });

  it('ブラックリストに登録されたトークン: token-revoked で 401', async () => {
    const token = createValidToken();
    const { context } = createMockExecutionContext(`Bearer ${token}`);
    vi.mocked(tokenBlacklist.isBlacklisted).mockResolvedValue(true);

    try {
      await authGuard.canActivate(context as never);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      const de = error as DomainException;
      expect(de.getStatus()).toBe(401);
      expect(de.type).toBe('https://agentloom.dev/errors/token-revoked');
    }
  });

  it('JWT認証: resolveAppUserId でアプリケーションユーザーIDに変換する', async () => {
    const token = createValidToken();
    const { context, request } = createMockExecutionContext(`Bearer ${token}`);

    const result = await authGuard.canActivate(context as never);

    expect(result).toBe(true);
    const user = request.user as { sub: string; supabaseUserId: string };
    expect(user.sub).toBe(TEST_APP_USER_ID);
    expect(user.supabaseUserId).toBe(TEST_USER_SUB);
  });

  it('JWT認証: ユーザーが見つからない場合は 401 を返す', async () => {
    userIdentityResolver.resolveAppUserId.mockResolvedValueOnce(null);
    const token = createValidToken();
    const { context } = createMockExecutionContext(`Bearer ${token}`);

    try {
      await authGuard.canActivate(context as never);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      const de = error as DomainException;
      expect(de.getStatus()).toBe(401);
      expect(de.type).toBe('https://agentloom.dev/errors/token-invalid');
    }
  });

  it('JWT認証: UserIdentityResolverService が例外を投げた場合は 401 を返す', async () => {
    userIdentityResolver.resolveAppUserId.mockRejectedValueOnce(
      new Error('DB error'),
    );
    const token = createValidToken();
    const { context } = createMockExecutionContext(`Bearer ${token}`);

    try {
      await authGuard.canActivate(context as never);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      const de = error as DomainException;
      expect(de.getStatus()).toBe(401);
      expect(de.type).toBe('https://agentloom.dev/errors/token-invalid');
    }
  });

  describe('API Key Authentication', () => {
    it('有効な API Key でアクセスを許可し、request.user を設定する', async () => {
      vi.mocked(platformApiTokenService.validateToken).mockResolvedValue(
        createValidatedApiKeyResult(),
      );
      const { context, request } = createMockExecutionContext(
        undefined,
        TEST_API_KEY,
      );

      const result = await authGuard.canActivate(context as never);

      expect(result).toBe(true);
      expect(platformApiTokenService.validateToken).toHaveBeenCalledWith(
        TEST_API_KEY,
      );

      const user = request.user as {
        sub: string;
        email: string;
        tenantId?: string;
        tenantRole?: string;
      };
      expect(user.sub).toBe(TEST_USER_SUB);
      expect(user.email).toBe('');
      expect(user.tenantId).toBe(TEST_TENANT_ID);
      expect(user.tenantRole).toBe('owner');
    });

    it("API Key 認証時は request.authMethod に 'api_key' を設定する", async () => {
      vi.mocked(platformApiTokenService.validateToken).mockResolvedValue(
        createValidatedApiKeyResult(),
      );
      const { context, request } = createMockExecutionContext(
        undefined,
        TEST_API_KEY,
      );

      const result = await authGuard.canActivate(context as never);

      expect(result).toBe(true);
      expect(request.authMethod).toBe('api_key');
    });

    it('API Key 認証時は request.apiKeyPrefix に token prefix を设置する', async () => {
      vi.mocked(platformApiTokenService.validateToken).mockResolvedValue(
        createValidatedApiKeyResult(),
      );
      const { context, request } = createMockExecutionContext(
        undefined,
        TEST_API_KEY,
      );

      const result = await authGuard.canActivate(context as never);

      expect(result).toBe(true);
      expect(request.apiKeyPrefix).toBe(TEST_API_KEY_PREFIX);
    });

    it('検証済み API Key の tenantId を request.tenantId に設定する', async () => {
      vi.mocked(platformApiTokenService.validateToken).mockResolvedValue(
        createValidatedApiKeyResult(),
      );
      const { context, request } = createMockExecutionContext(
        undefined,
        TEST_API_KEY,
      );

      const result = await authGuard.canActivate(context as never);

      expect(result).toBe(true);
      expect(request.tenantId).toBe(TEST_TENANT_ID);
    });

    it('無効な API Key は api-key-invalid で 401 を返す', async () => {
      vi.mocked(platformApiTokenService.validateToken).mockRejectedValueOnce(
        new Error('invalid api key'),
      );
      const { context } = createMockExecutionContext(undefined, TEST_API_KEY);

      try {
        await authGuard.canActivate(context as never);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(401);
        expect(de.type).toBe('https://agentloom.dev/errors/api-key-invalid');
      }
    });

    it('updateLastUsedAt を fire-and-forget で非同期実行する', async () => {
      const deferred = createDeferred<void>();
      vi.mocked(platformApiTokenService.validateToken).mockResolvedValue(
        createValidatedApiKeyResult(),
      );
      vi.mocked(platformApiTokenService.updateLastUsedAt).mockImplementation(
        () => deferred.promise,
      );
      const { context } = createMockExecutionContext(undefined, TEST_API_KEY);

      const result = await authGuard.canActivate(context as never);

      expect(result).toBe(true);
      expect(platformApiTokenService.updateLastUsedAt).toHaveBeenCalledWith(
        TEST_API_TOKEN_ID,
      );

      deferred.resolve(undefined);
      await deferred.promise;
    });

    it('updateLastUsedAt 失败时只记录 warning，不应导致认证失败', async () => {
      vi.mocked(platformApiTokenService.validateToken).mockResolvedValue(
        createValidatedApiKeyResult(),
      );
      vi.mocked(platformApiTokenService.updateLastUsedAt).mockRejectedValueOnce(
        new Error('write failed'),
      );
      const logger = (
        authGuard as unknown as {
          logger: { warn: (message: string) => void };
        }
      ).logger;
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {
        return undefined;
      });
      const { context } = createMockExecutionContext(undefined, TEST_API_KEY);

      try {
        const result = await authGuard.canActivate(context as never);

        expect(result).toBe(true);
        await Promise.resolve();
        expect(warnSpy).toHaveBeenCalledWith(
          `Failed to update lastUsedAt for token ${TEST_API_TOKEN_ID}: write failed`,
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('同时提供 JWT 与 API Key 时优先使用 JWT', async () => {
      const token = createValidToken({ tenant_id: TEST_TENANT_ID });
      vi.mocked(platformApiTokenService.validateToken).mockRejectedValueOnce(
        new Error('should not be called'),
      );
      const { context, request } = createMockExecutionContext(
        `Bearer ${token}`,
        TEST_API_KEY,
      );

      const result = await authGuard.canActivate(context as never);

      expect(result).toBe(true);
      expect(request.authMethod).toBe('jwt');
      expect(platformApiTokenService.validateToken).not.toHaveBeenCalled();
    });

    it('Authorization 与 X-Api-Key 都缺失时返回 token-missing', async () => {
      const { context } = createMockExecutionContext(undefined, undefined);

      try {
        await authGuard.canActivate(context as never);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(401);
        expect(de.type).toBe('https://agentloom.dev/errors/token-missing');
      }
    });
  });
});

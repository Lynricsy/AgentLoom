import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { AuthGuard } from '../auth.guard';
import { DomainException } from '../../exceptions/domain.exception';
import { TokenBlacklistService } from '../../services/token-blacklist.service';

const TEST_JWT_SECRET = 'test-secret-key-for-unit-tests';
const TEST_USER_SUB = 'user-uuid-12345';
const TEST_USER_EMAIL = 'test@example.com';
const TEST_TENANT_ID = '11111111-1111-4111-8111-111111111111';

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

function createMockExecutionContext(authorizationHeader?: string): {
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
      ],
    }).compile();

    authGuard = module.get(AuthGuard);
    reflector = module.get(Reflector);
    tokenBlacklist = module.get(TokenBlacklistService);
  });

  it('有効なトークンでアクセスを許可し、request.user を設定する', async () => {
    const token = createValidToken();
    const { context, request } = createMockExecutionContext(`Bearer ${token}`);

    const result = await authGuard.canActivate(context as never);

    expect(result).toBe(true);
    expect(request.user).toBeDefined();
    const user = request.user as { sub: string; email: string };
    expect(user.sub).toBe(TEST_USER_SUB);
    expect(user.email).toBe(TEST_USER_EMAIL);
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
      tenantId?: string;
      tenantRole?: string;
    };
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
});

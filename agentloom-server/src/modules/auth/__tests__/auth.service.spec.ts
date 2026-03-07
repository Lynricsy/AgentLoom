import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthApiError } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';
import { AuthService } from '../auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { TokenBlacklistService } from '../../../common/services/token-blacklist.service';
import { DRIZZLE } from '../../../database/database.module';

const MOCK_UUID = '01912345-6789-7abc-8ef0-123456789abc';
const MOCK_SUPABASE_UUID = 'sup-user-id-1234';
const MOCK_EMAIL = 'test@example.com';
const MOCK_PASSWORD = 'Password123';
const MOCK_DATE = new Date('2026-01-01T00:00:00Z');
const TEST_JWT_SECRET = 'test-auth-secret';
const TEST_FACTOR_ID = '01912345-6789-7abc-8ef0-123456789abc';

const mockUserRecord = {
  id: MOCK_UUID,
  supabaseUserId: MOCK_SUPABASE_UUID,
  email: MOCK_EMAIL,
  displayName: null,
  avatarUrl: null,
  isActive: true,
  currentOrganizationId: null,
  createdAt: MOCK_DATE,
  updatedAt: MOCK_DATE,
};

const mockSession = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
};

const mockAuthUser = {
  id: MOCK_SUPABASE_UUID,
  email: MOCK_EMAIL,
};

function createAccessToken(payload: Record<string, unknown> = {}) {
  return (
    Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url') +
    '.' +
    Buffer.from(
      JSON.stringify({ sub: 'test', exp: 1999999999, ...payload }),
    ).toString('base64url') +
    '.fake-sig'
  );
}

function createMockSupabaseService() {
  return {
    signUp: vi.fn(),
    signIn: vi.fn(),
    refreshToken: vi.fn(),
    signOut: vi.fn(),
    getUser: vi.fn(),
    listFactors: vi.fn(),
  };
}

function createMockDb() {
  const mockInsertReturning = vi.fn();
  const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const mockInsertValues = vi.fn().mockReturnValue({
    returning: mockInsertReturning,
    onConflictDoNothing: mockOnConflictDoNothing,
  });
  const mockInsert = vi.fn().mockReturnValue({
    values: mockInsertValues,
  });
  const mockFindFirst = vi.fn();
  const mockExecute = vi.fn();

  return {
    db: {
      insert: mockInsert,
      execute: mockExecute,
      query: {
        users: {
          findFirst: mockFindFirst,
        },
      },
    },
    mockInsert,
    mockInsertReturning,
    mockOnConflictDoNothing,
    mockFindFirst,
    mockExecute,
  };
}

function createMockConfigService() {
  return {
    get: vi.fn((key: string) =>
      key === 'APP_JWT_SECRET' ? TEST_JWT_SECRET : undefined,
    ),
  };
}

describe('AuthService', () => {
  let authService: AuthService;
  let supabaseService: ReturnType<typeof createMockSupabaseService>;
  let tokenBlacklist: { add: ReturnType<typeof vi.fn>; isBlacklisted: ReturnType<typeof vi.fn> };
  let mockInsert: ReturnType<typeof vi.fn>;
  let mockInsertReturning: ReturnType<typeof vi.fn>;
  let mockFindFirst: ReturnType<typeof vi.fn>;
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    supabaseService = createMockSupabaseService();
    supabaseService.listFactors.mockResolvedValue({ totp: [] });
    tokenBlacklist = { add: vi.fn().mockResolvedValue(undefined), isBlacklisted: vi.fn().mockResolvedValue(false) };
    const {
      db,
      mockInsert: mi,
      mockInsertReturning: ir,
      mockFindFirst: ff,
      mockExecute: me,
    } = createMockDb();
    mockInsert = mi;
    mockInsertReturning = ir;
    mockFindFirst = ff;
    mockExecute = me;

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: supabaseService },
        { provide: DRIZZLE, useValue: db },
        { provide: TokenBlacklistService, useValue: tokenBlacklist },
        { provide: ConfigService, useValue: createMockConfigService() },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  describe('register', () => {
    const registerDto = {
      email: MOCK_EMAIL,
      password: MOCK_PASSWORD,
    };

    it('正常登録: ユーザーとトークンを返す', async () => {
      supabaseService.signUp.mockResolvedValue({
        user: mockAuthUser,
        session: mockSession,
      });
      mockInsertReturning.mockResolvedValue([mockUserRecord]);

      const result = await authService.register(registerDto);

      expect(result.data.user.id).toBe(MOCK_UUID);
      expect(result.data.user.email).toBe(MOCK_EMAIL);
      expect(result.data.user.display_name).toBeNull();
      expect(result.data.user.created_at).toEqual(MOCK_DATE);
      expect(result.data.tokens).toEqual({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
      });
      expect(supabaseService.signUp).toHaveBeenCalledWith(
        MOCK_EMAIL,
        MOCK_PASSWORD,
      );
    });

    it('display_name 付きで正常登録', async () => {
      const dtoWithName = { ...registerDto, display_name: 'Test User' };
      supabaseService.signUp.mockResolvedValue({
        user: mockAuthUser,
        session: mockSession,
      });
      mockInsertReturning.mockResolvedValue([
        { ...mockUserRecord, displayName: 'Test User' },
      ]);

      const result = await authService.register(dtoWithName);

      expect(result.data.user.display_name).toBe('Test User');
    });

    it('重複メール: 409 Conflict を投げる', async () => {
      supabaseService.signUp.mockRejectedValue(
        new AuthApiError('User already registered', 422, 'email_exists'),
      );

      try {
        await authService.register(registerDto);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(HttpStatus.CONFLICT);
        expect(de.type).toBe('https://agentloom.dev/errors/email-conflict');
      }
    });

    it('Supabase が非冲突 422 を返した場合: registration-failed で 500', async () => {
      supabaseService.signUp.mockRejectedValue(
        new AuthApiError('Password should contain a symbol', 422, 'weak_password'),
      );

      try {
        await authService.register(registerDto);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(de.type).toBe('https://agentloom.dev/errors/registration-failed');
      }
    });

    it('GoTrue 応答に user が無い場合: 500', async () => {
      supabaseService.signUp.mockResolvedValue({
        user: null,
        session: null,
      });

      try {
        await authService.register(registerDto);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        expect((error as DomainException).getStatus()).toBe(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    });

    it('email確認必要 (user有り・session null): tokens=null を返す', async () => {
      supabaseService.signUp.mockResolvedValue({
        user: mockAuthUser,
        session: null,
      });
      mockInsertReturning.mockResolvedValue([mockUserRecord]);

      const result = await authService.register(registerDto);

      expect(result.data.user.id).toBe(MOCK_UUID);
      expect(result.data.user.email).toBe(MOCK_EMAIL);
      expect(result.data.tokens).toBeNull();
      expect(result.data.email_confirmation_required).toBe(true);
    });

    it('DB insert 失敗: 部分登録エラー 500', async () => {
      supabaseService.signUp.mockResolvedValue({
        user: mockAuthUser,
        session: mockSession,
      });
      mockInsertReturning.mockRejectedValue(new Error('DB connection failed'));

      try {
        await authService.register(registerDto);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(de.type).toBe(
          'https://agentloom.dev/errors/registration-partial',
        );
      }
    });
  });

  describe('login', () => {
    const loginDto = { email: MOCK_EMAIL, password: MOCK_PASSWORD };

    it('既存ユーザーで正常ログイン', async () => {
      supabaseService.signIn.mockResolvedValue({
        user: mockAuthUser,
        session: mockSession,
      });
      mockFindFirst.mockResolvedValue(mockUserRecord);

      const result = await authService.login(loginDto);
      const tokens = result.data.tokens;

      if (!tokens) {
        throw new Error('expected access tokens for non-MFA login');
      }

      expect(result.data.user).toEqual({
        id: MOCK_UUID,
        email: MOCK_EMAIL,
        display_name: null,
        created_at: MOCK_DATE,
      });
      expect(tokens.access_token).toBe('mock-access-token');
    });

    it('DB にユーザーが無い場合: 自動作成してログイン', async () => {
      supabaseService.signIn.mockResolvedValue({
        user: mockAuthUser,
        session: mockSession,
      });
      mockFindFirst
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockUserRecord);

      const result = await authService.login(loginDto);

      expect(result.data.user).not.toBeNull();
      expect(result.data.user!.id).toBe(MOCK_UUID);
    });

    it('已启用已验证 TOTP 时返回 mfa pending 令牌而不是 access tokens', async () => {
      supabaseService.signIn.mockResolvedValue({
        user: mockAuthUser,
        session: mockSession,
      });
      supabaseService.listFactors.mockResolvedValue({
        totp: [
          {
            id: TEST_FACTOR_ID,
            friendly_name: '主验证器',
            status: 'verified',
          },
        ],
      });
      mockFindFirst.mockResolvedValue(mockUserRecord);

      const result = await authService.login(loginDto);
      const mfaToken = result.data.mfaToken;

      if (!mfaToken) {
        throw new Error('expected MFA token for verified TOTP login');
      }

      const payload = jwt.verify(
        mfaToken,
        TEST_JWT_SECRET,
      ) as jwt.JwtPayload;

      expect(result.data).toEqual({
        mfaRequired: true,
        mfaToken,
        factors: [
          {
            id: TEST_FACTOR_ID,
            friendlyName: '主验证器',
          },
        ],
      });
      expect(payload.type).toBe('mfa_pending');
      expect(payload.supabaseAccessToken).toBe('mock-access-token');
    });

    it('backfill 中に email が別 supabase user に紐づく場合: login-failed で 500', async () => {
      supabaseService.signIn.mockResolvedValue({
        user: mockAuthUser,
        session: mockSession,
      });
      mockFindFirst
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          ...mockUserRecord,
          supabaseUserId: '11111111-1111-1111-1111-111111111111',
        });

      try {
        await authService.login(loginDto);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(de.type).toBe('https://agentloom.dev/errors/login-failed');
      }
    });

    it('認証情報が不正: 401 Unauthorized', async () => {
      supabaseService.signIn.mockRejectedValue(
        new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
      );

      try {
        await authService.login(loginDto);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        expect(de.type).toBe(
          'https://agentloom.dev/errors/invalid-credentials',
        );
      }
    });

    it('Supabase 登录 API 返回 5xx 时: login-failed で 500', async () => {
      supabaseService.signIn.mockRejectedValue(
        new AuthApiError('Upstream auth outage', 500, 'unexpected_failure'),
      );

      try {
        await authService.login(loginDto);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(de.type).toBe('https://agentloom.dev/errors/login-failed');
      }
    });

    it.each([HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED])(
      'Supabase 登录 API 返回泛化 %i 时: 仍然是 login-failed で 500',
      async (status) => {
        supabaseService.signIn.mockRejectedValue(
          new AuthApiError('Generic auth gateway failure', status, 'unexpected_failure'),
        );

        try {
          await authService.login(loginDto);
          expect.unreachable('should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(DomainException);
          const de = error as DomainException;
          expect(de.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
          expect(de.type).toBe('https://agentloom.dev/errors/login-failed');
        }
      },
    );

    it('GoTrue 応答に user が null の場合: user=null で返し backfill しない', async () => {
      supabaseService.signIn.mockResolvedValue({
        user: null,
        session: mockSession,
      });
      mockFindFirst.mockResolvedValueOnce(undefined);

      const result = await authService.login(loginDto);

      expect(result.data.user).toBeNull();
      expect(result.data.tokens).toEqual({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
      });
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });

    it('backfill 後もローカル profile が見つからない場合: login-failed で 500', async () => {
      supabaseService.signIn.mockResolvedValue({
        user: mockAuthUser,
        session: mockSession,
      });
      mockFindFirst
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      try {
        await authService.login(loginDto);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(de.type).toBe('https://agentloom.dev/errors/login-failed');
      }

      expect(mockInsert).toHaveBeenCalledTimes(1);
      const insertCall = mockInsert.mock.results[0]?.value as {
        values: ReturnType<typeof vi.fn>;
      };
      expect(insertCall.values).toHaveBeenCalledWith({
        supabaseUserId: MOCK_SUPABASE_UUID,
        email: MOCK_EMAIL,
      });
    });
  });

  describe('getSecurityInfo', () => {
    it('返回嵌套的 MFA、sessions 与 providers 结构', async () => {
      supabaseService.listFactors.mockResolvedValue({
        totp: [
          {
            id: TEST_FACTOR_ID,
            friendly_name: '主验证器',
            status: 'verified',
            created_at: '2026-03-07T00:00:00.000Z',
            updated_at: '2026-03-07T01:00:00.000Z',
          },
        ],
      });
      supabaseService.getUser.mockResolvedValue({
        id: MOCK_SUPABASE_UUID,
        email: MOCK_EMAIL,
        app_metadata: {
          provider: 'email',
          providers: ['email', 'google'],
        },
        identities: [{ provider: 'google' }],
      });
      mockExecute.mockResolvedValue({ rows: [{ active_count: 2 }] });

      const result = await authService.getSecurityInfo(mockSession.access_token);

      expect(result).toEqual({
        mfa: {
          enabled: true,
          factors: [
            {
              id: TEST_FACTOR_ID,
              factor_type: 'totp',
              friendly_name: '主验证器',
              status: 'verified',
              created_at: '2026-03-07T00:00:00.000Z',
              updated_at: '2026-03-07T01:00:00.000Z',
            },
          ],
        },
        sessions: {
          active_count: 2,
        },
        providers: ['email', 'google'],
      });
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe('refreshToken', () => {
    const refreshDto = { refresh_token: 'old-refresh-token' };

    it('正常リフレッシュ: 新トークンを返す', async () => {
      supabaseService.refreshToken.mockResolvedValue({
        session: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        },
      });

      const result = await authService.refreshToken(refreshDto);

      expect(result.data.tokens).toEqual({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
      });
    });

    it('リフレッシュトークンが無効: 401', async () => {
      supabaseService.refreshToken.mockRejectedValue(
        new AuthApiError('Token expired', 401, 'token_expired'),
      );

      try {
        await authService.refreshToken(refreshDto);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        expect(de.type).toBe('https://agentloom.dev/errors/refresh-invalid');
      }
    });

    it('Supabase refresh API 返回 5xx 时: refresh-failed で 500', async () => {
      supabaseService.refreshToken.mockRejectedValue(
        new AuthApiError('Refresh service unavailable', 500, 'unexpected_failure'),
      );

      try {
        await authService.refreshToken(refreshDto);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(de.type).toBe('https://agentloom.dev/errors/refresh-failed');
      }
    });

    it.each([HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED])(
      'Supabase refresh API 返回泛化 %i 时: 仍然是 refresh-failed で 500',
      async (status) => {
        supabaseService.refreshToken.mockRejectedValue(
          new AuthApiError(
            'Generic refresh gateway failure',
            status,
            'unexpected_failure',
          ),
        );

        try {
          await authService.refreshToken(refreshDto);
          expect.unreachable('should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(DomainException);
          const de = error as DomainException;
          expect(de.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
          expect(de.type).toBe('https://agentloom.dev/errors/refresh-failed');
        }
      },
    );

    it('セッションが null: refresh-failed で 500', async () => {
      supabaseService.refreshToken.mockResolvedValue({ session: null });

      try {
        await authService.refreshToken(refreshDto);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(de.type).toBe('https://agentloom.dev/errors/refresh-failed');
      }
    });
  });

  describe('logout', () => {
    it('正常ログアウト: signOut 呼出 + トークンをブラックリストに追加', async () => {
      supabaseService.signOut.mockResolvedValue(undefined);

      const token = createAccessToken();

      await expect(authService.logout(token)).resolves.not.toThrow();
      expect(supabaseService.signOut).toHaveBeenCalled();
      expect(tokenBlacklist.add).toHaveBeenCalledWith(token, 1999999999, 'test');
    });

    it('Supabase signOut エラー時: 先にブラックリスト化してから logout-failed で 500', async () => {
      supabaseService.signOut.mockRejectedValue(
        new Error('session already expired'),
      );
      const token = createAccessToken();

      try {
        await authService.logout(token);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(de.type).toBe('https://agentloom.dev/errors/logout-failed');
      }

      expect(tokenBlacklist.add).toHaveBeenCalledWith(token, 1999999999, 'test');
    });

    it('ブラックリスト永続化が非 Error 値で失敗した場合: logout-failed で 500 かつ stack は undefined', async () => {
      const logger = Reflect.get(authService, 'logger') as {
        error: (...args: unknown[]) => void;
      };
      const loggerErrorSpy = vi
        .spyOn(logger, 'error')
        .mockImplementation(() => undefined);
      tokenBlacklist.add.mockRejectedValueOnce('string-error');
      const token = createAccessToken();

      try {
        await authService.logout(token);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(de.type).toBe('https://agentloom.dev/errors/logout-failed');
      }

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to persist revoked access token',
        undefined,
      );
      expect(supabaseService.signOut).not.toHaveBeenCalled();
    });

    it('exp が無いアクセストークンでも signOut は実行し blacklist はスキップ', async () => {
      supabaseService.signOut.mockResolvedValue(undefined);
      const token = createAccessToken({ exp: undefined });

      await expect(authService.logout(token)).resolves.not.toThrow();

      expect(tokenBlacklist.add).not.toHaveBeenCalled();
      expect(supabaseService.signOut).toHaveBeenCalledWith(token);
    });

    it('不正 JWT で decode が null の場合: blacklist をスキップして signOut する', async () => {
      supabaseService.signOut.mockResolvedValue(undefined);
      const token = 'not-a-jwt';

      await expect(authService.logout(token)).resolves.not.toThrow();

      expect(tokenBlacklist.add).not.toHaveBeenCalled();
      expect(supabaseService.signOut).toHaveBeenCalledWith(token);
    });

    it('decode 結果が文字列 payload の場合: blacklist をスキップして signOut する', async () => {
      supabaseService.signOut.mockResolvedValue(undefined);
      const token =
        Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url') +
        '.' +
        Buffer.from(JSON.stringify('plain-text-payload')).toString('base64url') +
        '.fake-sig';

      await expect(authService.logout(token)).resolves.not.toThrow();

      expect(tokenBlacklist.add).not.toHaveBeenCalled();
      expect(supabaseService.signOut).toHaveBeenCalledWith(token);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { AuthApiError } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { TokenBlacklistService } from '../../../common/services/token-blacklist.service';
import { DRIZZLE } from '../../../database/database.module';

const MOCK_SUPABASE_UUID = 'sup-user-id-change-pw';
const MOCK_EMAIL = 'changepw@example.com';
const MOCK_CURRENT_PASSWORD = 'OldPassword123';
const MOCK_NEW_PASSWORD = 'NewPassword456';
const MOCK_ACCESS_TOKEN = 'mock-access-token-changepw';

const mockSupabaseUser = {
  id: MOCK_SUPABASE_UUID,
  email: MOCK_EMAIL,
};

const mockSession = {
  access_token: MOCK_ACCESS_TOKEN,
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
};

function createMockSupabaseService() {
  return {
    signUp: vi.fn(),
    signIn: vi.fn(),
    refreshToken: vi.fn(),
    signOut: vi.fn(),
    getUser: vi.fn(),
    listFactors: vi.fn(),
    updatePasswordForSession: vi.fn(),
  };
}

function createMockDb() {
  return {
    insert: vi.fn(),
    execute: vi.fn(),
    query: {
      users: {
        findFirst: vi.fn(),
      },
    },
  };
}

describe('AuthService.changePassword', () => {
  let authService: AuthService;
  let supabaseService: ReturnType<typeof createMockSupabaseService>;

  beforeEach(async () => {
    supabaseService = createMockSupabaseService();
    supabaseService.listFactors.mockResolvedValue({ totp: [] });

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: supabaseService },
        { provide: DRIZZLE, useValue: createMockDb() },
        {
          provide: TokenBlacklistService,
          useValue: { add: vi.fn(), checkToken: vi.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  it('成功修改密码: 返回 message', async () => {
    supabaseService.getUser.mockResolvedValue(mockSupabaseUser);
    supabaseService.signIn.mockResolvedValue({
      user: mockSupabaseUser,
      session: mockSession,
    });
    supabaseService.updatePasswordForSession.mockResolvedValue(undefined);

    const result = await authService.changePassword(
      MOCK_ACCESS_TOKEN,
      MOCK_CURRENT_PASSWORD,
      MOCK_NEW_PASSWORD,
    );

    expect(result).toEqual({ message: '密码修改成功' });
    expect(supabaseService.getUser).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
    expect(supabaseService.signIn).toHaveBeenCalledWith(
      MOCK_EMAIL,
      MOCK_CURRENT_PASSWORD,
    );
    // 用当前会话的 access token 改密：GoTrue 只注销其他会话，当前会话保留
    expect(supabaseService.updatePasswordForSession).toHaveBeenCalledWith(
      MOCK_ACCESS_TOKEN,
      MOCK_NEW_PASSWORD,
    );
  });

  it('当前密码错误: 抛出 401 wrong-current-password', async () => {
    supabaseService.getUser.mockResolvedValue(mockSupabaseUser);
    supabaseService.signIn.mockRejectedValue(
      new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    );

    try {
      await authService.changePassword(
        MOCK_ACCESS_TOKEN,
        'WrongPassword123',
        MOCK_NEW_PASSWORD,
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      const de = error as DomainException;
      expect(de.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(de.type).toBe(
        'https://agentloom.dev/errors/wrong-current-password',
      );
    }

    expect(supabaseService.updatePasswordForSession).not.toHaveBeenCalled();
  });

  it('新旧密码相同: 抛出 400 same-password，不调用 Supabase', async () => {
    try {
      await authService.changePassword(
        MOCK_ACCESS_TOKEN,
        MOCK_CURRENT_PASSWORD,
        MOCK_CURRENT_PASSWORD,
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      const de = error as DomainException;
      expect(de.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(de.type).toBe('https://agentloom.dev/errors/same-password');
    }

    expect(supabaseService.getUser).not.toHaveBeenCalled();
    expect(supabaseService.signIn).not.toHaveBeenCalled();
    expect(supabaseService.updatePasswordForSession).not.toHaveBeenCalled();
  });

  it('getUser 失败 (token 无效): 抛出 401 unauthorized', async () => {
    supabaseService.getUser.mockRejectedValue(
      new AuthApiError('JWT expired', 401, 'token_expired'),
    );

    try {
      await authService.changePassword(
        MOCK_ACCESS_TOKEN,
        MOCK_CURRENT_PASSWORD,
        MOCK_NEW_PASSWORD,
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      const de = error as DomainException;
      expect(de.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }

    expect(supabaseService.signIn).not.toHaveBeenCalled();
    expect(supabaseService.updatePasswordForSession).not.toHaveBeenCalled();
  });

  it('signIn 因非凭据原因失败: 抛出 500 change-password-failed', async () => {
    supabaseService.getUser.mockResolvedValue(mockSupabaseUser);
    supabaseService.signIn.mockRejectedValue(
      new AuthApiError('Auth service unavailable', 503, 'unexpected_failure'),
    );

    try {
      await authService.changePassword(
        MOCK_ACCESS_TOKEN,
        MOCK_CURRENT_PASSWORD,
        MOCK_NEW_PASSWORD,
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      const de = error as DomainException;
      expect(de.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(de.type).toBe(
        'https://agentloom.dev/errors/change-password-failed',
      );
    }
  });

  it('updatePasswordForSession 失败: 抛出 500 change-password-failed', async () => {
    supabaseService.getUser.mockResolvedValue(mockSupabaseUser);
    supabaseService.signIn.mockResolvedValue({
      user: mockSupabaseUser,
      session: mockSession,
    });
    supabaseService.updatePasswordForSession.mockRejectedValue(
      new Error('GoTrue error'),
    );

    try {
      await authService.changePassword(
        MOCK_ACCESS_TOKEN,
        MOCK_CURRENT_PASSWORD,
        MOCK_NEW_PASSWORD,
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      const de = error as DomainException;
      expect(de.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(de.type).toBe(
        'https://agentloom.dev/errors/change-password-failed',
      );
    }
  });
});

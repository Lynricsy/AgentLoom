import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  OAuthCallbackException,
  OAuthInitiationException,
} from '../../../common/exceptions/auth.exceptions';
import { DRIZZLE } from '../../../database/database.module';
import { OAuthService } from '../oauth.service';
import { SupabaseService } from '../supabase/supabase.service';

const MOCK_REDIRECT_URL =
  'http://localhost:3000/api/v1/auth/oauth/callback';
const MOCK_FRONTEND_URL = 'http://localhost:5173';
const MOCK_GOOGLE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const MOCK_CODE = 'oauth-code-123';
const MOCK_DATE = new Date('2026-03-07T00:00:00Z');
const MOCK_SUPABASE_USER_ID = '0195c9e1-6eb3-7a49-baf4-f772b7ab11c1';
const MOCK_LOCAL_USER_ID = '0195c9e1-8c58-7e3e-b422-bc3a18bfa111';
const MOCK_EMAIL = 'social@example.com';
const TEST_JWT_SECRET = 'oauth-mfa-secret';

const mockSession = {
  access_token: 'oauth-access-token',
  refresh_token: 'oauth-refresh-token',
  expires_in: 3600,
};

const mockSupabaseUser = {
  id: MOCK_SUPABASE_USER_ID,
  email: MOCK_EMAIL,
  user_metadata: {
    full_name: 'Social User',
    avatar_url: 'https://cdn.example.com/avatar.png',
  },
};

const mockUserRecord = {
  id: MOCK_LOCAL_USER_ID,
  supabaseUserId: MOCK_SUPABASE_USER_ID,
  email: MOCK_EMAIL,
  displayName: 'Social User',
  avatarUrl: 'https://cdn.example.com/avatar.png',
  isActive: true,
  currentOrganizationId: null,
  createdAt: MOCK_DATE,
  updatedAt: MOCK_DATE,
};

function createMockSupabaseService() {
  return {
    signInWithOAuth: vi.fn(),
    exchangeCodeForSession: vi.fn(),
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
  const mockUpdateReturning = vi.fn();
  const mockUpdateWhere = vi.fn().mockReturnValue({
    returning: mockUpdateReturning,
  });
  const mockUpdateSet = vi.fn().mockReturnValue({
    where: mockUpdateWhere,
  });
  const mockUpdate = vi.fn().mockReturnValue({
    set: mockUpdateSet,
  });

  return {
    db: {
      insert: mockInsert,
      update: mockUpdate,
      query: {
        users: {
          findFirst: mockFindFirst,
        },
      },
    },
    mockInsert,
    mockFindFirst,
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
    mockUpdateReturning,
  };
}

function createMockConfigService() {
  return {
    get: vi.fn((key: string) => {
      const values = {
        APP_OAUTH_REDIRECT_URL: MOCK_REDIRECT_URL,
        APP_FRONTEND_URL: MOCK_FRONTEND_URL,
        APP_JWT_SECRET: TEST_JWT_SECRET,
      };

      return values[key as keyof typeof values];
    }),
  };
}

describe('OAuthService', () => {
  let oauthService: OAuthService;
  let supabaseService: ReturnType<typeof createMockSupabaseService>;
  let mockInsert: ReturnType<typeof vi.fn>;
  let mockFindFirst: ReturnType<typeof vi.fn>;
  let mockUpdateSet: ReturnType<typeof vi.fn>;
  let mockUpdateReturning: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    supabaseService = createMockSupabaseService();
    supabaseService.listFactors.mockResolvedValue({ totp: [] });
    const {
      db,
      mockInsert: insert,
      mockFindFirst: findFirst,
      mockUpdateSet: updateSet,
      mockUpdateReturning: updateReturning,
    } = createMockDb();

    mockInsert = insert;
    mockFindFirst = findFirst;
    mockUpdateSet = updateSet;
    mockUpdateReturning = updateReturning;

    const module = await Test.createTestingModule({
      providers: [
        OAuthService,
        { provide: SupabaseService, useValue: supabaseService },
        { provide: ConfigService, useValue: createMockConfigService() },
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    oauthService = module.get(OAuthService);
  });

  it('成功发起 Google OAuth', async () => {
    supabaseService.signInWithOAuth.mockResolvedValue({ url: MOCK_GOOGLE_URL });

    const result = await oauthService.initiateOAuth('google');

    expect(result).toEqual({ url: MOCK_GOOGLE_URL });
    expect(supabaseService.signInWithOAuth).toHaveBeenCalledWith(
      'google',
      MOCK_REDIRECT_URL,
    );
  });

  it('Supabase 发起失败时抛出 OAuthInitiationException', async () => {
    supabaseService.signInWithOAuth.mockRejectedValue(
      new Error('oauth initiate failed'),
    );

    await expect(oauthService.initiateOAuth('google')).rejects.toBeInstanceOf(
      OAuthInitiationException,
    );
  });

  it('handleCallback 在无 MFA 时返回前端 access/refresh token 重定向', async () => {
    supabaseService.exchangeCodeForSession.mockResolvedValue({
      session: mockSession,
      user: mockSupabaseUser,
    });
    mockFindFirst.mockResolvedValueOnce(mockUserRecord);
    mockUpdateReturning.mockResolvedValueOnce([mockUserRecord]);

    const result = await oauthService.handleCallback(MOCK_CODE);

    expect(result.redirectUrl).toBe(
      `${MOCK_FRONTEND_URL}/auth/callback?access_token=oauth-access-token&refresh_token=oauth-refresh-token`,
    );
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('handleCallback 在用户已启用 MFA 时返回 mfa_required 重定向', async () => {
    supabaseService.exchangeCodeForSession.mockResolvedValue({
      session: mockSession,
      user: mockSupabaseUser,
    });
    supabaseService.listFactors.mockResolvedValue({
      totp: [{ id: 'factor-1', status: 'verified' }],
    });
    mockFindFirst.mockResolvedValueOnce(mockUserRecord);
    mockUpdateReturning.mockResolvedValueOnce([mockUserRecord]);

    const result = await oauthService.handleCallback(MOCK_CODE);
    const redirectUrl = new URL(result.redirectUrl);
    const mfaToken = redirectUrl.searchParams.get('mfa_token');

    expect(redirectUrl.searchParams.get('mfa_required')).toBe('true');
    expect(mfaToken).toBeTruthy();

    const payload = jwt.verify(mfaToken!, TEST_JWT_SECRET) as jwt.JwtPayload;

    expect(payload.type).toBe('mfa_pending');
    expect(payload.supabaseAccessToken).toBe('oauth-access-token');
    expect(payload.sub).toBe(MOCK_LOCAL_USER_ID);
  });

  it('handleCallback 会同步已有 OAuth 用户的资料字段', async () => {
    const existingUserRecord = {
      ...mockUserRecord,
      displayName: 'Old Name',
      avatarUrl: null,
    };
    const updatedUserRecord = {
      ...existingUserRecord,
      displayName: 'Social User',
      avatarUrl: 'https://cdn.example.com/avatar.png',
    };

    supabaseService.exchangeCodeForSession.mockResolvedValue({
      session: mockSession,
      user: mockSupabaseUser,
    });
    mockFindFirst.mockResolvedValueOnce(existingUserRecord);
    mockUpdateReturning.mockResolvedValueOnce([updatedUserRecord]);

    const result = await oauthService.handleCallback(MOCK_CODE);

    expect(mockUpdateSet).toHaveBeenCalledWith({
      displayName: 'Social User',
      avatarUrl: 'https://cdn.example.com/avatar.png',
    });
    expect(result.user).toEqual(updatedUserRecord);
  });

  it('Supabase 回调失败时抛出 OAuthCallbackException', async () => {
    supabaseService.exchangeCodeForSession.mockRejectedValue(
      new Error('invalid oauth code'),
    );

    await expect(oauthService.handleCallback(MOCK_CODE)).rejects.toBeInstanceOf(
      OAuthCallbackException,
    );
  });
});

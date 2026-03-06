import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OAuthCallbackException, OAuthInitiationException } from '../../../common/exceptions/auth.exceptions';
import { DRIZZLE } from '../../../database/database.module';
import { OAuthService } from '../oauth.service';
import { SupabaseService } from '../supabase/supabase.service';

const MOCK_REDIRECT_URL =
  'http://localhost:3000/api/v1/auth/oauth/callback';
const MOCK_FRONTEND_URL = 'http://localhost:5173';
const MOCK_GOOGLE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const MOCK_GITHUB_URL = 'https://github.com/login/oauth/authorize';
const MOCK_CODE = 'oauth-code-123';
const MOCK_DATE = new Date('2026-03-07T00:00:00Z');
const MOCK_SUPABASE_USER_ID = '0195c9e1-6eb3-7a49-baf4-f772b7ab11c1';
const MOCK_LOCAL_USER_ID = '0195c9e1-8c58-7e3e-b422-bc3a18bfa111';
const MOCK_EMAIL = 'social@example.com';

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

  return {
    db: {
      insert: mockInsert,
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
  };
}

function createMockConfigService() {
  return {
    get: vi.fn((key: string) => {
      const values = {
        APP_OAUTH_REDIRECT_URL: MOCK_REDIRECT_URL,
        APP_FRONTEND_URL: MOCK_FRONTEND_URL,
      };

      return values[key as keyof typeof values];
    }),
  };
}

describe('OAuthService', () => {
  let oauthService: OAuthService;
  let supabaseService: ReturnType<typeof createMockSupabaseService>;
  let configService: ReturnType<typeof createMockConfigService>;
  let mockInsert: ReturnType<typeof vi.fn>;
  let mockFindFirst: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    supabaseService = createMockSupabaseService();
    configService = createMockConfigService();
    const { db, mockInsert: insert, mockFindFirst: findFirst } = createMockDb();

    mockInsert = insert;
    mockFindFirst = findFirst;

    const module = await Test.createTestingModule({
      providers: [
        OAuthService,
        { provide: SupabaseService, useValue: supabaseService },
        { provide: ConfigService, useValue: configService },
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    oauthService = module.get(OAuthService);
  });

  describe('initiateOAuth', () => {
    it('成功发起 Google OAuth', async () => {
      supabaseService.signInWithOAuth.mockResolvedValue({ url: MOCK_GOOGLE_URL });

      const result = await oauthService.initiateOAuth('google');

      expect(result).toEqual({ url: MOCK_GOOGLE_URL });
      expect(supabaseService.signInWithOAuth).toHaveBeenCalledWith(
        'google',
        MOCK_REDIRECT_URL,
      );
    });

    it('成功发起 GitHub OAuth', async () => {
      const customRedirectUrl = 'https://custom.example.com/oauth/callback';
      supabaseService.signInWithOAuth.mockResolvedValue({ url: MOCK_GITHUB_URL });

      const result = await oauthService.initiateOAuth(
        'github',
        customRedirectUrl,
      );

      expect(result).toEqual({ url: MOCK_GITHUB_URL });
      expect(supabaseService.signInWithOAuth).toHaveBeenCalledWith(
        'github',
        customRedirectUrl,
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
  });

  describe('handleCallback', () => {
    it('成功处理回调并返回前端重定向 URL', async () => {
      supabaseService.exchangeCodeForSession.mockResolvedValue({
        session: mockSession,
        user: mockSupabaseUser,
      });
      mockFindFirst.mockResolvedValueOnce(mockUserRecord);

      const result = await oauthService.handleCallback(MOCK_CODE);

      expect(result.redirectUrl).toBe(
        `${MOCK_FRONTEND_URL}/auth/callback?access_token=oauth-access-token&refresh_token=oauth-refresh-token`,
      );
      expect(result.user).toEqual(mockUserRecord);
      expect(result.session).toEqual(mockSession);
      expect(supabaseService.exchangeCodeForSession).toHaveBeenCalledWith(
        MOCK_CODE,
      );
    });

    it('新 OAuth 用户会创建本地用户记录', async () => {
      supabaseService.exchangeCodeForSession.mockResolvedValue({
        session: mockSession,
        user: mockSupabaseUser,
      });
      mockFindFirst.mockResolvedValueOnce(mockUserRecord);

      await oauthService.handleCallback(MOCK_CODE);

      expect(mockInsert).toHaveBeenCalledTimes(1);
      const insertCall = mockInsert.mock.results[0]?.value as {
        values: ReturnType<typeof vi.fn>;
      };
      expect(insertCall.values).toHaveBeenCalledWith({
        supabaseUserId: MOCK_SUPABASE_USER_ID,
        email: MOCK_EMAIL,
        displayName: 'Social User',
        avatarUrl: 'https://cdn.example.com/avatar.png',
      });
    });

    it('已有 OAuth 用户时返回现有用户记录', async () => {
      const existingUserRecord = {
        ...mockUserRecord,
        displayName: 'Existing User',
        avatarUrl: null,
      };

      supabaseService.exchangeCodeForSession.mockResolvedValue({
        session: mockSession,
        user: {
          ...mockSupabaseUser,
          user_metadata: {
            name: 'Existing User',
          },
        },
      });
      mockFindFirst.mockResolvedValueOnce(existingUserRecord);

      const result = await oauthService.handleCallback(MOCK_CODE);

      expect(result.user).toEqual(existingUserRecord);
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
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
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { TokenBlacklistService } from '../../../common/services/token-blacklist.service';
import { DRIZZLE } from '../../../database/database.module';

const mocks = vi.hoisted(() => ({
  MOCK_USER_ID: 'sup-user-id-0001',
  MOCK_SESSION_ID: 'sess-uuid-1234-5678-abcd',
  MOCK_OTHER_SESSION_ID: 'sess-uuid-9999-0000-efgh',
  MOCK_ACCESS_TOKEN: 'mock.access.token',
}));

function createMockSupabaseService() {
  return {
    signUp: vi.fn(),
    signIn: vi.fn(),
    refreshToken: vi.fn(),
    signOut: vi.fn(),
    getUser: vi.fn(),
    listFactors: vi.fn().mockResolvedValue({ totp: [] }),
  };
}

function createMockDb() {
  const mockExecute = vi.fn();
  const mockInsertValues = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([]),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  });

  return {
    db: {
      insert: vi.fn().mockReturnValue({ values: mockInsertValues }),
      execute: mockExecute,
      query: {
        users: {
          findFirst: vi.fn(),
        },
      },
    },
    mockExecute,
  };
}

function buildFakeToken(
  sub: string,
  sessionId?: string,
  exp = 9999999999,
): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString(
    'base64url',
  );
  const payload = Buffer.from(
    JSON.stringify({ sub, exp, ...(sessionId ? { session_id: sessionId } : {}) }),
  ).toString('base64url');
  return `${header}.${payload}.fake-sig`;
}

const MOCK_SESSION_ROW = {
  id: mocks.MOCK_SESSION_ID,
  user_agent: 'Mozilla/5.0',
  ip: '127.0.0.1',
  created_at: '2026-01-01T00:00:00.000Z',
  last_active_at: '2026-01-02T00:00:00.000Z',
};

describe('AuthService — session management', () => {
  let authService: AuthService;
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { db, mockExecute: me } = createMockDb();
    mockExecute = me;

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: createMockSupabaseService() },
        { provide: DRIZZLE, useValue: db },
        {
          provide: TokenBlacklistService,
          useValue: { add: vi.fn(), isBlacklisted: vi.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('test-secret') },
        },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  describe('listSessions', () => {
    it('成功：活跃セッション一覧と is_current フラグを返す', async () => {
      const token = buildFakeToken(
        mocks.MOCK_USER_ID,
        mocks.MOCK_SESSION_ID,
      );

      mockExecute.mockResolvedValue({
        rows: [MOCK_SESSION_ROW],
      });

      const result = await authService.listSessions(token);

      expect(result.data.sessions).toHaveLength(1);
      const session = result.data.sessions[0];
      expect(session.id).toBe(mocks.MOCK_SESSION_ID);
      expect(session.user_agent).toBe('Mozilla/5.0');
      expect(session.ip).toBe('127.0.0.1');
      expect(session.is_current).toBe(true);
      expect(session.created_at).toBe('2026-01-01T00:00:00.000Z');
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it('空リスト：セッションが存在しない場合は空配列を返す', async () => {
      const token = buildFakeToken(mocks.MOCK_USER_ID, mocks.MOCK_SESSION_ID);

      mockExecute.mockResolvedValue({ rows: [] });

      const result = await authService.listSessions(token);

      expect(result.data.sessions).toEqual([]);
    });
  });

  describe('revokeSession', () => {
    it('成功：別セッションを正常に取消', async () => {
      const token = buildFakeToken(
        mocks.MOCK_USER_ID,
        mocks.MOCK_SESSION_ID,
      );

      mockExecute.mockResolvedValueOnce({
        rows: [{ id: mocks.MOCK_OTHER_SESSION_ID }],
      });
      mockExecute.mockResolvedValueOnce({ rows: [] });

      const result = await authService.revokeSession(
        token,
        mocks.MOCK_OTHER_SESSION_ID,
      );

      expect(result.message).toBe('Session revoked successfully');
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it('エラー：現在のセッションを取り消そうとすると 400 を投げる', async () => {
      const token = buildFakeToken(
        mocks.MOCK_USER_ID,
        mocks.MOCK_SESSION_ID,
      );

      try {
        await authService.revokeSession(token, mocks.MOCK_SESSION_ID);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(de.type).toBe(
          'https://agentloom.dev/errors/session-revoke-current',
        );
      }

      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('エラー：存在しないセッション ID で 404 を投げる', async () => {
      const token = buildFakeToken(
        mocks.MOCK_USER_ID,
        mocks.MOCK_SESSION_ID,
      );

      mockExecute.mockResolvedValueOnce({ rows: [] });

      try {
        await authService.revokeSession(token, mocks.MOCK_OTHER_SESSION_ID);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        const de = error as DomainException;
        expect(de.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(de.type).toBe(
          'https://agentloom.dev/errors/session-not-found',
        );
      }

      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe('revokeAllSessions', () => {
    it('成功：現在のセッション以外を全て削除し revokedCount を返す', async () => {
      const token = buildFakeToken(
        mocks.MOCK_USER_ID,
        mocks.MOCK_SESSION_ID,
      );

      mockExecute.mockResolvedValueOnce({
        rows: [
          { id: mocks.MOCK_SESSION_ID },
          { id: mocks.MOCK_OTHER_SESSION_ID },
        ],
      });
      mockExecute.mockResolvedValueOnce({ rows: [] });

      const result = await authService.revokeAllSessions(token);

      expect(result).toEqual({ data: { revokedCount: 1 } });
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it('成功：削除対象セッションが無い場合は revokedCount=0 を返す', async () => {
      const token = buildFakeToken(
        mocks.MOCK_USER_ID,
        mocks.MOCK_SESSION_ID,
      );

      mockExecute.mockResolvedValueOnce({
        rows: [{ id: mocks.MOCK_SESSION_ID }],
      });

      const result = await authService.revokeAllSessions(token);

      expect(result).toEqual({ data: { revokedCount: 0 } });
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });
});

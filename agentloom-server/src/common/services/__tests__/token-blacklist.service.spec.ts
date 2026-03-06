import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { TokenBlacklistService } from '../token-blacklist.service';
import { DRIZZLE } from '../../../database/database.module';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createMockDb() {
  const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const mockInsertValues = vi.fn().mockReturnValue({
    onConflictDoNothing: mockOnConflictDoNothing,
  });
  const mockInsert = vi.fn().mockReturnValue({
    values: mockInsertValues,
  });

  const mockFindFirst = vi.fn();

  const mockDeleteReturning = vi.fn().mockResolvedValue([]);
  const mockDeleteWhere = vi.fn().mockReturnValue({
    returning: mockDeleteReturning,
  });
  const mockDelete = vi.fn().mockReturnValue({
    where: mockDeleteWhere,
  });

  return {
    db: {
      insert: mockInsert,
      query: {
        revokedTokens: {
          findFirst: mockFindFirst,
        },
      },
      delete: mockDelete,
    },
    mockInsert,
    mockInsertValues,
    mockOnConflictDoNothing,
    mockFindFirst,
    mockDelete,
    mockDeleteWhere,
    mockDeleteReturning,
  };
}

describe('TokenBlacklistService (DB-backed)', () => {
  let service: TokenBlacklistService;
  let mockInsert: ReturnType<typeof vi.fn>;
  let mockInsertValues: ReturnType<typeof vi.fn>;
  let mockOnConflictDoNothing: ReturnType<typeof vi.fn>;
  let mockFindFirst: ReturnType<typeof vi.fn>;
  let mockDelete: ReturnType<typeof vi.fn>;
  let mockDeleteReturning: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const {
      db,
      mockInsert: mi,
      mockInsertValues: miv,
      mockOnConflictDoNothing: mocn,
      mockFindFirst: mff,
      mockDelete: md,
      mockDeleteReturning: mdr,
    } = createMockDb();

    mockInsert = mi;
    mockInsertValues = miv;
    mockOnConflictDoNothing = mocn;
    mockFindFirst = mff;
    mockDelete = md;
    mockDeleteReturning = mdr;

    const module = await Test.createTestingModule({
      providers: [
        TokenBlacklistService,
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    service = module.get(TokenBlacklistService);
  });

  describe('add', () => {
    it('SHA-256 ハッシュでトークンを DB に保存する', async () => {
      const token = 'test-access-token';
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      await service.add(token, expiresAt);

      expect(mockInsert).toHaveBeenCalled();
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenHash: hashToken(token),
          expiresAt: new Date(expiresAt * 1000),
        }),
      );
      expect(mockOnConflictDoNothing).toHaveBeenCalled();
    });

    it('userId 付きで保存する', async () => {
      const token = 'test-access-token';
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const userId = 'user-uuid-12345';

      await service.add(token, expiresAt, userId);

      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenHash: hashToken(token),
          userId,
          expiresAt: new Date(expiresAt * 1000),
        }),
      );
    });

    it('同じトークンの重複挿入は onConflictDoNothing で無視', async () => {
      const token = 'duplicate-token';
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      await service.add(token, expiresAt);

      expect(mockOnConflictDoNothing).toHaveBeenCalled();
    });
  });

  describe('isBlacklisted', () => {
    it('DB にハッシュが存在する場合 true を返す', async () => {
      mockFindFirst.mockResolvedValue({ tokenHash: hashToken('some-token') });

      const result = await service.isBlacklisted('some-token');

      expect(result).toBe(true);
      expect(mockFindFirst).toHaveBeenCalled();
    });

    it('DB にハッシュが無い場合 false を返す', async () => {
      mockFindFirst.mockResolvedValue(undefined);

      const result = await service.isBlacklisted('unknown-token');

      expect(result).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('期限切れトークンを削除して件数を返す', async () => {
      mockDeleteReturning.mockResolvedValue([
        { tokenHash: 'a' },
        { tokenHash: 'b' },
      ]);

      const count = await service.cleanup();

      expect(count).toBe(2);
      expect(mockDelete).toHaveBeenCalled();
    });

    it('期限切れトークンが無い場合 0 を返す', async () => {
      mockDeleteReturning.mockResolvedValue([]);

      const count = await service.cleanup();

      expect(count).toBe(0);
    });
  });
});

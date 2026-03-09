import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import { SandboxService } from '../sandbox.service';
import { SandboxNotFoundException } from '../sandbox.exceptions';
import { SANDBOX_LIFECYCLE_QUEUE } from '../sandbox.constants';
import type { SandboxConfig, SandboxSession } from '../../../database/schema';

function createSelectChainWithLimit(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createInsertChainReturning(result: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createUpdateChainReturning(result: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_EXECUTION_ID = '00000000-0000-0000-0000-000000000002';
const TEST_SESSION_ID = '00000000-0000-0000-0000-000000000003';

const TEST_CONFIG: SandboxConfig = {
  cpu: 1,
  memory: 512,
  disk: 2,
  timeout: 2,
};

function buildSession(
  overrides?: Partial<SandboxSession>,
): SandboxSession {
  return {
    id: TEST_SESSION_ID,
    executionId: TEST_EXECUTION_ID,
    sandboxNodeId: 'sandbox-1',
    tenantId: TEST_TENANT_ID,
    containerId: null,
    status: 'creating',
    config: TEST_CONFIG,
    workspacePath: null,
    startedAt: null,
    stoppedAt: null,
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('SandboxService', () => {
  let service: SandboxService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let mockQueue: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.clearAllMocks();

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
      transaction: vi.fn(),
    };

    mockQueue = {
      add: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    const module = await Test.createTestingModule({
      providers: [
        SandboxService,
        { provide: DRIZZLE, useValue: db },
        {
          provide: getQueueToken(SANDBOX_LIFECYCLE_QUEUE),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get(SandboxService);
  });

  describe('createSandboxSession', () => {
    it('既存アクティブセッション無しの場合、新規セッションを作成してキューに投入', async () => {
      const newSession = buildSession();

      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));
      db.insert.mockReturnValueOnce(
        createInsertChainReturning([newSession]),
      );

      const result = await service.createSandboxSession(
        TEST_EXECUTION_ID,
        'sandbox-1',
        TEST_CONFIG,
        TEST_TENANT_ID,
      );

      expect(result).toEqual(newSession);
      expect(db.insert).toHaveBeenCalledOnce();
      expect(mockQueue.add).toHaveBeenCalledWith('create', {
        sessionId: TEST_SESSION_ID,
        executionId: TEST_EXECUTION_ID,
        tenantId: TEST_TENANT_ID,
        jobType: 'create',
      });
    });

    it('アクティブセッション既存の場合、既存セッションを再利用', async () => {
      const existing = buildSession({ status: 'ready' });

      db.select.mockReturnValueOnce(
        createSelectChainWithLimit([existing]),
      );

      const result = await service.createSandboxSession(
        TEST_EXECUTION_ID,
        'sandbox-1',
        TEST_CONFIG,
        TEST_TENANT_ID,
      );

      expect(result).toEqual(existing);
      expect(db.insert).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('getSandboxSession', () => {
    it('アクティブセッション発見時にセッションを返す', async () => {
      const session = buildSession({ status: 'ready' });
      db.select.mockReturnValueOnce(
        createSelectChainWithLimit([session]),
      );

      const result = await service.getSandboxSession(TEST_EXECUTION_ID);
      expect(result).toEqual(session);
    });

    it('アクティブセッション未発見時に null を返す', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));

      const result = await service.getSandboxSession(TEST_EXECUTION_ID);
      expect(result).toBeNull();
    });
  });

  describe('updateSessionStatus', () => {
    it('セッションステータスを正常に更新', async () => {
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([{ id: TEST_SESSION_ID }]),
      );

      await expect(
        service.updateSessionStatus(TEST_SESSION_ID, 'ready', {
          containerId: 'container-abc',
          startedAt: new Date(),
        }),
      ).resolves.toBeUndefined();

      expect(db.update).toHaveBeenCalledOnce();
    });

    it('セッション未発見時に SandboxNotFoundException を投げる', async () => {
      db.update.mockReturnValueOnce(createUpdateChainReturning([]));

      await expect(
        service.updateSessionStatus(TEST_SESSION_ID, 'ready'),
      ).rejects.toThrow(SandboxNotFoundException);
    });
  });

  describe('destroySandbox', () => {
    it('アクティブセッション発見時にステータス更新 → destroy キュー投入', async () => {
      const session = buildSession({ status: 'ready' });

      db.select.mockReturnValueOnce(
        createSelectChainWithLimit([session]),
      );
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([{ id: TEST_SESSION_ID }]),
      );

      await service.destroySandbox(TEST_EXECUTION_ID, TEST_TENANT_ID);

      expect(db.update).toHaveBeenCalledOnce();
      expect(mockQueue.add).toHaveBeenCalledWith('destroy', {
        sessionId: TEST_SESSION_ID,
        executionId: TEST_EXECUTION_ID,
        tenantId: TEST_TENANT_ID,
        jobType: 'destroy',
      });
    });

    it('アクティブセッション未発見時にスキップ（warn ログ出力）', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));

      await service.destroySandbox(TEST_EXECUTION_ID, TEST_TENANT_ID);

      expect(db.update).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });
  });
});

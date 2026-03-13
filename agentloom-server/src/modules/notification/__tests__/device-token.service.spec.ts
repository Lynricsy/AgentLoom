import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { DRIZZLE } from '../../../database/database.module';
import { deviceTokens } from '../../../database/schema';
import { DeviceTokenService } from '../device-token.service';

const mocks = vi.hoisted(() => ({
  createMockDb: () => ({
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  }),
}));

const USER_ID = '019391d4-b000-7000-0000-000000000002';
const DEVICE_TOKEN = 'device-token-1';
const NOW = new Date('2025-01-01T00:00:00Z');

function createInsertUpsertReturning(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });

  return {
    values,
    onConflictDoUpdate,
    returning,
  };
}

function createUpdateWhere(result?: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const set = vi.fn().mockReturnValue({ where });

  return {
    set,
    where,
  };
}

function createSelectWhereResolved(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });

  return {
    from,
    where,
  };
}

describe('DeviceTokenService', () => {
  let service: DeviceTokenService;
  let db: ReturnType<typeof mocks.createMockDb>;

  beforeEach(async () => {
    vi.clearAllMocks();

    db = mocks.createMockDb();

    const module = await Test.createTestingModule({
      providers: [DeviceTokenService, { provide: DRIZZLE, useValue: db }],
    }).compile();

    service = module.get(DeviceTokenService);
  });

  it('应注册新设备 token', async () => {
    const record = {
      id: 'device-1',
      userId: USER_ID,
      deviceToken: DEVICE_TOKEN,
      platform: 'android',
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const insertChain = createInsertUpsertReturning([record]);
    db.insert.mockReturnValue(insertChain);

    await expect(
      service.register(USER_ID, DEVICE_TOKEN, 'android'),
    ).resolves.toEqual(record);

    expect(db.insert).toHaveBeenCalledWith(deviceTokens);
    expect(insertChain.values).toHaveBeenCalledWith({
      userId: USER_ID,
      deviceToken: DEVICE_TOKEN,
      platform: 'android',
      isActive: true,
    });
    expect(insertChain.onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it('应通过 upsert 重新激活已存在设备 token', async () => {
    const record = {
      id: 'device-1',
      userId: USER_ID,
      deviceToken: DEVICE_TOKEN,
      platform: 'ios',
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const insertChain = createInsertUpsertReturning([record]);
    db.insert.mockReturnValue(insertChain);

    await service.register(USER_ID, DEVICE_TOKEN, 'ios');

    const upsertArg = insertChain.onConflictDoUpdate.mock.calls[0]?.[0] as {
      target: unknown[];
      set: {
        platform: string;
        isActive: boolean;
        updatedAt: Date;
      };
    };

    expect(upsertArg.target).toEqual([
      deviceTokens.userId,
      deviceTokens.deviceToken,
    ]);
    expect(upsertArg.set.platform).toBe('ios');
    expect(upsertArg.set.isActive).toBe(true);
    expect(upsertArg.set.updatedAt).toBeInstanceOf(Date);
  });

  it('应注销设备 token', async () => {
    const updateChain = createUpdateWhere();
    db.update.mockReturnValue(updateChain);

    await service.unregister(USER_ID, DEVICE_TOKEN);

    expect(db.update).toHaveBeenCalledWith(deviceTokens);
    const unregisterArg = updateChain.set.mock.calls[0]?.[0] as {
      isActive: boolean;
      updatedAt: Date;
    };

    expect(unregisterArg.isActive).toBe(false);
    expect(unregisterArg.updatedAt).toBeInstanceOf(Date);
    expect(updateChain.where).toHaveBeenCalledOnce();
  });

  it('应返回用户有效设备 token 列表', async () => {
    const records = [
      { deviceToken: 'token-a', platform: 'android' },
      { deviceToken: 'token-b', platform: 'ios' },
    ];
    const selectChain = createSelectWhereResolved(records);
    db.select.mockReturnValue(selectChain);

    await expect(service.findActiveByUserId(USER_ID)).resolves.toEqual(records);

    expect(db.select).toHaveBeenCalledWith({
      deviceToken: deviceTokens.deviceToken,
      platform: deviceTokens.platform,
    });
    expect(selectChain.from).toHaveBeenCalledWith(deviceTokens);
  });

  it('deactivateTokens 在空数组时应直接跳过', async () => {
    await service.deactivateTokens([]);

    expect(db.update).not.toHaveBeenCalled();
  });

  it('deactivateTokens 应批量失活 token', async () => {
    const updateChain = createUpdateWhere();
    db.update.mockReturnValue(updateChain);

    await service.deactivateTokens(['token-a', 'token-b']);

    expect(db.update).toHaveBeenCalledWith(deviceTokens);
    const deactivateArg = updateChain.set.mock.calls[0]?.[0] as {
      isActive: boolean;
      updatedAt: Date;
    };

    expect(deactivateArg.isActive).toBe(false);
    expect(deactivateArg.updatedAt).toBeInstanceOf(Date);
    expect(updateChain.where).toHaveBeenCalledOnce();
  });
});

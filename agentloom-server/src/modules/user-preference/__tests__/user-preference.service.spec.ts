import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import { LlmModelConfigNotFoundException } from '../../llm/llm.exceptions';
import { UserPreferenceService } from '../user-preference.service';

const mocks = vi.hoisted(() => ({
  getTenantDb: vi.fn(),
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const MODEL_CONFIG_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-01-01T00:00:00.000Z');

function createDb(modelConfigRows: Array<{ id: string }>) {
  const limit = vi.fn().mockResolvedValue(modelConfigRows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const returning = vi.fn().mockResolvedValue([
    {
      id: 'pref-1',
      userId: USER_ID,
      tenantId: TENANT_ID,
      titleModelConfigId: MODEL_CONFIG_ID,
      preferences: {},
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });

  return {
    select: vi.fn().mockReturnValue({ from }),
    insert: vi.fn().mockReturnValue({ values }),
    where,
  };
}

describe('UserPreferenceService.upsert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('标题模型配置不在当前租户时抛出 404 且不写入', async () => {
    const db = createDb([]);
    mocks.getTenantDb.mockReturnValue(db as unknown as DrizzleDB);
    const service = new UserPreferenceService(db as unknown as DrizzleDB);

    await expect(
      service.upsert(USER_ID, TENANT_ID, {
        titleModelConfigId: MODEL_CONFIG_ID,
      }),
    ).rejects.toBeInstanceOf(LlmModelConfigNotFoundException);

    expect(db.insert).not.toHaveBeenCalled();
  });

  it('标题模型配置属于当前租户时正常写入', async () => {
    const db = createDb([{ id: MODEL_CONFIG_ID }]);
    mocks.getTenantDb.mockReturnValue(db as unknown as DrizzleDB);
    const service = new UserPreferenceService(db as unknown as DrizzleDB);

    await expect(
      service.upsert(USER_ID, TENANT_ID, {
        titleModelConfigId: MODEL_CONFIG_ID,
      }),
    ).resolves.toMatchObject({ titleModelConfigId: MODEL_CONFIG_ID });

    expect(db.select).toHaveBeenCalledOnce();
    expect(db.insert).toHaveBeenCalledOnce();
  });

  it('清空标题模型配置（null）时不做存在性校验', async () => {
    const db = createDb([]);
    mocks.getTenantDb.mockReturnValue(db as unknown as DrizzleDB);
    const service = new UserPreferenceService(db as unknown as DrizzleDB);

    await service.upsert(USER_ID, TENANT_ID, { titleModelConfigId: null });

    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledOnce();
  });
});

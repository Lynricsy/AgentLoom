import { describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import { TenantRequiredException } from '../../exceptions/auth.exceptions';
import {
  hasActiveTenantTransaction,
  runInTenantTransaction,
  tenantlessRequestStorage,
} from '../../interceptors/tenant-transaction.context';
import { getTenantDb } from '../tenant-aware-db.provider';

function createMockDb() {
  const tx = { execute: vi.fn().mockResolvedValue(undefined) };
  const db = {
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  return { db: db as unknown as DrizzleDB, tx };
}

describe('getTenantDb', () => {
  it('不在任何请求作用域（worker、定时任务等系统上下文）时返回基础连接', () => {
    const { db } = createMockDb();

    expect(getTenantDb(db)).toBe(db);
  });

  it('租户事务内返回事务对象', async () => {
    const { db, tx } = createMockDb();

    const resolved = await runInTenantTransaction(db, 'tenant-a', async () =>
      getTenantDb(db),
    );

    expect(resolved).toBe(tx);
  });

  it('无租户请求作用域内 fail-closed：抛 tenant-required，不回退到绕过 RLS 的基础连接', async () => {
    const { db } = createMockDb();

    await tenantlessRequestStorage.run(true, async () => {
      expect(() => getTenantDb(db)).toThrow(TenantRequiredException);
      // 异步延续同样处于无租户作用域
      await Promise.resolve();
      expect(() => getTenantDb(db)).toThrow(TenantRequiredException);
      expect(hasActiveTenantTransaction()).toBe(false);
    });
  });

  it('无租户请求作用域内显式开启租户事务后取得事务对象，结束后恢复 fail-closed', async () => {
    const { db, tx } = createMockDb();

    await tenantlessRequestStorage.run(true, async () => {
      const resolved = await runInTenantTransaction(
        db,
        'tenant-b',
        async () => {
          expect(hasActiveTenantTransaction()).toBe(true);
          return getTenantDb(db);
        },
      );

      expect(resolved).toBe(tx);
      expect(() => getTenantDb(db)).toThrow(TenantRequiredException);
    });
  });
});

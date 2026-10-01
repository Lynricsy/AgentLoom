import * as crypto from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runInTenantTransaction } from '../src/common/interceptors/tenant-transaction.context';
import { PluginDeveloperKeyNotFoundException } from '../src/modules/plugin/plugin.exceptions';
import { PluginDeveloperKeyService } from '../src/modules/plugin/plugin-developer-key.service';
import type { PluginSignatureService } from '../src/modules/plugin/plugin-signature.service';
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  type RlsTestContext,
} from './rls/rls-test-utils';

type Fixture = {
  tenantId: string;
  orgId: string;
  adminId: string;
  creatorAId: string;
  creatorBId: string;
  keyAId: string;
  keyBId: string;
};

async function seedKey(
  context: RlsTestContext,
  fixture: Pick<Fixture, 'tenantId' | 'orgId'>,
  userId: string,
  label: string,
) {
  const [row] = await context.adminSql<{ id: string }[]>`
    INSERT INTO plugin_developer_keys (
      tenant_id, org_id, user_id, public_key, key_fingerprint, label
    ) VALUES (
      ${fixture.tenantId}::uuid, ${fixture.orgId}::uuid, ${userId}::uuid,
      ${`-----BEGIN PUBLIC KEY-----\n${label}\n-----END PUBLIC KEY-----`},
      ${crypto.randomBytes(32).toString('hex')}, ${label}
    )
    RETURNING id
  `;
  return row!.id;
}

describe('PluginDeveloperKeyService 按调用者限定密钥范围 (testcontainers)', () => {
  let context: RlsTestContext;
  let fixture: Fixture;
  let service: PluginDeveloperKeyService;

  beforeAll(async () => {
    context = await createRlsTestContext();
    service = new PluginDeveloperKeyService(
      context.db,
      {} as PluginSignatureService,
    );
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.adminSql`DELETE FROM plugin_developer_keys`;
    await context.reset();

    const tenantId = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    const adminId = crypto.randomUUID();
    const creatorAId = crypto.randomUUID();
    const creatorBId = crypto.randomUUID();

    await seedAppUser(context.adminSql, adminId, `admin-${adminId}@ex.com`);
    await seedAppUser(context.adminSql, creatorAId, `a-${creatorAId}@ex.com`);
    await seedAppUser(context.adminSql, creatorBId, `b-${creatorBId}@ex.com`);
    await seedOrg(
      context.adminSql,
      orgId,
      'Org',
      `org-${orgId}`,
      adminId,
      tenantId,
    );
    await seedMember(context.adminSql, orgId, adminId, 'admin', adminId);
    await seedMember(context.adminSql, orgId, creatorAId, 'creator', adminId);
    await seedMember(context.adminSql, orgId, creatorBId, 'creator', adminId);

    const base = { tenantId, orgId };
    fixture = {
      ...base,
      adminId,
      creatorAId,
      creatorBId,
      keyAId: await seedKey(context, base, creatorAId, 'key-a'),
      keyBId: await seedKey(context, base, creatorBId, 'key-b'),
    };
  });

  const asTenant = <T>(operation: () => Promise<T>) =>
    runInTenantTransaction(context.db, fixture.tenantId, operation);

  it('creator 列表只包含自己注册的密钥', async () => {
    const result = await asTenant(() =>
      service.listKeys(fixture.orgId, {
        userId: fixture.creatorAId,
        canManageAllKeys: false,
      }),
    );

    expect(result.data.map((key) => key.id)).toEqual([fixture.keyAId]);
    expect(result.meta.total).toBe(1);
  });

  it('creator 读取或撤销他人密钥得到 404，且对方密钥保持 active', async () => {
    const actor = { userId: fixture.creatorAId, canManageAllKeys: false };

    await expect(
      asTenant(() => service.findById(fixture.orgId, fixture.keyBId, actor)),
    ).rejects.toBeInstanceOf(PluginDeveloperKeyNotFoundException);
    await expect(
      asTenant(() => service.revokeKey(fixture.orgId, fixture.keyBId, actor)),
    ).rejects.toBeInstanceOf(PluginDeveloperKeyNotFoundException);

    const [row] = await context.adminSql<{ status: string }[]>`
      SELECT status FROM plugin_developer_keys WHERE id = ${fixture.keyBId}::uuid
    `;
    expect(row?.status).toBe('active');
  });

  it('creator 可以撤销自己的密钥', async () => {
    const revoked = await asTenant(() =>
      service.revokeKey(fixture.orgId, fixture.keyAId, {
        userId: fixture.creatorAId,
        canManageAllKeys: false,
      }),
    );

    expect(revoked.status).toBe('revoked');
  });

  it('owner/admin 保留组织全局视图并可撤销任意成员密钥', async () => {
    const actor = { userId: fixture.adminId, canManageAllKeys: true };

    const result = await asTenant(() => service.listKeys(fixture.orgId, actor));
    expect(result.data.map((key) => key.id).sort()).toEqual(
      [fixture.keyAId, fixture.keyBId].sort(),
    );

    const revoked = await asTenant(() =>
      service.revokeKey(fixture.orgId, fixture.keyBId, actor),
    );
    expect(revoked.status).toBe('revoked');
  });
});

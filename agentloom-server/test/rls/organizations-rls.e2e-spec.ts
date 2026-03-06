import * as crypto from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { organizations } from '../../src/database/schema';
import {
  createRlsTestContext,
  getErrorText,
  seedAppUser,
  seedOrg,
  withTenantContext,
  withoutTenantContext,
  type RlsTestContext,
} from './rls-test-utils';

type OrganizationFixture = {
  tenantOneId: string;
  tenantTwoId: string;
  tenantThreeId: string;
  tenantOneOwnerId: string;
  tenantTwoOwnerId: string;
  tenantThreeOwnerId: string;
  orgOneId: string;
  orgTwoId: string;
  orgThreeId: string;
};

function createFixture(): OrganizationFixture {
  return {
    tenantOneId: crypto.randomUUID(),
    tenantTwoId: crypto.randomUUID(),
    tenantThreeId: crypto.randomUUID(),
    tenantOneOwnerId: crypto.randomUUID(),
    tenantTwoOwnerId: crypto.randomUUID(),
    tenantThreeOwnerId: crypto.randomUUID(),
    orgOneId: crypto.randomUUID(),
    orgTwoId: crypto.randomUUID(),
    orgThreeId: crypto.randomUUID(),
  };
}

function createEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

describe('Organizations RLS isolation (testcontainers)', () => {
  let context: RlsTestContext;
  let fixture: OrganizationFixture;

  beforeAll(async () => {
    context = await createRlsTestContext();
  }, 120_000);

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await context.reset();
    fixture = createFixture();

    await seedAppUser(
      context.adminSql,
      fixture.tenantOneOwnerId,
      createEmail('tenant-one-owner'),
    );
    await seedAppUser(
      context.adminSql,
      fixture.tenantTwoOwnerId,
      createEmail('tenant-two-owner'),
    );
    await seedAppUser(
      context.adminSql,
      fixture.tenantThreeOwnerId,
      createEmail('tenant-three-owner'),
    );

    await seedOrg(
      context.adminSql,
      fixture.orgOneId,
      'Tenant One Org One',
      'tenant-one-org-one',
      fixture.tenantOneOwnerId,
      fixture.tenantOneId,
    );
    await seedOrg(
      context.adminSql,
      fixture.orgTwoId,
      'Tenant Three Org One',
      'tenant-three-org-one',
      fixture.tenantThreeOwnerId,
      fixture.tenantThreeId,
    );
    await seedOrg(
      context.adminSql,
      fixture.orgThreeId,
      'Tenant Two Org One',
      'tenant-two-org-one',
      fixture.tenantTwoOwnerId,
      fixture.tenantTwoId,
    );
  });

  it('T1 SELECT 只返回 T1 organizations', async () => {
    const rows = await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
      tx.query.organizations.findMany(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fixture.orgOneId);
    expect([...new Set(rows.map((row) => row.tenantId))]).toEqual([
      fixture.tenantOneId,
    ]);
  });

  it('T2 SELECT 只返回 T2 organizations', async () => {
    const rows = await withTenantContext(context.db, fixture.tenantTwoId, (tx) =>
      tx.query.organizations.findMany(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fixture.orgThreeId);
    expect(rows[0]?.tenantId).toBe(fixture.tenantTwoId);
  });

  it('T1 INSERT 带入 T2 tenant_id 会被拒绝', async () => {
    let thrown: unknown;

    try {
      await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
        tx
          .insert(organizations)
          .values({
            name: 'Cross Tenant Insert',
            slug: `cross-tenant-${crypto.randomUUID().slice(0, 8)}`,
            ownerId: fixture.tenantOneOwnerId,
            tenantId: fixture.tenantTwoId,
          })
          .returning(),
      );
    } catch (error) {
      thrown = error;
    }

    expect(getErrorText(thrown)).toMatch(/row-level security/i);
  });

  it('T1 无法 UPDATE T2 organization', async () => {
    const updatedRows = await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
      tx
        .update(organizations)
        .set({ name: 'hacked' })
        .where(eq(organizations.id, fixture.orgThreeId))
        .returning({ id: organizations.id }),
    );

    expect(updatedRows).toHaveLength(0);

    const [organization] = await context.adminSql`
      SELECT name
      FROM organizations
      WHERE id = ${fixture.orgThreeId}::uuid
    `;

    expect(organization?.name).toBe('Tenant Two Org One');
  });

  it('T1 无法 DELETE T2 organization', async () => {
    const deletedRows = await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
      tx
        .delete(organizations)
        .where(eq(organizations.id, fixture.orgThreeId))
        .returning({ id: organizations.id }),
    );

    expect(deletedRows).toHaveLength(0);

    const [organization] = await context.adminSql`
      SELECT id
      FROM organizations
      WHERE id = ${fixture.orgThreeId}::uuid
    `;

    expect(organization?.id).toBe(fixture.orgThreeId);
  });

  it('没有 tenant context 时 SELECT 返回空数组', async () => {
    const rows = await withoutTenantContext(context.db, (tx) =>
      tx.query.organizations.findMany(),
    );

    expect(rows).toEqual([]);
  });
});

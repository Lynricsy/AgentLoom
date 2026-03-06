import * as crypto from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { organizationMembers } from '../../src/database/schema';
import {
  createRlsTestContext,
  getErrorText,
  seedAppUser,
  seedMember,
  seedOrg,
  withTenantContext,
  withoutTenantContext,
  type RlsTestContext,
} from './rls-test-utils';

type MemberFixture = {
  tenantOneId: string;
  tenantTwoId: string;
  tenantOneOwnerId: string;
  tenantTwoOwnerId: string;
  tenantOneMemberId: string;
  tenantTwoMemberId: string;
  orgOneId: string;
  orgTwoId: string;
  memberOneId: string;
  memberTwoId: string;
  memberThreeId: string;
};

function createFixture(): MemberFixture {
  return {
    tenantOneId: crypto.randomUUID(),
    tenantTwoId: crypto.randomUUID(),
    tenantOneOwnerId: crypto.randomUUID(),
    tenantTwoOwnerId: crypto.randomUUID(),
    tenantOneMemberId: crypto.randomUUID(),
    tenantTwoMemberId: crypto.randomUUID(),
    orgOneId: crypto.randomUUID(),
    orgTwoId: crypto.randomUUID(),
    memberOneId: '',
    memberTwoId: '',
    memberThreeId: '',
  };
}

function createEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

describe('Organization members RLS isolation (testcontainers)', () => {
  let context: RlsTestContext;
  let fixture: MemberFixture;

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
      fixture.tenantOneMemberId,
      createEmail('tenant-one-member'),
    );
    await seedAppUser(
      context.adminSql,
      fixture.tenantTwoMemberId,
      createEmail('tenant-two-member'),
    );

    await seedOrg(
      context.adminSql,
      fixture.orgOneId,
      'Tenant One Org',
      'tenant-one-org-members',
      fixture.tenantOneOwnerId,
      fixture.tenantOneId,
    );
    await seedOrg(
      context.adminSql,
      fixture.orgTwoId,
      'Tenant Two Org',
      'tenant-two-org-members',
      fixture.tenantTwoOwnerId,
      fixture.tenantTwoId,
    );

    const memberOne = await seedMember(
      context.adminSql,
      fixture.orgOneId,
      fixture.tenantOneOwnerId,
      'owner',
      fixture.tenantOneOwnerId,
    );
    const memberTwo = await seedMember(
      context.adminSql,
      fixture.orgOneId,
      fixture.tenantOneMemberId,
      'viewer',
      fixture.tenantOneOwnerId,
    );
    const memberThree = await seedMember(
      context.adminSql,
      fixture.orgTwoId,
      fixture.tenantTwoMemberId,
      'admin',
      fixture.tenantTwoOwnerId,
    );

    fixture.memberOneId = memberOne.id;
    fixture.memberTwoId = memberTwo.id;
    fixture.memberThreeId = memberThree.id;
  });

  it('T1 SELECT 只返回 T1 organization members', async () => {
    const rows = await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
      tx.query.organizationMembers.findMany(),
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id).sort()).toEqual(
      [fixture.memberOneId, fixture.memberTwoId].sort(),
    );
    expect([...new Set(rows.map((row) => row.organizationId))]).toEqual([
      fixture.orgOneId,
    ]);
  });

  it('T2 SELECT 只返回 T2 organization members', async () => {
    const rows = await withTenantContext(context.db, fixture.tenantTwoId, (tx) =>
      tx.query.organizationMembers.findMany(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fixture.memberThreeId);
    expect(rows[0]?.organizationId).toBe(fixture.orgTwoId);
  });

  it('T1 无法向 T2 organization INSERT member', async () => {
    let thrown: unknown;

    try {
      await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
        tx
          .insert(organizationMembers)
          .values({
            organizationId: fixture.orgTwoId,
            userId: fixture.tenantOneOwnerId,
            role: 'viewer',
            invitedBy: fixture.tenantOneOwnerId,
          })
          .returning(),
      );
    } catch (error) {
      thrown = error;
    }

    expect(getErrorText(thrown)).toMatch(/row-level security/i);
  });

  it('T1 无法 UPDATE T2 organization members', async () => {
    const updatedRows = await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
      tx
        .update(organizationMembers)
        .set({ role: 'creator' })
        .where(eq(organizationMembers.id, fixture.memberThreeId))
        .returning({ id: organizationMembers.id }),
    );

    expect(updatedRows).toHaveLength(0);

    const [member] = await context.adminSql`
      SELECT role
      FROM organization_members
      WHERE id = ${fixture.memberThreeId}::uuid
    `;

    expect(member?.role).toBe('admin');
  });

  it('T1 无法 DELETE T2 organization members', async () => {
    const deletedRows = await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
      tx
        .delete(organizationMembers)
        .where(eq(organizationMembers.id, fixture.memberThreeId))
        .returning({ id: organizationMembers.id }),
    );

    expect(deletedRows).toHaveLength(0);

    const [member] = await context.adminSql`
      SELECT id
      FROM organization_members
      WHERE id = ${fixture.memberThreeId}::uuid
    `;

    expect(member?.id).toBe(fixture.memberThreeId);
  });

  it('没有 tenant context 时 SELECT 返回空数组', async () => {
    const rows = await withoutTenantContext(context.db, (tx) =>
      tx.query.organizationMembers.findMany(),
    );

    expect(rows).toEqual([]);
  });
});

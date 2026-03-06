import * as crypto from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { organizationInvitations } from '../../src/database/schema';
import {
  createRlsTestContext,
  getErrorText,
  seedAppUser,
  seedInvitation,
  seedOrg,
  withTenantContext,
  withoutTenantContext,
  type RlsTestContext,
} from './rls-test-utils';

type InvitationFixture = {
  tenantOneId: string;
  tenantTwoId: string;
  tenantOneOwnerId: string;
  tenantTwoOwnerId: string;
  orgOneId: string;
  orgTwoId: string;
  invitationOneId: string;
  invitationTwoId: string;
  invitationThreeId: string;
};

function createFixture(): InvitationFixture {
  return {
    tenantOneId: crypto.randomUUID(),
    tenantTwoId: crypto.randomUUID(),
    tenantOneOwnerId: crypto.randomUUID(),
    tenantTwoOwnerId: crypto.randomUUID(),
    orgOneId: crypto.randomUUID(),
    orgTwoId: crypto.randomUUID(),
    invitationOneId: '',
    invitationTwoId: '',
    invitationThreeId: '',
  };
}

function createEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

function createToken() {
  return crypto.randomBytes(16).toString('hex');
}

describe('Organization invitations RLS isolation (testcontainers)', () => {
  let context: RlsTestContext;
  let fixture: InvitationFixture;

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

    await seedOrg(
      context.adminSql,
      fixture.orgOneId,
      'Tenant One Org',
      'tenant-one-org-invitations',
      fixture.tenantOneOwnerId,
      fixture.tenantOneId,
    );
    await seedOrg(
      context.adminSql,
      fixture.orgTwoId,
      'Tenant Two Org',
      'tenant-two-org-invitations',
      fixture.tenantTwoOwnerId,
      fixture.tenantTwoId,
    );

    const invitationOne = await seedInvitation(
      context.adminSql,
      fixture.orgOneId,
      'alpha@example.com',
      'viewer',
      fixture.tenantOneOwnerId,
      createToken(),
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    const invitationTwo = await seedInvitation(
      context.adminSql,
      fixture.orgOneId,
      'beta@example.com',
      'admin',
      fixture.tenantOneOwnerId,
      createToken(),
      new Date(Date.now() + 48 * 60 * 60 * 1000),
    );
    const invitationThree = await seedInvitation(
      context.adminSql,
      fixture.orgTwoId,
      'gamma@example.com',
      'viewer',
      fixture.tenantTwoOwnerId,
      createToken(),
      new Date(Date.now() + 72 * 60 * 60 * 1000),
    );

    fixture.invitationOneId = invitationOne.id;
    fixture.invitationTwoId = invitationTwo.id;
    fixture.invitationThreeId = invitationThree.id;
  });

  it('T1 SELECT 只返回 T1 organization invitations', async () => {
    const rows = await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
      tx.query.organizationInvitations.findMany(),
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id).sort()).toEqual(
      [fixture.invitationOneId, fixture.invitationTwoId].sort(),
    );
    expect([...new Set(rows.map((row) => row.organizationId))]).toEqual([
      fixture.orgOneId,
    ]);
  });

  it('T2 SELECT 只返回 T2 organization invitations', async () => {
    const rows = await withTenantContext(context.db, fixture.tenantTwoId, (tx) =>
      tx.query.organizationInvitations.findMany(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fixture.invitationThreeId);
    expect(rows[0]?.organizationId).toBe(fixture.orgTwoId);
  });

  it('T1 无法向 T2 organization INSERT invitation', async () => {
    let thrown: unknown;

    try {
      await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
        tx
          .insert(organizationInvitations)
          .values({
            organizationId: fixture.orgTwoId,
            email: 'cross-tenant@example.com',
            role: 'viewer',
            invitedBy: fixture.tenantOneOwnerId,
            token: createToken(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          })
          .returning(),
      );
    } catch (error) {
      thrown = error;
    }

    expect(getErrorText(thrown)).toMatch(/row-level security/i);
  });

  it('T1 无法 UPDATE T2 organization invitations', async () => {
    const updatedRows = await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
      tx
        .update(organizationInvitations)
        .set({ status: 'accepted' })
        .where(eq(organizationInvitations.id, fixture.invitationThreeId))
        .returning({ id: organizationInvitations.id }),
    );

    expect(updatedRows).toHaveLength(0);

    const [invitation] = await context.adminSql`
      SELECT status
      FROM organization_invitations
      WHERE id = ${fixture.invitationThreeId}::uuid
    `;

    expect(invitation?.status).toBe('pending');
  });

  it('T1 无法 DELETE T2 organization invitations', async () => {
    const deletedRows = await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
      tx
        .delete(organizationInvitations)
        .where(eq(organizationInvitations.id, fixture.invitationThreeId))
        .returning({ id: organizationInvitations.id }),
    );

    expect(deletedRows).toHaveLength(0);

    const [invitation] = await context.adminSql`
      SELECT id
      FROM organization_invitations
      WHERE id = ${fixture.invitationThreeId}::uuid
    `;

    expect(invitation?.id).toBe(fixture.invitationThreeId);
  });

  it('没有 tenant context 时 SELECT 返回空数组', async () => {
    const rows = await withoutTenantContext(context.db, (tx) =>
      tx.query.organizationInvitations.findMany(),
    );

    expect(rows).toEqual([]);
  });
});

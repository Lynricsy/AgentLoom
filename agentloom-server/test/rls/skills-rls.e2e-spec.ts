import * as crypto from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { BUILTIN_SKILL_TENANT_ID, skills } from '../../src/database/schema';
import {
  createRlsTestContext,
  getErrorText,
  seedAppUser,
  withTenantContext,
  withoutTenantContext,
  type RlsTestContext,
} from './rls-test-utils';

type SkillFixture = {
  tenantOneId: string;
  tenantTwoId: string;
  userOneId: string;
  userTwoId: string;
  builtinSkillId: string;
  skillOneId: string;
  skillTwoId: string;
};

function createFixture(): SkillFixture {
  return {
    tenantOneId: crypto.randomUUID(),
    tenantTwoId: crypto.randomUUID(),
    userOneId: crypto.randomUUID(),
    userTwoId: crypto.randomUUID(),
    builtinSkillId: crypto.randomUUID(),
    skillOneId: crypto.randomUUID(),
    skillTwoId: crypto.randomUUID(),
  };
}

async function seedSkill(
  sqlClient: RlsTestContext['adminSql'],
  options: {
    id: string;
    tenantId: string;
    name: string;
    createdBy: string;
    isBuiltin?: boolean;
  },
) {
  await sqlClient`
    INSERT INTO skills (
      id, tenant_id, name, slug, description, is_builtin, created_by, updated_by
    )
    VALUES (
      ${options.id}::uuid,
      ${options.tenantId}::uuid,
      ${options.name},
      ${options.name},
      'desc',
      ${options.isBuiltin ?? false},
      ${options.createdBy}::uuid,
      ${options.createdBy}::uuid
    )
  `;
}

describe('Skills RLS：内置 Skill 跨租户只读可见 (testcontainers)', () => {
  let context: RlsTestContext;
  let fixture: SkillFixture;

  beforeAll(async () => {
    context = await createRlsTestContext();
  }, 120_000);

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await context.adminSql`DELETE FROM skills`;
    await context.reset();
    fixture = createFixture();

    await seedAppUser(
      context.adminSql,
      fixture.userOneId,
      `skill-user-one-${fixture.userOneId.slice(0, 8)}@example.com`,
    );
    await seedAppUser(
      context.adminSql,
      fixture.userTwoId,
      `skill-user-two-${fixture.userTwoId.slice(0, 8)}@example.com`,
    );

    await seedSkill(context.adminSql, {
      id: fixture.builtinSkillId,
      tenantId: BUILTIN_SKILL_TENANT_ID,
      name: 'code-review',
      createdBy: fixture.userOneId,
      isBuiltin: true,
    });
    await seedSkill(context.adminSql, {
      id: fixture.skillOneId,
      tenantId: fixture.tenantOneId,
      name: 'tenant-one-skill',
      createdBy: fixture.userOneId,
    });
    await seedSkill(context.adminSql, {
      id: fixture.skillTwoId,
      tenantId: fixture.tenantTwoId,
      name: 'tenant-two-skill',
      createdBy: fixture.userTwoId,
    });
  });

  it('租户 SELECT 返回本租户 Skill 与内置 Skill，不含他租户 Skill', async () => {
    const rows = await withTenantContext(
      context.db,
      fixture.tenantOneId,
      (tx) => tx.select({ id: skills.id }).from(skills),
    );

    expect(rows.map((row) => row.id).sort()).toEqual(
      [fixture.builtinSkillId, fixture.skillOneId].sort(),
    );
  });

  it('租户无法 UPDATE 或 DELETE 内置 Skill', async () => {
    const updated = await withTenantContext(
      context.db,
      fixture.tenantOneId,
      (tx) =>
        tx
          .update(skills)
          .set({ description: 'hijacked' })
          .where(eq(skills.id, fixture.builtinSkillId))
          .returning({ id: skills.id }),
    );
    const deleted = await withTenantContext(
      context.db,
      fixture.tenantOneId,
      (tx) =>
        tx
          .delete(skills)
          .where(eq(skills.id, fixture.builtinSkillId))
          .returning({ id: skills.id }),
    );

    expect(updated).toHaveLength(0);
    expect(deleted).toHaveLength(0);

    const [row] = await context.adminSql`
      SELECT description FROM skills WHERE id = ${fixture.builtinSkillId}
    `;
    expect(row?.description).toBe('desc');
  });

  it('租户不能把自己的 Skill 写成内置行来跨租户暴露', async () => {
    let insertError: unknown;
    try {
      await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
        tx.insert(skills).values({
          tenantId: fixture.tenantOneId,
          name: 'fake-builtin',
          slug: 'fake-builtin',
          description: 'x',
          isBuiltin: true,
          createdBy: fixture.userOneId,
          updatedBy: fixture.userOneId,
        }),
      );
    } catch (error) {
      insertError = error;
    }

    let updateError: unknown;
    try {
      await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
        tx
          .update(skills)
          .set({ isBuiltin: true })
          .where(eq(skills.id, fixture.skillOneId)),
      );
    } catch (error) {
      updateError = error;
    }

    expect(getErrorText(insertError)).toMatch(/row-level security/i);
    expect(getErrorText(updateError)).toMatch(/row-level security/i);
  });

  it('没有 tenant context 时内置 Skill 仍可读，租户 Skill 不可读', async () => {
    const rows = await withoutTenantContext(context.db, (tx) =>
      tx.select({ id: skills.id }).from(skills),
    );

    expect(rows.map((row) => row.id)).toEqual([fixture.builtinSkillId]);
  });
});

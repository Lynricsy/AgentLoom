import * as crypto from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { workflowDefinitions } from '../../src/database/schema';
import {
  createRlsTestContext,
  getErrorText,
  seedAppUser,
  seedWorkflowDefinition,
  withTenantContext,
  withoutTenantContext,
  type RlsTestContext,
} from './rls-test-utils';

type WorkflowDefinitionFixture = {
  tenantOneId: string;
  tenantTwoId: string;
  userOneId: string;
  userTwoId: string;
  workflowOneId: string;
  workflowTwoId: string;
};

function createFixture(): WorkflowDefinitionFixture {
  return {
    tenantOneId: crypto.randomUUID(),
    tenantTwoId: crypto.randomUUID(),
    userOneId: crypto.randomUUID(),
    userTwoId: crypto.randomUUID(),
    workflowOneId: crypto.randomUUID(),
    workflowTwoId: crypto.randomUUID(),
  };
}

function createEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

describe('WorkflowDefinitions RLS isolation (testcontainers)', () => {
  let context: RlsTestContext;
  let fixture: WorkflowDefinitionFixture;

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
      fixture.userOneId,
      createEmail('user-one'),
    );
    await seedAppUser(
      context.adminSql,
      fixture.userTwoId,
      createEmail('user-two'),
    );

    await seedWorkflowDefinition(context.adminSql, {
      id: fixture.workflowOneId,
      tenantId: fixture.tenantOneId,
      name: 'Workflow One',
      slug: 'workflow-one',
      createdBy: fixture.userOneId,
      updatedBy: fixture.userOneId,
    });

    await seedWorkflowDefinition(context.adminSql, {
      id: fixture.workflowTwoId,
      tenantId: fixture.tenantTwoId,
      name: 'Workflow Two',
      slug: 'workflow-two',
      createdBy: fixture.userTwoId,
      updatedBy: fixture.userTwoId,
    });
  });

  // ── AC1-AC3: RLS テナント分離 ──────────────────────────────

  it('T1 SELECT 只返回 T1 workflow_definitions', async () => {
    const rows = await withTenantContext(
      context.db,
      fixture.tenantOneId,
      (tx) => tx.query.workflowDefinitions.findMany(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fixture.workflowOneId);
    expect(rows[0]?.tenantId).toBe(fixture.tenantOneId);
  });

  it('T2 SELECT 只返回 T2 workflow_definitions', async () => {
    const rows = await withTenantContext(
      context.db,
      fixture.tenantTwoId,
      (tx) => tx.query.workflowDefinitions.findMany(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fixture.workflowTwoId);
    expect(rows[0]?.tenantId).toBe(fixture.tenantTwoId);
  });

  it('T1 INSERT 带入 T2 tenant_id 会被拒绝', async () => {
    let thrown: unknown;

    try {
      await withTenantContext(context.db, fixture.tenantOneId, (tx) =>
        tx
          .insert(workflowDefinitions)
          .values({
            name: 'Cross Tenant Workflow',
            slug: `cross-${crypto.randomUUID().slice(0, 8)}`,
            tenantId: fixture.tenantTwoId,
            createdBy: fixture.userOneId,
            updatedBy: fixture.userOneId,
          })
          .returning(),
      );
    } catch (error) {
      thrown = error;
    }

    expect(getErrorText(thrown)).toMatch(/row-level security/i);
  });

  it('T1 无法 UPDATE T2 workflow_definitions', async () => {
    const updatedRows = await withTenantContext(
      context.db,
      fixture.tenantOneId,
      (tx) =>
        tx
          .update(workflowDefinitions)
          .set({ name: 'hacked' })
          .where(eq(workflowDefinitions.id, fixture.workflowTwoId))
          .returning({ id: workflowDefinitions.id }),
    );

    expect(updatedRows).toHaveLength(0);

    const [row] = await context.adminSql`
      SELECT name FROM workflow_definitions WHERE id = ${fixture.workflowTwoId}::uuid
    `;
    expect(row?.name).toBe('Workflow Two');
  });

  it('T1 无法 DELETE T2 workflow_definitions', async () => {
    const deletedRows = await withTenantContext(
      context.db,
      fixture.tenantOneId,
      (tx) =>
        tx
          .delete(workflowDefinitions)
          .where(eq(workflowDefinitions.id, fixture.workflowTwoId))
          .returning({ id: workflowDefinitions.id }),
    );

    expect(deletedRows).toHaveLength(0);

    const [row] = await context.adminSql`
      SELECT id FROM workflow_definitions WHERE id = ${fixture.workflowTwoId}::uuid
    `;
    expect(row?.id).toBe(fixture.workflowTwoId);
  });

  it('没有 tenant context 时 SELECT 返回空数组', async () => {
    const rows = await withoutTenantContext(context.db, (tx) =>
      tx.query.workflowDefinitions.findMany(),
    );

    expect(rows).toEqual([]);
  });

  // ── AC2-AC3: Slug 唯一约束 ────────────────────────────────

  it('同一 tenant 内 slug 唯一约束生效', async () => {
    let thrown: unknown;

    try {
      await seedWorkflowDefinition(context.adminSql, {
        id: crypto.randomUUID(),
        tenantId: fixture.tenantOneId,
        name: 'Duplicate Slug',
        slug: 'workflow-one',
        createdBy: fixture.userOneId,
        updatedBy: fixture.userOneId,
      });
    } catch (error) {
      thrown = error;
    }

    expect(getErrorText(thrown)).toMatch(/unique|duplicate/i);
  });

  it('不同 tenant 可以复用相同 slug', async () => {
    const row = await seedWorkflowDefinition(context.adminSql, {
      id: crypto.randomUUID(),
      tenantId: fixture.tenantTwoId,
      name: 'Same Slug Different Tenant',
      slug: 'workflow-one',
      createdBy: fixture.userTwoId,
      updatedBy: fixture.userTwoId,
    });

    expect(row?.slug).toBe('workflow-one');
    expect(row?.tenant_id).toBe(fixture.tenantTwoId);
  });

  // ── AC4-AC5: 数据模型验证 ─────────────────────────────────

  it('JSONB nodes/edges/viewport 可以完整存取 (round-trip)', async () => {
    const testNodes = [
      {
        id: 'node-1',
        type: 'custom',
        position: { x: 100, y: 200 },
        data: { label: 'Start Node', config: { timeout: 30 } },
        width: 150,
        height: 40,
      },
      {
        id: 'node-2',
        position: { x: 300, y: 400 },
        data: { label: 'End Node' },
      },
    ];
    const testEdges = [
      {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        type: 'smoothstep',
        animated: true,
        data: { condition: 'success' },
      },
    ];
    const testViewport = { x: 50, y: 75, zoom: 1.5 };

    const wfId = crypto.randomUUID();
    await seedWorkflowDefinition(context.adminSql, {
      id: wfId,
      tenantId: fixture.tenantOneId,
      name: 'JSONB Test Workflow',
      slug: 'jsonb-test',
      createdBy: fixture.userOneId,
      updatedBy: fixture.userOneId,
      nodes: testNodes,
      edges: testEdges,
      viewport: testViewport,
    });

    const [row] = await context.adminSql`
      SELECT nodes, edges, viewport
      FROM workflow_definitions
      WHERE id = ${wfId}::uuid
    `;

    expect(row?.nodes).toEqual(testNodes);
    expect(row?.edges).toEqual(testEdges);
    expect(row?.viewport).toEqual(testViewport);
  });

  it('默认值: status=draft, version=1', async () => {
    const [row] = await context.adminSql`
      SELECT status, version
      FROM workflow_definitions
      WHERE id = ${fixture.workflowOneId}::uuid
    `;

    expect(row?.status).toBe('draft');
    expect(row?.version).toBe(1);
  });

  it('updated_at 触发器在 UPDATE 时自动更新', async () => {
    const [before] = await context.adminSql`
      SELECT updated_at
      FROM workflow_definitions
      WHERE id = ${fixture.workflowOneId}::uuid
    `;

    // 小延迟确保时间戳差异
    await new Promise((resolve) => setTimeout(resolve, 50));

    await context.adminSql`
      UPDATE workflow_definitions
      SET name = 'Updated Name'
      WHERE id = ${fixture.workflowOneId}::uuid
    `;

    const [after] = await context.adminSql`
      SELECT updated_at
      FROM workflow_definitions
      WHERE id = ${fixture.workflowOneId}::uuid
    `;

    expect(new Date(after?.updated_at).getTime()).toBeGreaterThan(
      new Date(before?.updated_at).getTime(),
    );
  });

  it('workflow_status_enum 拒绝无效状态值', async () => {
    let thrown: unknown;

    try {
      await context.adminSql`
        INSERT INTO workflow_definitions (
          id, tenant_id, name, slug, created_by, updated_by, status
        ) VALUES (
          ${crypto.randomUUID()}::uuid,
          ${fixture.tenantOneId}::uuid,
          'Invalid Status',
          'invalid-status',
          ${fixture.userOneId}::uuid,
          ${fixture.userOneId}::uuid,
          'invalid_status'::workflow_status_enum
        )
      `;
    } catch (error) {
      thrown = error;
    }

    expect(getErrorText(thrown)).toMatch(/invalid input value|invalid_status/i);
  });
});

import * as crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  optimizationEvaluationRuns,
  optimizationEvaluations,
  optimizationProposals,
} from '../../src/database/schema';
import {
  createRlsTestContext,
  getErrorText,
  seedAppUser,
  seedWorkflowDefinition,
  withTenantContext,
  type RlsTestContext,
} from './rls-test-utils';

interface TenantFixture {
  tenantId: string;
  userId: string;
  workflowId: string;
  versionId: string;
  proposalId: string;
  evaluationId: string;
  runId: string;
}

const EVIDENCE = {
  analyzerVersion: 1,
  windowDays: 28,
  windowStart: '2026-01-01T00:00:00.000Z',
  windowEnd: '2026-01-29T00:00:00.000Z',
  sampleCount: 3,
  matchedCount: 3,
  matchedRate: 1,
  sampleIds: [],
};

/** 以超级用户身份为一个租户种下 工作流 → 版本 → 执行 → 提案 → 评测 → 评测 run */
async function seedTenant(
  context: RlsTestContext,
  label: string,
): Promise<TenantFixture> {
  const sql = context.adminSql;
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const workflowId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const executionId = crypto.randomUUID();

  await seedAppUser(sql, userId, `${label}-${userId}@ex.com`);
  await seedWorkflowDefinition(sql, {
    id: workflowId,
    tenantId,
    name: `Workflow ${label}`,
    slug: `workflow-${workflowId}`,
    createdBy: userId,
    updatedBy: userId,
  });
  await sql`
    INSERT INTO workflow_versions (
      id, workflow_definition_id, tenant_id, version_number, snapshot, created_by
    ) VALUES (
      ${versionId}::uuid, ${workflowId}::uuid, ${tenantId}::uuid, 1,
      ${sql.json({ nodes: [], edges: [] })}, ${userId}::uuid
    )
  `;
  await sql`
    INSERT INTO workflow_executions (
      id, workflow_definition_id, workflow_version_id, tenant_id,
      definition_snapshot, created_by
    ) VALUES (
      ${executionId}::uuid, ${workflowId}::uuid, ${versionId}::uuid,
      ${tenantId}::uuid, ${sql.json({ nodes: [], edges: [] })}, ${userId}::uuid
    )
  `;
  const [proposal] = await sql<{ id: string }[]>`
    INSERT INTO optimization_proposals (
      tenant_id, workflow_definition_id, node_id, node_type, proposal_type,
      config_path, current_value, proposed_value, rationale, evidence, base_version_id
    ) VALUES (
      ${tenantId}::uuid, ${workflowId}::uuid, 'team-1', 'team', 'team_budget_messages',
      'config.budget.maxMessages', ${sql.json(1)}, ${sql.json(2)}, ${`理由 ${label}`},
      ${sql.json(EVIDENCE)}, ${versionId}::uuid
    )
    RETURNING id
  `;
  const [evaluation] = await sql<{ id: string }[]>`
    INSERT INTO optimization_evaluations (
      tenant_id, proposal_id, base_version_id, candidate_version_id, cases,
      deadline_at, started_by_user_id
    ) VALUES (
      ${tenantId}::uuid, ${proposal.id}::uuid, ${versionId}::uuid, ${versionId}::uuid,
      ${sql.json([])}, now() + interval '30 minutes', ${userId}::uuid
    )
    RETURNING id
  `;
  const [run] = await sql<{ id: string }[]>`
    INSERT INTO optimization_evaluation_runs (
      tenant_id, evaluation_id, arm, case_index, execution_id
    ) VALUES (
      ${tenantId}::uuid, ${evaluation.id}::uuid, 'baseline', 0, ${executionId}::uuid
    )
    RETURNING id
  `;

  return {
    tenantId,
    userId,
    workflowId,
    versionId,
    proposalId: proposal.id,
    evaluationId: evaluation.id,
    runId: run.id,
  };
}

describe('Optimization proposal RLS isolation (testcontainers)', () => {
  let context: RlsTestContext;
  let tenantOne: TenantFixture;
  let tenantTwo: TenantFixture;

  beforeAll(async () => {
    // 不额外 GRANT：权限完全来自迁移 0086 末尾的 GRANT 语句
    context = await createRlsTestContext();
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.adminSql`DELETE FROM optimization_evaluation_runs`;
    await context.adminSql`DELETE FROM workflow_executions`;
    await context.reset();
    tenantOne = await seedTenant(context, 't1');
    tenantTwo = await seedTenant(context, 't2');
  });

  it.each([
    'optimization_proposals',
    'optimization_evaluations',
    'optimization_evaluation_runs',
  ])('%s 启用 RLS 并带四条租户策略', async (tableName) => {
    const [table] = await context.adminSql<{ relrowsecurity: boolean }[]>`
      SELECT relrowsecurity FROM pg_class WHERE relname = ${tableName}
    `;
    const policies = await context.adminSql<{ policyname: string }[]>`
      SELECT policyname FROM pg_policies WHERE tablename = ${tableName}
      ORDER BY policyname
    `;
    expect(table?.relrowsecurity).toBe(true);
    expect(policies.map((row) => row.policyname)).toEqual(
      ['delete', 'insert', 'select', 'update'].map(
        (op) => `${tableName}_${op}_policy`,
      ),
    );
  });

  it('租户只看到自己的提案、评测与评测 run', async () => {
    const visible = await withTenantContext(
      context.db,
      tenantOne.tenantId,
      async (db) => ({
        proposals: await db
          .select({ id: optimizationProposals.id })
          .from(optimizationProposals),
        evaluations: await db
          .select({ id: optimizationEvaluations.id })
          .from(optimizationEvaluations),
        runs: await db
          .select({ id: optimizationEvaluationRuns.id })
          .from(optimizationEvaluationRuns),
      }),
    );
    expect(visible).toEqual({
      proposals: [{ id: tenantOne.proposalId }],
      evaluations: [{ id: tenantOne.evaluationId }],
      runs: [{ id: tenantOne.runId }],
    });
  });

  it('跨租户无法更新对方的提案状态', async () => {
    const updated = await withTenantContext(
      context.db,
      tenantTwo.tenantId,
      (db) =>
        db
          .update(optimizationProposals)
          .set({ status: 'dismissed' })
          .where(eq(optimizationProposals.id, tenantOne.proposalId))
          .returning({ id: optimizationProposals.id }),
    );
    expect(updated).toEqual([]);
    const [row] = await context.adminSql<{ status: string }[]>`
      SELECT status FROM optimization_proposals WHERE id = ${tenantOne.proposalId}::uuid
    `;
    expect(row?.status).toBe('proposed');
  });

  it.each([
    [
      'optimization_proposals',
      (fixture: TenantFixture) => ({
        table: optimizationProposals,
        values: {
          tenantId: fixture.tenantId,
          workflowDefinitionId: fixture.workflowId,
          nodeId: 'team-x',
          nodeType: 'team' as const,
          proposalType: 'team_deadline' as const,
          configPath: 'config.budget.deadlineMinutes',
          currentValue: 60,
          proposedValue: 90,
          rationale: '越权',
          evidence: EVIDENCE as never,
          baseVersionId: fixture.versionId,
        },
      }),
    ],
    [
      'optimization_evaluations',
      (fixture: TenantFixture) => ({
        table: optimizationEvaluations,
        values: {
          tenantId: fixture.tenantId,
          proposalId: fixture.proposalId,
          baseVersionId: fixture.versionId,
          candidateVersionId: fixture.versionId,
          cases: [],
          deadlineAt: new Date(),
          startedByUserId: fixture.userId,
        },
      }),
    ],
    [
      'optimization_evaluation_runs',
      (fixture: TenantFixture) => ({
        table: optimizationEvaluationRuns,
        values: {
          tenantId: fixture.tenantId,
          evaluationId: fixture.evaluationId,
          arm: 'candidate' as const,
          caseIndex: 0,
        },
      }),
    ],
  ])('跨租户不能以对方 tenant_id 写入 %s', async (_name, build) => {
    const { table, values } = build(tenantOne);
    let thrown: unknown;
    try {
      await withTenantContext(context.db, tenantTwo.tenantId, (db) =>
        db
          .insert(table as typeof optimizationProposals)
          .values(values as never),
      );
    } catch (error) {
      thrown = error;
    }
    expect(getErrorText(thrown)).toMatch(/row-level security/i);
  });
});

import * as crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  decisionRecords,
  teamMembers,
  teamMessages,
  teamRuns,
} from '../../src/database/schema';
import {
  createRlsTestContext,
  getErrorText,
  seedAppUser,
  seedWorkflowDefinition,
  withTenantContext,
  withoutTenantContext,
  type RlsTestContext,
} from './rls-test-utils';

const TEAM_CONFIG = {
  objective: '',
  members: [],
  budget: { maxTotalTokens: 1000, maxMessages: 10, deadlineMinutes: 10 },
  outputSchema: null,
};

interface TenantFixture {
  tenantId: string;
  userId: string;
  executionId: string;
  stepId: string;
  teamRunId: string;
  leadMemberId: string;
  workerMemberId: string;
  messageId: string;
  decisionRecordId: string;
}

/** 以超级用户身份为一个租户种下完整的团队运行链路（执行 → 步骤 → 团队 → 成员对话 → 消息 → 决策记录） */
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
  const stepId = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  const teamRunId = crypto.randomUUID();
  const decisionRecordId = crypto.randomUUID();

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
  await sql`
    INSERT INTO execution_steps (id, execution_id, node_id, step_order)
    VALUES (${stepId}::uuid, ${executionId}::uuid, 'team-1', 1)
  `;
  await sql`
    INSERT INTO agent_definitions (
      id, tenant_id, name, slug, runtime_mode, status, created_by, updated_by
    ) VALUES (
      ${agentId}::uuid, ${tenantId}::uuid, 'Agent', ${`agent-${agentId}`},
      'no_sandbox', 'published', ${userId}::uuid, ${userId}::uuid
    )
  `;
  await sql`
    INSERT INTO team_runs (
      id, tenant_id, execution_id, step_id, node_id, config, task_text,
      budget_max_total_tokens, budget_max_messages, deadline_at
    ) VALUES (
      ${teamRunId}::uuid, ${tenantId}::uuid, ${executionId}::uuid,
      ${stepId}::uuid, 'team-1', ${sql.json(TEAM_CONFIG)}, ${`任务 ${label}`},
      1000, 10, now() + interval '10 minutes'
    )
  `;

  const memberIds: Record<'lead' | 'worker', string> = {
    lead: crypto.randomUUID(),
    worker: crypto.randomUUID(),
  };
  for (const role of ['lead', 'worker'] as const) {
    const conversationId = crypto.randomUUID();
    // 团队成员对话：source='team'，没有 created_by / api_key_id
    await sql`
      INSERT INTO agent_conversations (id, agent_definition_id, tenant_id, source)
      VALUES (${conversationId}::uuid, ${agentId}::uuid, ${tenantId}::uuid, 'team')
    `;
    await sql`
      INSERT INTO team_members (
        id, tenant_id, team_run_id, role, agent_definition_id, conversation_id,
        is_lead, can_message
      ) VALUES (
        ${memberIds[role]}::uuid, ${tenantId}::uuid, ${teamRunId}::uuid, ${role},
        ${agentId}::uuid, ${conversationId}::uuid, ${role === 'lead'},
        ${sql.json(['*'])}
      )
    `;
  }

  const [message] = await sql<{ id: string }[]>`
    INSERT INTO team_messages (
      tenant_id, team_run_id, sender_member_id, recipient_member_id, kind, content
    ) VALUES (
      ${tenantId}::uuid, ${teamRunId}::uuid, ${memberIds.worker}::uuid,
      ${memberIds.lead}::uuid, 'observation', ${`发现 ${label}`}
    )
    RETURNING id
  `;
  await sql`
    INSERT INTO decision_records (
      id, tenant_id, kind, subject_type, subject_id, provider, mode,
      definition_version, input_digest, outcome, latency_ms
    ) VALUES (
      ${decisionRecordId}::uuid, ${tenantId}::uuid, 'team.message_relevance',
      'team_message', ${message.id}::uuid, 'rule', 'primary', 1,
      ${'0'.repeat(64)}, ${sql.json({ type: 'noul', value: 1 })}, 0
    )
  `;

  return {
    tenantId,
    userId,
    executionId,
    stepId,
    teamRunId,
    leadMemberId: memberIds.lead,
    workerMemberId: memberIds.worker,
    messageId: message.id,
    decisionRecordId,
  };
}

describe('Team runtime RLS isolation (testcontainers)', () => {
  let context: RlsTestContext;
  let tenantOne: TenantFixture;
  let tenantTwo: TenantFixture;

  beforeAll(async () => {
    // 不额外 GRANT：权限完全来自迁移 0084 末尾的 GRANT 语句
    context = await createRlsTestContext();
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.adminSql`DELETE FROM decision_records`;
    await context.adminSql`DELETE FROM team_runs`;
    await context.adminSql`DELETE FROM workflow_executions`;
    await context.adminSql`DELETE FROM agent_definitions`;
    await context.reset();

    tenantOne = await seedTenant(context, 't1');
    tenantTwo = await seedTenant(context, 't2');
  });

  it.each(['team_runs', 'team_members', 'team_messages'])(
    '%s 启用 RLS 并带四条租户策略',
    async (tableName) => {
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
    },
  );

  it('decision_records 只有 SELECT / INSERT 策略', async () => {
    const policies = await context.adminSql<{ policyname: string }[]>`
      SELECT policyname FROM pg_policies WHERE tablename = 'decision_records'
      ORDER BY policyname
    `;

    expect(policies.map((row) => row.policyname)).toEqual([
      'decision_records_insert_policy',
      'decision_records_select_policy',
    ]);
  });

  it('同租户只看到自己的 team_runs / team_members / team_messages / decision_records', async () => {
    const visible = await withTenantContext(
      context.db,
      tenantOne.tenantId,
      async (db) => ({
        runs: await db.select({ id: teamRuns.id }).from(teamRuns),
        members: await db.select({ id: teamMembers.id }).from(teamMembers),
        messages: await db.select({ id: teamMessages.id }).from(teamMessages),
        decisions: await db
          .select({ id: decisionRecords.id })
          .from(decisionRecords),
      }),
    );

    expect(visible.runs.map((row) => row.id)).toEqual([tenantOne.teamRunId]);
    expect(visible.members.map((row) => row.id).sort()).toEqual(
      [tenantOne.leadMemberId, tenantOne.workerMemberId].sort(),
    );
    expect(visible.messages.map((row) => row.id)).toEqual([
      tenantOne.messageId,
    ]);
    expect(visible.decisions.map((row) => row.id)).toEqual([
      tenantOne.decisionRecordId,
    ]);
  });

  it('跨租户读不到对方的 team_runs 与 team_messages', async () => {
    const visible = await withTenantContext(
      context.db,
      tenantTwo.tenantId,
      async (db) => ({
        runs: await db
          .select({ id: teamRuns.id })
          .from(teamRuns)
          .where(eq(teamRuns.id, tenantOne.teamRunId)),
        messages: await db
          .select({ id: teamMessages.id })
          .from(teamMessages)
          .where(eq(teamMessages.teamRunId, tenantOne.teamRunId)),
      }),
    );

    expect(visible).toEqual({ runs: [], messages: [] });
  });

  it('跨租户无法更新对方的 team_messages 投递状态', async () => {
    const updated = await withTenantContext(
      context.db,
      tenantTwo.tenantId,
      (db) =>
        db
          .update(teamMessages)
          .set({ deliveryStatus: 'delivered' })
          .where(eq(teamMessages.id, tenantOne.messageId))
          .returning({ id: teamMessages.id }),
    );

    expect(updated).toEqual([]);
    const [row] = await context.adminSql<{ delivery_status: string }[]>`
      SELECT delivery_status FROM team_messages WHERE id = ${tenantOne.messageId}::uuid
    `;
    expect(row?.delivery_status).toBe('pending');
  });

  it('跨租户不能以对方 tenant_id 写入 team_messages', async () => {
    let thrown: unknown;
    try {
      await withTenantContext(context.db, tenantTwo.tenantId, (db) =>
        db.insert(teamMessages).values({
          tenantId: tenantOne.tenantId,
          teamRunId: tenantOne.teamRunId,
          recipientMemberId: tenantOne.leadMemberId,
          kind: 'system',
          content: '越权消息',
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(getErrorText(thrown)).toMatch(/row-level security/i);
  });

  it('缺少租户上下文时 fail-closed：读不到任何团队行', async () => {
    const visible = await withoutTenantContext(context.db, async (db) => ({
      runs: await db.select({ id: teamRuns.id }).from(teamRuns),
      members: await db.select({ id: teamMembers.id }).from(teamMembers),
      messages: await db.select({ id: teamMessages.id }).from(teamMessages),
      decisions: await db
        .select({ id: decisionRecords.id })
        .from(decisionRecords),
    }));

    expect(visible).toEqual({
      runs: [],
      members: [],
      messages: [],
      decisions: [],
    });
  });

  it('同租户可以 INSERT decision_records，但不能 UPDATE / DELETE（append-only）', async () => {
    const inserted = await withTenantContext(
      context.db,
      tenantOne.tenantId,
      (db) =>
        db
          .insert(decisionRecords)
          .values({
            tenantId: tenantOne.tenantId,
            kind: 'team.message_relevance',
            subjectType: 'team_message',
            subjectId: tenantOne.messageId,
            provider: 'jev',
            mode: 'shadow',
            definitionVersion: 1,
            inputDigest: 'f'.repeat(64),
            latencyMs: 12,
            error: 'timeout',
          })
          .returning({ id: decisionRecords.id }),
    );
    expect(inserted).toHaveLength(1);

    for (const operation of ['update', 'delete'] as const) {
      let thrown: unknown;
      try {
        await withTenantContext(context.db, tenantOne.tenantId, (db) =>
          operation === 'update'
            ? db
                .update(decisionRecords)
                .set({ error: null })
                .where(eq(decisionRecords.id, tenantOne.decisionRecordId))
            : db
                .delete(decisionRecords)
                .where(eq(decisionRecords.id, tenantOne.decisionRecordId)),
        );
      } catch (error) {
        thrown = error;
      }

      expect(getErrorText(thrown)).toMatch(
        /permission denied|row-level security/i,
      );
    }

    const [row] = await context.adminSql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM decision_records
      WHERE id = ${tenantOne.decisionRecordId}::uuid
    `;
    expect(row?.count).toBe(1);
  });

  it('同一步骤只能有一个 running 的 team_run，终态后可重跑', async () => {
    let thrown: unknown;
    try {
      await context.adminSql`
        INSERT INTO team_runs (
          tenant_id, execution_id, step_id, node_id, config, task_text,
          budget_max_total_tokens, budget_max_messages, deadline_at
        ) VALUES (
          ${tenantOne.tenantId}::uuid, ${tenantOne.executionId}::uuid,
          ${tenantOne.stepId}::uuid, 'team-1', ${context.adminSql.json(TEAM_CONFIG)},
          '重跑', 1000, 10, now()
        )
      `;
    } catch (error) {
      thrown = error;
    }
    expect(getErrorText(thrown)).toMatch(/uq_team_runs_running_step/);

    await context.adminSql`
      UPDATE team_runs SET status = 'failed' WHERE id = ${tenantOne.teamRunId}::uuid
    `;
    await expect(
      context.adminSql`
        INSERT INTO team_runs (
          tenant_id, execution_id, step_id, node_id, config, task_text,
          budget_max_total_tokens, budget_max_messages, deadline_at
        ) VALUES (
          ${tenantOne.tenantId}::uuid, ${tenantOne.executionId}::uuid,
          ${tenantOne.stepId}::uuid, 'team-1', ${context.adminSql.json(TEAM_CONFIG)},
          '重跑', 1000, 10, now()
        )
      `,
    ).resolves.toBeDefined();
  });

  it('source=studio 的对话仍要求 created_by', async () => {
    const [agent] = await context.adminSql<{ id: string }[]>`
      SELECT id FROM agent_definitions WHERE tenant_id = ${tenantOne.tenantId}::uuid
    `;
    let thrown: unknown;
    try {
      await context.adminSql`
        INSERT INTO agent_conversations (agent_definition_id, tenant_id, source)
        VALUES (${agent.id}::uuid, ${tenantOne.tenantId}::uuid, 'studio')
      `;
    } catch (error) {
      thrown = error;
    }

    expect(getErrorText(thrown)).toMatch(
      /chk_agent_conversations_source_actor/,
    );
  });
});

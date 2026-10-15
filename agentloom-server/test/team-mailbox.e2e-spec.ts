/**
 * 团队邮箱可靠性（真实 PostgreSQL，testcontainers）：
 * - 同一 pending 行并发投递只写入一条 agent_messages；
 * - 持久化后投递丢失（未触发提交后投递）的 pending 行由清扫重投；
 * - 接收者对话已结束时清扫把消息置 expired，不写 agent_messages。
 */
import * as crypto from 'node:crypto';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { agentMessages, teamMessages } from '../src/database/schema';
import { AgentConversationService } from '../src/modules/agent-conversation/agent-conversation.service';
import { TeamMailboxService } from '../src/modules/team/team-mailbox.service';
import { TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT } from '../src/modules/team/team.events';
import {
  createRlsTestContext,
  seedAppUser,
  seedWorkflowDefinition,
  type RlsTestContext,
} from './rls/rls-test-utils';

const TEAM_CONFIG = {
  objective: '',
  members: [],
  budget: { maxTotalTokens: 1000, maxMessages: 10, deadlineMinutes: 10 },
  outputSchema: null,
};

interface TeamFixture {
  tenantId: string;
  teamRunId: string;
  senderMemberId: string;
  recipientMemberId: string;
  recipientConversationId: string;
}

async function seedTeam(context: RlsTestContext): Promise<TeamFixture> {
  const sql = context.adminSql;
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const workflowId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const executionId = crypto.randomUUID();
  const stepId = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  const teamRunId = crypto.randomUUID();

  await seedAppUser(sql, userId, `team-${userId}@ex.com`);
  await seedWorkflowDefinition(sql, {
    id: workflowId,
    tenantId,
    name: 'Team workflow',
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
      ${stepId}::uuid, 'team-1', ${sql.json(TEAM_CONFIG)}, '任务',
      1000, 10, now() + interval '10 minutes'
    )
  `;

  const members: Record<
    'locator' | 'implementer',
    { id: string; conversationId: string }
  > = {
    locator: { id: crypto.randomUUID(), conversationId: crypto.randomUUID() },
    implementer: {
      id: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
    },
  };
  for (const [role, member] of Object.entries(members)) {
    await sql`
      INSERT INTO agent_conversations (id, agent_definition_id, tenant_id, source)
      VALUES (${member.conversationId}::uuid, ${agentId}::uuid, ${tenantId}::uuid, 'team')
    `;
    await sql`
      INSERT INTO team_members (
        id, tenant_id, team_run_id, role, agent_definition_id, conversation_id,
        is_lead, can_message
      ) VALUES (
        ${member.id}::uuid, ${tenantId}::uuid, ${teamRunId}::uuid, ${role},
        ${agentId}::uuid, ${member.conversationId}::uuid, ${role === 'implementer'},
        ${sql.json(['*'])}
      )
    `;
  }

  return {
    tenantId,
    teamRunId,
    senderMemberId: members.locator.id,
    recipientMemberId: members.implementer.id,
    recipientConversationId: members.implementer.conversationId,
  };
}

/** 以超级用户直接写入一条 pending 消息，模拟「已持久化、提交后投递未执行」 */
async function insertPendingMessage(
  context: RlsTestContext,
  team: TeamFixture,
  createdAgo: string,
): Promise<string> {
  const [row] = await context.adminSql<{ id: string }[]>`
    INSERT INTO team_messages (
      tenant_id, team_run_id, sender_member_id, recipient_member_id, kind,
      content, refs, created_at
    ) VALUES (
      ${team.tenantId}::uuid, ${team.teamRunId}::uuid, ${team.senderMemberId}::uuid,
      ${team.recipientMemberId}::uuid, 'observation', '问题在 auth.ts',
      ${context.adminSql.json(['src/auth.ts'])}, now() - ${createdAgo}::interval
    )
    RETURNING id
  `;
  return row.id;
}

describe('Team mailbox reliability (testcontainers)', () => {
  let context: RlsTestContext;
  let mailbox: TeamMailboxService;
  let eventEmitter: EventEmitter2;
  let team: TeamFixture;

  beforeAll(async () => {
    context = await createRlsTestContext();
    eventEmitter = new EventEmitter2();
    const conversationService = new AgentConversationService(
      context.db,
      eventEmitter,
      {} as never,
      {} as never,
      {} as never,
    );
    mailbox = new TeamMailboxService(
      context.db,
      conversationService,
      { emitTeamMessage: vi.fn() } as never,
      eventEmitter,
    );
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.adminSql`DELETE FROM team_runs`;
    await context.adminSql`DELETE FROM workflow_executions`;
    await context.adminSql`DELETE FROM agent_definitions`;
    await context.reset();
    team = await seedTeam(context);
    vi.restoreAllMocks();
  });

  async function loadMessage(messageId: string) {
    const [row] = await context.db
      .select()
      .from(teamMessages)
      .where(eq(teamMessages.id, messageId));
    return row;
  }

  async function countRecipientMessages(): Promise<number> {
    const rows = await context.db
      .select({ id: agentMessages.id })
      .from(agentMessages)
      .where(eq(agentMessages.conversationId, team.recipientConversationId));
    return rows.length;
  }

  it('同一 pending 行并发投递两次只写入一条 agent_messages', async () => {
    const dispatch = vi.spyOn(eventEmitter, 'emitAsync');
    const messageId = await insertPendingMessage(context, team, '0 seconds');

    await Promise.all([
      mailbox.deliverPending(team.tenantId, [messageId]),
      mailbox.deliverPending(team.tenantId, [messageId]),
    ]);

    const message = await loadMessage(messageId);
    expect(message.deliveryStatus).toBe('delivered');
    expect(message.agentMessageId).not.toBeNull();
    expect(await countRecipientMessages()).toBe(1);
    expect(
      dispatch.mock.calls.filter(
        ([event]) => event === TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT,
      ),
    ).toHaveLength(1);

    const [agentMessage] = await context.db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.id, message.agentMessageId!));
    expect(agentMessage.role).toBe('user');
    expect(agentMessage.content).toBe(
      '[来自 locator｜observation]\n问题在 auth.ts\n引用：\n- src/auth.ts',
    );
    expect(agentMessage.metadata).toMatchObject({
      type: 'team_message',
      teamMessageId: messageId,
    });
  });

  it('提交后投递丢失的 pending 行由清扫重投', async () => {
    const messageId = await insertPendingMessage(context, team, '20 seconds');

    await mailbox.sweep();

    const message = await loadMessage(messageId);
    expect(message.deliveryStatus).toBe('delivered');
    expect(message.deliveredAt).not.toBeNull();
    expect(await countRecipientMessages()).toBe(1);
  });

  it('接收者对话已结束时清扫把消息置 expired，不写 agent_messages', async () => {
    await context.adminSql`
      UPDATE agent_conversations SET status = 'ended'
      WHERE id = ${team.recipientConversationId}::uuid
    `;
    const messageId = await insertPendingMessage(context, team, '20 seconds');

    await mailbox.sweep();

    const message = await loadMessage(messageId);
    expect(message.deliveryStatus).toBe('expired');
    expect(message.agentMessageId).toBeNull();
    expect(await countRecipientMessages()).toBe(0);
  });
});

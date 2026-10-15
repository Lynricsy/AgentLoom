/**
 * 团队运行时结算与恢复（真实 PostgreSQL，testcontainers）：
 * - 用量从成员对话已落库 assistant 消息重算（含缓存读写 token），重复结算幂等；
 * - 待定结果：lead 提交回合落库后才完成，步骤结果使用结算后的用量；
 * - 回合落库事件丢失：清扫按接收者对话持久游标把 delivered 消息置 consumed；
 * - 截止延迟任务丢失：清扫按 deadline_at 直接以 deadline_exceeded 失败并推进步骤；
 * - 结束后推进步骤失败：清扫幂等重做步骤终态与调度，被新运行取代的旧运行不推进。
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

import { transactionStorage } from '../src/common/interceptors/tenant-transaction.context';
import {
  executionSteps,
  teamMembers,
  teamMessages,
  teamRuns,
} from '../src/database/schema';
import { AgentConversationService } from '../src/modules/agent-conversation/agent-conversation.service';
import { TeamMailboxService } from '../src/modules/team/team-mailbox.service';
import { TeamRunService } from '../src/modules/team/team-run.service';
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

interface MemberFixture {
  id: string;
  conversationId: string;
}

interface TeamFixture {
  tenantId: string;
  executionId: string;
  stepId: string;
  teamRunId: string;
  agentId: string;
  locator: MemberFixture;
  implementer: MemberFixture;
}

async function seedTeam(
  context: RlsTestContext,
  options: { maxTotalTokens?: number } = {},
): Promise<TeamFixture> {
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
      definition_snapshot, created_by, status
    ) VALUES (
      ${executionId}::uuid, ${workflowId}::uuid, ${versionId}::uuid,
      ${tenantId}::uuid, ${sql.json({ nodes: [], edges: [] })}, ${userId}::uuid,
      'running'
    )
  `;
  await sql`
    INSERT INTO execution_steps (id, execution_id, node_id, step_order, status)
    VALUES (${stepId}::uuid, ${executionId}::uuid, 'team-1', 1, 'running')
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
      budget_max_total_tokens, budget_max_messages, deadline_at,
      created_at, started_at
    ) VALUES (
      ${teamRunId}::uuid, ${tenantId}::uuid, ${executionId}::uuid,
      ${stepId}::uuid, 'team-1', ${sql.json(TEAM_CONFIG)}, '任务',
      ${options.maxTotalTokens ?? 1000}, 10, now() + interval '10 minutes',
      now() - interval '5 minutes', now() - interval '5 minutes'
    )
  `;

  const members: Record<'locator' | 'implementer', MemberFixture> = {
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
    executionId,
    stepId,
    teamRunId,
    agentId,
    ...members,
  };
}

/** 以超级用户写入一条成员 assistant 消息（模拟回合已落库），返回 id */
async function insertAssistantTurn(
  context: RlsTestContext,
  team: TeamFixture,
  conversationId: string,
  metadata: Record<string, unknown>,
  createdOffset = '0 seconds',
): Promise<string> {
  const [row] = await context.adminSql<{ id: string }[]>`
    INSERT INTO agent_messages (
      conversation_id, tenant_id, role, content, metadata, created_at
    ) VALUES (
      ${conversationId}::uuid, ${team.tenantId}::uuid, 'assistant', '回合输出',
      ${context.adminSql.json(metadata as never)}, now() + ${createdOffset}::interval
    )
    RETURNING id
  `;
  return row.id;
}

describe('Team settlement and recovery (testcontainers)', () => {
  let context: RlsTestContext;
  let mailbox: TeamMailboxService;
  let service: TeamRunService;
  let team: TeamFixture;
  const stepStateMachine = { updateStepStatus: vi.fn() };
  const nodeScheduler = {
    onNodeCompleted: vi.fn(),
    onNodeFailed: vi.fn(),
  };
  const eventBridge = { emitTeamStatus: vi.fn(), emitTeamMessage: vi.fn() };
  const queue = { add: vi.fn(), remove: vi.fn() };

  beforeAll(async () => {
    context = await createRlsTestContext();
    const eventEmitter = new EventEmitter2();
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
      eventBridge as never,
      eventEmitter,
    );
    service = new TeamRunService(
      context.db,
      conversationService,
      mailbox,
      stepStateMachine as never,
      nodeScheduler as never,
      eventBridge as never,
      queue as never,
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
    vi.clearAllMocks();
    // 步骤终态写入走调用方事务（与调度同事务提交）
    stepStateMachine.updateStepStatus.mockImplementation(
      async (
        _tenantId: string,
        stepId: string,
        status: 'completed' | 'failed',
      ) => {
        const store = transactionStorage.getStore();
        if (!store) {
          throw new Error('步骤终态必须在租户事务内写入');
        }
        await store.db
          .update(executionSteps)
          .set({ status })
          .where(eq(executionSteps.id, stepId));
      },
    );
    nodeScheduler.onNodeCompleted.mockResolvedValue(undefined);
    nodeScheduler.onNodeFailed.mockResolvedValue(undefined);
    queue.add.mockResolvedValue(undefined);
    queue.remove.mockResolvedValue(1);
  });

  async function loadRun() {
    const [row] = await context.db
      .select()
      .from(teamRuns)
      .where(eq(teamRuns.id, team.teamRunId));
    return row;
  }

  async function loadStepStatus() {
    const [row] = await context.adminSql<{ status: string }[]>`
      SELECT status FROM execution_steps WHERE id = ${team.stepId}::uuid
    `;
    return row.status;
  }

  it('用量按落库 assistant 消息重算：输入含缓存读写 token，重复结算幂等', async () => {
    await insertAssistantTurn(context, team, team.locator.conversationId, {
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 100,
        cacheWriteTokens: 20,
        totalTokens: 135,
      },
      costUsd: 0.25,
    });
    await insertAssistantTurn(context, team, team.locator.conversationId, {
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      costUsd: null,
    });
    await insertAssistantTurn(context, team, team.implementer.conversationId, {
      stopReason: 'end_turn',
    });

    await service.settle(team.tenantId, team.teamRunId);
    await service.settle(team.tenantId, team.teamRunId);

    const run = await loadRun();
    expect(run.status).toBe('running');
    expect(run.usedInputTokens).toBe(131);
    expect(run.usedOutputTokens).toBe(7);
    expect(run.usedCostUsd).toBeCloseTo(0.25, 6);
    const members = await context.db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamRunId, team.teamRunId));
    const locator = members.find((member) => member.role === 'locator')!;
    const implementer = members.find(
      (member) => member.role === 'implementer',
    )!;
    expect(locator).toMatchObject({
      usedInputTokens: 131,
      usedOutputTokens: 7,
      turnCount: 2,
    });
    expect(locator.lastTurnAt).not.toBeNull();
    expect(implementer).toMatchObject({ usedInputTokens: 0, turnCount: 1 });
  });

  it('含缓存 token 的输入超过预算时以 budget_exhausted 失败', async () => {
    await insertAssistantTurn(context, team, team.locator.conversationId, {
      usage: {
        inputTokens: 10,
        outputTokens: 10,
        cacheReadTokens: 990,
        totalTokens: 1010,
      },
    });

    await service.settle(team.tenantId, team.teamRunId);

    const run = await loadRun();
    expect(run.status).toBe('failed');
    expect(run.failureReason).toBe('budget_exhausted');
    expect(await loadStepStatus()).toBe('failed');
  });

  it('待定结果在 lead 提交回合落库后结算完成，步骤结果使用结算后的用量', async () => {
    // 提交前的 lead 回合
    await insertAssistantTurn(
      context,
      team,
      team.implementer.conversationId,
      { usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 } },
      '-1 minute',
    );
    await expect(
      service.submitResult(team.tenantId, team.teamRunId, { summary: '完成' }),
    ).resolves.toBe('submitted');
    await expect(
      service.submitResult(team.tenantId, team.teamRunId, { summary: '再次' }),
    ).resolves.toBe('already_submitted');

    // 其他成员回合落库：lead 提交回合尚未落库，继续运行
    await service.settle(team.tenantId, team.teamRunId);
    expect((await loadRun()).status).toBe('running');

    // lead 提交回合落库（时间晚于提交）
    await insertAssistantTurn(
      context,
      team,
      team.implementer.conversationId,
      { usage: { inputTokens: 40, outputTokens: 10, totalTokens: 50 } },
      '1 second',
    );
    await service.settle(team.tenantId, team.teamRunId);

    const run = await loadRun();
    expect(run.status).toBe('completed');
    expect(run.result).toEqual({ summary: '完成' });
    expect(await loadStepStatus()).toBe('completed');
    expect(stepStateMachine.updateStepStatus).toHaveBeenCalledWith(
      team.tenantId,
      team.stepId,
      'completed',
      {
        result: expect.objectContaining({
          'summary-out': '完成',
          promptTokens: 45,
          completionTokens: 15,
        }),
      },
    );
    expect(nodeScheduler.onNodeCompleted).toHaveBeenCalledTimes(1);
  });

  it('回合落库事件丢失：清扫按接收者持久游标把 delivered 消息置 consumed', async () => {
    const deliveredIds: string[] = [];
    for (const content of ['第一条', '第二条']) {
      const [agentMessage] = await context.adminSql<{ id: string }[]>`
        INSERT INTO agent_messages (conversation_id, tenant_id, role, content, created_at)
        VALUES (
          ${team.implementer.conversationId}::uuid, ${team.tenantId}::uuid, 'user',
          ${content}, now() - interval '30 seconds' + ${`${deliveredIds.length} seconds`}::interval
        )
        RETURNING id
      `;
      const [row] = await context.adminSql<{ id: string }[]>`
        INSERT INTO team_messages (
          tenant_id, team_run_id, sender_member_id, recipient_member_id, kind,
          content, delivery_status, agent_message_id, delivered_at
        ) VALUES (
          ${team.tenantId}::uuid, ${team.teamRunId}::uuid, ${team.locator.id}::uuid,
          ${team.implementer.id}::uuid, 'observation', ${content}, 'delivered',
          ${agentMessage.id}::uuid, now() - interval '30 seconds'
        )
        RETURNING id
      `;
      deliveredIds.push(row.id);
      if (deliveredIds.length === 1) {
        // 接收者只处理到第一条
        await context.adminSql`
          UPDATE agent_conversations
          SET metadata = ${context.adminSql.json({
            execution: { lastProcessedMessageId: agentMessage.id },
          })}
          WHERE id = ${team.implementer.conversationId}::uuid
        `;
      }
    }

    await mailbox.sweep();

    const rows = await context.db
      .select()
      .from(teamMessages)
      .where(eq(teamMessages.teamRunId, team.teamRunId));
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(deliveredIds[0])?.deliveryStatus).toBe('consumed');
    expect(byId.get(deliveredIds[0])?.consumedAt).not.toBeNull();
    expect(byId.get(deliveredIds[1])?.deliveryStatus).toBe('delivered');
  });

  it('截止延迟任务丢失：清扫按 deadline_at 以 deadline_exceeded 失败并推进步骤', async () => {
    await context.adminSql`
      UPDATE team_runs SET deadline_at = now() - interval '1 second'
      WHERE id = ${team.teamRunId}::uuid
    `;

    await service.sweep();

    const run = await loadRun();
    expect(run.status).toBe('failed');
    expect(run.failureReason).toBe('deadline_exceeded');
    expect(await loadStepStatus()).toBe('failed');
    expect(nodeScheduler.onNodeFailed).toHaveBeenCalledWith(
      team.executionId,
      team.stepId,
      team.tenantId,
    );
  });

  it('结束后推进步骤失败：清扫幂等重做步骤终态与调度', async () => {
    nodeScheduler.onNodeFailed.mockRejectedValueOnce(new Error('调度失败'));

    await service.fail(team.tenantId, team.teamRunId, 'no_result', '无结果');
    // 步骤写入与调度同事务：调度失败时步骤保持 running
    expect(await loadStepStatus()).toBe('running');
    expect((await loadRun()).status).toBe('failed');

    await context.adminSql`
      UPDATE team_runs SET completed_at = now() - interval '1 minute'
      WHERE id = ${team.teamRunId}::uuid
    `;
    await service.sweepUnadvancedSteps();
    expect(await loadStepStatus()).toBe('failed');
    expect(nodeScheduler.onNodeFailed).toHaveBeenCalledTimes(2);

    await service.sweepUnadvancedSteps();
    expect(nodeScheduler.onNodeFailed).toHaveBeenCalledTimes(2);
  });

  it('被同一步骤新运行取代的旧终态运行不推进步骤', async () => {
    await context.adminSql`
      UPDATE team_runs
      SET status = 'completed', result = ${context.adminSql.json({ summary: '旧' })},
          completed_at = now() - interval '1 minute'
      WHERE id = ${team.teamRunId}::uuid
    `;
    await context.adminSql`
      INSERT INTO team_runs (
        tenant_id, execution_id, step_id, node_id, config, task_text,
        budget_max_total_tokens, budget_max_messages, deadline_at
      ) VALUES (
        ${team.tenantId}::uuid, ${team.executionId}::uuid, ${team.stepId}::uuid,
        'team-1', ${context.adminSql.json(TEAM_CONFIG)}, '任务', 1000, 10,
        now() + interval '10 minutes'
      )
    `;

    await service.sweepUnadvancedSteps();
    const snapshot = await service.loadSnapshot(team.tenantId, team.teamRunId);
    await expect(
      service.advanceStep(team.tenantId, snapshot!.run),
    ).resolves.toBe(false);

    expect(await loadStepStatus()).toBe('running');
    expect(stepStateMachine.updateStepStatus).not.toHaveBeenCalled();
  });
});

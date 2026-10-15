import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamNodeConfigSchema } from '@agentloom/contracts';

import type { TeamMember } from '../../../database/schema/team-members.schema';
import type { TeamRun } from '../../../database/schema/team-runs.schema';
import { TeamRunService } from '../team-run.service';
import { TeamConfigInvalidException } from '../team.exceptions';
import {
  TEAM_MEMBER_CONVERSATION_CANCEL_EVENT,
  TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT,
} from '../team.events';
import { createFakeDb } from './fake-db';

const TENANT_ID = '019577a0-0000-7000-8000-000000000099';
const EXECUTION_ID = '019577a0-0000-7000-8000-000000000001';
const STEP_ID = '019577a0-0000-7000-8000-000000000002';
const RUN_ID = '019577a0-0000-7000-8000-000000000003';
const AGENT_A = '019577a0-0000-7000-8000-00000000000a';
const AGENT_B = '019577a0-0000-7000-8000-00000000000b';

const config = TeamNodeConfigSchema.parse({
  objective: '修复缺陷',
  members: [
    {
      role: 'locator',
      agentDefinitionId: AGENT_A,
      canMessage: ['implementer'],
    },
    {
      role: 'implementer',
      agentDefinitionId: AGENT_B,
      isLead: true,
      canMessage: ['*'],
    },
  ],
});

function makeRun(overrides: Partial<TeamRun> = {}): TeamRun {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: RUN_ID,
    tenantId: TENANT_ID,
    executionId: EXECUTION_ID,
    stepId: STEP_ID,
    nodeId: 'team-1',
    status: 'running',
    config,
    taskText: '任务',
    context: null,
    budgetMaxTotalTokens: 1000,
    budgetMaxMessages: 10,
    deadlineAt: new Date('2026-01-01T01:00:00Z'),
    usedInputTokens: 0,
    usedOutputTokens: 0,
    usedCostUsd: 0,
    messageCount: 0,
    nudgeCount: 0,
    schemaInvalidCount: 0,
    result: null,
    failureReason: null,
    failureDetail: null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeMember(
  role: string,
  overrides: Partial<TeamMember> = {},
): TeamMember {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: `member-${role}`,
    tenantId: TENANT_ID,
    teamRunId: RUN_ID,
    role,
    agentDefinitionId: AGENT_A,
    agentVersionId: 'v1',
    conversationId: `conversation-${role}`,
    isLead: role === 'implementer',
    canMessage: [],
    instructions: null,
    status: 'idle',
    usedInputTokens: 10,
    usedOutputTokens: 5,
    usedCostUsd: 0.01,
    turnCount: 1,
    lastTurnAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function setup(results: unknown[] = []) {
  const fake = createFakeDb(results);
  const conversationService = {
    insertUserMessage: vi.fn().mockResolvedValue({ id: 'message-1' }),
  };
  const mailbox = { sendSystem: vi.fn().mockResolvedValue({ ok: true }) };
  const stepStateMachine = { updateStepStatus: vi.fn().mockResolvedValue({}) };
  const nodeScheduler = {
    onNodeCompleted: vi.fn().mockResolvedValue(undefined),
    onNodeFailed: vi.fn().mockResolvedValue(undefined),
  };
  const eventBridge = { emitTeamStatus: vi.fn() };
  const queue = {
    add: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(1),
  };
  const eventEmitter = { emitAsync: vi.fn().mockResolvedValue([]) };
  const service = new TeamRunService(
    fake.db as never,
    conversationService as never,
    mailbox as never,
    stepStateMachine as never,
    nodeScheduler as never,
    eventBridge as never,
    queue as never,
    eventEmitter as never,
  );
  return {
    ...fake,
    service,
    conversationService,
    mailbox,
    stepStateMachine,
    nodeScheduler,
    eventBridge,
    queue,
    eventEmitter,
  };
}

/** finalize 的三次查询：结束运行、成员置 ended、读取成员 */
function finalizeResults(run: TeamRun, members: TeamMember[]): unknown[] {
  return [[run], undefined, members];
}

describe('TeamRunService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('start', () => {
    it('写入运行、成员对话、成员与简报，提交后派发成员并登记截止任务', async () => {
      const run = makeRun();
      const locator = makeMember('locator');
      const implementer = makeMember('implementer');
      const ctx = setup([
        [
          {
            id: AGENT_A,
            name: 'A',
            status: 'published',
            publishedVersionId: 'v1',
          },
          {
            id: AGENT_B,
            name: 'B',
            status: 'published',
            publishedVersionId: 'v2',
          },
        ],
        [run],
        [{ id: 'conversation-locator' }],
        [locator],
        [{ id: 'conversation-implementer' }],
        [implementer],
      ]);

      const result = await ctx.service.start({
        tenantId: TENANT_ID,
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        nodeId: 'team-1',
        config,
        taskText: '任务',
        context: { a: 1 },
      });

      expect(result).toEqual({ teamRunId: RUN_ID });
      const inserts = ctx.calls.filter((call) => call.op === 'insert');
      expect(inserts).toHaveLength(5);
      const conversationValues = ctx.argsOf(inserts[1], 'values')?.[0];
      expect(conversationValues).toMatchObject({
        source: 'team',
        createdBy: null,
        apiKeyId: null,
        agentDefinitionId: AGENT_A,
      });
      const memberValues = ctx.argsOf(inserts[4], 'values')?.[0];
      expect(memberValues).toMatchObject({
        role: 'implementer',
        isLead: true,
        agentVersionId: 'v2',
        conversationId: 'conversation-implementer',
      });
      expect(ctx.conversationService.insertUserMessage).toHaveBeenCalledTimes(
        2,
      );
      expect(
        ctx.conversationService.insertUserMessage.mock.calls[0][3],
      ).toMatchObject({
        contentType: 'text',
        metadata: { type: 'team_brief', teamRunId: RUN_ID },
      });
      expect(ctx.eventEmitter.emitAsync).toHaveBeenCalledWith(
        TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT,
        { conversationId: 'conversation-locator', tenantId: TENANT_ID },
      );
      expect(ctx.eventEmitter.emitAsync).toHaveBeenCalledWith(
        TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT,
        { conversationId: 'conversation-implementer', tenantId: TENANT_ID },
      );
      expect(ctx.queue.add).toHaveBeenCalledWith(
        'team-deadline',
        { tenantId: TENANT_ID, teamRunId: RUN_ID },
        expect.objectContaining({ jobId: `team-deadline-${RUN_ID}` }),
      );
      expect(ctx.eventBridge.emitTeamStatus).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        expect.objectContaining({ teamRunId: RUN_ID, status: 'running' }),
      );
    });

    it('成员 Agent 未发布时拒绝启动且不写入', async () => {
      const ctx = setup([
        [
          { id: AGENT_A, name: 'A', status: 'draft', publishedVersionId: null },
          {
            id: AGENT_B,
            name: 'B',
            status: 'published',
            publishedVersionId: 'v2',
          },
        ],
      ]);

      await expect(
        ctx.service.start({
          tenantId: TENANT_ID,
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          nodeId: 'team-1',
          config,
          taskText: '任务',
          context: null,
        }),
      ).rejects.toBeInstanceOf(TeamConfigInvalidException);
      expect(ctx.calls.filter((call) => call.op === 'insert')).toHaveLength(0);
      expect(ctx.eventEmitter.emitAsync).not.toHaveBeenCalled();
    });
  });

  describe('finalize', () => {
    it('complete 写入结果，结束成员对话并推进步骤完成', async () => {
      const members = [makeMember('locator'), makeMember('implementer')];
      const run = makeRun({
        status: 'completed',
        result: { summary: '已修复' },
        usedInputTokens: 20,
        usedOutputTokens: 10,
        messageCount: 3,
      });
      const ctx = setup(finalizeResults(run, members));

      await expect(
        ctx.service.complete(TENANT_ID, RUN_ID, { summary: '已修复' }),
      ).resolves.toBe(true);

      const runUpdate = ctx.calls[0];
      expect(ctx.argsOf(runUpdate, 'set')?.[0]).toMatchObject({
        status: 'completed',
        result: { summary: '已修复' },
      });
      expect(ctx.eventEmitter.emitAsync).toHaveBeenCalledWith(
        TEAM_MEMBER_CONVERSATION_CANCEL_EVENT,
        { conversationId: 'conversation-locator', tenantId: TENANT_ID },
      );
      expect(ctx.queue.remove).toHaveBeenCalledWith(`team-deadline-${RUN_ID}`);
      expect(ctx.stepStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'completed',
        {
          result: expect.objectContaining({
            'summary-out': '已修复',
            'result-out': expect.objectContaining({
              teamRunId: RUN_ID,
              summary: '已修复',
              messageCount: 3,
              usage: { inputTokens: 20, outputTokens: 10, costUsd: 0 },
            }),
            promptTokens: 20,
            completionTokens: 10,
            totalTokens: 30,
          }),
        },
      );
      expect(ctx.nodeScheduler.onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );
      expect(ctx.nodeScheduler.onNodeFailed).not.toHaveBeenCalled();
    });

    it('fail 以 team/<reason> 置步骤失败并调用 onNodeFailed', async () => {
      const run = makeRun({
        status: 'failed',
        failureReason: 'deadline_exceeded',
      });
      const ctx = setup(finalizeResults(run, [makeMember('implementer')]));

      await ctx.service.fail(TENANT_ID, RUN_ID, 'deadline_exceeded', '超时');

      expect(ctx.stepStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'failed',
        {
          errorMessage: {
            message: '超时',
            type: 'team/deadline_exceeded',
            nodeId: 'team-1',
          },
        },
      );
      expect(ctx.nodeScheduler.onNodeFailed).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );
      expect(ctx.eventBridge.emitTeamStatus).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        expect.objectContaining({ failureReason: 'deadline_exceeded' }),
      );
    });

    it('cancel 结束成员对话但不推进步骤', async () => {
      const run = makeRun({ status: 'cancelled', failureReason: 'cancelled' });
      const ctx = setup(finalizeResults(run, [makeMember('implementer')]));

      await ctx.service.cancel(TENANT_ID, RUN_ID);

      expect(ctx.eventEmitter.emitAsync).toHaveBeenCalledWith(
        TEAM_MEMBER_CONVERSATION_CANCEL_EVENT,
        expect.anything(),
      );
      expect(ctx.stepStateMachine.updateStepStatus).not.toHaveBeenCalled();
      expect(ctx.nodeScheduler.onNodeCompleted).not.toHaveBeenCalled();
      expect(ctx.nodeScheduler.onNodeFailed).not.toHaveBeenCalled();
    });

    it('已结束的运行再次结束是幂等的', async () => {
      const ctx = setup([[]]);

      await expect(
        ctx.service.fail(TENANT_ID, RUN_ID, 'no_result'),
      ).resolves.toBe(false);

      expect(ctx.calls).toHaveLength(1);
      expect(ctx.eventEmitter.emitAsync).not.toHaveBeenCalled();
      expect(ctx.stepStateMachine.updateStepStatus).not.toHaveBeenCalled();
    });
  });

  describe('recordMemberTurn', () => {
    const turn = {
      conversationId: 'conversation-locator',
      tenantId: TENANT_ID,
      assistantMessageId: 'assistant-1',
      processedMessageIds: [],
      usage: { inputTokens: 600, outputTokens: 500, totalTokens: 1100 },
      costUsd: 0.5,
      stopReason: 'end_turn' as const,
    };

    it('累计用量超过 tokens 预算时以 budget_exhausted 失败', async () => {
      const usedRun = makeRun({ usedInputTokens: 600, usedOutputTokens: 500 });
      const failedRun = makeRun({
        status: 'failed',
        failureReason: 'budget_exhausted',
      });
      const ctx = setup([
        [{ teamRunId: RUN_ID }],
        [usedRun],
        ...finalizeResults(failedRun, [makeMember('locator')]),
      ]);

      await ctx.service.recordMemberTurn(turn);

      const memberUpdate = ctx.calls[0];
      expect(ctx.argsOf(memberUpdate, 'set')?.[0]).toHaveProperty('lastTurnAt');
      expect(ctx.argsOf(ctx.calls[2], 'set')?.[0]).toMatchObject({
        status: 'failed',
        failureReason: 'budget_exhausted',
      });
      expect(ctx.stepStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'failed',
        expect.objectContaining({
          errorMessage: expect.objectContaining({
            type: 'team/budget_exhausted',
          }),
        }),
      );
    });

    it('非团队成员的对话直接忽略', async () => {
      const ctx = setup([[]]);

      await ctx.service.recordMemberTurn(turn);

      expect(ctx.calls).toHaveLength(1);
      expect(ctx.eventBridge.emitTeamStatus).not.toHaveBeenCalled();
    });
  });

  describe('nudgeOrFail / sweepIdleRuns', () => {
    it('催办次数未用尽时给 lead 发系统消息', async () => {
      const lead = makeMember('implementer');
      const ctx = setup([[{ id: RUN_ID }], [lead]]);

      await ctx.service.nudgeOrFail(TENANT_ID, RUN_ID);

      expect(ctx.mailbox.sendSystem).toHaveBeenCalledWith(
        TENANT_ID,
        RUN_ID,
        lead.id,
        expect.stringContaining('team_submit_result'),
      );
    });

    it('催办次数用尽时以 no_result 失败', async () => {
      const run = makeRun({ status: 'failed', failureReason: 'no_result' });
      const ctx = setup([
        [],
        ...finalizeResults(run, [makeMember('implementer')]),
      ]);

      await ctx.service.nudgeOrFail(TENANT_ID, RUN_ID);

      expect(ctx.mailbox.sendSystem).not.toHaveBeenCalled();
      expect(ctx.argsOf(ctx.calls[1], 'set')?.[0]).toMatchObject({
        status: 'failed',
        failureReason: 'no_result',
      });
    });

    it('清扫对空闲运行逐个催办', async () => {
      const ctx = setup([[{ id: RUN_ID, tenantId: TENANT_ID }]]);
      const nudge = vi
        .spyOn(ctx.service, 'nudgeOrFail')
        .mockResolvedValue(undefined);

      await ctx.service.sweepIdleRuns();

      expect(nudge).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
    });
  });

  it('工作流执行取消时取消其下运行中的团队', async () => {
    const ctx = setup([[{ id: RUN_ID }]]);
    const cancel = vi.spyOn(ctx.service, 'cancel').mockResolvedValue(true);

    await ctx.service.handleExecutionStatusChanged({
      tenantId: TENANT_ID,
      executionId: EXECUTION_ID,
      status: 'cancelled',
    });

    expect(cancel).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
  });
});

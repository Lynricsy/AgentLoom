import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamNodeConfigSchema } from '@agentloom/contracts';

import type { TeamMember } from '../../../database/schema/team-members.schema';
import type { TeamRun } from '../../../database/schema/team-runs.schema';
import { decideSettlement, TeamRunService } from '../team-run.service';
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
    resultSubmittedAt: null,
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

/** 推进步骤的查询：最新运行、锁定步骤（完成时再读成员） */
function advanceResults(
  run: TeamRun,
  stepStatus = 'running',
  members: TeamMember[] = [],
): unknown[] {
  const base = [[{ id: run.id }], [{ status: stepStatus }]];
  return run.status === 'completed' && stepStatus === 'running'
    ? [...base, members]
    : base;
}

/** 重算用量的聚合行 */
function totals(
  memberId: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  turnCount: number,
) {
  return {
    memberId,
    inputTokens,
    outputTokens,
    costUsd,
    turnCount,
    lastTurnAt: null,
  };
}

describe('TeamRunService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
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
        [],
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

    it('同一步骤仍有运行中的旧团队时先取消它（不推进步骤），再启动新运行', async () => {
      const oldMember = makeMember('locator', {
        id: 'old-member',
        teamRunId: 'old-run',
        conversationId: 'old-conversation',
      });
      const oldRun = makeRun({
        id: 'old-run',
        status: 'cancelled',
        failureReason: 'cancelled',
      });
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
        [{ id: 'old-run' }],
        ...finalizeResults(oldRun, [oldMember]),
        [makeRun()],
        [{ id: 'conversation-locator' }],
        [makeMember('locator')],
        [{ id: 'conversation-implementer' }],
        [makeMember('implementer')],
      ]);

      await ctx.service.start({
        tenantId: TENANT_ID,
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        nodeId: 'team-1',
        config,
        taskText: '任务',
        context: null,
      });

      const staleSelect = ctx.calls[1];
      expect(staleSelect.chain.map(([name]) => name)).toContain('for');
      expect(ctx.argsOf(ctx.calls[2], 'set')?.[0]).toMatchObject({
        status: 'cancelled',
        failureReason: 'cancelled',
      });
      expect(ctx.eventEmitter.emitAsync).toHaveBeenCalledWith(
        TEAM_MEMBER_CONVERSATION_CANCEL_EVENT,
        { conversationId: 'old-conversation', tenantId: TENANT_ID },
      );
      expect(ctx.queue.remove).toHaveBeenCalledWith('team-deadline-old-run');
      expect(ctx.stepStateMachine.updateStepStatus).not.toHaveBeenCalled();
      expect(ctx.calls.filter((call) => call.op === 'insert')).toHaveLength(5);
    });

    it('提交后派发与截止登记失败只记录，不让启动失败', async () => {
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
        [],
        [makeRun()],
        [{ id: 'conversation-locator' }],
        [makeMember('locator')],
        [{ id: 'conversation-implementer' }],
        [makeMember('implementer')],
      ]);
      ctx.eventEmitter.emitAsync.mockRejectedValue(new Error('redis down'));
      ctx.queue.add.mockRejectedValue(new Error('redis down'));
      const warn = vi.spyOn(Logger.prototype, 'warn');

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
      ).resolves.toEqual({ teamRunId: RUN_ID });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('由清扫'));
    });
  });

  describe('finalize', () => {
    it('fail 以 team/<reason> 置步骤失败并调用 onNodeFailed', async () => {
      const run = makeRun({
        status: 'failed',
        failureReason: 'deadline_exceeded',
        failureDetail: '超时',
      });
      const ctx = setup([
        ...finalizeResults(run, [makeMember('implementer')]),
        ...advanceResults(run),
      ]);

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

    it('迟到的结束：本运行已不是该步骤的最新运行时不修改步骤', async () => {
      const run = makeRun({ status: 'failed', failureReason: 'no_result' });
      const ctx = setup([
        ...finalizeResults(run, [makeMember('implementer')]),
        [{ id: 'newer-run' }],
      ]);

      await ctx.service.fail(TENANT_ID, RUN_ID, 'no_result');

      expect(ctx.stepStateMachine.updateStepStatus).not.toHaveBeenCalled();
      expect(ctx.nodeScheduler.onNodeFailed).not.toHaveBeenCalled();
    });

    it('步骤已不在 running（如执行已取消）时不修改步骤', async () => {
      const run = makeRun({ status: 'failed', failureReason: 'no_result' });
      const ctx = setup([
        ...finalizeResults(run, [makeMember('implementer')]),
        ...advanceResults(run, 'cancelled'),
      ]);

      await ctx.service.fail(TENANT_ID, RUN_ID, 'no_result');

      expect(ctx.stepStateMachine.updateStepStatus).not.toHaveBeenCalled();
    });

    it('推进步骤失败时记录错误交给清扫恢复，结束本身仍成功', async () => {
      const run = makeRun({ status: 'failed', failureReason: 'no_result' });
      const ctx = setup([
        ...finalizeResults(run, [makeMember('implementer')]),
        ...advanceResults(run),
      ]);
      ctx.stepStateMachine.updateStepStatus.mockRejectedValueOnce(
        new Error('db down'),
      );
      const error = vi.spyOn(Logger.prototype, 'error');

      await expect(
        ctx.service.fail(TENANT_ID, RUN_ID, 'no_result'),
      ).resolves.toBe(true);

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('等待清扫恢复'),
      );
      expect(ctx.nodeScheduler.onNodeFailed).not.toHaveBeenCalled();
    });
  });

  describe('submitResult', () => {
    it('只登记待定结果（不结束团队、不推进步骤）', async () => {
      const ctx = setup([[{ id: RUN_ID }], [makeRun()], []]);

      await expect(
        ctx.service.submitResult(TENANT_ID, RUN_ID, { summary: '已修复' }),
      ).resolves.toBe('submitted');

      const set = ctx.argsOf(ctx.calls[0], 'set')?.[0] as Record<
        string,
        unknown
      >;
      expect(set).toMatchObject({ result: { summary: '已修复' } });
      expect(set).toHaveProperty('resultSubmittedAt');
      expect(set).not.toHaveProperty('status');
      expect(ctx.eventEmitter.emitAsync).not.toHaveBeenCalled();
      expect(ctx.stepStateMachine.updateStepStatus).not.toHaveBeenCalled();
    });

    it('已提交过的运行拒绝重复提交', async () => {
      const ctx = setup([[], [{ status: 'running' }]]);

      await expect(
        ctx.service.submitResult(TENANT_ID, RUN_ID, { summary: '再次' }),
      ).resolves.toBe('already_submitted');
    });

    it('团队已结束时返回 not_running', async () => {
      const ctx = setup([[], [{ status: 'failed' }]]);

      await expect(
        ctx.service.submitResult(TENANT_ID, RUN_ID, { summary: '迟到' }),
      ).resolves.toBe('not_running');
    });
  });

  describe('recordMemberTurn / settle', () => {
    const turn = {
      conversationId: 'conversation-implementer',
      tenantId: TENANT_ID,
      assistantMessageId: 'assistant-1',
      processedMessageIds: [],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      costUsd: 0.5,
      stopReason: 'end_turn' as const,
    };

    it('按持久数据重算成员与团队用量（不按事件增量累加），成员回到空闲', async () => {
      const locator = makeMember('locator', {
        usedInputTokens: 100,
        usedOutputTokens: 20,
        turnCount: 2,
      });
      const implementer = makeMember('implementer', {
        usedInputTokens: 300,
        usedOutputTokens: 40,
        turnCount: 3,
      });
      const recomputed = makeRun({
        usedInputTokens: 400,
        usedOutputTokens: 60,
        usedCostUsd: 0.3,
      });
      const ctx = setup([
        [{ teamRunId: RUN_ID }],
        [makeRun()],
        undefined,
        [
          totals('member-locator', 100, 20, 0.1, 2),
          totals('member-implementer', 300, 40, 0.2, 3),
        ],
        [locator],
        [implementer],
        [recomputed],
      ]);

      await ctx.service.recordMemberTurn(turn);

      // 结算前锁定运行行，保证同一运行的重算串行
      expect(ctx.calls[1].chain.map(([name]) => name)).toContain('for');
      expect(ctx.argsOf(ctx.calls[2], 'set')?.[0]).toHaveProperty('status');
      expect(ctx.argsOf(ctx.calls[4], 'set')?.[0]).toMatchObject({
        usedInputTokens: 100,
        usedOutputTokens: 20,
        usedCostUsd: 0.1,
        turnCount: 2,
      });
      expect(ctx.argsOf(ctx.calls[6], 'set')?.[0]).toMatchObject({
        usedInputTokens: 400,
        usedOutputTokens: 60,
        usedCostUsd: expect.closeTo(0.3, 6),
      });
      // 事件里的增量 usage 不参与计算
      expect(JSON.stringify(ctx.argsOf(ctx.calls[6], 'set'))).not.toContain(
        '"usedInputTokens":401',
      );
      expect(ctx.stepStateMachine.updateStepStatus).not.toHaveBeenCalled();
      expect(ctx.eventBridge.emitTeamStatus).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        expect.objectContaining({
          budget: expect.objectContaining({ usedTokens: 460 }),
        }),
      );
    });

    it('重算后超过 tokens 预算时以 budget_exhausted 失败', async () => {
      const members = [makeMember('implementer')];
      const recomputed = makeRun({
        usedInputTokens: 600,
        usedOutputTokens: 500,
      });
      const failedRun = makeRun({
        status: 'failed',
        failureReason: 'budget_exhausted',
        failureDetail: '已用 1100 tokens',
      });
      const ctx = setup([
        [{ teamRunId: RUN_ID }],
        [makeRun()],
        undefined,
        [totals('member-implementer', 600, 500, 0, 1)],
        members,
        [recomputed],
        ...finalizeResults(failedRun, members),
        ...advanceResults(failedRun),
      ]);

      await ctx.service.recordMemberTurn(turn);

      expect(ctx.argsOf(ctx.calls[6], 'set')?.[0]).toMatchObject({
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

    it('团队结束后才落库的被取消成员回合仍计入成员与团队用量，但不再结算状态', async () => {
      const ended = makeRun({
        status: 'failed',
        failureReason: 'budget_exhausted',
        usedInputTokens: 18_000,
        usedOutputTokens: 2_000,
      });
      const implementer = makeMember('implementer', {
        status: 'ended',
        usedInputTokens: 9_000,
        usedOutputTokens: 500,
        turnCount: 1,
      });
      const recomputed = makeRun({
        status: 'failed',
        failureReason: 'budget_exhausted',
        usedInputTokens: 27_000,
        usedOutputTokens: 2_500,
      });
      const ctx = setup([
        [{ teamRunId: RUN_ID }],
        [ended],
        [totals('member-implementer', 9_000, 500, 0, 1)],
        [implementer],
        [recomputed],
      ]);

      await ctx.service.recordMemberTurn({
        ...turn,
        stopReason: 'cancelled' as never,
      });

      expect(ctx.argsOf(ctx.calls[3], 'set')?.[0]).toMatchObject({
        usedInputTokens: 9_000,
        usedOutputTokens: 500,
        turnCount: 1,
      });
      expect(ctx.argsOf(ctx.calls[4], 'set')?.[0]).toMatchObject({
        usedInputTokens: 9_000,
        usedOutputTokens: 500,
      });
      expect(ctx.argsOf(ctx.calls[4], 'set')?.[0]).not.toHaveProperty('status');
      expect(ctx.stepStateMachine.updateStepStatus).not.toHaveBeenCalled();
      expect(ctx.eventBridge.emitTeamStatus).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        expect.objectContaining({
          status: 'failed',
          budget: expect.objectContaining({ usedTokens: 29_500 }),
        }),
      );
    });

    it('lead 提交回合落库后用结算后的用量完成，步骤结果用结算快照', async () => {
      const submittedAt = new Date('2026-01-01T00:10:00Z');
      const lead = makeMember('implementer', {
        usedInputTokens: 30,
        usedOutputTokens: 15,
        lastTurnAt: new Date('2026-01-01T00:10:05Z'),
      });
      const pending = makeRun({
        result: { summary: '已修复' },
        resultSubmittedAt: submittedAt,
      });
      const recomputed = makeRun({
        result: { summary: '已修复' },
        resultSubmittedAt: submittedAt,
        usedInputTokens: 30,
        usedOutputTokens: 15,
        messageCount: 3,
      });
      const completed = { ...recomputed, status: 'completed' as const };
      const ctx = setup([
        [{ teamRunId: RUN_ID }],
        [pending],
        undefined,
        [totals('member-implementer', 30, 15, 0, 2)],
        [lead],
        [recomputed],
        ...finalizeResults(completed, [lead]),
        ...advanceResults(completed, 'running', [lead]),
      ]);

      await ctx.service.recordMemberTurn(turn);

      const finalizeSet = ctx.argsOf(ctx.calls[6], 'set')?.[0];
      expect(finalizeSet).toMatchObject({ status: 'completed' });
      expect(finalizeSet).not.toHaveProperty('result');
      expect(ctx.stepStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'completed',
        {
          result: expect.objectContaining({
            'summary-out': '已修复',
            'result-out': expect.objectContaining({
              summary: '已修复',
              messageCount: 3,
              usage: { inputTokens: 30, outputTokens: 15, costUsd: 0 },
            }),
            promptTokens: 30,
            completionTokens: 15,
            totalTokens: 45,
          }),
        },
      );
      expect(ctx.nodeScheduler.onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );
    });

    it('有待定结果但 lead 的提交回合尚未落库（其他成员回合）时继续运行', async () => {
      const submittedAt = new Date('2026-01-01T00:10:00Z');
      const lead = makeMember('implementer', {
        lastTurnAt: new Date('2026-01-01T00:05:00Z'),
      });
      const pending = makeRun({
        result: { summary: '已修复' },
        resultSubmittedAt: submittedAt,
      });
      const ctx = setup([
        [{ teamRunId: RUN_ID }],
        [pending],
        undefined,
        [totals('member-implementer', 10, 5, 0, 1)],
        [lead],
        [pending],
      ]);

      await ctx.service.recordMemberTurn({
        ...turn,
        conversationId: 'conversation-locator',
      });

      expect(ctx.calls).toHaveLength(6);
      expect(ctx.stepStateMachine.updateStepStatus).not.toHaveBeenCalled();
    });

    it('非团队成员的对话直接忽略', async () => {
      const ctx = setup([[]]);

      await ctx.service.recordMemberTurn(turn);

      expect(ctx.calls).toHaveLength(1);
      expect(ctx.eventBridge.emitTeamStatus).not.toHaveBeenCalled();
    });
  });

  describe('decideSettlement', () => {
    const submittedAt = new Date('2026-01-01T00:10:00Z');
    const pending = makeRun({
      result: { summary: '已修复' },
      resultSubmittedAt: submittedAt,
    });

    it('有待定结果但超预算 → budget_exhausted', () => {
      expect(
        decideSettlement(
          {
            run: { ...pending, usedInputTokens: 900, usedOutputTokens: 200 },
            members: [],
          },
          { force: true },
        ),
      ).toMatchObject({ status: 'failed', reason: 'budget_exhausted' });
    });

    it('清扫兜底：提交已久且 lead 不在运行 → 完成；lead 仍在运行 → 等待', () => {
      const later = new Date('2026-01-01T00:20:00Z');
      expect(
        decideSettlement(
          { run: pending, members: [makeMember('implementer')] },
          { submittedBefore: later },
        ),
      ).toEqual({ status: 'completed' });
      expect(
        decideSettlement(
          {
            run: pending,
            members: [makeMember('implementer', { status: 'running' })],
          },
          { submittedBefore: later },
        ),
      ).toBeNull();
    });

    it('没有待定结果时从不完成', () => {
      expect(
        decideSettlement(
          { run: makeRun(), members: [makeMember('implementer')] },
          { force: true },
        ),
      ).toBeNull();
    });
  });

  describe('handleLoopEnded', () => {
    it('已提交结果的 lead 循环失败时结算后完成，而不是 member_failed', async () => {
      const lead = makeMember('implementer');
      const ctx = setup([
        [lead],
        [{ status: 'running', result: { summary: '已修复' } }],
      ]);
      const settle = vi
        .spyOn(ctx.service, 'settle')
        .mockResolvedValue('completed');
      const fail = vi.spyOn(ctx.service, 'fail');

      await ctx.service.handleLoopEnded({
        conversationId: 'conversation-implementer',
        tenantId: TENANT_ID,
        status: 'failed',
        errorMessage: 'model error',
      });

      expect(settle).toHaveBeenCalledWith(TENANT_ID, RUN_ID, { force: true });
      expect(fail).not.toHaveBeenCalled();
    });

    it('未提交结果的 lead 循环失败 → member_failed', async () => {
      const lead = makeMember('implementer');
      const ctx = setup([[lead], [{ status: 'running', result: null }]]);
      const fail = vi.spyOn(ctx.service, 'fail').mockResolvedValue(true);

      await ctx.service.handleLoopEnded({
        conversationId: 'conversation-implementer',
        tenantId: TENANT_ID,
        status: 'failed',
        errorMessage: 'model error',
      });

      expect(fail).toHaveBeenCalledWith(
        TENANT_ID,
        RUN_ID,
        'member_failed',
        expect.stringContaining('model error'),
      );
    });
  });

  describe('handleDeadline', () => {
    it('无待定结果时以 deadline_exceeded 失败', async () => {
      const ctx = setup();
      const settle = vi
        .spyOn(ctx.service, 'settle')
        .mockResolvedValue('running');
      const fail = vi.spyOn(ctx.service, 'fail').mockResolvedValue(true);

      await ctx.service.handleDeadline({
        tenantId: TENANT_ID,
        teamRunId: RUN_ID,
      });

      expect(settle).toHaveBeenCalledWith(TENANT_ID, RUN_ID, { force: true });
      expect(fail).toHaveBeenCalledWith(
        TENANT_ID,
        RUN_ID,
        'deadline_exceeded',
        expect.any(String),
      );
    });

    it('结算已结束团队（如待定结果完成）时不再失败', async () => {
      const ctx = setup();
      vi.spyOn(ctx.service, 'settle').mockResolvedValue('completed');
      const fail = vi.spyOn(ctx.service, 'fail');

      await ctx.service.handleDeadline({
        tenantId: TENANT_ID,
        teamRunId: RUN_ID,
      });

      expect(fail).not.toHaveBeenCalled();
    });
  });

  describe('nudgeOrFail / sweep', () => {
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
        ...advanceResults(run),
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

    it('清扫：已过截止时间的运行中团队直接走截止处理（不依赖延迟任务）', async () => {
      const ctx = setup([[{ id: RUN_ID, tenantId: TENANT_ID }]]);
      const deadline = vi
        .spyOn(ctx.service, 'handleDeadline')
        .mockResolvedValue(undefined);

      await ctx.service.sweepOverdueDeadlines();

      expect(deadline).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        teamRunId: RUN_ID,
      });
    });

    it('清扫：运行中团队逐个结算，并带上待定结果兜底时间', async () => {
      const ctx = setup([[{ id: RUN_ID, tenantId: TENANT_ID }]]);
      const settle = vi
        .spyOn(ctx.service, 'settle')
        .mockResolvedValue('running');

      await ctx.service.sweepSettleRunningRuns();

      expect(settle).toHaveBeenCalledWith(TENANT_ID, RUN_ID, {
        submittedBefore: expect.any(Date),
      });
    });

    it('清扫：启动已久仍无落库回合的成员重新派发', async () => {
      const ctx = setup([
        [{ conversationId: 'conversation-locator', tenantId: TENANT_ID }],
      ]);

      await ctx.service.sweepUnstartedMembers();

      expect(ctx.eventEmitter.emitAsync).toHaveBeenCalledWith(
        TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT,
        { conversationId: 'conversation-locator', tenantId: TENANT_ID },
      );
    });

    it('清扫：终态团队而步骤仍 running 时重做步骤终态与调度', async () => {
      const run = makeRun({ status: 'completed', result: { summary: '完成' } });
      const members = [makeMember('implementer')];
      const ctx = setup([
        [{ id: RUN_ID, tenantId: TENANT_ID }],
        [run],
        members,
        ...advanceResults(run, 'running', members),
      ]);

      await ctx.service.sweepUnadvancedSteps();

      expect(ctx.stepStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'completed',
        expect.objectContaining({
          result: expect.objectContaining({ 'summary-out': '完成' }),
        }),
      );
      expect(ctx.nodeScheduler.onNodeCompleted).toHaveBeenCalled();
    });

    it('清扫：终态团队仍有 active 成员对话时结束它们', async () => {
      const ctx = setup([
        [{ conversationId: 'conversation-locator', tenantId: TENANT_ID }],
      ]);

      await ctx.service.sweepOrphanedMemberConversations();

      expect(ctx.eventEmitter.emitAsync).toHaveBeenCalledWith(
        TEAM_MEMBER_CONVERSATION_CANCEL_EVENT,
        { conversationId: 'conversation-locator', tenantId: TENANT_ID },
      );
    });

    it('清扫按顺序执行全部分支，单个分支失败不影响后续', async () => {
      const ctx = setup();
      const order: string[] = [];
      for (const name of [
        'sweepOverdueDeadlines',
        'sweepSettleRunningRuns',
        'sweepUnstartedMembers',
        'sweepIdleRuns',
        'sweepUnadvancedSteps',
        'sweepOrphanedMemberConversations',
      ] as const) {
        vi.spyOn(ctx.service, name).mockImplementation(async () => {
          order.push(name);
        });
      }

      await ctx.service.sweep();

      expect(order).toEqual([
        'sweepOverdueDeadlines',
        'sweepSettleRunningRuns',
        'sweepUnstartedMembers',
        'sweepIdleRuns',
        'sweepUnadvancedSteps',
        'sweepOrphanedMemberConversations',
      ]);
    });
  });

  it.each(['cancelled', 'failed', 'completed'])(
    '工作流执行进入 %s 时取消其下运行中的团队',
    async (status) => {
      const ctx = setup([[{ id: RUN_ID }]]);
      const cancel = vi.spyOn(ctx.service, 'cancel').mockResolvedValue(true);

      await ctx.service.handleExecutionStatusChanged({
        tenantId: TENANT_ID,
        executionId: EXECUTION_ID,
        status,
      });

      expect(cancel).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
    },
  );

  it('工作流执行仍在运行时不取消团队', async () => {
    const ctx = setup();
    const cancel = vi.spyOn(ctx.service, 'cancel');

    await ctx.service.handleExecutionStatusChanged({
      tenantId: TENANT_ID,
      executionId: EXECUTION_ID,
      status: 'running',
    });

    expect(cancel).not.toHaveBeenCalled();
    expect(ctx.calls).toHaveLength(0);
  });
});

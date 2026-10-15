import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TeamMessage } from '../../../database/schema/team-messages.schema';
import { TeamMailboxService } from '../team-mailbox.service';
import { TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT } from '../team.events';
import { createFakeDb } from './fake-db';

const TENANT_ID = '019577a0-0000-7000-8000-000000000099';
const RUN_ID = '019577a0-0000-7000-8000-000000000003';

function makeMessage(overrides: Partial<TeamMessage> = {}): TeamMessage {
  return {
    id: 'message-1',
    tenantId: TENANT_ID,
    teamRunId: RUN_ID,
    senderMemberId: 'member-locator',
    recipientMemberId: 'member-implementer',
    kind: 'observation',
    content: '问题在 auth.ts',
    refs: ['src/auth.ts'],
    replyToMessageId: null,
    deliveryStatus: 'pending',
    agentMessageId: null,
    decisionRecordId: null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    deliveredAt: null,
    consumedAt: null,
    ...overrides,
  };
}

function setup(results: unknown[] = []) {
  const fake = createFakeDb(results);
  const conversationService = {
    insertUserMessage: vi.fn().mockResolvedValue({ id: 'agent-message-1' }),
  };
  const eventBridge = { emitTeamMessage: vi.fn() };
  const eventEmitter = { emitAsync: vi.fn().mockResolvedValue([]) };
  const service = new TeamMailboxService(
    fake.db as never,
    conversationService as never,
    eventBridge as never,
    eventEmitter as never,
  );
  const internals = service as unknown as {
    emitMessageEvents: (tenantId: string, rows: TeamMessage[]) => Promise<void>;
  };
  const emitMessageEvents = vi
    .spyOn(internals, 'emitMessageEvents')
    .mockResolvedValue(undefined);
  return {
    ...fake,
    service,
    conversationService,
    eventBridge,
    eventEmitter,
    emitMessageEvents,
  };
}

describe('TeamMailboxService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('send', () => {
    it('每个接收者一行并递增消息数，提交后投递 pending 行', async () => {
      const rows = [
        makeMessage({ id: 'm-1', recipientMemberId: 'member-a' }),
        makeMessage({
          id: 'm-2',
          recipientMemberId: 'member-b',
          deliveryStatus: 'suppressed',
        }),
      ];
      const ctx = setup([[{ deadlineAt: new Date() }], rows]);
      const deliver = vi
        .spyOn(ctx.service, 'deliverPending')
        .mockResolvedValue(undefined);

      const result = await ctx.service.send({
        tenantId: TENANT_ID,
        teamRunId: RUN_ID,
        senderMemberId: 'member-locator',
        recipients: [
          { memberId: 'member-a', messageId: 'm-1', decisionRecordId: 'd-1' },
          { memberId: 'member-b', suppressed: true },
        ],
        kind: 'observation',
        content: '发现',
        refs: ['a.ts'],
      });

      expect(result).toEqual({ ok: true, messageIds: ['m-1', 'm-2'] });
      const inserted = ctx.argsOf(ctx.calls[1], 'values')?.[0] as Array<
        Record<string, unknown>
      >;
      expect(inserted).toHaveLength(2);
      expect(inserted[0]).toMatchObject({
        id: 'm-1',
        recipientMemberId: 'member-a',
        deliveryStatus: 'pending',
        decisionRecordId: 'd-1',
        refs: ['a.ts'],
      });
      expect(inserted[1]).toMatchObject({ deliveryStatus: 'suppressed' });
      expect(deliver).toHaveBeenCalledWith(TENANT_ID, ['m-1']);
      expect(ctx.emitMessageEvents).toHaveBeenCalledWith(TENANT_ID, rows);
    });

    it('消息预算不足时不写入并返回 budget_exhausted', async () => {
      const ctx = setup([[], [{ status: 'running' }]]);

      const result = await ctx.service.send({
        tenantId: TENANT_ID,
        teamRunId: RUN_ID,
        senderMemberId: 'member-locator',
        recipients: [{ memberId: 'member-a' }],
        kind: 'request',
        content: '请求',
      });

      expect(result).toEqual({ ok: false, reason: 'budget_exhausted' });
      expect(ctx.calls.filter((call) => call.op === 'insert')).toHaveLength(0);
    });
  });

  describe('deliverPending', () => {
    it('非 pending 行跳过：不写 agent_messages、不派发', async () => {
      const ctx = setup([[makeMessage({ deliveryStatus: 'delivered' })]]);

      await ctx.service.deliverPending(TENANT_ID, ['message-1']);

      expect(ctx.argsOf(ctx.calls[0], 'for')).toEqual(['update']);
      expect(ctx.conversationService.insertUserMessage).not.toHaveBeenCalled();
      expect(ctx.eventEmitter.emitAsync).not.toHaveBeenCalled();
    });

    it('pending 行写入接收者对话、置 delivered 并派发', async () => {
      const delivered = makeMessage({
        deliveryStatus: 'delivered',
        agentMessageId: 'agent-message-1',
      });
      const ctx = setup([
        [makeMessage()],
        [{ conversationId: 'conversation-impl', conversationStatus: 'active' }],
        [{ role: 'locator' }],
        [delivered],
      ]);

      await ctx.service.deliverPending(TENANT_ID, ['message-1']);

      expect(ctx.conversationService.insertUserMessage).toHaveBeenCalledWith(
        ctx.db,
        'conversation-impl',
        TENANT_ID,
        {
          content:
            '[来自 locator｜observation]\n问题在 auth.ts\n引用：\n- src/auth.ts',
          contentType: 'text',
          metadata: expect.objectContaining({
            type: 'team_message',
            teamMessageId: 'message-1',
            fromRole: 'locator',
          }),
        },
      );
      expect(ctx.argsOf(ctx.calls[3], 'set')?.[0]).toMatchObject({
        deliveryStatus: 'delivered',
        agentMessageId: 'agent-message-1',
      });
      expect(ctx.eventEmitter.emitAsync).toHaveBeenCalledWith(
        TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT,
        { conversationId: 'conversation-impl', tenantId: TENANT_ID },
      );
      expect(ctx.emitMessageEvents).toHaveBeenCalledWith(TENANT_ID, [
        delivered,
      ]);
    });

    it('接收者对话已结束时置 expired，不写 agent_messages', async () => {
      const expired = makeMessage({ deliveryStatus: 'expired' });
      const ctx = setup([
        [makeMessage()],
        [{ conversationId: 'conversation-impl', conversationStatus: 'ended' }],
        [expired],
      ]);

      await ctx.service.deliverPending(TENANT_ID, ['message-1']);

      expect(ctx.argsOf(ctx.calls[2], 'set')?.[0]).toEqual({
        deliveryStatus: 'expired',
      });
      expect(ctx.conversationService.insertUserMessage).not.toHaveBeenCalled();
      expect(ctx.eventEmitter.emitAsync).not.toHaveBeenCalled();
    });
  });

  it('接收者回合落库后对应消息置 consumed', async () => {
    const consumed = [makeMessage({ deliveryStatus: 'consumed' })];
    const ctx = setup([consumed]);

    await ctx.service.handleTurnPersisted({
      conversationId: 'conversation-impl',
      tenantId: TENANT_ID,
      assistantMessageId: 'assistant-1',
      processedMessageIds: ['agent-message-1'],
      costUsd: null,
      stopReason: 'end_turn',
    });

    expect(ctx.argsOf(ctx.calls[0], 'set')?.[0]).toMatchObject({
      deliveryStatus: 'consumed',
    });
    expect(ctx.emitMessageEvents).toHaveBeenCalledWith(TENANT_ID, consumed);
  });

  it('清扫：过期 pending 置 expired、超时 pending 重投、未消费 delivered 重新派发', async () => {
    const expired = [
      makeMessage({ id: 'expired-1', deliveryStatus: 'expired' }),
    ];
    const ctx = setup([
      expired,
      [{ id: 'stale-1', tenantId: TENANT_ID }],
      [{ conversationId: 'conversation-impl', tenantId: TENANT_ID }],
    ]);
    const deliver = vi
      .spyOn(ctx.service, 'deliverPending')
      .mockResolvedValue(undefined);

    await ctx.service.sweep();

    expect(ctx.argsOf(ctx.calls[0], 'set')?.[0]).toEqual({
      deliveryStatus: 'expired',
    });
    expect(ctx.emitMessageEvents).toHaveBeenCalledWith(TENANT_ID, expired);
    expect(deliver).toHaveBeenCalledWith(TENANT_ID, ['stale-1']);
    expect(ctx.calls[2].op).toBe('selectDistinct');
    expect(ctx.eventEmitter.emitAsync).toHaveBeenCalledWith(
      TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT,
      { conversationId: 'conversation-impl', tenantId: TENANT_ID },
    );
  });
});

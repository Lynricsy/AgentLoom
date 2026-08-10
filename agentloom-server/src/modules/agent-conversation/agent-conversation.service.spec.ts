import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../database/database.module';
import { AgentConversationService } from './agent-conversation.service';
import type { SendMessageDto } from './dto/send-message.dto';

const tenantTransactionMocks = vi.hoisted(() => ({
  hasActiveTenantTransaction: vi.fn(() => false),
  registerAfterCommitHook: vi.fn(),
}));

vi.mock('../../common/interceptors/tenant-transaction.context', async () => {
  const actual = await vi.importActual<
    typeof import('../../common/interceptors/tenant-transaction.context')
  >('../../common/interceptors/tenant-transaction.context');

  return {
    ...actual,
    hasActiveTenantTransaction:
      tenantTransactionMocks.hasActiveTenantTransaction,
    registerAfterCommitHook: tenantTransactionMocks.registerAfterCommitHook,
  };
});

type MockFn = ReturnType<typeof vi.fn>;

interface MockDb {
  select: MockFn;
  insert: MockFn;
  update: MockFn;
  transaction: MockFn;
}

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const AGENT_ID = '33333333-3333-4333-8333-333333333333';
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const MESSAGE_ID = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2025-01-01T00:00:00.000Z');

function createConversationRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: CONVERSATION_ID,
    agentDefinitionId: AGENT_ID,
    tenantId: TENANT_ID,
    title: '测试对话',
    status: 'active',
    metadata: {},
    createdBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createMessageRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    tenantId: TENANT_ID,
    role: 'user',
    contentType: 'text',
    content: '你好',
    toolCalls: null,
    toolResults: null,
    metadata: {},
    createdAt: NOW,
    ...overrides,
  };
}

function createSelectChain(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function createPaginatedSelectChain(result: unknown) {
  const offset = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, orderBy, limit, offset };
}

function createCountSelectChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });
  return { from, where };
}

function createInsertChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });
  return { values, returning };
}

function createUpdateChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { set, where, returning };
}

function createUpdateNoReturnChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  return { set, where };
}

describe('AgentConversationService', () => {
  let module: TestingModule;
  let service: AgentConversationService;
  let db: MockDb;
  let mockEventEmitter: { emit: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    tenantTransactionMocks.hasActiveTenantTransaction.mockReturnValue(false);
    tenantTransactionMocks.registerAfterCommitHook.mockImplementation(() => {});

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(async (callback: (tx: MockDb) => unknown) =>
        callback(db),
      ),
    };

    mockEventEmitter = { emit: vi.fn() };

    module = await Test.createTestingModule({
      providers: [
        AgentConversationService,
        { provide: DRIZZLE, useValue: db },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get(AgentConversationService);
  });

  afterEach(async () => {
    await module.close();
    vi.useRealTimers();
  });

  describe('create', () => {
    it('应校验 Agent 存在后创建对话并返回序列化结果', async () => {
      const agentSelectChain = createSelectChain([{ id: AGENT_ID }]);
      const created = createConversationRecord();
      const insertChain = createInsertChain([created]);

      db.select.mockReturnValueOnce(agentSelectChain);
      db.insert.mockReturnValueOnce(insertChain);

      const result = await service.create(AGENT_ID, TENANT_ID, USER_ID, {
        title: '测试对话',
      });

      expect(insertChain.values).toHaveBeenCalledWith({
        agentDefinitionId: AGENT_ID,
        tenantId: TENANT_ID,
        title: '测试对话',
        metadata: {},
        createdBy: USER_ID,
      });
      expect(result.data).toMatchObject({
        id: CONVERSATION_ID,
        agentDefinitionId: AGENT_ID,
        status: 'active',
        title: '测试对话',
      });
    });

    it('Agent 不存在时应抛出 NotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.create(AGENT_ID, TENANT_ID, USER_ID, {}),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('title 为空时应使用 undefined', async () => {
      db.select.mockReturnValueOnce(createSelectChain([{ id: AGENT_ID }]));
      const created = createConversationRecord({ title: null });
      db.insert.mockReturnValueOnce(createInsertChain([created]));

      const result = await service.create(AGENT_ID, TENANT_ID, USER_ID, {});

      expect(result.data).toBeDefined();
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('startConversation', () => {
    it('应在同一流程内创建对话并写入首条消息', async () => {
      const agentSelectChain = createSelectChain([{ id: AGENT_ID }]);
      const created = createConversationRecord({ title: null });
      const conversationInsertChain = createInsertChain([created]);
      const messageInsertChain = createInsertChain([
        createMessageRecord({
          content: '请开始处理',
          contentType: 'text',
        }),
      ]);
      const updatedAtChain = createUpdateNoReturnChain();

      db.select.mockReturnValueOnce(agentSelectChain);
      db.insert
        .mockReturnValueOnce(conversationInsertChain)
        .mockReturnValueOnce(messageInsertChain);
      db.update.mockReturnValueOnce(updatedAtChain);

      const result = await service.startConversation(
        AGENT_ID,
        TENANT_ID,
        USER_ID,
        {
          content: '请开始处理',
          contentType: 'text',
        },
      );

      expect(result.data).toMatchObject({
        id: CONVERSATION_ID,
        agentDefinitionId: AGENT_ID,
        status: 'active',
      });
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(messageInsertChain.values).toHaveBeenCalledWith({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        role: 'user',
        content: '请开始处理',
        contentType: 'text',
        metadata: {},
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'agent-conversation.message-sent',
        expect.objectContaining({
          conversationId: CONVERSATION_ID,
          tenantId: TENANT_ID,
        }),
      );
    });

    it('首条消息写入失败时应终止整次 start 流程且不发出消息事件', async () => {
      const agentSelectChain = createSelectChain([{ id: AGENT_ID }]);
      const created = createConversationRecord({ title: null });
      const conversationInsertChain = createInsertChain([created]);
      const messageInsertChain = createInsertChain([]);
      const sendError = new Error('message insert failed');

      messageInsertChain.values.mockReturnValueOnce({
        returning: vi.fn().mockRejectedValueOnce(sendError),
      });

      db.select.mockReturnValueOnce(agentSelectChain);
      db.insert
        .mockReturnValueOnce(conversationInsertChain)
        .mockReturnValueOnce(messageInsertChain);

      await expect(
        service.startConversation(AGENT_ID, TENANT_ID, USER_ID, {
          content: '请开始处理',
          contentType: 'text',
        }),
      ).rejects.toThrow(sendError);

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
        'agent-conversation.message-sent',
        expect.anything(),
      );
    });
  });

  describe('listByAgent', () => {
    it('应返回分页对话列表', async () => {
      const conversations = [
        createConversationRecord(),
        createConversationRecord({
          id: '66666666-6666-4666-8666-666666666666',
          title: '第二个对话',
        }),
      ];
      const listChain = createPaginatedSelectChain(conversations);
      const countChain = createCountSelectChain([{ total: 5 }]);

      db.select.mockReturnValueOnce(listChain).mockReturnValueOnce(countChain);

      const result = await service.listByAgent(AGENT_ID, {
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({
        total: 5,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });

    it('带 status 过滤时应正常工作', async () => {
      const listChain = createPaginatedSelectChain([]);
      const countChain = createCountSelectChain([{ total: 0 }]);

      db.select.mockReturnValueOnce(listChain).mockReturnValueOnce(countChain);

      const result = await service.listByAgent(AGENT_ID, {
        page: 1,
        limit: 20,
        status: 'active',
      });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('offset 应基于 page 和 limit 计算', async () => {
      const listChain = createPaginatedSelectChain([]);
      const countChain = createCountSelectChain([{ total: 0 }]);

      db.select.mockReturnValueOnce(listChain).mockReturnValueOnce(countChain);

      await service.listByAgent(AGENT_ID, {
        page: 3,
        limit: 10,
      });

      expect(listChain.limit).toHaveBeenCalledWith(10);
      expect(listChain.offset).toHaveBeenCalledWith(20);
    });
  });

  describe('getDetail', () => {
    it('应返回对话详情和分页消息', async () => {
      const conversation = createConversationRecord();
      const messages = [createMessageRecord()];
      const convChain = createSelectChain([conversation]);
      const msgChain = createPaginatedSelectChain(messages);
      const msgCountChain = createCountSelectChain([{ total: 1 }]);

      db.select
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(msgChain)
        .mockReturnValueOnce(msgCountChain);

      const result = await service.getDetail(CONVERSATION_ID);

      expect(result.data).toMatchObject({
        id: CONVERSATION_ID,
        messages: {
          data: expect.arrayContaining([
            expect.objectContaining({ id: MESSAGE_ID }),
          ]),
          meta: {
            total: 1,
            page: 1,
            pageSize: 50,
            totalPages: 1,
          },
        },
      });
    });

    it('对话不存在时应抛出 NotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(service.getDetail(CONVERSATION_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('应支持自定义消息分页参数', async () => {
      const convChain = createSelectChain([createConversationRecord()]);
      const msgChain = createPaginatedSelectChain([]);
      const msgCountChain = createCountSelectChain([{ total: 0 }]);

      db.select
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(msgChain)
        .mockReturnValueOnce(msgCountChain);

      const result = await service.getDetail(CONVERSATION_ID, 2, 10);

      expect(result.data.messages.meta).toMatchObject({
        page: 2,
        pageSize: 10,
      });
    });
  });

  describe('sendMessage', () => {
    it('应在活跃对话中发送消息并更新 updatedAt', async () => {
      const convChain = createSelectChain([
        { id: CONVERSATION_ID, status: 'active' },
      ]);
      const message = createMessageRecord();
      const insertChain = createInsertChain([message]);
      const updateChain = createUpdateNoReturnChain();

      db.select.mockReturnValueOnce(convChain);
      db.insert.mockReturnValueOnce(insertChain);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.sendMessage(CONVERSATION_ID, TENANT_ID, {
        content: '你好',
      } as any);

      expect(insertChain.values).toHaveBeenCalledWith({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        role: 'user',
        contentType: 'text',
        content: '你好',
        metadata: {},
      });
      expect(result.data).toMatchObject({
        id: MESSAGE_ID,
        content: '你好',
        contentType: 'text',
        role: 'user',
      });
      expect(updateChain.set).toHaveBeenCalledWith({
        updatedAt: NOW,
      });
    });

    it('对话不存在时应抛出 NotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.sendMessage(CONVERSATION_ID, TENANT_ID, {
          content: '你好',
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('对话非活跃时应抛出 NotFoundException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([{ id: CONVERSATION_ID, status: 'ended' }]),
      );

      await expect(
        service.sendMessage(CONVERSATION_ID, TENANT_ID, {
          content: '你好',
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('应使用 dto 中的 role', async () => {
      const convChain = createSelectChain([
        { id: CONVERSATION_ID, status: 'active' },
      ]);
      const message = createMessageRecord({ role: 'system' });
      const insertChain = createInsertChain([message]);
      const updateChain = createUpdateNoReturnChain();

      db.select.mockReturnValueOnce(convChain);
      db.insert.mockReturnValueOnce(insertChain);
      db.update.mockReturnValueOnce(updateChain);

      await service.sendMessage(CONVERSATION_ID, TENANT_ID, {
        content: '系统消息',
        role: 'system',
      } as any);

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'system', contentType: 'text' }),
      );
    });

    it('应持久化图片消息的 contentType 与 attachment 元数据', async () => {
      const convChain = createSelectChain([
        { id: CONVERSATION_ID, status: 'active' },
      ]);
      const message = createMessageRecord({
        contentType: 'image',
        content: '请看这张图',
        metadata: {
          contentType: 'image',
          attachment: {
            kind: 'image',
            fileName: 'design.png',
            mimeType: 'image/png',
            sizeBytes: 32,
            dataBase64: 'cG5n',
          },
        },
      });
      const insertChain = createInsertChain([message]);
      const updateChain = createUpdateNoReturnChain();

      db.select.mockReturnValueOnce(convChain);
      db.insert.mockReturnValueOnce(insertChain);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.sendMessage(CONVERSATION_ID, TENANT_ID, {
        content: '请看这张图',
        contentType: 'image',
        metadata: {
          attachment: {
            kind: 'image',
            fileName: 'design.png',
            mimeType: 'image/png',
            sizeBytes: 32,
            dataBase64: 'cG5n',
          },
        },
      } as any);

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'image',
          metadata: {
            contentType: 'image',
            attachments: [
              {
                kind: 'image',
                fileName: 'design.png',
                mimeType: 'image/png',
                sizeBytes: 32,
                dataBase64: 'cG5n',
              },
            ],
            attachment: {
              kind: 'image',
              fileName: 'design.png',
              mimeType: 'image/png',
              sizeBytes: 32,
              dataBase64: 'cG5n',
            },
          },
        }),
      );
      expect(result.data).toMatchObject({
        id: MESSAGE_ID,
        contentType: 'image',
      });
    });

    it('应持久化多附件消息并保留 attachments 元数据', async () => {
      const convChain = createSelectChain([
        { id: CONVERSATION_ID, status: 'active' },
      ]);
      const message = createMessageRecord({
        contentType: 'text',
        content: '请同时查看这两个附件',
        metadata: {
          contentType: 'text',
          attachments: [
            {
              kind: 'image',
              fileName: 'design.png',
              mimeType: 'image/png',
              sizeBytes: 32,
              dataBase64: 'cG5n',
            },
            {
              kind: 'file',
              fileName: 'notes.txt',
              mimeType: 'text/plain',
              sizeBytes: 24,
              textContent: 'ATTACH-QA-20260406',
            },
          ],
        },
      });
      const insertChain = createInsertChain([message]);
      const updateChain = createUpdateNoReturnChain();

      db.select.mockReturnValueOnce(convChain);
      db.insert.mockReturnValueOnce(insertChain);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.sendMessage(CONVERSATION_ID, TENANT_ID, {
        content: '请同时查看这两个附件',
        contentType: 'text',
        metadata: {
          attachments: [
            {
              kind: 'image',
              fileName: 'design.png',
              mimeType: 'image/png',
              sizeBytes: 32,
              dataBase64: 'cG5n',
            },
            {
              kind: 'file',
              fileName: 'notes.txt',
              mimeType: 'text/plain',
              sizeBytes: 24,
              textContent: 'ATTACH-QA-20260406',
            },
          ],
        },
      } as any);

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'text',
          metadata: {
            contentType: 'text',
            attachments: [
              {
                kind: 'image',
                fileName: 'design.png',
                mimeType: 'image/png',
                sizeBytes: 32,
                dataBase64: 'cG5n',
              },
              {
                kind: 'file',
                fileName: 'notes.txt',
                mimeType: 'text/plain',
                sizeBytes: 24,
                textContent: 'ATTACH-QA-20260406',
              },
            ],
          },
        }),
      );
      expect(result.data).toMatchObject({
        id: MESSAGE_ID,
        contentType: 'text',
      });
    });

    it('多附件总量超过 10 MB 时应拒绝写入', async () => {
      const convChain = createSelectChain([
        { id: CONVERSATION_ID, status: 'active' },
      ]);
      db.select.mockReturnValueOnce(convChain);

      await expect(
        service.sendMessage(CONVERSATION_ID, TENANT_ID, {
          content: '这是超限附件集合',
          contentType: 'text',
          metadata: {
            attachments: [
              {
                kind: 'file',
                fileName: 'a.bin',
                mimeType: 'application/octet-stream',
                sizeBytes: 6_000_000,
                dataBase64: 'YQ==',
              },
              {
                kind: 'file',
                fileName: 'b.bin',
                mimeType: 'application/octet-stream',
                sizeBytes: 5_000_001,
                dataBase64: 'Yg==',
              },
            ],
          },
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('应将活跃对话状态更新为 ended', async () => {
      const updated = createConversationRecord({ status: 'ended' });
      const updateChain = createUpdateChain([updated]);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.cancel(CONVERSATION_ID);

      expect(updateChain.set).toHaveBeenCalledWith({
        status: 'ended',
        updatedAt: NOW,
      });
      expect(result.data).toMatchObject({
        id: CONVERSATION_ID,
        status: 'ended',
      });
    });

    it('活跃对话不存在时应抛出 NotFoundException', async () => {
      db.update.mockReturnValueOnce(createUpdateChain([]));

      await expect(service.cancel(CONVERSATION_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('取消对话后应发出 agent-conversation.ended 事件并携带正确载荷', async () => {
      const updated = createConversationRecord({ status: 'ended' });
      const updateChain = createUpdateChain([updated]);
      db.update.mockReturnValueOnce(updateChain);

      await service.cancel(CONVERSATION_ID);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'agent-conversation.ended',
        {
          conversationId: CONVERSATION_ID,
          tenantId: TENANT_ID,
          organizationId: TENANT_ID,
          userId: USER_ID,
        },
      );
    });

    it('事务内取消对话时应注册 after-commit hook，而不是提前发事件', async () => {
      const updated = createConversationRecord({ status: 'ended' });
      const updateChain = createUpdateChain([updated]);
      db.update.mockReturnValueOnce(updateChain);
      tenantTransactionMocks.hasActiveTenantTransaction.mockReturnValue(true);

      let afterCommitHook: (() => Promise<void>) | undefined;
      tenantTransactionMocks.registerAfterCommitHook.mockImplementation(
        (hook: () => Promise<void>) => {
          afterCommitHook = hook;
        },
      );

      await service.cancel(CONVERSATION_ID);

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
      expect(
        tenantTransactionMocks.registerAfterCommitHook,
      ).toHaveBeenCalledTimes(1);

      await afterCommitHook?.();

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'agent-conversation.ended',
        {
          conversationId: CONVERSATION_ID,
          tenantId: TENANT_ID,
          organizationId: TENANT_ID,
          userId: USER_ID,
        },
      );
    });
  });

  describe('end', () => {
    it('应将对话状态更新为 ended', async () => {
      const updated = createConversationRecord({ status: 'ended' });
      const updateChain = createUpdateChain([updated]);
      db.update.mockReturnValueOnce(updateChain);

      await expect(service.end(CONVERSATION_ID)).resolves.toBeUndefined();

      expect(updateChain.set).toHaveBeenCalledWith({
        status: 'ended',
        updatedAt: NOW,
      });
    });

    it('对话不存在时应抛出 NotFoundException', async () => {
      db.update.mockReturnValueOnce(createUpdateChain([]));

      await expect(service.end(CONVERSATION_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('结束对话后应发出 agent-conversation.ended 事件并携带正确载荷', async () => {
      const updated = createConversationRecord({ status: 'ended' });
      const updateChain = createUpdateChain([updated]);
      db.update.mockReturnValueOnce(updateChain);

      await service.end(CONVERSATION_ID);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'agent-conversation.ended',
        {
          conversationId: CONVERSATION_ID,
          tenantId: TENANT_ID,
          organizationId: TENANT_ID,
          userId: USER_ID,
        },
      );
    });

    it('事务内结束对话时应注册 after-commit hook，而不是提前发事件', async () => {
      const updated = createConversationRecord({ status: 'ended' });
      const updateChain = createUpdateChain([updated]);
      db.update.mockReturnValueOnce(updateChain);
      tenantTransactionMocks.hasActiveTenantTransaction.mockReturnValue(true);

      let afterCommitHook: (() => Promise<void>) | undefined;
      tenantTransactionMocks.registerAfterCommitHook.mockImplementation(
        (hook: () => Promise<void>) => {
          afterCommitHook = hook;
        },
      );

      await service.end(CONVERSATION_ID);

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
      expect(
        tenantTransactionMocks.registerAfterCommitHook,
      ).toHaveBeenCalledTimes(1);

      await afterCommitHook?.();

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'agent-conversation.ended',
        {
          conversationId: CONVERSATION_ID,
          tenantId: TENANT_ID,
          organizationId: TENANT_ID,
          userId: USER_ID,
        },
      );
    });
  });

  describe('listMessages', () => {
    it('应按页返回序列化消息并计算总页数', async () => {
      const conversationChain = createSelectChain([{ id: CONVERSATION_ID }]);
      const messagesChain = createPaginatedSelectChain([createMessageRecord()]);
      const countChain = createCountSelectChain([{ total: 21 }]);
      db.select
        .mockReturnValueOnce(conversationChain)
        .mockReturnValueOnce(messagesChain)
        .mockReturnValueOnce(countChain);

      const result = await service.listMessages(CONVERSATION_ID, 3, 10);

      expect(messagesChain.limit).toHaveBeenCalledWith(10);
      expect(messagesChain.offset).toHaveBeenCalledWith(20);
      expect(result.data).toEqual([
        expect.objectContaining({ id: MESSAGE_ID, content: '你好' }),
      ]);
      expect(result.meta).toEqual({
        total: 21,
        page: 3,
        pageSize: 10,
        totalPages: 3,
      });
    });

    it('对话不存在时应拒绝读取消息', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(service.listMessages(CONVERSATION_ID)).rejects.toThrow(
        `Conversation ${CONVERSATION_ID} not found`,
      );
    });
  });

  describe('getPermissionResolutionTarget', () => {
    function createPermissionTargetSelectChain(result: unknown[]) {
      const limit = vi.fn().mockResolvedValue(result);
      const where = vi.fn().mockReturnValue({ limit });
      const innerJoin = vi.fn().mockReturnValue({ where });
      const from = vi.fn().mockReturnValue({ innerJoin });
      return { from, innerJoin, where, limit };
    }

    it('应返回定义的运行模式和 execution sessionId', async () => {
      db.select.mockReturnValueOnce(
        createPermissionTargetSelectChain([
          {
            id: CONVERSATION_ID,
            runtimeMode: 'no_sandbox',
            metadata: {
              execution: {
                sessionId: 'session-1',
                executionId: 'execution-1',
              },
            },
          },
        ]),
      );

      await expect(
        service.getPermissionResolutionTarget(CONVERSATION_ID),
      ).resolves.toEqual({
        runtimeMode: 'no_sandbox',
        sessionId: 'session-1',
      });
    });

    it.each([
      { metadata: null, runtimeMode: null },
      { metadata: [], runtimeMode: undefined },
      { metadata: { execution: null }, runtimeMode: 'sandbox' },
      { metadata: { execution: 'invalid' }, runtimeMode: 'sandbox' },
      { metadata: { unrelated: true }, runtimeMode: 'sandbox' },
    ])('无有效 execution metadata 时仅返回安全运行模式 %#', async (row) => {
      db.select.mockReturnValueOnce(
        createPermissionTargetSelectChain([
          {
            id: CONVERSATION_ID,
            ...row,
          },
        ]),
      );

      await expect(
        service.getPermissionResolutionTarget(CONVERSATION_ID),
      ).resolves.toEqual({ runtimeMode: row.runtimeMode ?? 'sandbox' });
    });

    it('对话不存在时应抛出 NotFoundException', async () => {
      db.select.mockReturnValueOnce(createPermissionTargetSelectChain([]));

      await expect(
        service.getPermissionResolutionTarget(CONVERSATION_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateConversation', () => {
    it('应同时更新标题、metadata 和 updatedAt', async () => {
      const updated = createConversationRecord({
        title: '新标题',
        metadata: { pinned: true },
      });
      const updateChain = createUpdateChain([updated]);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.updateConversation(
        CONVERSATION_ID,
        TENANT_ID,
        {
          title: '新标题',
          metadata: { pinned: true },
        },
      );

      expect(updateChain.set).toHaveBeenCalledWith({
        title: '新标题',
        metadata: { pinned: true },
        updatedAt: NOW,
      });
      expect(result.data).toMatchObject({
        id: CONVERSATION_ID,
        title: '新标题',
        metadata: { pinned: true },
      });
    });

    it('空更新只应刷新 updatedAt，且找不到对话时抛错', async () => {
      const updateChain = createUpdateChain([]);
      db.update.mockReturnValueOnce(updateChain);

      await expect(
        service.updateConversation(CONVERSATION_ID, TENANT_ID, {}),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(updateChain.set).toHaveBeenCalledWith({ updatedAt: NOW });
    });
  });

  it('附件类型与请求类型不一致时应拒绝且不持久化', async () => {
    db.select.mockReturnValueOnce(
      createSelectChain([{ id: CONVERSATION_ID, status: 'active' }]),
    );

    const dto = {
      content: '附件',
      role: 'user',
      contentType: 'image',
      metadata: {
        attachments: [
          {
            kind: 'file',
            fileName: 'notes.txt',
            mimeType: 'text/plain',
            sizeBytes: 5,
            textContent: 'notes',
          },
        ],
      },
    } satisfies SendMessageDto;
    await expect(
      service.sendMessage(CONVERSATION_ID, TENANT_ID, dto),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});

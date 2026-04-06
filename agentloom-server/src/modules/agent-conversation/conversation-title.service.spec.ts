import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversationTitleService } from './conversation-title.service';

const { mockGenerateText, mockGetTenantDb, mockRunInTenantTransaction } =
  vi.hoisted(() => ({
    mockGenerateText: vi.fn(),
    mockGetTenantDb: vi.fn((db: unknown) => db),
    mockRunInTenantTransaction: vi.fn(
      async (
        db: unknown,
        _tenantId: string,
        operation: (dbClient: unknown) => Promise<unknown>,
      ) => operation(db),
    ),
  }));

vi.mock('ai', () => ({
  generateText: mockGenerateText,
}));

vi.mock('../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: mockRunInTenantTransaction,
}));

vi.mock('../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mockGetTenantDb,
}));

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

function createUpdateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ id: 'conversation-1' }]),
  };
}

describe('ConversationTitleService', () => {
  let mockDb: {
    select: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mockLlmService: {
    findById: ReturnType<typeof vi.fn>;
    findDefaultByType: ReturnType<typeof vi.fn>;
  };
  let mockPiAiAdapter: {
    getModel: ReturnType<typeof vi.fn>;
  };
  let mockUserPreferenceService: {
    findByUser: ReturnType<typeof vi.fn>;
  };
  let mockAgentDefinitionService: {
    buildRuntimeConfigFromNodes: ReturnType<typeof vi.fn>;
  };
  let mockEventEmitter: {
    emit: ReturnType<typeof vi.fn>;
  };
  let service: ConversationTitleService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn(),
      update: vi.fn(),
    };
    mockLlmService = {
      findById: vi.fn(),
      findDefaultByType: vi.fn(),
    };
    mockPiAiAdapter = {
      getModel: vi.fn(),
    };
    mockUserPreferenceService = {
      findByUser: vi.fn(),
    };
    mockAgentDefinitionService = {
      buildRuntimeConfigFromNodes: vi.fn(),
    };
    mockEventEmitter = {
      emit: vi.fn(),
    };

    mockRunInTenantTransaction.mockImplementation(
      async (
        db: unknown,
        _tenantId: string,
        operation: (dbClient: unknown) => Promise<unknown>,
      ) => operation(db),
    );
    mockGetTenantDb.mockReturnValue(mockDb as never);

    service = new ConversationTitleService(
      mockDb as never,
      mockLlmService as never,
      mockPiAiAdapter as never,
      mockUserPreferenceService as never,
      mockAgentDefinitionService as never,
      mockEventEmitter as never,
    );
  });

  it('LLM 正常时使用模型生成的标题', async () => {
    const selectChain = createSelectChain([
      { role: 'user', content: '这是异步子代理链路验证' },
      { role: 'assistant', content: '已收到请求' },
    ]);
    const conversationSelectChain = createSelectChain([]);
    const updateChain = createUpdateChain();
    mockDb.select
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(conversationSelectChain);
    mockDb.update.mockReturnValue(updateChain);
    mockUserPreferenceService.findByUser.mockResolvedValue(null);
    mockLlmService.findDefaultByType.mockResolvedValue({ id: 'model-1' });
    mockPiAiAdapter.getModel.mockResolvedValue({ provider: 'mock' });
    mockGenerateText.mockResolvedValue({ text: '🧪 异步子代理' });

    const title = await service.generateTitle(
      'conversation-1',
      'tenant-1',
      'user-1',
    );

    expect(title).toBe('🧪 异步子代理');
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '🧪 异步子代理',
        updatedAt: expect.any(Date),
      }),
    );
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'conversation.title.updated',
      {
        conversationId: 'conversation-1',
        tenantId: 'tenant-1',
        title: '🧪 异步子代理',
      },
    );
    expect(mockRunInTenantTransaction).toHaveBeenCalledWith(
      mockDb,
      'tenant-1',
      expect.any(Function),
    );
  });

  it('标题偏好失效时应回退到会话所属 Agent 的运行模型', async () => {
    const messageSelectChain = createSelectChain([
      { role: 'user', content: '请帮我检查标题总结链路' },
      { role: 'assistant', content: '我先排查模型解析路径' },
    ]);
    const conversationSelectChain = createSelectChain([
      { agentDefinitionId: 'agent-1' },
    ]);
    const definitionSelectChain = createSelectChain([
      {
        id: 'agent-1',
        publishedVersionId: null,
        nodes: [{ id: 'llm-node-1' }],
        edges: [],
        runtimeMode: 'sandbox',
      },
    ]);
    const updateChain = createUpdateChain();

    mockDb.select
      .mockReturnValueOnce(messageSelectChain)
      .mockReturnValueOnce(conversationSelectChain)
      .mockReturnValueOnce(definitionSelectChain);
    mockDb.update.mockReturnValue(updateChain);
    mockUserPreferenceService.findByUser.mockResolvedValue({
      titleModelConfigId: 'pref-model',
    });
    mockAgentDefinitionService.buildRuntimeConfigFromNodes.mockReturnValue({
      modelConfig: { modelId: 'agent-model' },
    });
    mockLlmService.findById
      .mockRejectedValueOnce(new Error('标题模型不存在'))
      .mockResolvedValueOnce({ id: 'agent-model' });
    mockPiAiAdapter.getModel.mockResolvedValue({ provider: 'mock' });
    mockGenerateText.mockResolvedValue({ text: '🦊 标题链路排查' });

    const title = await service.generateTitle(
      'conversation-1',
      'tenant-1',
      'user-1',
    );

    expect(title).toBe('🦊 标题链路排查');
    expect(mockLlmService.findById).toHaveBeenNthCalledWith(
      1,
      'pref-model',
      'tenant-1',
    );
    expect(mockLlmService.findById).toHaveBeenNthCalledWith(
      2,
      'agent-model',
      'tenant-1',
    );
    expect(mockLlmService.findDefaultByType).not.toHaveBeenCalled();
    expect(
      mockAgentDefinitionService.buildRuntimeConfigFromNodes,
    ).toHaveBeenCalledWith([{ id: 'llm-node-1' }], [], 'agent-1', 'sandbox');
  });

  it('LLM 调用失败时回退到首条用户消息摘要标题', async () => {
    const messageSelectChain = createSelectChain([
      { role: 'user', content: '0123456789abcdefghijk' },
      { role: 'assistant', content: '已收到请求' },
    ]);
    const conversationSelectChain = createSelectChain([]);
    const updateChain = createUpdateChain();
    mockDb.select
      .mockReturnValueOnce(messageSelectChain)
      .mockReturnValueOnce(conversationSelectChain);
    mockDb.update.mockReturnValue(updateChain);
    mockUserPreferenceService.findByUser.mockResolvedValue(null);
    mockLlmService.findDefaultByType.mockResolvedValue({ id: 'model-1' });
    mockPiAiAdapter.getModel.mockResolvedValue({ provider: 'mock' });
    mockGenerateText.mockRejectedValue(new Error('LLM 提供商错误'));

    const title = await service.generateTitle(
      'conversation-1',
      'tenant-1',
      'user-1',
    );

    expect(title).toBe('💬 0123456789abc…');
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '💬 0123456789abc…',
        updatedAt: expect.any(Date),
      }),
    );
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'conversation.title.updated',
      {
        conversationId: 'conversation-1',
        tenantId: 'tenant-1',
        title: '💬 0123456789abc…',
      },
    );
  });

  it('没有任何消息时返回 null 且不更新标题', async () => {
    const selectChain = createSelectChain([]);
    mockDb.select.mockReturnValue(selectChain);

    const title = await service.generateTitle(
      'conversation-1',
      'tenant-1',
      'user-1',
    );

    expect(title).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
  });
});

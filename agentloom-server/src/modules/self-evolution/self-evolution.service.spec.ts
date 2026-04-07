import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SelfEvolutionService } from './self-evolution.service';
import type { AgentSession } from '../agent/types/agent-session.types';
import type { SelfEvolutionSessionContext } from './self-evolution.types';

const {
  mockTenantDb,
  selectResults,
  insertResults,
  insertValuesCalls,
  updateSetCalls,
  selectChain,
  insertChain,
  updateChain,
} = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const insertResults: unknown[][] = [];
  const insertValuesCalls: Array<Record<string, unknown>> = [];
  const updateSetCalls: Array<Record<string, unknown>> = [];

  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(async () => selectResults.shift() ?? []),
    orderBy: vi
      .fn()
      .mockImplementation(async () => selectResults.shift() ?? []),
  };

  const insertChain = {
    values: vi.fn().mockImplementation((value: Record<string, unknown>) => {
      insertValuesCalls.push(value);
      return insertChain;
    }),
    returning: vi
      .fn()
      .mockImplementation(async () => insertResults.shift() ?? []),
  };

  const updateChain = {
    set: vi.fn().mockImplementation((value: Record<string, unknown>) => {
      updateSetCalls.push(value);
      return updateChain;
    }),
    where: vi.fn().mockResolvedValue([]),
  };

  const mockTenantDb = {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
  };

  return {
    mockTenantDb,
    selectResults,
    insertResults,
    insertValuesCalls,
    updateSetCalls,
    selectChain,
    insertChain,
    updateChain,
  };
});

vi.mock('../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn(() => mockTenantDb),
}));

function enqueueSelectResult(result: unknown[]) {
  selectResults.push(result);
}

function enqueueInsertResult(result: unknown[]) {
  insertResults.push(result);
}

function makeContext(
  overrides: Partial<SelfEvolutionSessionContext> = {},
): SelfEvolutionSessionContext {
  return {
    sessionId: 'session-1',
    conversationId: 'conversation-1',
    tenantId: 'tenant-1',
    actorUserId: 'user-1',
    currentAgentDefinitionId: 'agent-1',
    currentAgentName: '当前 Agent',
    selfEvolutionPolicy: {
      enabled: true,
      resourceManagement: true,
      externalEditing: true,
      sandboxManagement: true,
    },
    runtimeConfig: {},
    ...overrides,
  };
}

function makeSession(): AgentSession {
  return {
    id: 'session-1',
    agentId: 'agent-1',
    mode: 'conversation',
    context: {
      history: [],
      serverSandbox: {
        agentConversationId: 'conversation-1',
      },
    },
    status: 'active',
    tenantId: 'tenant-1',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
}

describe('SelfEvolutionService', () => {
  let service: SelfEvolutionService;
  let mockAgentDefinitionService: {
    findDetailById: ReturnType<typeof vi.fn>;
    applyCanvasSnapshot: ReturnType<typeof vi.fn>;
  };
  let mockSkillService: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockLlmService: {
    createModelConfig: ReturnType<typeof vi.fn>;
  };
  let mockLlmProviderService: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockMcpService: {
    importTools: ReturnType<typeof vi.fn>;
  };
  let mockWorkspaceService: {
    resolveOrganizationId: ReturnType<typeof vi.fn>;
    createEmpty: ReturnType<typeof vi.fn>;
  };
  let mockWorkflowVersionService: {
    updateDefinition: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let mockPermissionService: {
    getRememberedDecision: ReturnType<typeof vi.fn>;
    registerPendingRequest: ReturnType<typeof vi.fn>;
    waitForResolution: ReturnType<typeof vi.fn>;
    cloneRememberedPolicies: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    insertResults.length = 0;
    insertValuesCalls.length = 0;
    updateSetCalls.length = 0;
    mockTenantDb.select.mockReturnValue(selectChain);
    mockTenantDb.insert.mockReturnValue(insertChain);
    mockTenantDb.update.mockReturnValue(updateChain);

    mockAgentDefinitionService = {
      findDetailById: vi.fn(),
      applyCanvasSnapshot: vi.fn(),
    };
    mockSkillService = {
      create: vi.fn(),
    };
    mockLlmService = {
      createModelConfig: vi.fn(),
    };
    mockLlmProviderService = {
      create: vi.fn(),
    };
    mockMcpService = {
      importTools: vi.fn(),
    };
    mockWorkspaceService = {
      resolveOrganizationId: vi.fn(),
      createEmpty: vi.fn(),
    };
    mockWorkflowVersionService = {
      updateDefinition: vi.fn(),
      publish: vi.fn(),
      create: vi.fn(),
    };
    mockPermissionService = {
      getRememberedDecision: vi.fn().mockResolvedValue(null),
      registerPendingRequest: vi.fn(),
      waitForResolution: vi.fn(),
      cloneRememberedPolicies: vi.fn().mockResolvedValue(undefined),
    };

    service = new SelfEvolutionService(
      mockTenantDb as never,
      mockAgentDefinitionService as never,
      mockSkillService as never,
      mockLlmService as never,
      mockLlmProviderService as never,
      mockMcpService as never,
      mockWorkspaceService as never,
      mockWorkflowVersionService as never,
      mockPermissionService as never,
    );
  });

  it('低风险 apply_change preflight 应直接应用，无需等待审批', async () => {
    const context = makeContext();
    vi.spyOn(service as any, 'buildSessionContext').mockResolvedValue(context);
    const applyChangeSpy = vi
      .spyOn(service as any, 'applyChange')
      .mockResolvedValue({
        success: true,
        data: {
          targetType: 'agent',
          applied: true,
        },
      });

    const result = await service.handleSessionToolPreflight(
      makeSession(),
      'apply_change',
      'tool-call-1',
      {
        proposal: {
          domain: 'self_evolution',
          targetKind: 'self',
          targetId: 'agent-1',
          targetLabel: '当前 Agent',
          baseVersion: 3,
          publishTarget: false,
          nodeOperations: [],
          edgeOperations: [],
          summary: '新增一个 skill 节点',
          category: 'agent_self_canvas_edit',
          riskLevel: 'low',
          requiresConfirmation: false,
          diffPreview: {
            summary: '新增一个 skill 节点',
          },
        },
      },
    );

    expect(mockPermissionService.registerPendingRequest).not.toHaveBeenCalled();
    expect(applyChangeSpy).toHaveBeenCalledWith(context, {
      proposal: expect.any(Object),
    });
    expect(result).toEqual({
      result: {
        success: true,
        data: {
          targetType: 'agent',
          applied: true,
        },
      },
    });
  });

  it('proposeChange 应识别仅按 nodeId 局部更新的 sandbox 节点为高风险审批', async () => {
    vi.spyOn(service as any, 'loadGraphTarget').mockResolvedValueOnce({
      kind: 'agent',
      id: 'agent-1',
      label: '当前 Agent',
      version: 16,
      publishedVersionId: 'version-16',
      nodes: [
        {
          id: 'sandbox-1',
          type: 'tool',
          data: {
            nodeType: 'sandbox',
            cpuLimit: 2,
            memoryLimitMb: 1536,
            diskLimitGb: 5,
            timeoutSeconds: 906,
          },
        },
      ],
      edges: [],
      viewport: null,
    });

    const result = await (service as any).proposeChange(makeContext(), {
      targetKind: 'self',
      nodeOperations: [
        {
          op: 'update',
          nodeId: 'sandbox-1',
          patch: {
            data: {
              memoryLimitMb: 768,
              diskLimitGb: 3,
              timeoutSeconds: 180,
            },
          },
        },
      ],
      publishTarget: true,
    });

    expect(result.proposal).toMatchObject({
      category: 'sandbox_spec_adjustment',
      riskLevel: 'high',
      requiresConfirmation: true,
    });
  });

  it('proposeChange 应识别仅按 edgeId 删除的 workspace 绑定为审批类变更', async () => {
    vi.spyOn(service as any, 'loadGraphTarget').mockResolvedValueOnce({
      kind: 'agent',
      id: 'agent-1',
      label: '当前 Agent',
      version: 16,
      publishedVersionId: 'version-16',
      nodes: [
        {
          id: 'workspace-1',
          type: 'tool',
          data: {
            nodeType: 'workspace',
          },
        },
        {
          id: 'sandbox-1',
          type: 'tool',
          data: {
            nodeType: 'sandbox',
          },
        },
      ],
      edges: [
        {
          id: 'binding-edge-1',
          source: 'workspace-1',
          target: 'sandbox-1',
          sourceHandle: 'volume-out',
          targetHandle: 'volume-in',
        },
      ],
      viewport: null,
    });

    const result = await (service as any).proposeChange(makeContext(), {
      targetKind: 'self',
      edgeOperations: [
        {
          op: 'remove',
          edgeId: 'binding-edge-1',
        },
      ],
    });

    expect(result.proposal).toMatchObject({
      category: 'workspace_sandbox_binding_adjustment',
      riskLevel: 'medium',
      requiresConfirmation: true,
    });
  });

  it('高风险 create_resource preflight 应进入 awaiting_permission，并注册待审批请求', async () => {
    vi.spyOn(service as any, 'buildSessionContext').mockResolvedValue(
      makeContext(),
    );

    const result = await service.handleSessionToolPreflight(
      makeSession(),
      'create_resource',
      'tool-call-2',
      {
        resourceType: 'skill',
        spec: {
          name: '自进化 Skill',
          files: {
            'SKILL.md': '# self evolution',
          },
        },
      },
    );

    expect(mockPermissionService.registerPendingRequest).toHaveBeenCalledWith({
      sessionId: 'session-1',
      conversationId: 'conversation-1',
      toolCallId: 'tool-call-2',
      toolName: 'create_resource',
      permissionRequest: expect.objectContaining({
        category: 'skill_resource_management',
        targetLabel: '自进化 Skill',
        targetType: 'skill',
      }),
    });
    expect(result).toMatchObject({
      outcome: 'awaiting_permission',
      permissionRequest: expect.objectContaining({
        category: 'skill_resource_management',
      }),
    });
  });

  it('审批被拒绝时，create_resource execute 应返回 denied outcome', async () => {
    vi.spyOn(service as any, 'buildSessionContext').mockResolvedValue(
      makeContext(),
    );
    mockPermissionService.waitForResolution.mockResolvedValueOnce('deny');

    const result = await service.handleSessionToolExecute(
      makeSession(),
      'create_resource',
      'tool-call-3',
      {
        resourceType: 'workspace',
        spec: {
          name: '新的工作区',
        },
      },
    );

    expect(mockPermissionService.waitForResolution).toHaveBeenCalledWith(
      'session-1',
      'tool-call-3',
    );
    expect(result).toMatchObject({
      outcome: 'denied',
      result: {
        payload: {
          success: false,
          data: {
            denied: true,
          },
          error: '用户拒绝了本次资源创建',
        },
      },
      permissionRequest: expect.objectContaining({
        category: 'workspace_resource_management',
      }),
    });
  });

  it('applyChange 在 publishedVersionId 未变化时不应返回 restartSuggestion', async () => {
    vi.spyOn(service as any, 'loadGraphTarget').mockResolvedValueOnce({
      kind: 'agent',
      id: 'agent-1',
      label: '当前 Agent',
      version: 12,
      publishedVersionId: 'version-12',
      nodes: [],
      edges: [],
      viewport: null,
    });
    mockAgentDefinitionService.applyCanvasSnapshot.mockResolvedValueOnce({
      publishedVersionId: 'version-12',
      publishedVersionNumber: 12,
      detail: { summary: '未产生新发布版本', version: 12 },
    });

    const result = await (service as any).applyChange(makeContext(), {
      proposal: {
        domain: 'self_evolution',
        targetKind: 'self',
        targetId: 'agent-1',
        targetLabel: '当前 Agent',
        baseVersion: 12,
        publishTarget: true,
        nodeOperations: [],
        edgeOperations: [],
        summary: '调整 timeout',
        category: 'agent_self_canvas_edit',
        riskLevel: 'low',
        requiresConfirmation: false,
        diffPreview: {
          summary: '调整 timeout',
        },
      },
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        targetType: 'agent',
        publishedVersionId: 'version-12',
        publishedVersionNumber: 12,
        versionInfo: {
          draftVersion: 12,
          publishedVersionNumber: 12,
          userVisibleVersionNumber: 12,
        },
      },
    });
    expect(
      (result.data as { restartSuggestion?: unknown }).restartSuggestion,
    ).toBeUndefined();
  });

  it('applyChange 在产生新 publishedVersionId 时应返回 restartSuggestion', async () => {
    vi.spyOn(service as any, 'loadGraphTarget').mockResolvedValueOnce({
      kind: 'agent',
      id: 'agent-1',
      label: '当前 Agent',
      version: 12,
      publishedVersionId: 'version-12',
      nodes: [],
      edges: [],
      viewport: null,
    });
    mockAgentDefinitionService.applyCanvasSnapshot.mockResolvedValueOnce({
      publishedVersionId: 'version-13',
      publishedVersionNumber: 17,
      detail: { summary: '已生成新发布版本', version: 18 },
    });

    const result = await (service as any).applyChange(makeContext(), {
      proposal: {
        domain: 'self_evolution',
        targetKind: 'self',
        targetId: 'agent-1',
        targetLabel: '当前 Agent',
        baseVersion: 12,
        publishTarget: true,
        nodeOperations: [],
        edgeOperations: [],
        summary: '调整 timeout',
        category: 'agent_self_canvas_edit',
        riskLevel: 'low',
        requiresConfirmation: false,
        diffPreview: {
          summary: '调整 timeout',
        },
      },
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        targetType: 'agent',
        publishedVersionId: 'version-13',
        publishedVersionNumber: 17,
        versionInfo: {
          draftVersion: 18,
          publishedVersionNumber: 17,
          userVisibleVersionNumber: 17,
        },
        restartSuggestion: {
          available: true,
          currentConversationId: 'conversation-1',
          publishedVersionId: 'version-13',
          publishedVersionNumber: 17,
        },
      },
    });
  });

  it('applyChange 对外部 draft Agent 且 publishTarget=true 时应请求保存后直接发布', async () => {
    vi.spyOn(service as any, 'loadGraphTarget').mockResolvedValueOnce({
      kind: 'agent',
      id: 'agent-2',
      label: '外部 Agent',
      version: 2,
      publishedVersionId: null,
      nodes: [],
      edges: [],
      viewport: null,
    });
    mockAgentDefinitionService.applyCanvasSnapshot.mockResolvedValueOnce({
      publishedVersionId: 'version-1',
      publishedVersionNumber: 1,
      detail: { summary: '已发布外部 Agent', version: 3, status: 'published' },
    });

    const result = await (service as any).applyChange(makeContext(), {
      proposal: {
        domain: 'self_evolution',
        targetKind: 'agent',
        targetId: 'agent-2',
        targetLabel: '外部 Agent',
        baseVersion: 2,
        publishTarget: true,
        nodeOperations: [
          {
            op: 'add',
            node: {
              id: 'agent-main-1',
              type: 'agent',
              data: { nodeType: 'agent-main' },
            },
          },
        ],
        edgeOperations: [],
        summary: '创建最小外部 Agent 编排',
        category: 'agent_external_edit',
        riskLevel: 'high',
        requiresConfirmation: true,
        diffPreview: {
          summary: '创建最小外部 Agent 编排',
        },
      },
    });

    expect(mockAgentDefinitionService.applyCanvasSnapshot).toHaveBeenCalledWith(
      'agent-2',
      expect.objectContaining({
        expectedVersion: 2,
        publishAfterSave: true,
      }),
      'user-1',
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        targetType: 'agent',
        targetId: 'agent-2',
        publishedVersionId: 'version-1',
        publishedVersionNumber: 1,
      },
    });
  });

  it('restartConversationToLatestVersion 应复制完整消息历史并继承 remembered policies', async () => {
    mockAgentDefinitionService.findDetailById.mockResolvedValueOnce({
      id: 'agent-1',
      name: '当前 Agent',
      publishedVersionId: 'published-version-2',
    });

    enqueueSelectResult([
      {
        id: 'conversation-1',
        agentDefinitionId: 'agent-1',
        title: '旧会话',
      },
    ]);
    enqueueSelectResult([
      {
        id: 'message-1',
        role: 'user',
        contentType: 'text',
        content: '你好',
        toolCalls: null,
        toolResults: null,
        metadata: { local: true },
        parentMessageId: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      },
      {
        id: 'message-2',
        role: 'assistant',
        contentType: 'text',
        content: '你好，主人',
        toolCalls: [],
        toolResults: [],
        metadata: { segments: [] },
        parentMessageId: 'message-1',
        createdAt: new Date('2025-01-01T00:00:01.000Z'),
      },
    ]);
    enqueueInsertResult([{ id: 'conversation-2' }]);
    enqueueInsertResult([{ id: 'message-copy-1' }]);
    enqueueInsertResult([{ id: 'message-copy-2' }]);

    const result = await service.restartConversationToLatestVersion(
      'conversation-1',
      'tenant-1',
      'user-2',
    );

    expect(result).toEqual({
      data: {
        conversationId: 'conversation-2',
      },
    });
    expect(insertValuesCalls[0]).toMatchObject({
      agentDefinitionId: 'agent-1',
      tenantId: 'tenant-1',
      title: '旧会话',
      createdBy: 'user-2',
      metadata: {
        restartFromConversationId: 'conversation-1',
        inheritedMessageHistory: true,
      },
    });
    expect(insertValuesCalls[1]).toMatchObject({
      conversationId: 'conversation-2',
      role: 'user',
      content: '你好',
      parentMessageId: null,
    });
    expect(insertValuesCalls[2]).toMatchObject({
      conversationId: 'conversation-2',
      role: 'assistant',
      content: '你好，主人',
      parentMessageId: 'message-copy-1',
    });
    expect(updateSetCalls[0]).toMatchObject({
      metadata: {
        restartFromConversationId: 'conversation-1',
        inheritedMessageHistory: true,
        restartTargetPublishedVersionId: 'published-version-2',
        execution: {
          lastProcessedMessageId: 'message-copy-1',
          lastAssistantMessageId: 'message-copy-2',
          lastStopReason: 'end_turn',
          runningState: 'idle',
        },
      },
    });
    expect(mockPermissionService.cloneRememberedPolicies).toHaveBeenCalledWith(
      'conversation-1',
      'conversation-2',
    );
  });
});

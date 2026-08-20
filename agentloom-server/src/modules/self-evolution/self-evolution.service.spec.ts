import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SelfEvolutionService } from './self-evolution.service';
import { SelfEvolutionGraphPatch } from './self-evolution-graph-patch';
import { SelfEvolutionMutationService } from './self-evolution-mutation.service';
import { SelfEvolutionPermissionPolicy } from './self-evolution-permission-policy';
import { SelfEvolutionReadService } from './self-evolution-read.service';
import { AgentCanvasInvalidMcpToolBindingException } from '../agent-definition/agent-definition.exceptions';
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

function makeProposal(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    domain: 'self_evolution',
    targetKind: 'self',
    targetId: 'agent-1',
    targetLabel: '当前 Agent',
    baseVersion: 3,
    publishTarget: false,
    nodeOperations: [],
    edgeOperations: [],
    summary: '调整编排',
    category: 'agent_self_canvas_edit',
    riskLevel: 'low',
    requiresConfirmation: false,
    diffPreview: { summary: '调整编排' },
    ...overrides,
  };
}

describe('SelfEvolutionService', () => {
  let service: SelfEvolutionService;
  let mockAgentDefinitionService: {
    findDetailById: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    applyCanvasSnapshot: ReturnType<typeof vi.fn>;
  };
  let mockSkillService: {
    findAll: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let mockLlmService: {
    findAll: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let mockLlmProviderService: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockMcpService: {
    findAllConfigs: ReturnType<typeof vi.fn>;
    importTools: ReturnType<typeof vi.fn>;
    listTools: ReturnType<typeof vi.fn>;
  };
  let mockWorkspaceService: {
    findAll: ReturnType<typeof vi.fn>;
    resolveOrganizationId: ReturnType<typeof vi.fn>;
    createEmpty: ReturnType<typeof vi.fn>;
  };
  let mockSandboxService: {
    findByConversationId: ReturnType<typeof vi.fn>;
    endConversationSandbox: ReturnType<typeof vi.fn>;
  };
  let mockWorkflowVersionService: {
    findAllDefinitions: ReturnType<typeof vi.fn>;
    findDefinitionDetailById: ReturnType<typeof vi.fn>;
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
      findAll: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn(),
      applyCanvasSnapshot: vi.fn(),
    };
    mockSkillService = {
      findAll: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn(),
    };
    mockLlmService = {
      findAll: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    };
    mockLlmProviderService = {
      create: vi.fn(),
    };
    mockMcpService = {
      findAllConfigs: vi.fn().mockResolvedValue({ data: [] }),
      importTools: vi.fn(),
      listTools: vi.fn().mockResolvedValue([]),
    };
    mockWorkspaceService = {
      findAll: vi.fn().mockResolvedValue({ data: [] }),
      resolveOrganizationId: vi.fn(),
      createEmpty: vi.fn(),
    };
    mockSandboxService = {
      findByConversationId: vi.fn().mockResolvedValue(null),
      endConversationSandbox: vi.fn().mockResolvedValue(undefined),
    };
    mockWorkflowVersionService = {
      findAllDefinitions: vi.fn().mockResolvedValue({ data: [] }),
      findDefinitionDetailById: vi.fn(),
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

    const permissionPolicy = new SelfEvolutionPermissionPolicy();
    const graphPatch = new SelfEvolutionGraphPatch(
      mockMcpService as unknown as ConstructorParameters<
        typeof SelfEvolutionGraphPatch
      >[0],
    );
    const readService = new SelfEvolutionReadService(
      mockAgentDefinitionService as unknown as ConstructorParameters<
        typeof SelfEvolutionReadService
      >[0],
      mockSkillService as unknown as ConstructorParameters<
        typeof SelfEvolutionReadService
      >[1],
      mockLlmService as unknown as ConstructorParameters<
        typeof SelfEvolutionReadService
      >[2],
      mockMcpService as unknown as ConstructorParameters<
        typeof SelfEvolutionReadService
      >[3],
      mockWorkspaceService as unknown as ConstructorParameters<
        typeof SelfEvolutionReadService
      >[4],
      mockWorkflowVersionService as unknown as ConstructorParameters<
        typeof SelfEvolutionReadService
      >[5],
      permissionPolicy,
      graphPatch,
    );
    const mutationService = new SelfEvolutionMutationService(
      mockAgentDefinitionService as unknown as ConstructorParameters<
        typeof SelfEvolutionMutationService
      >[0],
      mockSkillService as unknown as ConstructorParameters<
        typeof SelfEvolutionMutationService
      >[1],
      mockLlmService as unknown as ConstructorParameters<
        typeof SelfEvolutionMutationService
      >[2],
      mockLlmProviderService as unknown as ConstructorParameters<
        typeof SelfEvolutionMutationService
      >[3],
      mockMcpService as unknown as ConstructorParameters<
        typeof SelfEvolutionMutationService
      >[4],
      mockWorkspaceService as unknown as ConstructorParameters<
        typeof SelfEvolutionMutationService
      >[5],
      mockWorkflowVersionService as unknown as ConstructorParameters<
        typeof SelfEvolutionMutationService
      >[6],
      permissionPolicy,
      graphPatch,
      readService,
    );
    service = new SelfEvolutionService(
      mockTenantDb as unknown as ConstructorParameters<typeof SelfEvolutionService>[0],
      mockAgentDefinitionService as unknown as ConstructorParameters<typeof SelfEvolutionService>[1],
      mockSkillService as unknown as ConstructorParameters<typeof SelfEvolutionService>[2],
      mockLlmService as unknown as ConstructorParameters<typeof SelfEvolutionService>[3],
      mockLlmProviderService as unknown as ConstructorParameters<typeof SelfEvolutionService>[4],
      mockMcpService as unknown as ConstructorParameters<typeof SelfEvolutionService>[5],
      mockWorkspaceService as unknown as ConstructorParameters<typeof SelfEvolutionService>[6],
      mockWorkflowVersionService as unknown as ConstructorParameters<typeof SelfEvolutionService>[7],
      mockPermissionService as unknown as ConstructorParameters<typeof SelfEvolutionService>[8],
      mockSandboxService as unknown as ConstructorParameters<typeof SelfEvolutionService>[9],
      readService,
      mutationService,
      permissionPolicy,
      graphPatch,
    );
  });

  it('低风险 apply_change preflight 应直接应用，无需等待审批', async () => {
    const context = makeContext();
    vi.spyOn(service as any, 'buildSessionContext').mockResolvedValue(context);
    const applyChangeSpy = vi
      .spyOn(service.mutationService, 'applyChange')
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
    vi.spyOn(service.readService, 'loadGraphTarget').mockResolvedValueOnce({
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

    const result = await service.readService.proposeChange(makeContext(), {
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
    vi.spyOn(service.readService, 'loadGraphTarget').mockResolvedValueOnce({
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

    const result = await service.readService.proposeChange(makeContext(), {
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

  it('queryResourcePool 的 mcp_tool 结果应返回可直接绑定节点的工具元数据', async () => {
    mockMcpService.listTools.mockResolvedValueOnce([
      {
        id: 'tool-fast',
        name: 'fast_search',
        title: 'Fast Search',
        description: '快速搜索',
        mcpServerConfigId: 'cfg-websearch',
        isActive: true,
        inputSchema: { type: 'object' },
        outputSchema: null,
        portMappingMetadata: {
          inputs: [{ name: 'query', dataType: 'text' }],
          outputs: [{ name: 'result', dataType: 'json' }],
        },
        source: 'mcp',
        annotations: { category: 'search' },
      },
      {
        id: 'tool-disabled',
        name: 'disabled_search',
        title: 'Disabled Search',
        description: '已停用',
        mcpServerConfigId: 'cfg-websearch',
        isActive: false,
        inputSchema: null,
        outputSchema: null,
        portMappingMetadata: null,
        source: 'mcp',
        annotations: null,
      },
    ]);

    const result = await service.readService.queryResourcePool(makeContext(), {
      resourceType: 'mcp_tool',
    });

    expect(result).toEqual({
      mcpTools: [
        {
          id: 'tool-fast',
          name: 'fast_search',
          title: 'Fast Search',
          description: '快速搜索',
          mcpServerConfigId: 'cfg-websearch',
          isActive: true,
          inputSchema: { type: 'object' },
          outputSchema: null,
          portMappingMetadata: {
            inputs: [{ name: 'query', dataType: 'text' }],
            outputs: [{ name: 'result', dataType: 'json' }],
          },
          source: 'mcp',
          annotations: { category: 'search' },
        },
      ],
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

  it('applyChange 应把半残的 mcp-tool 节点补全为 canonical MCP 配置', async () => {
    vi.spyOn(service.readService, 'loadGraphTarget').mockResolvedValueOnce({
      kind: 'agent',
      id: 'agent-1',
      label: '当前 Agent',
      version: 12,
      publishedVersionId: null,
      nodes: [],
      edges: [],
      viewport: null,
    });
    mockMcpService.listTools.mockResolvedValueOnce([
      {
        id: 'tool-fast',
        name: 'fast_search',
        title: 'Fast Search',
        description: '快速搜索',
        mcpServerConfigId: 'cfg-websearch',
        isActive: true,
        inputSchema: { type: 'object' },
        outputSchema: null,
        portMappingMetadata: null,
        source: 'mcp',
        annotations: null,
      },
      {
        id: 'tool-deep',
        name: 'deep_search',
        title: 'Deep Search',
        description: '深度搜索',
        mcpServerConfigId: 'cfg-websearch',
        isActive: true,
        inputSchema: { type: 'object' },
        outputSchema: null,
        portMappingMetadata: null,
        source: 'mcp',
        annotations: null,
      },
    ]);
    mockAgentDefinitionService.applyCanvasSnapshot.mockResolvedValueOnce({
      detail: { summary: '已保存', version: 13 },
    });

    await service.mutationService.applyChange(makeContext(), {
      proposal: {
        domain: 'self_evolution',
        targetKind: 'self',
        targetId: 'agent-1',
        targetLabel: '当前 Agent',
        baseVersion: 12,
        publishTarget: false,
        nodeOperations: [
          {
            op: 'add',
            node: {
              id: 'main-mcp-websearch',
              type: 'tool',
              data: {
                label: 'WebSearch',
                nodeType: 'mcp',
                category: 'tool',
                mcpServerId: 'cfg-websearch',
                mcpServerName: 'WebSearch',
                config: {
                  mcpServerId: 'cfg-websearch',
                  mcpServerName: 'WebSearch',
                },
              },
            },
          },
        ],
        edgeOperations: [],
        summary: '新增 WebSearch MCP 节点',
        category: 'agent_self_canvas_edit',
        riskLevel: 'low',
        requiresConfirmation: false,
        diffPreview: {
          summary: '新增 WebSearch MCP 节点',
        },
      },
    });

    expect(mockAgentDefinitionService.applyCanvasSnapshot).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({
        canvasNodes: [
          expect.objectContaining({
            type: 'tool',
            data: expect.objectContaining({
              nodeType: 'mcp-tool',
              category: 'tool',
              mcpServerConfigId: 'cfg-websearch',
              config: expect.objectContaining({
                mcpServerConfigId: 'cfg-websearch',
                mcpServerName: 'WebSearch',
                enabledToolIds: ['tool-fast', 'tool-deep'],
                tools: [
                  expect.objectContaining({
                    id: 'tool-fast',
                    name: 'fast_search',
                    mcpServerConfigId: 'cfg-websearch',
                  }),
                  expect.objectContaining({
                    id: 'tool-deep',
                    name: 'deep_search',
                    mcpServerConfigId: 'cfg-websearch',
                  }),
                ],
              }),
            }),
          }),
        ],
      }),
      'user-1',
    );
  });

  it('applyChange 遇到 Agent 画布 MCP 校验失败时应返回结构化 Problem Details', async () => {
    vi.spyOn(service.readService, 'loadGraphTarget').mockResolvedValueOnce({
      kind: 'agent',
      id: 'agent-1',
      label: '当前 Agent',
      version: 12,
      publishedVersionId: 'version-12',
      nodes: [],
      edges: [],
      viewport: null,
    });
    mockAgentDefinitionService.applyCanvasSnapshot.mockRejectedValueOnce(
      new AgentCanvasInvalidMcpToolBindingException([
        {
          nodeId: 'main-mcp-websearch',
          mcpServerConfigId: 'cfg-websearch',
          enabledToolIds: [],
          issues: ['未选择具体工具'],
        },
      ]),
    );

    const result = await service.mutationService.applyChange(makeContext(), {
      proposal: {
        domain: 'self_evolution',
        targetKind: 'self',
        targetId: 'agent-1',
        targetLabel: '当前 Agent',
        baseVersion: 12,
        publishTarget: false,
        nodeOperations: [],
        edgeOperations: [],
        summary: '新增 WebSearch MCP 节点',
        category: 'agent_self_canvas_edit',
        riskLevel: 'low',
        requiresConfirmation: false,
        diffPreview: {
          summary: '新增 WebSearch MCP 节点',
        },
      },
    });

    expect(result).toEqual({
      success: false,
      error: '节点 main-mcp-websearch 的 MCP 配置不完整：未选择具体工具',
      data: {
        problemDetails: {
          type: 'https://agentloom.dev/errors/agent-canvas-invalid-mcp-tool-binding',
          title: 'Agent MCP 节点配置不完整',
          status: 422,
          detail: '节点 main-mcp-websearch 的 MCP 配置不完整：未选择具体工具',
          errors: [
            {
              field: 'canvasNodes',
              message:
                '节点 main-mcp-websearch 的 mcp-tool 配置不完整（未选择具体工具）。请把 node.data.config.mcpServerConfigId、enabledToolIds 和 tools[] 一起写完整，并至少选择一个具体工具。',
            },
          ],
          extensions: expect.objectContaining({
            fixHint:
              '请在 node.data.config 中显式写入 mcpServerConfigId、enabledToolIds 与 tools[]；enabledToolIds 里的每个 tool id 都必须在 tools[] 中有对应的 id/name/mcpServerConfigId 元数据。',
            nodes: [
              {
                nodeId: 'main-mcp-websearch',
                mcpServerConfigId: 'cfg-websearch',
                enabledToolIds: [],
                issues: ['未选择具体工具'],
              },
            ],
          }),
        },
      },
    });
  });

  it('applyChange 在 publishedVersionId 未变化时不应返回 restartSuggestion', async () => {
    vi.spyOn(service.readService, 'loadGraphTarget').mockResolvedValueOnce({
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

    const result = await service.mutationService.applyChange(makeContext(), {
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
    vi.spyOn(service.readService, 'loadGraphTarget').mockResolvedValueOnce({
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

    const result = await service.mutationService.applyChange(makeContext(), {
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
    vi.spyOn(service.readService, 'loadGraphTarget').mockResolvedValueOnce({
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

    const result = await service.mutationService.applyChange(makeContext(), {
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

  it('restartConversationToLatestVersion 应在当前会话刷新 execution metadata 并保留 remembered policies', async () => {
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
        metadata: {
          selfEvolution: {
            rememberedPolicies: {
              workflow_edit: 'approve',
            },
          },
          execution: {
            sessionId: 'session-1',
            memorySessionIds: ['memory-1'],
          },
        },
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

    const result = await service.restartConversationToLatestVersion(
      'conversation-1',
      'tenant-1',
      'user-2',
    );

    expect(result).toEqual({
      data: {
        conversationId: 'conversation-1',
      },
    });
    expect(insertValuesCalls).toHaveLength(0);
    expect(updateSetCalls[0]).toMatchObject({
      metadata: {
        selfEvolution: {
          rememberedPolicies: {
            workflow_edit: 'approve',
          },
        },
        execution: {
          loadedPublishedVersionId: 'published-version-2',
          lastProcessedMessageId: 'message-1',
          lastAssistantMessageId: 'message-2',
          lastStopReason: 'end_turn',
          runningState: 'idle',
        },
      },
    });
    expect(
      mockPermissionService.cloneRememberedPolicies,
    ).not.toHaveBeenCalled();
  });

  it('restartConversationToLatestVersion 不应释放当前会话的沙箱绑定', async () => {
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
    enqueueSelectResult([]);

    await service.restartConversationToLatestVersion(
      'conversation-1',
      'tenant-1',
      'user-2',
    );

    expect(mockSandboxService.endConversationSandbox).not.toHaveBeenCalled();
  });

  describe('query contracts and authorization', () => {
    it('queryState 应区分 self、外部 agent 与 workflow，并拒绝缺少授权或目标', async () => {
      mockAgentDefinitionService.findDetailById
        .mockResolvedValueOnce({ id: 'agent-1', name: '当前 Agent' })
        .mockResolvedValueOnce({ id: 'agent-2', name: '外部 Agent' });
      mockWorkflowVersionService.findDefinitionDetailById.mockResolvedValueOnce(
        {
          id: 'workflow-1',
          name: '外部 Workflow',
        },
      );

      await expect(
        service.readService.queryState(makeContext(), {}),
      ).resolves.toMatchObject({
        scope: 'self',
        currentConversationId: 'conversation-1',
        target: { id: 'agent-1' },
      });
      await expect(
        service.readService.queryState(makeContext(), {
          scope: 'agent',
          targetId: ' agent-2 ',
        }),
      ).resolves.toEqual({
        scope: 'agent',
        target: { id: 'agent-2', name: '外部 Agent' },
      });
      await expect(
        service.readService.queryState(makeContext(), {
          scope: 'workflow',
          targetId: 'workflow-1',
        }),
      ).resolves.toEqual({
        scope: 'workflow',
        target: { id: 'workflow-1', name: '外部 Workflow' },
      });
      await expect(
        service.readService.queryState(makeContext(), { scope: 'agent' }),
      ).rejects.toThrow('必须提供 targetId');
      await expect(
        service.readService.queryState(
          makeContext({
            selfEvolutionPolicy: {
              enabled: true,
              resourceManagement: true,
              externalEditing: false,
              sandboxManagement: true,
            },
          }),
          { scope: 'agent', targetId: 'agent-2' },
        ),
      ).rejects.toThrow('未启用外部编辑');
      await expect(
        service.readService.queryState(makeContext(), {
          scope: 'organization',
          targetId: 'target-1',
        }),
      ).rejects.toThrow('不支持的 scope');
    });

    it('queryResourcePool 应按搜索、有效性与上限映射全部资源类型', async () => {
      mockSkillService.findAll.mockResolvedValueOnce({
        data: [
          {
            id: 'skill-1',
            name: 'Search Skill',
            slug: 'search',
            description: 'desc',
            isBuiltin: false,
            fileCount: 2,
          },
        ],
      });
      mockMcpService.findAllConfigs.mockResolvedValueOnce({
        data: [
          {
            id: 'cfg-1',
            name: 'Search MCP',
            description: 'desc',
            transportType: 'stdio',
            toolCount: 2,
          },
        ],
      });
      mockMcpService.listTools.mockResolvedValueOnce([
        {
          id: 'tool-inactive',
          name: 'Search inactive',
          isActive: false,
          mcpServerConfigId: 'cfg-1',
        },
        {
          id: 'tool-title',
          name: 'other',
          title: 'Search title',
          description: '',
          isActive: true,
          mcpServerConfigId: 'cfg-1',
        },
        {
          id: 'tool-description',
          name: 'other-2',
          title: '',
          description: 'Search description',
          isActive: true,
          mcpServerConfigId: 'cfg-1',
        },
      ]);
      mockLlmService.findAll.mockResolvedValueOnce([
        {
          id: 'model-1',
          name: 'other',
          modelId: 'Search-model',
          providerId: 'provider-1',
          provider: { name: 'Provider' },
          modelType: 'chat',
          isDefault: true,
        },
        {
          id: 'model-2',
          name: 'excluded',
          modelId: 'excluded',
          providerId: 'provider-1',
          provider: { name: 'Other' },
          modelType: 'chat',
          isDefault: false,
        },
      ]);
      mockAgentDefinitionService.findAll.mockResolvedValueOnce({
        data: [
          {
            id: 'agent-2',
            name: 'Search Agent',
            status: 'draft',
            publishedVersionId: null,
          },
        ],
      });
      mockWorkflowVersionService.findAllDefinitions.mockResolvedValueOnce({
        data: [
          {
            id: 'workflow-1',
            name: 'Search Workflow',
            status: 'published',
            publishedVersionId: 'wv-1',
          },
        ],
      });
      mockWorkspaceService.findAll.mockResolvedValueOnce({
        data: [
          {
            id: 'workspace-1',
            name: 'Search Workspace',
            description: 'desc',
            status: 'active',
          },
        ],
      });

      const result = await service.readService.queryResourcePool(makeContext(), {
        search: 'Search',
        limit: 150,
      });

      expect(mockSkillService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ pageSize: 100, search: 'Search' }),
      );
      expect(result).toMatchObject({
        skills: [{ id: 'skill-1', slug: 'search' }],
        mcpServers: [{ id: 'cfg-1', transportType: 'stdio' }],
        mcpTools: [
          { id: 'tool-title', mcpServerConfigId: 'cfg-1' },
          { id: 'tool-description', mcpServerConfigId: 'cfg-1' },
        ],
        models: [{ id: 'model-1', modelId: 'Search-model' }],
        agents: [{ id: 'agent-2' }],
        workflows: [{ id: 'workflow-1' }],
        workspaces: [{ id: 'workspace-1' }],
      });
      await expect(
        service.readService.queryResourcePool(makeContext(), {
          resourceType: 'unknown',
          limit: 0,
        }),
      ).resolves.toEqual({});
    });

    it('read tool 应把无效输入和服务错误转换为失败结果', async () => {
      await expect(
        (service as any).executeReadTool('propose_change', makeContext(), {
          targetKind: 'invalid',
        }),
      ).resolves.toEqual({
        success: false,
        data: null,
        error: 'targetKind 必须是 self / agent / workflow',
      });
      mockSkillService.findAll.mockRejectedValueOnce('resource unavailable');
      await expect(
        (service as any).executeReadTool('query_resource_pool', makeContext(), {
          resourceType: 'skill',
        }),
      ).resolves.toEqual({
        success: false,
        data: null,
        error: 'resource unavailable',
      });
    });

    it('公开 session tool 分发应支持全部工具名并保持 read 工具无审批', async () => {
      expect(service.supportsTool('query_state')).toBe(true);
      expect(service.supportsTool('create_resource')).toBe(true);
      expect(service.supportsTool('unknown_tool')).toBe(false);
      vi.spyOn(service as any, 'buildSessionContext').mockResolvedValue(
        makeContext(),
      );
      mockAgentDefinitionService.findDetailById.mockResolvedValueOnce({
        id: 'agent-1',
        name: '当前 Agent',
      });

      await expect(
        service.handleSessionToolPreflight(
          makeSession(),
          'query_state',
          'query-state',
          {},
        ),
      ).resolves.toMatchObject({
        result: {
          success: true,
          data: { scope: 'self', target: { id: 'agent-1' } },
        },
      });
      await expect(
        service.handleSessionToolExecute(
          makeSession(),
          'query_resource_pool',
          'query-pool',
          { resourceType: 'unknown' },
        ),
      ).resolves.toEqual({
        result: { success: true, data: {} },
      });
      expect(
        mockPermissionService.registerPendingRequest,
      ).not.toHaveBeenCalled();
    });
  });

  describe('proposal classification and graph validation', () => {
    it('proposeChange 应应用节点/连线 CRUD、深合并 viewport 并保留 OCC baseVersion', async () => {
      vi.spyOn(service.readService, 'loadGraphTarget').mockResolvedValueOnce({
        kind: 'agent',
        id: 'agent-1',
        label: '当前 Agent',
        version: 7,
        publishedVersionId: 'published-7',
        nodes: [
          {
            id: 'keep',
            type: 'text',
            data: { nodeType: 'text', config: { a: 1, b: 2 } },
          },
          { id: 'remove', type: 'text', data: { nodeType: 'text' } },
        ],
        edges: [
          {
            id: 'edge-update',
            source: 'keep',
            target: 'remove',
            meta: { a: 1 },
          },
          { id: 'edge-remove', source: 'remove', target: 'keep' },
        ],
        viewport: { x: 1, y: 2, zoom: 1 },
      });

      const result = await service.readService.proposeChange(makeContext(), {
        targetKind: 'self',
        nodeOperations: [
          {
            op: 'update',
            nodeId: 'keep',
            patch: { data: { config: { a: 9, c: 3 } } },
          },
          { op: 'remove', nodeId: 'remove' },
          {
            op: 'add',
            node: { id: 'added', type: 'text', data: { nodeType: 'text' } },
          },
        ],
        edgeOperations: [
          { op: 'update', edgeId: 'edge-update', patch: { meta: { b: 2 } } },
          { op: 'remove', edgeId: 'edge-remove' },
          {
            op: 'add',
            edge: { id: 'edge-added', source: 'keep', target: 'added' },
          },
        ],
        viewport: { x: 10, y: 20, zoom: 0.8 },
        metadataPatch: { description: 'updated' },
      });

      expect(result.proposal).toMatchObject({
        targetKind: 'self',
        baseVersion: 7,
        publishTarget: true,
        category: 'agent_self_canvas_edit',
        riskLevel: 'low',
        requiresConfirmation: false,
        metadataPatch: { description: 'updated' },
      });
      expect(result.preview).toEqual({
        nodes: [
          {
            id: 'keep',
            type: 'text',
            data: { nodeType: 'text', config: { a: 9, b: 2, c: 3 } },
          },
          { id: 'added', type: 'text', data: { nodeType: 'text' } },
        ],
        edges: [
          {
            id: 'edge-update',
            source: 'keep',
            target: 'remove',
            meta: { a: 1, b: 2 },
          },
          { id: 'edge-added', source: 'keep', target: 'added' },
        ],
        viewport: { x: 10, y: 20, zoom: 0.8 },
      });
      expect(result).toMatchObject({
        proposal: {
          diffPreview: {
            nextNodeCount: 2,
            nextEdgeCount: 2,
            addedNodes: [{ id: 'added', nodeType: 'text' }],
            updatedNodes: [{ id: 'keep' }],
            removedNodes: [{ id: 'remove' }],
            addedEdges: [{ id: 'edge-added' }],
            updatedEdges: [{ id: 'edge-update' }],
            removedEdges: [{ id: 'edge-remove' }],
          },
        },
      });
    });

    it.each([
      ['workflow', { kind: 'workflow' as const, id: 'workflow-1' }, 'workflow_edit'],
      ['agent', { kind: 'agent' as const, id: 'agent-2' }, 'agent_external_edit'],
    ])(
      'proposeChange 应将外部 %s 变更分类为强制审批',
      async (targetKind, targetIdentity, category) => {
        vi.spyOn(service.readService, 'loadGraphTarget').mockResolvedValueOnce({
          ...targetIdentity,
          label: '外部目标',
          version: 2,
          publishedVersionId: null,
          nodes: [],
          edges: [],
          viewport: null,
        });

        const result = await service.readService.proposeChange(makeContext(), {
          targetKind,
          targetId: targetIdentity.id,
        });

        expect(result.proposal).toMatchObject({
          targetKind,
          category,
          riskLevel: 'high',
          requiresConfirmation: true,
          publishTarget: false,
        });
      },
    );

    it('proposeChange 应按 sandbox 与 workspace 优先级分类并执行子能力授权', async () => {
      const target = {
        kind: 'agent' as const,
        id: 'agent-1',
        label: '当前 Agent',
        version: 1,
        publishedVersionId: null,
        nodes: [],
        edges: [],
        viewport: null,
      };
      vi.spyOn(service.readService, 'loadGraphTarget')
        .mockResolvedValueOnce(target)
        .mockResolvedValueOnce(target)
        .mockResolvedValueOnce(target);

      const sandbox = await service.readService.proposeChange(makeContext(), {
        targetKind: 'self',
        nodeOperations: [
          {
            op: 'add',
            node: { id: 'sandbox', data: { nodeType: 'sandbox' } },
          },
          {
            op: 'add',
            node: { id: 'workspace', data: { nodeType: 'workspace' } },
          },
        ],
      });
      expect(sandbox.proposal).toMatchObject({
        category: 'sandbox_spec_adjustment',
        riskLevel: 'high',
      });

      const workspace = await service.readService.proposeChange(makeContext(), {
        targetKind: 'self',
        edgeOperations: [
          {
            op: 'add',
            edge: {
              id: 'binding',
              sourceHandle: 'volume-out',
              targetHandle: 'volume-in',
            },
          },
        ],
      });
      expect(workspace.proposal).toMatchObject({
        category: 'workspace_sandbox_binding_adjustment',
        riskLevel: 'medium',
      });

      await expect(
        service.readService.proposeChange(
          makeContext({
            selfEvolutionPolicy: {
              enabled: true,
              resourceManagement: true,
              externalEditing: true,
              sandboxManagement: false,
            },
          }),
          {
            targetKind: 'self',
            nodeOperations: [
              {
                op: 'add',
                node: { id: 'sandbox', data: { nodeType: 'sandbox' } },
              },
            ],
          },
        ),
      ).rejects.toThrow('未启用沙箱管理');
    });

    it.each([
      [{ op: 'add' }, '新增节点时必须提供'],
      [{ op: 'add', node: { id: 'existing' } }, '已存在'],
      [{ op: 'update', nodeId: 'missing', patch: {} }, '待更新节点不存在'],
      [{ op: 'update', nodeId: 'existing' }, '必须提供 nodeId 与 patch'],
      [{ op: 'remove' }, '删除节点时必须提供 nodeId'],
      [{ op: 'replace' }, '必须是 add / update / remove'],
    ])('应拒绝非法节点操作 %#', async (operation, message) => {
      vi.spyOn(service.readService, 'loadGraphTarget').mockResolvedValueOnce({
        kind: 'agent',
        id: 'agent-1',
        label: '当前 Agent',
        version: 1,
        nodes: [{ id: 'existing', data: { nodeType: 'text' } }],
        edges: [],
      });
      await expect(
        service.readService.proposeChange(makeContext(), {
          targetKind: 'self',
          nodeOperations: [operation],
        }),
      ).rejects.toThrow(message);
    });

    it.each([
      [{ op: 'add' }, '新增连线时必须提供'],
      [{ op: 'add', edge: { id: 'existing' } }, '已存在'],
      [{ op: 'update', edgeId: 'missing', patch: {} }, '待更新连线不存在'],
      [{ op: 'update', edgeId: 'existing' }, '必须提供 edgeId 与 patch'],
      [{ op: 'remove' }, '删除连线时必须提供 edgeId'],
    ])('应拒绝非法连线操作 %#', async (operation, message) => {
      vi.spyOn(service.readService, 'loadGraphTarget').mockResolvedValueOnce({
        kind: 'agent',
        id: 'agent-1',
        label: '当前 Agent',
        version: 1,
        nodes: [],
        edges: [{ id: 'existing', source: 'a', target: 'b' }],
      });
      await expect(
        service.readService.proposeChange(makeContext(), {
          targetKind: 'self',
          edgeOperations: [operation],
        }),
      ).rejects.toThrow(message);
    });
  });

  describe('approval policy and remembered scope', () => {
    it('高风险 apply_change 应按 conversation/category 注册真实审批请求', async () => {
      vi.spyOn(service as any, 'buildSessionContext').mockResolvedValue(
        makeContext(),
      );
      const proposal = makeProposal({
        targetKind: 'workflow',
        targetId: 'workflow-1',
        targetLabel: '发布流程',
        category: 'workflow_edit',
        riskLevel: 'high',
        requiresConfirmation: true,
        publishTarget: true,
      });

      const outcome = await service.handleSessionToolPreflight(
        makeSession(),
        'apply_change',
        'call-workflow',
        { proposal },
      );

      expect(mockPermissionService.getRememberedDecision).toHaveBeenCalledWith(
        'conversation-1',
        'workflow_edit',
      );
      expect(mockPermissionService.registerPendingRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          conversationId: 'conversation-1',
          toolCallId: 'call-workflow',
          toolName: 'apply_change',
          permissionRequest: expect.objectContaining({
            category: 'workflow_edit',
            riskLevel: 'high',
            targetType: 'workflow',
            targetLabel: '发布流程',
            approveEffect: expect.stringContaining('最新发布版本'),
            resourcePaths: ['workflow:workflow-1'],
          }),
        }),
      );
      expect(outcome).toMatchObject({
        outcome: 'awaiting_permission',
        permissionRequest: { category: 'workflow_edit' },
      });
    });

    it('remember approve 应仅对同会话分类绕过审批，remember deny 应返回 denied', async () => {
      vi.spyOn(service as any, 'buildSessionContext').mockResolvedValue(
        makeContext(),
      );
      const applySpy = vi
        .spyOn(service.mutationService, 'applyChange')
        .mockResolvedValue({ success: true, data: { applied: true } });
      const proposal = makeProposal({
        category: 'workflow_edit',
        requiresConfirmation: true,
      });

      mockPermissionService.getRememberedDecision.mockResolvedValueOnce(
        'approve',
      );
      await expect(
        service.handleSessionToolPreflight(
          makeSession(),
          'apply_change',
          'call-approved',
          { proposal },
        ),
      ).resolves.toEqual({
        result: { success: true, data: { applied: true } },
      });
      expect(applySpy).toHaveBeenCalledTimes(1);

      mockPermissionService.getRememberedDecision.mockResolvedValueOnce('deny');
      const denied = await service.handleSessionToolPreflight(
        makeSession(),
        'apply_change',
        'call-denied',
        { proposal },
      );
      expect(denied).toMatchObject({
        outcome: 'denied',
        result: {
          __agentloomToolStatus: 'denied',
          payload: {
            data: { denied: true },
            error: expect.stringContaining('本会话已记住'),
          },
        },
      });
      expect(applySpy).toHaveBeenCalledTimes(1);
    });

    it('审批 execute 应在 approve 后应用，并在非 approve/非法 proposal 时保持无副作用', async () => {
      vi.spyOn(service as any, 'buildSessionContext').mockResolvedValue(
        makeContext(),
      );
      const applySpy = vi
        .spyOn(service.mutationService, 'applyChange')
        .mockResolvedValue({ success: true, data: { applied: true } });
      const proposal = makeProposal({
        category: 'sandbox_spec_adjustment',
        requiresConfirmation: true,
      });

      mockPermissionService.waitForResolution.mockResolvedValueOnce('approve');
      await expect(
        service.handleSessionToolExecute(
          makeSession(),
          'apply_change',
          'call-approved',
          { proposal },
        ),
      ).resolves.toEqual({
        result: { success: true, data: { applied: true } },
      });

      mockPermissionService.waitForResolution.mockResolvedValueOnce('deny');
      await expect(
        service.handleSessionToolExecute(
          makeSession(),
          'apply_change',
          'call-denied',
          { proposal },
        ),
      ).resolves.toMatchObject({
        outcome: 'denied',
        result: { payload: { error: '用户拒绝了本次自进化变更' } },
      });
      await expect(
        service.handleSessionToolPreflight(
          makeSession(),
          'apply_change',
          'call-invalid',
          { proposal: { domain: 'other' } },
        ),
      ).resolves.toEqual({
        result: {
          success: false,
          data: null,
          error: 'proposal 缺失或格式非法',
        },
      });
      expect(applySpy).toHaveBeenCalledTimes(1);
    });

    it('create_resource remember approve/deny 应遵守资源分类策略', async () => {
      vi.spyOn(service as any, 'buildSessionContext').mockResolvedValue(
        makeContext(),
      );
      const createSpy = vi
        .spyOn(service.mutationService, 'createResource')
        .mockResolvedValue({ success: true, data: { resourceType: 'model' } });
      const input = {
        resourceType: 'model',
        spec: { name: 'Model', providerId: 'provider-1', modelId: 'm-1' },
      };

      mockPermissionService.getRememberedDecision.mockResolvedValueOnce(
        'approve',
      );
      await expect(
        service.handleSessionToolPreflight(
          makeSession(),
          'create_resource',
          'create-approved',
          input,
        ),
      ).resolves.toEqual({
        result: { success: true, data: { resourceType: 'model' } },
      });

      mockPermissionService.getRememberedDecision.mockResolvedValueOnce('deny');
      await expect(
        service.handleSessionToolPreflight(
          makeSession(),
          'create_resource',
          'create-denied',
          input,
        ),
      ).resolves.toMatchObject({
        outcome: 'denied',
        permissionRequest: { category: 'model_resource_management' },
      });
      expect(createSpy).toHaveBeenCalledTimes(1);
    });

    it.each([
      [
        {
          resourceType: 'mcp',
          spec: {
            serverName: 'Search MCP',
            connection: { type: 'stdio' },
            toolNames: ['search'],
          },
        },
        'mcp_resource_management',
        'mcp',
        'Search MCP',
      ],
      [
        {
          resourceType: 'workspace',
          spec: { name: 'Workspace' },
        },
        'workspace_resource_management',
        'workspace',
        'Workspace',
      ],
      [
        {
          resourceType: 'agent',
          spec: { name: 'External Agent' },
        },
        'agent_external_edit',
        'agent',
        'External Agent',
      ],
      [
        {
          resourceType: 'workflow',
          spec: { name: 'External Workflow' },
        },
        'workflow_edit',
        'workflow',
        'External Workflow',
      ],
    ])(
      'create_resource 应为 %# 生成匹配资源路径的审批分类',
      async (input, category, targetType, targetLabel) => {
        vi.spyOn(service as any, 'buildSessionContext').mockResolvedValue(
          makeContext(),
        );

        const outcome = await service.handleSessionToolPreflight(
          makeSession(),
          'create_resource',
          `create-${targetType}`,
          input,
        );

        expect(outcome).toMatchObject({
          outcome: 'awaiting_permission',
          permissionRequest: {
            category,
            riskLevel: 'high',
            targetType,
            targetLabel,
            resourcePaths: [`resource:${targetType}`],
          },
        });
      },
    );

    it('create_resource execute 应只在审批通过后执行一次真实创建', async () => {
      vi.spyOn(service as any, 'buildSessionContext').mockResolvedValue(
        makeContext(),
      );
      const createSpy = vi
        .spyOn(service.mutationService, 'createResource')
        .mockResolvedValue({
          success: true,
          data: { resourceType: 'workspace', resource: { id: 'workspace-1' } },
        });
      mockPermissionService.waitForResolution.mockResolvedValueOnce('approve');
      const input = {
        resourceType: 'workspace',
        spec: { name: 'Approved Workspace' },
      };

      await expect(
        service.handleSessionToolExecute(
          makeSession(),
          'create_resource',
          'create-approved',
          input,
        ),
      ).resolves.toEqual({
        result: {
          success: true,
          data: {
            resourceType: 'workspace',
            resource: { id: 'workspace-1' },
          },
        },
      });
      expect(mockPermissionService.waitForResolution).toHaveBeenCalledWith(
        'session-1',
        'create-approved',
      );
      expect(createSpy).toHaveBeenCalledWith(makeContext(), input);
    });
  });

  describe('apply and resource mutation contracts', () => {
    it('workflow apply 应传递目标当前 version 做 OCC，并按 publishTarget 发布', async () => {
      vi.spyOn(service.readService, 'loadGraphTarget').mockResolvedValueOnce({
        kind: 'workflow',
        id: 'workflow-1',
        label: '审批流',
        version: 11,
        publishedVersionId: 'published-10',
        nodes: [{ id: 'a', data: { nodeType: 'text' } }],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      });
      mockWorkflowVersionService.updateDefinition.mockResolvedValueOnce({
        id: 'workflow-1',
        version: 12,
      });
      mockWorkflowVersionService.publish.mockResolvedValueOnce({
        id: 'published-12',
        version: 12,
      });

      const result = await service.mutationService.applyChange(makeContext(), {
        proposal: makeProposal({
          targetKind: 'workflow',
          targetId: 'workflow-1',
          targetLabel: '审批流',
          baseVersion: 11,
          publishTarget: true,
          category: 'workflow_edit',
          metadataPatch: { name: '审批流 v2' },
          viewport: { x: 5, y: 6, zoom: 0.9 },
          nodeOperations: [
            {
              op: 'add',
              node: { id: 'b', data: { nodeType: 'text' } },
            },
          ],
        }),
      });

      expect(mockWorkflowVersionService.updateDefinition).toHaveBeenCalledWith(
        'workflow-1',
        'user-1',
        {
          version: 11,
          nodes: [
            { id: 'a', data: { nodeType: 'text' } },
            { id: 'b', data: { nodeType: 'text' } },
          ],
          edges: [],
          viewport: { x: 5, y: 6, zoom: 0.9 },
          name: '审批流 v2',
        },
      );
      expect(mockWorkflowVersionService.publish).toHaveBeenCalledWith(
        'workflow-1',
        {},
        'user-1',
      );
      expect(result).toMatchObject({
        success: true,
        data: {
          targetType: 'workflow',
          targetId: 'workflow-1',
          applied: true,
          publish: { id: 'published-12' },
        },
      });
    });

    it('agent apply 应透传 expectedVersion，未发布时回退草稿版本展示且不建议重启', async () => {
      vi.spyOn(service.readService, 'loadGraphTarget').mockResolvedValueOnce({
        kind: 'agent',
        id: 'agent-2',
        label: '外部 Agent',
        version: 5,
        publishedVersionId: null,
        nodes: [],
        edges: [],
        viewport: null,
      });
      mockAgentDefinitionService.applyCanvasSnapshot.mockResolvedValueOnce({
        detail: { id: 'agent-2', version: 6 },
      });

      const result = await service.mutationService.applyChange(makeContext(), {
        proposal: makeProposal({
          targetKind: 'agent',
          targetId: 'agent-2',
          targetLabel: '外部 Agent',
          baseVersion: 5,
          viewport: { x: 1, y: 2, zoom: 1 },
        }),
      });

      expect(
        mockAgentDefinitionService.applyCanvasSnapshot,
      ).toHaveBeenCalledWith(
        'agent-2',
        expect.objectContaining({
          expectedVersion: 5,
          publishAfterSave: false,
          canvasViewport: { x: 1, y: 2, zoom: 1 },
        }),
        'user-1',
      );
      expect(result).toMatchObject({
        success: true,
        data: {
          versionInfo: {
            draftVersion: 6,
            userVisibleVersionNumber: 6,
          },
        },
      });
      expect((result.data as any).restartSuggestion).toBeUndefined();
    });

    it('applyChange 应保留底层 OCC 错误，并拒绝伪造 proposal', async () => {
      vi.spyOn(service.readService, 'loadGraphTarget').mockResolvedValueOnce({
        kind: 'agent',
        id: 'agent-1',
        label: '当前 Agent',
        version: 4,
        nodes: [],
        edges: [],
      });
      mockAgentDefinitionService.applyCanvasSnapshot.mockRejectedValueOnce(
        new Error('版本冲突：expectedVersion=3 currentVersion=4'),
      );

      await expect(
        service.mutationService.applyChange(makeContext(), {
          proposal: makeProposal({ baseVersion: 3 }),
        }),
      ).resolves.toEqual({
        success: false,
        data: null,
        error: '版本冲突：expectedVersion=3 currentVersion=4',
      });
      await expect(
        service.mutationService.applyChange(makeContext(), {
          proposal: { ...makeProposal(), category: 'not-a-category' },
        }),
      ).resolves.toEqual({
        success: false,
        data: null,
        error: 'proposal 缺失或格式非法',
      });
    });

    it('createResource 应创建 skill/workspace/agent/workflow 并规范可选字段', async () => {
      mockSkillService.create.mockResolvedValueOnce({ id: 'skill-1' });
      mockWorkspaceService.resolveOrganizationId.mockResolvedValueOnce('org-1');
      mockWorkspaceService.createEmpty.mockResolvedValueOnce({
        id: 'workspace-1',
      });
      mockAgentDefinitionService.create.mockResolvedValueOnce({
        id: 'agent-2',
      });
      mockWorkflowVersionService.create.mockResolvedValueOnce({
        id: 'workflow-1',
      });

      const skill = await service.mutationService.createResource(makeContext(), {
        resourceType: 'skill',
        spec: {
          name: 'Skill',
          description: ' desc ',
          files: { 'SKILL.md': '# skill', 'guide.md': 'guide' },
        },
      });
      expect(skill).toMatchObject({
        success: true,
        data: { resourceType: 'skill', resource: { id: 'skill-1' } },
      });
      expect(mockSkillService.create).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        { name: 'Skill', description: 'desc' },
        [
          expect.objectContaining({
            filename: 'SKILL.md',
            mimetype: 'text/markdown',
          }),
          expect.objectContaining({ filename: 'guide.md' }),
        ],
      );

      await service.mutationService.createResource(makeContext(), {
        resourceType: 'workspace',
        spec: { name: 'Workspace', description: ' workspace ' },
      });
      expect(mockWorkspaceService.createEmpty).toHaveBeenCalledWith(
        'tenant-1',
        'org-1',
        'user-1',
        'Workspace',
        'workspace',
      );

      await service.mutationService.createResource(makeContext(), {
        resourceType: 'agent',
        spec: { name: 'Agent', description: 'desc', icon: 'robot' },
      });
      expect(mockAgentDefinitionService.create).toHaveBeenCalledWith(
        { name: 'Agent', description: 'desc', icon: 'robot' },
        'user-1',
      );

      await service.mutationService.createResource(makeContext(), {
        resourceType: 'workflow',
        spec: { name: 'Workflow', description: 'desc', icon: 'flow' },
      });
      expect(mockWorkflowVersionService.create).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        { name: 'Workflow', description: 'desc', icon: 'flow' },
      );
    });

    it('createResource 应导入 MCP，并从 content 构造默认 Skill 文件', async () => {
      mockMcpService.importTools.mockResolvedValueOnce({ imported: 2 });
      mockSkillService.create.mockResolvedValueOnce({ id: 'skill-content' });

      const mcp = await service.mutationService.createResource(makeContext(), {
        resourceType: 'mcp',
        spec: {
          serverName: 'Web MCP',
          serverDescription: 'search',
          connection: { type: 'sse', url: 'https://example.test/sse' },
          toolNames: ['search', '', 1],
          conflictStrategy: 'overwrite',
        },
      });
      expect(mockMcpService.importTools).toHaveBeenCalledWith(
        {
          serverName: 'Web MCP',
          serverDescription: 'search',
          connection: { type: 'sse', url: 'https://example.test/sse' },
          toolNames: ['search'],
          conflictStrategy: 'overwrite',
        },
        'user-1',
        'tenant-1',
      );
      expect(mcp).toMatchObject({
        success: true,
        data: { resourceType: 'mcp', resource: { imported: 2 } },
      });

      await service.mutationService.createResource(makeContext(), {
        resourceType: 'skill',
        spec: { name: 'Inline Skill', content: '# inline' },
      });
      const files = mockSkillService.create.mock.calls[0]?.[3];
      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({ filename: 'SKILL.md' });
      expect(files[0].buffer.toString('utf-8')).toBe('# inline');
    });

    it('createResource 应支持已有 Provider 与内联 Provider 的模型创建参数', async () => {
      mockLlmService.create
        .mockResolvedValueOnce({ id: 'model-existing' })
        .mockResolvedValueOnce({ id: 'model-inline' });
      mockLlmProviderService.create.mockResolvedValueOnce({
        id: 'provider-inline',
      });

      await service.mutationService.createResource(makeContext(), {
        resourceType: 'model',
        spec: {
          name: 'Embedding',
          providerId: 'provider-existing',
          modelId: 'embed-1',
          modelType: 'embedding',
          parameters: { dimensions: 1536 },
          capabilities: { embeddings: true },
          contextWindow: 8192,
          maxOutputTokens: 1024,
          timeoutMs: 30000,
        },
      });
      expect(mockLlmService.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          name: 'Embedding',
          providerId: 'provider-existing',
          modelId: 'embed-1',
          modelType: 'embedding',
          parameters: { dimensions: 1536 },
          capabilities: { embeddings: true },
          contextWindow: 8192,
          maxOutputTokens: 1024,
          timeoutMs: 30000,
        }),
        'tenant-1',
        'user-1',
      );

      await service.mutationService.createResource(makeContext(), {
        resourceType: 'model',
        spec: {
          name: 'Chat',
          modelId: 'chat-1',
          provider: {
            name: 'Inline Provider',
            baseUrl: 'https://api.example.test',
            slug: 'inline',
            apiProtocol: 'openai',
            apiKey: 'secret',
            iconUrl: 'https://example.test/icon.svg',
          },
        },
      });
      expect(mockLlmProviderService.create).toHaveBeenCalledWith(
        {
          name: 'Inline Provider',
          baseUrl: 'https://api.example.test',
          slug: 'inline',
          apiProtocol: 'openai',
          apiKey: 'secret',
          iconUrl: 'https://example.test/icon.svg',
        },
        'tenant-1',
        'user-1',
      );
      expect(mockLlmService.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          name: 'Chat',
          providerId: 'provider-inline',
          modelId: 'chat-1',
          modelType: 'chat',
        }),
        'tenant-1',
        'user-1',
      );
    });

    it.each([
      [{}, 'resourceType 与 spec 都是必填项'],
      [{ resourceType: 'unknown', spec: {} }, '不支持的 resourceType: unknown'],
      [
        { resourceType: 'model', spec: { name: 'M', modelId: 'm' } },
        '创建模型时必须提供 providerId 或 provider 配置',
      ],
      [
        {
          resourceType: 'mcp',
          spec: { serverName: 'MCP', connection: {}, toolNames: [] },
        },
        'spec.toolNames 至少需要包含一个字符串',
      ],
      [{ resourceType: 'skill', spec: { name: '' } }, 'spec.name 是必填字符串'],
    ])(
      'createResource 应将无效资源参数转换为失败结果 %#',
      async (input, error) => {
        await expect(
          service.mutationService.createResource(makeContext(), input),
        ).resolves.toEqual({ success: false, data: null, error });
      },
    );

    it('资源与外部创建在 policy 关闭时应在审批前拒绝且不注册请求', async () => {
      vi.spyOn(service as any, 'buildSessionContext').mockResolvedValue(
        makeContext({
          selfEvolutionPolicy: {
            enabled: true,
            resourceManagement: false,
            externalEditing: false,
            sandboxManagement: false,
          },
        }),
      );

      await expect(
        service.handleSessionToolPreflight(
          makeSession(),
          'create_resource',
          'create-skill',
          { resourceType: 'skill', spec: { name: 'Denied' } },
        ),
      ).rejects.toThrow('未启用资源管理');
      await expect(
        service.handleSessionToolPreflight(
          makeSession(),
          'create_resource',
          'create-agent',
          { resourceType: 'agent', spec: { name: 'Denied' } },
        ),
      ).rejects.toThrow('未启用外部编辑');
      expect(
        mockPermissionService.registerPendingRequest,
      ).not.toHaveBeenCalled();
    });
  });

  describe('session context and restart validation', () => {
    it('buildSessionContext 应优先 workflowState conversation 并使用 conversation owner 授权', async () => {
      enqueueSelectResult([
        { id: 'workflow-conversation', createdBy: 'owner-1' },
      ]);
      mockAgentDefinitionService.findDetailById.mockResolvedValueOnce({
        id: 'agent-1',
        name: 'Runtime Agent',
      });
      const session: AgentSession = {
        ...makeSession(),
        context: {
          ...makeSession().context,
          workflowState: {
            agentConversationId: 'workflow-conversation',
          },
        },
        runtimeConfig: {
          selfEvolutionPolicy: {
            enabled: true,
            resourceManagement: false,
            externalEditing: true,
            sandboxManagement: false,
          },
        },
      };

      await expect(
        (service as any).buildSessionContext(session),
      ).resolves.toMatchObject({
        conversationId: 'workflow-conversation',
        tenantId: 'tenant-1',
        actorUserId: 'owner-1',
        currentAgentName: 'Runtime Agent',
        selfEvolutionPolicy: {
          enabled: true,
          resourceManagement: false,
          externalEditing: true,
        },
      });
    });

    it('buildSessionContext 应拒绝未绑定会话、缺 tenant、未知会话和未启用 policy', async () => {
      const noConversation: AgentSession = {
        ...makeSession(),
        context: {
          ...makeSession().context,
          serverSandbox: undefined,
        },
      };
      await expect(
        (service as any).buildSessionContext(noConversation),
      ).rejects.toThrow('不绑定 conversation');

      const noTenant: AgentSession = {
        ...makeSession(),
        tenantId: undefined,
      };
      await expect(
        (service as any).buildSessionContext(noTenant),
      ).rejects.toThrow('缺少 tenantId');

      enqueueSelectResult([]);
      await expect(
        (service as any).buildSessionContext(makeSession()),
      ).rejects.toThrow('Conversation conversation-1 不存在');

      enqueueSelectResult([{ id: 'conversation-1', createdBy: 'owner-1' }]);
      mockAgentDefinitionService.findDetailById.mockResolvedValueOnce({
        id: 'agent-1',
        name: 'Agent',
      });
      await expect(
        (service as any).buildSessionContext(makeSession()),
      ).rejects.toThrow('未启用自进化能力');
    });

    it('restartConversationToLatestVersion 应拒绝未知会话和无发布版本', async () => {
      enqueueSelectResult([]);
      await expect(
        service.restartConversationToLatestVersion(
          'missing',
          'tenant-1',
          'user-1',
        ),
      ).rejects.toThrow('Conversation missing not found');

      enqueueSelectResult([
        {
          id: 'conversation-1',
          agentDefinitionId: 'agent-1',
          metadata: {},
        },
      ]);
      mockAgentDefinitionService.findDetailById.mockResolvedValueOnce({
        id: 'agent-1',
        name: 'Agent',
        publishedVersionId: null,
      });
      await expect(
        service.restartConversationToLatestVersion(
          'conversation-1',
          'tenant-1',
          'user-1',
        ),
      ).rejects.toThrow('没有可切换的已发布版本');
    });
  });
});

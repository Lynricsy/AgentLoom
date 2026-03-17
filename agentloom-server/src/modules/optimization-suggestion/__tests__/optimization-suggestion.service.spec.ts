import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import type {
  AutonomyUpgradeValue,
  ModelDowngradeValue,
  OptimizationSuggestion,
  ReactFlowNode,
  ToolPruningValue,
  WorkflowDefinition,
} from '../../../database/schema';
import { WorkflowVersionConflictException } from '../../workflow-definition/workflow-version.exceptions';
import { OptimizationSuggestionService } from '../optimization-suggestion.service';

const mocks = vi.hoisted(() => ({
  getTenantDb: vi.fn(),
  createMockDb: () => ({
    select: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  }),
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WORKFLOW_ID = '33333333-3333-4333-8333-333333333333';
const SUGGESTION_ID = '44444444-4444-4444-8444-444444444444';
const NODE_ID = 'agent-node-1';
const NOW = new Date('2025-01-01T00:00:00.000Z');

function createSelectWhereResolved(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createSelectOrderedResolved(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createSelectPaginatedResolved(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
    }),
  };
}

function createUpdateReturning(result: unknown) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createWorkflowNode(
  config: Record<string, unknown>,
  id = NODE_ID,
): ReactFlowNode {
  return {
    id,
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      label: 'Agent',
      config,
    },
  };
}

function createWorkflowDefinition(nodes: ReactFlowNode[]): WorkflowDefinition {
  return {
    id: WORKFLOW_ID,
    tenantId: TENANT_ID,
    name: '优化工作流',
    slug: 'optimized-workflow',
    description: '用于测试的工作流',
    nodes,
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    metadata: {},
    inputSchema: null,
    version: 1,
    status: 'draft',
    publishedVersionId: null,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createSuggestion(
  overrides: Partial<OptimizationSuggestion> = {},
): OptimizationSuggestion {
  return {
    id: SUGGESTION_ID,
    tenantId: TENANT_ID,
    workflowDefinitionId: WORKFLOW_ID,
    nodeId: NODE_ID,
    suggestionType: 'model_downgrade',
    status: 'pending',
    confidence: 0.91,
    currentValue: {
      modelId: 'model-pro',
      modelName: 'GPT Pro',
      provider: 'openai',
    },
    suggestedValue: {
      modelId: 'model-mini',
      modelName: 'GPT Mini',
      provider: 'openai',
    },
    rationale: '成本优化',
    impactEstimate: {
      costSavingPct: 0.4,
      latencyImpactPct: -0.1,
    },
    analysisMetadata: {
      totalRecords: 100,
      analyzerVersion: '1.0.0',
    },
    analysisPeriodStart: NOW,
    analysisPeriodEnd: NOW,
    appliedAt: null,
    appliedByUserId: null,
    dismissedAt: null,
    dismissedByUserId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('OptimizationSuggestionService', () => {
  let service: OptimizationSuggestionService;
  let db: ReturnType<typeof mocks.createMockDb>;
  let txDb: ReturnType<typeof mocks.createMockDb>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    db = mocks.createMockDb();
    txDb = mocks.createMockDb();

    mocks.getTenantDb.mockReturnValue(db);
    db.transaction.mockImplementation(async (callback) => callback(txDb));

    const module = await Test.createTestingModule({
      providers: [
        OptimizationSuggestionService,
        {
          provide: DRIZZLE,
          useValue: db,
        },
      ],
    }).compile();

    service = module.get(OptimizationSuggestionService);
  });

  describe('findByWorkflowAndNode', () => {
    it('应按工作流、节点与状态返回建议列表', async () => {
      const suggestions = [createSuggestion()];
      db.select.mockReturnValue(createSelectOrderedResolved(suggestions));

      await expect(
        service.findByWorkflowAndNode(WORKFLOW_ID, NODE_ID, 'pending'),
      ).resolves.toEqual(suggestions);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('未提供状态时也应返回建议列表', async () => {
      const suggestions = [createSuggestion()];
      db.select.mockReturnValue(createSelectOrderedResolved(suggestions));

      await expect(
        service.findByWorkflowAndNode(WORKFLOW_ID, NODE_ID),
      ).resolves.toEqual(suggestions);
    });
  });

  describe('findByTenant', () => {
    it('应返回分页结果与 meta', async () => {
      const suggestions = [createSuggestion()];
      db.select
        .mockReturnValueOnce(createSelectPaginatedResolved(suggestions))
        .mockReturnValueOnce(createSelectWhereResolved([{ total: 3 }]));

      await expect(
        service.findByTenant({
          limit: 2,
          offset: 2,
          status: 'pending',
          suggestionType: 'model_downgrade',
        }),
      ).resolves.toEqual({
        data: suggestions,
        meta: {
          total: 3,
          limit: 2,
          offset: 2,
          hasMore: false,
        },
      });
    });

    it('未提供过滤条件时应使用默认分页参数', async () => {
      const suggestions = [createSuggestion()];
      db.select
        .mockReturnValueOnce(createSelectPaginatedResolved(suggestions))
        .mockReturnValueOnce(createSelectWhereResolved([{ total: 5 }]));

      await expect(service.findByTenant({})).resolves.toEqual({
        data: suggestions,
        meta: {
          total: 5,
          limit: 50,
          offset: 0,
          hasMore: false,
        },
      });
    });
  });

  describe('findById', () => {
    it('应返回单条建议', async () => {
      const suggestion = createSuggestion();
      db.select.mockReturnValue(createSelectWhereResolved([suggestion]));

      await expect(service.findById(SUGGESTION_ID)).resolves.toEqual(suggestion);
    });

    it('建议不存在时应抛出 404 DomainException', async () => {
      db.select.mockReturnValue(createSelectWhereResolved([]));

      await expect(service.findById(SUGGESTION_ID)).rejects.toMatchObject({
        type: 'OPTIMIZATION_SUGGESTION_NOT_FOUND',
        status: 404,
      } as Record<string, unknown>);
    });
  });

  describe('applySuggestion', () => {
    it('应应用 model_downgrade 建议并更新工作流', async () => {
      const suggestion = createSuggestion({
        suggestionType: 'model_downgrade',
        suggestedValue: {
          modelId: 'model-economy',
          modelName: 'Economy Model',
          provider: 'openrouter',
        } satisfies ModelDowngradeValue,
      });
      const workflow = createWorkflowDefinition([
        createWorkflowNode({
          modelId: 'model-pro',
          modelName: 'GPT Pro',
          provider: 'openai',
        }),
      ]);
      const workflowUpdate = createUpdateReturning([{ id: WORKFLOW_ID }]);
      const updatedSuggestion = createSuggestion({
        ...suggestion,
        status: 'applied',
        appliedAt: NOW,
        appliedByUserId: USER_ID,
      });
      const suggestionUpdate = createUpdateReturning([updatedSuggestion]);

      db.select
        .mockReturnValueOnce(createSelectWhereResolved([suggestion]))
        .mockReturnValueOnce(createSelectWhereResolved([workflow]));
      txDb.update
        .mockReturnValueOnce(workflowUpdate)
        .mockReturnValueOnce(suggestionUpdate);

      await expect(
        service.applySuggestion(SUGGESTION_ID, USER_ID),
      ).resolves.toEqual(updatedSuggestion);

      const workflowSetPayload = workflowUpdate.set.mock.calls[0]?.[0] as {
        version: number;
        nodes: ReactFlowNode[];
      };
      expect(workflowSetPayload.version).toBe(2);
      expect(workflowSetPayload.nodes[0]).toMatchObject({
        data: {
          config: {
            modelId: 'model-economy',
            modelName: 'Economy Model',
            provider: 'openrouter',
          },
        },
      });
      expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it('应应用 timeout_adjustment 建议', async () => {
      const suggestion = createSuggestion({
        suggestionType: 'timeout_adjustment',
        suggestedValue: { timeoutMs: 45_000 },
      });
      const workflow = createWorkflowDefinition([
        createWorkflowNode({ timeoutMs: 60_000 }),
      ]);
      const workflowUpdate = createUpdateReturning([{ id: WORKFLOW_ID }]);
      const suggestionUpdate = createUpdateReturning([
        createSuggestion({
          ...suggestion,
          status: 'applied',
          appliedAt: NOW,
          appliedByUserId: USER_ID,
        }),
      ]);

      db.select
        .mockReturnValueOnce(createSelectWhereResolved([suggestion]))
        .mockReturnValueOnce(createSelectWhereResolved([workflow]));
      txDb.update
        .mockReturnValueOnce(workflowUpdate)
        .mockReturnValueOnce(suggestionUpdate);

      await service.applySuggestion(SUGGESTION_ID, USER_ID);

      const workflowSetPayload = workflowUpdate.set.mock.calls[0]?.[0] as {
        nodes: ReactFlowNode[];
      };
      expect(workflowSetPayload.nodes[0]).toMatchObject({
        data: {
          config: {
            timeoutMs: 45_000,
          },
        },
      });
    });

    it('应应用 tool_pruning 建议', async () => {
      const suggestion = createSuggestion({
        suggestionType: 'tool_pruning',
        suggestedValue: {
          tools: ['search', 'summarize'],
          removedTools: ['browser'],
        } satisfies ToolPruningValue,
      });
      const workflow = createWorkflowDefinition([
        createWorkflowNode({ tools: ['search', 'browser', 'summarize'] }),
      ]);
      const workflowUpdate = createUpdateReturning([{ id: WORKFLOW_ID }]);
      const suggestionUpdate = createUpdateReturning([
        createSuggestion({
          ...suggestion,
          status: 'applied',
          appliedAt: NOW,
          appliedByUserId: USER_ID,
        }),
      ]);

      db.select
        .mockReturnValueOnce(createSelectWhereResolved([suggestion]))
        .mockReturnValueOnce(createSelectWhereResolved([workflow]));
      txDb.update
        .mockReturnValueOnce(workflowUpdate)
        .mockReturnValueOnce(suggestionUpdate);

      await service.applySuggestion(SUGGESTION_ID, USER_ID);

      const workflowSetPayload = workflowUpdate.set.mock.calls[0]?.[0] as {
        nodes: ReactFlowNode[];
      };
      expect(workflowSetPayload.nodes[0]).toMatchObject({
        data: {
          config: {
            tools: ['search', 'summarize'],
          },
        },
      });
    });

    it('应应用 autonomy_upgrade 建议', async () => {
      const suggestion = createSuggestion({
        suggestionType: 'autonomy_upgrade',
        suggestedValue: {
          autonomyMode: 'full_autonomy',
        } satisfies AutonomyUpgradeValue,
      });
      const workflow = createWorkflowDefinition([
        createWorkflowNode({ autonomyMode: 'manual' }),
      ]);
      const workflowUpdate = createUpdateReturning([{ id: WORKFLOW_ID }]);
      const suggestionUpdate = createUpdateReturning([
        createSuggestion({
          ...suggestion,
          status: 'applied',
          appliedAt: NOW,
          appliedByUserId: USER_ID,
        }),
      ]);

      db.select
        .mockReturnValueOnce(createSelectWhereResolved([suggestion]))
        .mockReturnValueOnce(createSelectWhereResolved([workflow]));
      txDb.update
        .mockReturnValueOnce(workflowUpdate)
        .mockReturnValueOnce(suggestionUpdate);

      await service.applySuggestion(SUGGESTION_ID, USER_ID);

      const workflowSetPayload = workflowUpdate.set.mock.calls[0]?.[0] as {
        nodes: ReactFlowNode[];
      };
      expect(workflowSetPayload.nodes[0]).toMatchObject({
        data: {
          autonomyMode: 'full_autonomy',
          autonomyConfig: {
            mode: 'full_autonomy',
          },
          config: {
            autonomyMode: 'full_autonomy',
          },
        },
      });
    });

    it('建议不存在时应抛出 404 DomainException', async () => {
      db.select.mockReturnValue(createSelectWhereResolved([]));

      await expect(
        service.applySuggestion(SUGGESTION_ID, USER_ID),
      ).rejects.toMatchObject({
        type: 'OPTIMIZATION_SUGGESTION_NOT_FOUND',
        status: 404,
      } as Record<string, unknown>);
    });

    it('建议非 pending 状态时应抛出 409 DomainException', async () => {
      db.select.mockReturnValue(
        createSelectWhereResolved([createSuggestion({ status: 'applied' })]),
      );

      await expect(
        service.applySuggestion(SUGGESTION_ID, USER_ID),
      ).rejects.toMatchObject({
        type: 'OPTIMIZATION_SUGGESTION_STATUS_CONFLICT',
        status: 409,
      } as Record<string, unknown>);
    });

    it('工作流节点不存在时应抛出 404 DomainException', async () => {
      const suggestion = createSuggestion();
      const workflow = createWorkflowDefinition([
        createWorkflowNode({ modelId: 'other' }, 'different-node'),
      ]);

      db.select
        .mockReturnValueOnce(createSelectWhereResolved([suggestion]))
        .mockReturnValueOnce(createSelectWhereResolved([workflow]));

      await expect(
        service.applySuggestion(SUGGESTION_ID, USER_ID),
      ).rejects.toMatchObject({
        type: 'OPTIMIZATION_SUGGESTION_NODE_NOT_FOUND',
        status: 404,
      } as Record<string, unknown>);
    });

    it('工作流版本冲突时应抛出 WorkflowVersionConflictException', async () => {
      const suggestion = createSuggestion();
      const workflow = createWorkflowDefinition([
        createWorkflowNode({ modelId: 'model-pro' }),
      ]);
      const workflowUpdate = createUpdateReturning([]);

      db.select
        .mockReturnValueOnce(createSelectWhereResolved([suggestion]))
        .mockReturnValueOnce(createSelectWhereResolved([workflow]));
      txDb.update.mockReturnValueOnce(workflowUpdate);
      txDb.select.mockReturnValue(
        createSelectWhereResolved([{ version: workflow.version + 2 }]),
      );

      await expect(
        service.applySuggestion(SUGGESTION_ID, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowVersionConflictException);

      expect(workflowUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          version: workflow.version + 1,
          updatedBy: USER_ID,
        }),
      );
    });

    it('建议状态在事务中变化时应抛出 409 DomainException', async () => {
      const suggestion = createSuggestion();
      const workflow = createWorkflowDefinition([
        createWorkflowNode({ modelId: 'model-pro' }),
      ]);
      const workflowUpdate = createUpdateReturning([{ id: WORKFLOW_ID }]);
      const suggestionUpdate = createUpdateReturning([]);

      db.select
        .mockReturnValueOnce(createSelectWhereResolved([suggestion]))
        .mockReturnValueOnce(createSelectWhereResolved([workflow]));
      txDb.update
        .mockReturnValueOnce(workflowUpdate)
        .mockReturnValueOnce(suggestionUpdate);
      txDb.select.mockReturnValue(
        createSelectWhereResolved([{ status: 'dismissed' }]),
      );

      await expect(
        service.applySuggestion(SUGGESTION_ID, USER_ID),
      ).rejects.toMatchObject({
        type: 'OPTIMIZATION_SUGGESTION_STATUS_CONFLICT',
        status: 409,
        detail: `Optimization suggestion ${SUGGESTION_ID} is already dismissed`,
      } as Record<string, unknown>);
    });
  });

  describe('dismissSuggestion', () => {
    it('应将 pending 建议标记为 dismissed', async () => {
      const suggestion = createSuggestion();
      const updatedSuggestion = createSuggestion({
        status: 'dismissed',
        dismissedAt: NOW,
        dismissedByUserId: USER_ID,
      });
      const updateChain = createUpdateReturning([updatedSuggestion]);

      db.select.mockReturnValue(createSelectWhereResolved([suggestion]));
      db.update.mockReturnValue(updateChain);

      await expect(
        service.dismissSuggestion(SUGGESTION_ID, USER_ID),
      ).resolves.toEqual(updatedSuggestion);
    });

    it('建议不存在时应抛出 404 DomainException', async () => {
      db.select.mockReturnValue(createSelectWhereResolved([]));

      await expect(
        service.dismissSuggestion(SUGGESTION_ID, USER_ID),
      ).rejects.toMatchObject({
        type: 'OPTIMIZATION_SUGGESTION_NOT_FOUND',
        status: 404,
      } as Record<string, unknown>);
    });

    it('建议非 pending 状态时应抛出 409 DomainException', async () => {
      db.select.mockReturnValue(
        createSelectWhereResolved([createSuggestion({ status: 'dismissed' })]),
      );

      await expect(
        service.dismissSuggestion(SUGGESTION_ID, USER_ID),
      ).rejects.toMatchObject({
        type: 'OPTIMIZATION_SUGGESTION_STATUS_CONFLICT',
        status: 409,
      } as Record<string, unknown>);
    });

    it('建议状态在更新时变化应抛出 409 DomainException', async () => {
      const suggestion = createSuggestion();
      const updateChain = createUpdateReturning([]);

      db.select
        .mockReturnValueOnce(createSelectWhereResolved([suggestion]))
        .mockReturnValueOnce(createSelectWhereResolved([{ status: 'applied' }]));
      db.update.mockReturnValue(updateChain);

      await expect(
        service.dismissSuggestion(SUGGESTION_ID, USER_ID),
      ).rejects.toMatchObject({
        type: 'OPTIMIZATION_SUGGESTION_STATUS_CONFLICT',
        status: 409,
        detail: `Optimization suggestion ${SUGGESTION_ID} is already applied`,
      } as Record<string, unknown>);
    });
  });

  describe('getAdoptionStats', () => {
    it('应返回整体与按类型的采纳统计', async () => {
      db.select.mockReturnValue(
        createSelectWhereResolved([
          {
            suggestionType: 'model_downgrade',
            status: 'applied',
          },
          {
            suggestionType: 'model_downgrade',
            status: 'dismissed',
          },
          {
            suggestionType: 'tool_pruning',
            status: 'pending',
          },
        ]),
      );

      await expect(service.getAdoptionStats(WORKFLOW_ID)).resolves.toEqual({
        total: 3,
        applied: 1,
        dismissed: 1,
        pending: 1,
        adoptionRate: 0.5,
        targetRate: 0.5,
        byType: [
          {
            suggestionType: 'model_downgrade',
            total: 2,
            applied: 1,
            dismissed: 1,
            pending: 0,
            adoptionRate: 0.5,
          },
          {
            suggestionType: 'tool_pruning',
            total: 1,
            applied: 0,
            dismissed: 0,
            pending: 1,
            adoptionRate: 0,
          },
        ],
      });
    });

    it('无已处理建议时 adoptionRate 应为 0', async () => {
      db.select.mockReturnValue(
        createSelectWhereResolved([
          {
            suggestionType: 'timeout_adjustment',
            status: 'pending',
          },
        ]),
      );

      await expect(service.getAdoptionStats()).resolves.toEqual({
        total: 1,
        applied: 0,
        dismissed: 0,
        pending: 1,
        adoptionRate: 0,
        targetRate: 0.5,
        byType: [
          {
            suggestionType: 'timeout_adjustment',
            total: 1,
            applied: 0,
            dismissed: 0,
            pending: 1,
            adoptionRate: 0,
          },
        ],
      });
    });
  });
});

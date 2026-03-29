import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMockDb, runInTenantTransaction } = vi.hoisted(() => ({
  createMockDb: () => ({
    select: vi.fn(),
    insert: vi.fn(),
  }),
  runInTenantTransaction: vi.fn(),
}));

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction,
}));

import type { DrizzleDB } from '../../../database/database.module';
import type { AnalysisContext, SuggestionCandidate } from '../analyzers';
import type { OrganizationAutonomyPolicyService } from '../../organization/organization-autonomy-policy.service';
import { OptimizationAnalysisService } from '../optimization-analysis.service';

type MockDb = ReturnType<typeof createMockDb>;

type SelectChain<TResult> = {
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
} & Promise<TResult[]>;

function createSelectChain<TResult>(result: TResult[]): SelectChain<TResult> {
  const chain = Promise.resolve(result) as SelectChain<TResult>;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);

  return chain;
}

function createInsertChain() {
  return {
    values: vi.fn().mockResolvedValue(undefined),
  };
}

function createWorkflow(
  id: string,
  tenantId: string,
  nodeIds: string[],
): {
  id: string;
  tenantId: string;
  nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>;
} {
  return {
    id,
    tenantId,
    nodes: nodeIds.map((nodeId) => ({
      id: nodeId,
      type: 'agent',
      data: {
        config: {
          model: {
            modelId: 'gpt-4',
            modelName: 'GPT-4',
            provider: 'openai',
          },
        },
        toolBindings: ['search'],
        autonomyConfig: { mode: 'MANUAL_CONFIRM' },
      },
    })),
  };
}

function createTelemetryRecord(executionId: string, nodeId: string) {
  return {
    executionId,
    stepId: `${executionId}-step`,
    nodeId,
    telemetryData: {
      llmInteractions: {
        modelId: 'gpt-4',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        latencyMs: 4_000,
      },
      errors: [],
      toolCalls: [
        {
          toolName: 'search',
          input: {},
          output: {},
          durationMs: 250,
          status: 'success',
        },
      ],
      selfRepairs: [],
    },
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
  };
}

function createSummaryRecord(executionId: string, nodeId: string) {
  return {
    executionId,
    stepId: `${executionId}-step`,
    nodeId,
    summaryData: {
      totalSteps: 1,
      completedSteps: 1,
      failedSteps: 0,
      totalToolCalls: 1,
      totalErrors: 0,
      totalSelfRepairs: 0,
      totalTokens: 150,
      totalLatencyMs: 4_000,
      avgStepLatencyMs: 4_000,
      executionDurationMs: 6_000,
    },
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
  };
}

function createCandidate(
  suggestionType: SuggestionCandidate['suggestionType'],
): SuggestionCandidate {
  switch (suggestionType) {
    case 'model_downgrade':
      return {
        suggestionType,
        confidence: 0.9,
        currentValue: {
          modelId: 'gpt-4',
          modelName: 'GPT-4',
          provider: 'openai',
        },
        suggestedValue: {
          modelId: 'gpt-4o-mini',
          modelName: 'GPT-4o Mini',
          provider: 'openai',
        },
        rationale: `${suggestionType} rationale`,
      };
    case 'timeout_adjustment':
      return {
        suggestionType,
        confidence: 0.9,
        currentValue: { timeoutMs: 45_000 },
        suggestedValue: { timeoutMs: 30_000 },
        rationale: `${suggestionType} rationale`,
      };
    case 'tool_pruning':
      return {
        suggestionType,
        confidence: 0.9,
        currentValue: { tools: ['search', 'browser'], removedTools: [] },
        suggestedValue: { tools: ['search'], removedTools: ['browser'] },
        rationale: `${suggestionType} rationale`,
      };
    case 'autonomy_upgrade':
      return {
        suggestionType,
        confidence: 0.9,
        currentValue: { autonomyMode: 'RULE_BASED' },
        suggestedValue: { autonomyMode: 'MANUAL_CONFIRM' },
        rationale: `${suggestionType} rationale`,
      };
  }
}

function createAnalyzer(
  type: SuggestionCandidate['suggestionType'],
  implementation?: (context: AnalysisContext) => SuggestionCandidate | null,
) {
  return {
    type,
    analyze: vi.fn(
      (context: AnalysisContext) => implementation?.(context) ?? null,
    ),
  };
}

describe('OptimizationAnalysisService', () => {
  let service: OptimizationAnalysisService;
  let mockDb: MockDb;
  let modelDowngradeAnalyzer: ReturnType<typeof createAnalyzer>;
  let timeoutAdjustmentAnalyzer: ReturnType<typeof createAnalyzer>;
  let toolPruningAnalyzer: ReturnType<typeof createAnalyzer>;
  let autonomyUpgradeAnalyzer: ReturnType<typeof createAnalyzer>;
  let organizationAutonomyPolicyService: {
    resolveAutonomyCapForTenant: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = createMockDb();
    modelDowngradeAnalyzer = createAnalyzer('model_downgrade');
    timeoutAdjustmentAnalyzer = createAnalyzer('timeout_adjustment');
    toolPruningAnalyzer = createAnalyzer('tool_pruning');
    autonomyUpgradeAnalyzer = createAnalyzer('autonomy_upgrade');
    organizationAutonomyPolicyService = {
      resolveAutonomyCapForTenant: vi.fn().mockResolvedValue('LLM_SUGGEST'),
    };

    runInTenantTransaction.mockImplementation(
      async (
        db: unknown,
        _tenantId: string,
        operation: (tenantDb: unknown) => Promise<unknown>,
      ) => operation(db),
    );

    service = new OptimizationAnalysisService(
      mockDb as unknown as DrizzleDB,
      modelDowngradeAnalyzer as never,
      timeoutAdjustmentAnalyzer as never,
      toolPruningAnalyzer as never,
      autonomyUpgradeAnalyzer as never,
      organizationAutonomyPolicyService as unknown as OrganizationAutonomyPolicyService,
    );
  });

  it('应跨租户运行分析并批量写入新建议', async () => {
    const tenantOne = '11111111-1111-4111-8111-111111111111';
    const tenantTwo = '22222222-2222-4222-8222-222222222222';
    const insertChainOne = createInsertChain();
    const insertChainTwo = createInsertChain();

    modelDowngradeAnalyzer.analyze.mockReturnValue(
      createCandidate('model_downgrade'),
    );

    mockDb.select
      .mockReturnValueOnce(
        createSelectChain([{ tenantId: tenantOne }, { tenantId: tenantTwo }]),
      )
      .mockReturnValueOnce(
        createSelectChain([createWorkflow('wf-1', tenantOne, ['node-1'])]),
      )
      .mockReturnValueOnce(createSelectChain([{ count: 25 }]))
      .mockReturnValueOnce(
        createSelectChain([createTelemetryRecord('exec-1', 'node-1')]),
      )
      .mockReturnValueOnce(
        createSelectChain([createSummaryRecord('exec-1', 'node-1')]),
      )
      .mockReturnValueOnce(createSelectChain([]))
      .mockReturnValueOnce(
        createSelectChain([createWorkflow('wf-2', tenantTwo, ['node-2'])]),
      )
      .mockReturnValueOnce(createSelectChain([{ count: 25 }]))
      .mockReturnValueOnce(
        createSelectChain([createTelemetryRecord('exec-2', 'node-2')]),
      )
      .mockReturnValueOnce(
        createSelectChain([createSummaryRecord('exec-2', 'node-2')]),
      )
      .mockReturnValueOnce(createSelectChain([]));

    mockDb.insert
      .mockReturnValueOnce(insertChainOne)
      .mockReturnValueOnce(insertChainTwo);

    const result = await service.runAnalysis();

    expect(runInTenantTransaction).toHaveBeenCalledTimes(2);
    expect(modelDowngradeAnalyzer.analyze).toHaveBeenCalledTimes(2);
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
    expect(insertChainOne.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: tenantOne,
          workflowDefinitionId: 'wf-1',
          nodeId: 'node-1',
          suggestionType: 'model_downgrade',
          status: 'pending',
        }),
      ]),
    );
    expect(insertChainTwo.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: tenantTwo,
          workflowDefinitionId: 'wf-2',
          nodeId: 'node-2',
          suggestionType: 'model_downgrade',
          status: 'pending',
        }),
      ]),
    );
    expect(result).toEqual({ analyzed: 2, suggestionsCreated: 2 });
  });

  it('应在 step telemetry 少于 20 条时跳过节点分析', async () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';

    mockDb.select
      .mockReturnValueOnce(createSelectChain([{ tenantId }]))
      .mockReturnValueOnce(
        createSelectChain([createWorkflow('wf-1', tenantId, ['node-1'])]),
      )
      .mockReturnValueOnce(createSelectChain([{ count: 10 }]));

    const result = await service.runAnalysis();

    expect(modelDowngradeAnalyzer.analyze).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(result).toEqual({ analyzed: 0, suggestionsCreated: 0 });
  });

  it('应对已存在 pending 建议的相同类型进行去重', async () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';

    modelDowngradeAnalyzer.analyze.mockReturnValue(
      createCandidate('model_downgrade'),
    );

    mockDb.select
      .mockReturnValueOnce(createSelectChain([{ tenantId }]))
      .mockReturnValueOnce(
        createSelectChain([createWorkflow('wf-1', tenantId, ['node-1'])]),
      )
      .mockReturnValueOnce(createSelectChain([{ count: 25 }]))
      .mockReturnValueOnce(
        createSelectChain([createTelemetryRecord('exec-1', 'node-1')]),
      )
      .mockReturnValueOnce(
        createSelectChain([createSummaryRecord('exec-1', 'node-1')]),
      )
      .mockReturnValueOnce(
        createSelectChain([{ suggestionType: 'model_downgrade' }]),
      );

    const result = await service.runAnalysis();

    expect(modelDowngradeAnalyzer.analyze).toHaveBeenCalledOnce();
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(result).toEqual({ analyzed: 1, suggestionsCreated: 0 });
  });

  it('应在单个节点失败时记录错误并继续分析其他节点', async () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const insertChain = createInsertChain();

    modelDowngradeAnalyzer.analyze.mockImplementation(
      (context: AnalysisContext) => {
        if (context.nodeId === 'node-1') {
          throw new Error('boom');
        }

        return createCandidate('model_downgrade');
      },
    );

    mockDb.select
      .mockReturnValueOnce(createSelectChain([{ tenantId }]))
      .mockReturnValueOnce(
        createSelectChain([
          createWorkflow('wf-1', tenantId, ['node-1', 'node-2']),
        ]),
      )
      .mockReturnValueOnce(createSelectChain([{ count: 25 }]))
      .mockReturnValueOnce(
        createSelectChain([createTelemetryRecord('exec-1', 'node-1')]),
      )
      .mockReturnValueOnce(
        createSelectChain([createSummaryRecord('exec-1', 'node-1')]),
      )
      .mockReturnValueOnce(createSelectChain([{ count: 25 }]))
      .mockReturnValueOnce(
        createSelectChain([createTelemetryRecord('exec-2', 'node-2')]),
      )
      .mockReturnValueOnce(
        createSelectChain([createSummaryRecord('exec-2', 'node-2')]),
      )
      .mockReturnValueOnce(createSelectChain([]));

    mockDb.insert.mockReturnValueOnce(insertChain);

    const result = await service.runAnalysis();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Optimization analysis failed for node'),
      expect.any(String),
    );
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-2',
          suggestionType: 'model_downgrade',
        }),
      ]),
    );
    expect(result).toEqual({ analyzed: 1, suggestionsCreated: 1 });
  });

  it('应在指定 tenantId 时归一化节点配置并映射 telemetry 与 summary 数据', async () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const workflow = {
      id: 'wf-normalized',
      tenantId,
      nodes: [
        {
          id: 'note-1',
          type: 'note',
          data: { content: 'ignore me' },
        },
        {
          id: 'model-node-1',
          type: 'llm-model',
          data: {
            config: {
              modelId: 'gpt-4o',
              modelName: 'GPT-4o',
              provider: 'openai',
              contextWindow: 64_000,
            },
          },
        },
        {
          id: 'node-1',
          type: 'chat-agent',
          data: {
            settings: { timeoutMs: 45_000 },
            toolBindings: ['search', 'browser'],
            autonomyConfig: { mode: 'RULE_BASED' },
            modelConfig: { connectedModelNodeId: 'model-node-1' },
          },
        },
      ],
    };

    modelDowngradeAnalyzer.analyze.mockReturnValue(null);

    mockDb.select
      .mockReturnValueOnce(createSelectChain([workflow]))
      .mockReturnValueOnce(createSelectChain([{ count: '25' }]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            executionId: 'exec-ignored',
            stepId: null,
            telemetryData: {
              llmInteractions: {
                modelId: 'gpt-4o',
                promptTokens: 10,
                completionTokens: 5,
                totalTokens: 15,
                latencyMs: 500,
              },
              errors: [],
              toolCalls: [],
              selfRepairs: [],
            },
            createdAt: new Date('2026-03-01T00:00:00.000Z'),
          },
          {
            executionId: 'exec-1',
            stepId: 'step-1',
            telemetryData: {
              llmInteractions: {
                modelId: 'gpt-4o',
                promptTokens: 120,
                completionTokens: 80,
                totalTokens: 200,
                latencyMs: 4_500,
              },
              errors: [
                {
                  errorType: 'timeout_error',
                  errorMessage: 'timed out waiting for tool',
                },
              ],
              toolCalls: [
                {
                  toolName: 'search',
                  input: {},
                  output: {},
                  durationMs: 100,
                  status: 'success',
                },
                {
                  toolName: 'browser',
                  input: {},
                  output: {},
                  durationMs: 200,
                  status: 'failed',
                },
              ],
              selfRepairs: [
                {
                  originalOutput: 'draft',
                  validationError: 'invalid',
                  repairAttempts: [{ success: false, changes: 'retry' }],
                },
              ],
            },
            createdAt: new Date('2026-03-02T00:00:00.000Z'),
          },
        ]),
      )
      .mockReturnValueOnce(
        createSelectChain([
          {
            executionId: 'exec-empty',
            summaryData: null,
            createdAt: new Date('2026-03-01T00:00:00.000Z'),
          },
          {
            executionId: 'exec-1',
            summaryData: {
              totalSteps: 1,
              completedSteps: 0,
              failedSteps: 1,
              totalToolCalls: 2,
              totalErrors: 1,
              totalSelfRepairs: 1,
              totalTokens: 200,
              totalLatencyMs: 4_500,
              avgStepLatencyMs: 4_500,
              executionDurationMs: 7_000,
            },
            createdAt: new Date('2026-03-02T00:00:00.000Z'),
          },
        ]),
      )
      .mockReturnValueOnce(createSelectChain([]));

    const result = await service.runAnalysis(tenantId);

    expect(runInTenantTransaction).toHaveBeenCalledTimes(1);
    expect(runInTenantTransaction).toHaveBeenCalledWith(
      mockDb,
      tenantId,
      expect.any(Function),
    );
    expect(modelDowngradeAnalyzer.analyze).toHaveBeenCalledOnce();

    const context = modelDowngradeAnalyzer.analyze.mock.calls[0]?.[0];
    expect(context.nodeConfig).toMatchObject({
      timeoutMs: 45_000,
      autonomyMode: 'RULE_BASED',
      tools: ['search', 'browser'],
      model: {
        modelId: 'gpt-4o',
        modelName: 'GPT-4o',
        provider: 'openai',
        contextWindow: 64_000,
      },
    });
    expect(context.stepTelemetries).toEqual([
      expect.objectContaining({
        executionId: 'exec-1',
        stepId: 'step-1',
        telemetryData: {
          tokenUsage: {
            promptTokens: 120,
            completionTokens: 80,
            totalTokens: 200,
          },
          latencyMs: 4_500,
          errors: [
            {
              type: 'timeout_error',
              message: 'timed out waiting for tool',
            },
          ],
          toolCalls: [
            { toolName: 'search', success: true },
            { toolName: 'browser', success: false },
          ],
          selfRepairs: [{ success: false }],
        },
      }),
    ]);
    expect(context.executionSummaries).toEqual([
      expect.objectContaining({
        executionId: 'exec-1',
        summaryData: {
          status: 'failed',
          totalDurationMs: 7_000,
          totalErrors: 1,
          totalTokens: 200,
        },
      }),
    ]);
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(result).toEqual({ analyzed: 1, suggestionsCreated: 0 });
  });

  it('应映射四类建议值结构并兼容 category=agent 的节点识别', async () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const insertChain = createInsertChain();

    modelDowngradeAnalyzer.analyze.mockReturnValue({
      suggestionType: 'model_downgrade',
      confidence: 0.9,
      currentValue: {
        modelId: 'gpt-4',
        modelName: 'gpt-4',
        provider: 'unknown-provider',
      },
      suggestedValue: {
        modelId: 'gpt-3.5-turbo',
        modelName: 'GPT-3.5 Turbo',
        provider: 'unknown-provider',
      },
      rationale: 'downgrade rationale',
    });
    timeoutAdjustmentAnalyzer.analyze.mockReturnValue({
      suggestionType: 'timeout_adjustment',
      confidence: 0.8,
      currentValue: { timeoutMs: 45_000 },
      suggestedValue: { timeoutMs: 30_000 },
      rationale: 'timeout rationale',
    });
    toolPruningAnalyzer.analyze.mockReturnValue({
      suggestionType: 'tool_pruning',
      confidence: 0.85,
      currentValue: { tools: ['search', 'browser'] },
      suggestedValue: { tools: ['search'] },
      rationale: 'prune rationale',
    });
    autonomyUpgradeAnalyzer.analyze.mockReturnValue({
      suggestionType: 'autonomy_upgrade',
      confidence: 0.88,
      currentValue: { autonomyMode: 'RULE_BASED' },
      suggestedValue: { autonomyMode: 'LLM_SUGGEST' },
      rationale: 'autonomy rationale',
    });

    mockDb.select
      .mockReturnValueOnce(createSelectChain([{ tenantId }]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: 'wf-typed-node',
            tenantId,
            nodes: [
              { id: 'note-1', type: 'note', data: { category: 'note' } },
              {
                id: 'node-1',
                type: 'custom-node',
                data: {
                  category: 'agent',
                  config: { timeoutMs: 45_000 },
                },
              },
            ],
          },
        ]),
      )
      .mockReturnValueOnce(createSelectChain([{ count: 25 }]))
      .mockReturnValueOnce(
        createSelectChain([createTelemetryRecord('exec-1', 'node-1')]),
      )
      .mockReturnValueOnce(
        createSelectChain([createSummaryRecord('exec-1', 'node-1')]),
      )
      .mockReturnValueOnce(createSelectChain([]));

    mockDb.insert.mockReturnValueOnce(insertChain);

    const result = await service.runAnalysis();

    expect(modelDowngradeAnalyzer.analyze).toHaveBeenCalledOnce();
    expect(timeoutAdjustmentAnalyzer.analyze).toHaveBeenCalledOnce();
    expect(toolPruningAnalyzer.analyze).toHaveBeenCalledOnce();
    expect(autonomyUpgradeAnalyzer.analyze).toHaveBeenCalledOnce();
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          suggestionType: 'model_downgrade',
          currentValue: {
            modelId: 'gpt-4',
            modelName: 'gpt-4',
            provider: 'unknown-provider',
          },
          suggestedValue: {
            modelId: 'gpt-3.5-turbo',
            modelName: 'GPT-3.5 Turbo',
            provider: 'unknown-provider',
          },
        }),
        expect.objectContaining({
          suggestionType: 'timeout_adjustment',
          currentValue: { timeoutMs: 45_000 },
          suggestedValue: { timeoutMs: 30_000 },
        }),
        expect.objectContaining({
          suggestionType: 'tool_pruning',
          currentValue: {
            tools: ['search', 'browser'],
            removedTools: [],
          },
          suggestedValue: {
            tools: ['search'],
            removedTools: [],
          },
        }),
        expect.objectContaining({
          suggestionType: 'autonomy_upgrade',
          currentValue: { autonomyMode: 'RULE_BASED' },
          suggestedValue: { autonomyMode: 'LLM_SUGGEST' },
        }),
      ]),
    );
    expect(result).toEqual({ analyzed: 1, suggestionsCreated: 4 });
  });

  it('应将租户自治上限透传给 analyzer 上下文', async () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const insertChain = createInsertChain();

    organizationAutonomyPolicyService.resolveAutonomyCapForTenant.mockResolvedValue(
      'RULE_BASED',
    );
    autonomyUpgradeAnalyzer.analyze.mockImplementation(
      (context: AnalysisContext) => {
        expect(context.autonomyCap).toBe('RULE_BASED');
        return createCandidate('autonomy_upgrade');
      },
    );

    mockDb.select
      .mockReturnValueOnce(createSelectChain([{ tenantId }]))
      .mockReturnValueOnce(
        createSelectChain([createWorkflow('wf-1', tenantId, ['node-1'])]),
      )
      .mockReturnValueOnce(createSelectChain([{ count: 25 }]))
      .mockReturnValueOnce(
        createSelectChain([createTelemetryRecord('exec-1', 'node-1')]),
      )
      .mockReturnValueOnce(
        createSelectChain([createSummaryRecord('exec-1', 'node-1')]),
      )
      .mockReturnValueOnce(createSelectChain([]));

    mockDb.insert.mockReturnValueOnce(insertChain);

    const result = await service.runAnalysis();

    expect(
      organizationAutonomyPolicyService.resolveAutonomyCapForTenant,
    ).toHaveBeenCalledWith(tenantId);
    expect(autonomyUpgradeAnalyzer.analyze).toHaveBeenCalledOnce();
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          suggestionType: 'autonomy_upgrade',
          suggestedValue: { autonomyMode: 'MANUAL_CONFIRM' },
        }),
      ]),
    );
    expect(result).toEqual({ analyzed: 1, suggestionsCreated: 1 });
  });

  it('应在 telemetry count 查询为空时按 0 处理并跳过节点', async () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';

    mockDb.select
      .mockReturnValueOnce(
        createSelectChain([createWorkflow('wf-1', tenantId, ['node-1'])]),
      )
      .mockReturnValueOnce(createSelectChain([]));

    const result = await service.runAnalysis(tenantId);

    expect(modelDowngradeAnalyzer.analyze).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(result).toEqual({ analyzed: 0, suggestionsCreated: 0 });
  });
});

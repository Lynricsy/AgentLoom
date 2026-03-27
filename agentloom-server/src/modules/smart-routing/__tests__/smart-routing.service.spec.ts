import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import { executionSteps } from '../../../database/schema/execution-steps.schema';
import { routingDecisions } from '../../../database/schema/routing-decisions.schema';
import { LlmService } from '../../llm/llm.service';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { RouterRegistry } from '../core/router-registry';
import type { QueryRoutingDecisionsDto } from '../dto/query-routing-decisions.dto';
import {
  type RoutingContext,
  ROUTING_STRATEGIES,
  type RoutingDecisionResult,
  type RoutingStrategy,
} from '../dto/routing-context.dto';
import { EmbeddingIntegrationService } from '../embedding/embedding.service';
import {
  InsufficientModelsException,
  InvalidRoutingStrategyException,
} from '../smart-routing.exceptions';
import { SmartRoutingService } from '../smart-routing.service';

const {
  createInsertChain,
  createMockDb,
  createMockCircuitBreakerService,
  createMockEmbeddingService,
  createMockLlmService,
  createMockRouterRegistry,
  createSelectChain,
  mockModelConfigs,
} = vi.hoisted(() => {
  type SelectChain<T> = {
    select: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
    innerJoin: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    offset: ReturnType<typeof vi.fn>;
  } & Promise<T[]>;

  function createSelectChain<T>(data: T[]): SelectChain<T> {
    const chain = Promise.resolve(data) as SelectChain<T>;
    chain.select = vi.fn().mockReturnValue(chain);
    chain.from = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.offset = vi.fn().mockReturnValue(chain);
    return chain;
  }

  function createInsertChain() {
    const chain = {
      values: vi.fn(),
      returning: vi.fn(),
    };

    chain.values.mockReturnValue(chain);
    chain.returning.mockResolvedValue([{ id: 'routing-decision-1' }]);

    return chain;
  }

  return {
    createSelectChain,
    createInsertChain,
    createMockDb: () => ({
      select: vi.fn(),
      insert: vi.fn(),
    }),
    createMockCircuitBreakerService: () => ({}),
    createMockEmbeddingService: () => ({}),
    createMockLlmService: () => ({
      findByIds: vi.fn(),
    }),
    createMockRouterRegistry: () => ({}),
    mockModelConfigs: [
      { id: 'model-1', modelName: 'gpt-4o', provider: 'openai' },
      {
        id: 'model-2',
        modelName: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
      },
      { id: 'model-3', modelName: 'gemini-1.5-pro', provider: 'google' },
    ],
  };
});

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn((db) => db),
}));

type RoutingDecisionRecord = typeof routingDecisions.$inferSelect;

const NOW = new Date('2025-01-01T00:00:00.000Z');
const TENANT_ID = '00000000-0000-0000-0000-000000000010';
const EXECUTION_ID = '00000000-0000-0000-0000-000000000011';

function createRoutingDecisionRecord(
  overrides: Partial<RoutingDecisionRecord> = {},
): RoutingDecisionRecord {
  return {
    ...overrides,
    id: '00000000-0000-0000-0000-000000000100',
    executionStepId: EXECUTION_ID,
    tenantId: TENANT_ID,
    routingNodeId: 'routing-node-1',
    strategy: 'QUALITY_FIRST',
    modelsEvaluated: [
      {
        modelId: 'model-2',
        modelName: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        score: 92,
        reasoning: '质量排名 92/100',
      },
    ],
    selectedModelId: '00000000-0000-0000-0000-000000000200',
    decisionReasoning: '选择了 claude-sonnet-4-20250514',
    routingLatencyMs: 12,
    createdAt: NOW,
    routerType: overrides.routerType ?? null,
  };
}

describe('SmartRoutingService', () => {
  let module: TestingModule;
  let service: SmartRoutingService;
  let db: ReturnType<typeof createMockDb>;
  let mockCircuitBreakerService: ReturnType<
    typeof createMockCircuitBreakerService
  >;
  let mockEmbeddingService: ReturnType<typeof createMockEmbeddingService>;
  let mockLlmService: ReturnType<typeof createMockLlmService>;
  let mockRouterRegistry: ReturnType<typeof createMockRouterRegistry>;

  type LegacyEvaluateFn = (
    modelConfigIds: string[],
    context: RoutingContext,
    strategy: RoutingStrategy,
    tenantId: string,
  ) => Promise<RoutingDecisionResult>;

  const callLegacyEvaluate: LegacyEvaluateFn = (
    modelConfigIds: string[],
    context: RoutingContext,
    strategy: RoutingStrategy,
    tenantId: string,
  ) => {
    const legacyEvaluate = Reflect.get(
      service as object,
      'evaluate',
    ) as LegacyEvaluateFn;

    return legacyEvaluate.call(
      service,
      modelConfigIds,
      context,
      strategy,
      tenantId,
    );
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

    db = createMockDb();
    mockCircuitBreakerService = createMockCircuitBreakerService();
    mockEmbeddingService = createMockEmbeddingService();
    mockLlmService = createMockLlmService();
    mockRouterRegistry = createMockRouterRegistry();

    module = await Test.createTestingModule({
      providers: [
        SmartRoutingService,
        { provide: DRIZZLE, useValue: db },
        { provide: LlmService, useValue: mockLlmService },
        { provide: RouterRegistry, useValue: mockRouterRegistry },
        {
          provide: CircuitBreakerService,
          useValue: mockCircuitBreakerService,
        },
        {
          provide: EmbeddingIntegrationService,
          useValue: mockEmbeddingService,
        },
      ],
    }).compile();

    service = module.get(SmartRoutingService);
  });

  afterEach(async () => {
    await module.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('evaluate', () => {
    it('对未知策略抛出 InvalidRoutingStrategyException', async () => {
      await expect(
        callLegacyEvaluate(
          ['model-1', 'model-2'],
          { inputTokenCount: 1_000 },
          'UNKNOWN_STRATEGY' as RoutingStrategy,
          TENANT_ID,
        ),
      ).rejects.toBeInstanceOf(InvalidRoutingStrategyException);

      expect(mockLlmService.findByIds).not.toHaveBeenCalled();
    });

    it('在模型配置少于 2 个时抛出 InsufficientModelsException', async () => {
      await expect(
        callLegacyEvaluate(
          ['model-1'],
          { inputTokenCount: 1_000 },
          'QUALITY_FIRST',
          TENANT_ID,
        ),
      ).rejects.toBeInstanceOf(InsufficientModelsException);

      expect(mockLlmService.findByIds).not.toHaveBeenCalled();
    });

    it('在 findByIds 仅返回 1 个模型时抛出 InsufficientModelsException', async () => {
      mockLlmService.findByIds.mockResolvedValue([mockModelConfigs[0]]);

      await expect(
        callLegacyEvaluate(
          ['model-1', 'model-2'],
          { inputTokenCount: 1_000 },
          'QUALITY_FIRST',
          TENANT_ID,
        ),
      ).rejects.toBeInstanceOf(InsufficientModelsException);

      expect(mockLlmService.findByIds).toHaveBeenCalledWith(
        ['model-1', 'model-2'],
        TENANT_ID,
      );
    });

    it.each([
      {
        strategy: 'TOKEN_OPTIMIZED' as const,
        context: { inputTokenCount: 150_000 },
        selectedModelId: 'model-3',
      },
      {
        strategy: 'COST_OPTIMIZED' as const,
        context: { inputTokenCount: 10_000 },
        selectedModelId: 'model-3',
      },
      {
        strategy: 'QUALITY_FIRST' as const,
        context: { inputTokenCount: 10_000 },
        selectedModelId: 'model-2',
      },
      {
        strategy: 'LATENCY_FIRST' as const,
        context: { inputTokenCount: 10_000 },
        selectedModelId: 'model-1',
      },
      {
        strategy: 'HISTORICAL_BEST' as const,
        context: {
          inputTokenCount: 10_000,
          historicalMetrics: {
            'model-1': {
              successRate: 0.85,
              avgLatencyMs: 700,
              avgTokenUsage: 3_000,
              lastUsedAt: '2024-12-30T00:00:00.000Z',
            },
            'model-2': {
              successRate: 0.9,
              avgLatencyMs: 900,
              avgTokenUsage: 4_000,
              lastUsedAt: '2024-12-31T00:00:00.000Z',
            },
            'model-3': {
              successRate: 0.99,
              avgLatencyMs: 600,
              avgTokenUsage: 2_000,
              lastUsedAt: '2024-12-29T00:00:00.000Z',
            },
          },
        },
        selectedModelId: 'model-3',
      },
      {
        strategy: 'FALLBACK_CHAIN' as const,
        context: { inputTokenCount: 10_000 },
        selectedModelId: 'model-1',
      },
    ] satisfies ReadonlyArray<{
      strategy: (typeof ROUTING_STRATEGIES)[number];
      context: RoutingContext;
      selectedModelId: string;
    }>)(
      '应当使用 $strategy 返回排序后的评估结果',
      async ({ strategy, context, selectedModelId }) => {
        mockLlmService.findByIds.mockResolvedValue(mockModelConfigs);

        const result = await callLegacyEvaluate(
          mockModelConfigs.map((config) => config.id),
          context,
          strategy,
          TENANT_ID,
        );

        expect(mockLlmService.findByIds).toHaveBeenCalledWith(
          ['model-1', 'model-2', 'model-3'],
          TENANT_ID,
        );
        expect(result.selectedModelId).toBe(selectedModelId);
        expect(result.evaluatedModels[0]?.modelId).toBe(selectedModelId);
        expect(result.evaluatedModels).toHaveLength(3);
        expect(result.evaluatedModels.map((model) => model.score)).toEqual(
          [...result.evaluatedModels]
            .map((model) => model.score)
            .sort((a, b) => b - a),
        );
        expect(result.strategy).toBe(strategy);
        expect(result.reasoning).toContain(strategy);
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      },
    );

    it('应保留传入的候选模型顺序，供 FALLBACK_CHAIN 直接使用', async () => {
      mockLlmService.findByIds.mockResolvedValue([
        mockModelConfigs[2],
        mockModelConfigs[0],
        mockModelConfigs[1],
      ]);

      const result = await callLegacyEvaluate(
        ['model-2', 'model-1', 'model-3'],
        { inputTokenCount: 1_000 },
        'FALLBACK_CHAIN',
        TENANT_ID,
      );

      expect(result.selectedModelId).toBe('model-2');
      expect(result.evaluatedModels.map((model) => model.modelId)).toEqual([
        'model-2',
        'model-1',
        'model-3',
      ]);
    });
  });

  describe('getHistoricalMetrics', () => {
    it('应按路由决策序列与实际下游 agent 步骤结果聚合成功率、平均延迟与最近使用时间', async () => {
      const routingChain = createSelectChain([
        {
          routingStepId: 'routing-step-1',
          executionId: 'execution-1',
          selectedModelId: 'model-1',
          routingLatencyMs: 100,
          createdAt: new Date('2024-12-31T00:00:00.000Z'),
        },
        {
          routingStepId: 'routing-step-1',
          executionId: 'execution-1',
          selectedModelId: 'model-2',
          routingLatencyMs: 300,
          createdAt: new Date('2024-12-31T00:01:00.000Z'),
        },
        {
          routingStepId: 'routing-step-2',
          executionId: 'execution-2',
          selectedModelId: 'model-2',
          routingLatencyMs: 50,
          createdAt: new Date('2024-12-29T00:00:00.000Z'),
        },
        {
          routingStepId: 'routing-step-3',
          executionId: 'execution-3',
          selectedModelId: null,
          routingLatencyMs: 999,
          createdAt: new Date('2024-12-28T00:00:00.000Z'),
        },
      ]);
      const stepChain = createSelectChain([
        {
          id: 'agent-step-1',
          executionId: 'execution-1',
          nodeType: 'agent',
          status: 'completed',
          input: {
            'routing-node-1': {
              routingStepId: 'routing-step-1',
              selectedModelId: 'model-1',
            },
          },
          checkpointData: {
            smartRouting: {
              routingStepId: 'routing-step-1',
              selectedModelId: 'model-2',
            },
          },
        },
        {
          id: 'agent-step-2',
          executionId: 'execution-2',
          nodeType: 'agent',
          status: 'failed',
          input: {
            'routing-node-1': {
              routingStepId: 'routing-step-2',
              selectedModelId: 'model-2',
            },
          },
          checkpointData: null,
        },
      ]);
      db.select
        .mockReturnValueOnce(routingChain)
        .mockReturnValueOnce(stepChain);

      const result = await service.getHistoricalMetrics(
        TENANT_ID,
        'routing-node-1',
      );

      expect(result).toEqual({
        'model-1': {
          successRate: 0,
          avgLatencyMs: 100,
          avgTokenUsage: 0,
          lastUsedAt: '2024-12-31T00:00:00.000Z',
        },
        'model-2': {
          successRate: 0.5,
          avgLatencyMs: 175,
          avgTokenUsage: 0,
          lastUsedAt: '2024-12-31T00:01:00.000Z',
        },
      });
      expect(routingChain.from).toHaveBeenCalledWith(routingDecisions);
      expect(routingChain.innerJoin).toHaveBeenCalledWith(
        executionSteps,
        expect.anything(),
      );
      expect(routingChain.where).toHaveBeenCalledTimes(1);
      expect(stepChain.from).toHaveBeenCalledWith(executionSteps);
      expect(stepChain.where).toHaveBeenCalledTimes(1);
    });
  });

  describe('recordDecision', () => {
    it('应当向 routingDecisions 表插入正确的基础字段并返回决策 id', async () => {
      const insertChain = createInsertChain();
      db.insert.mockReturnValueOnce(insertChain);

      const decision: RoutingDecisionResult = {
        selectedModelId: 'model-2',
        strategy: 'QUALITY_FIRST',
        reasoning: '选择了 claude-sonnet-4-20250514',
        evaluatedModels: [
          {
            modelId: 'model-2',
            modelName: 'claude-sonnet-4-20250514',
            provider: 'anthropic',
            score: 92,
            reasoning: '质量排名 92/100',
          },
        ],
        latencyMs: 12,
      };

      const routingDecisionId = await service.recordDecision(
        'step-1',
        TENANT_ID,
        'routing-node-1',
        decision,
      );

      expect(db.insert).toHaveBeenCalledWith(routingDecisions);
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          executionStepId: 'step-1',
          tenantId: TENANT_ID,
          routingNodeId: 'routing-node-1',
          strategy: 'QUALITY_FIRST',
          selectedModelId: 'model-2',
        }),
      );
      expect(insertChain.returning).toHaveBeenCalledWith({
        id: routingDecisions.id,
      });
      expect(routingDecisionId).toBe('routing-decision-1');
    });

    it('应当完整透传路由决策字段并持久化 routerType', async () => {
      const insertChain = createInsertChain();
      db.insert.mockReturnValueOnce(insertChain);

      const decision = {
        selectedModelId: 'model-3',
        strategy: 'COST_OPTIMIZED',
        reasoning: '选择了 gemini-1.5-pro',
        evaluatedModels: [
          {
            modelId: 'model-3',
            modelName: 'gemini-1.5-pro',
            provider: 'google',
            score: 64,
            reasoning: '预估成本最低',
          },
          {
            modelId: 'model-1',
            modelName: 'gpt-4o',
            provider: 'openai',
            score: 29,
            reasoning: '成本次优',
          },
        ],
        latencyMs: 7,
        routerType: 'round_robin',
      };

      await service.recordDecision(
        'step-2',
        TENANT_ID,
        'routing-node-2',
        decision,
      );

      expect(insertChain.values).toHaveBeenCalledWith({
        executionStepId: 'step-2',
        tenantId: TENANT_ID,
        routingNodeId: 'routing-node-2',
        strategy: 'COST_OPTIMIZED',
        modelsEvaluated: [
          {
            modelId: 'model-3',
            modelName: 'gemini-1.5-pro',
            provider: 'google',
            score: 64,
            reasoning: '预估成本最低',
          },
          {
            modelId: 'model-1',
            modelName: 'gpt-4o',
            provider: 'openai',
            score: 29,
            reasoning: '成本次优',
          },
        ],
        selectedModelId: 'model-3',
        decisionReasoning: '选择了 gemini-1.5-pro',
        routingLatencyMs: 7,
        routerType: 'round_robin',
      });
    });
  });

  describe('findByExecution', () => {
    it('应当返回带分页信息的查询结果', async () => {
      const rows = [
        createRoutingDecisionRecord({
          id: '00000000-0000-0000-0000-000000000101',
        }),
      ];
      const countChain = createSelectChain([{ total: 2 }]);
      const dataChain = createSelectChain(rows);
      db.select.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

      const query: QueryRoutingDecisionsDto = { page: 2, pageSize: 1 };
      const result = await service.findByExecution(TENANT_ID, query);

      expect(result).toEqual({
        data: rows,
        meta: {
          page: 2,
          pageSize: 1,
          total: 2,
          totalPages: 2,
        },
      });
      expect(countChain.from).toHaveBeenCalledWith(routingDecisions);
      expect(countChain.innerJoin).toHaveBeenCalledWith(
        executionSteps,
        expect.anything(),
      );
      expect(dataChain.from).toHaveBeenCalledWith(routingDecisions);
      expect(dataChain.innerJoin).toHaveBeenCalledWith(
        executionSteps,
        expect.anything(),
      );
      expect(dataChain.orderBy).toHaveBeenCalledTimes(1);
      expect(dataChain.limit).toHaveBeenCalledWith(1);
      expect(dataChain.offset).toHaveBeenCalledWith(1);
      expect(dataChain.where).toHaveBeenCalledTimes(1);
    });

    it('在提供 executionId 时应当应用 executionId 过滤条件', async () => {
      const countChain = createSelectChain([{ total: 1 }]);
      const dataChain = createSelectChain([createRoutingDecisionRecord()]);
      db.select.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

      await service.findByExecution(TENANT_ID, {
        page: 1,
        pageSize: 20,
        executionId: EXECUTION_ID,
      });

      expect(countChain.where).toHaveBeenCalledTimes(1);
      expect(dataChain.where).toHaveBeenCalledTimes(1);
    });

    it('在同时提供 executionId 与 routingNodeId 时应组合为单个 where 条件', async () => {
      const countChain = createSelectChain([{ total: 1 }]);
      const dataChain = createSelectChain([createRoutingDecisionRecord()]);
      db.select.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

      await service.findByExecution(TENANT_ID, {
        page: 1,
        pageSize: 20,
        executionId: EXECUTION_ID,
        routingNodeId: 'routing-node-1',
      });

      expect(countChain.where).toHaveBeenCalledTimes(1);
      expect(dataChain.where).toHaveBeenCalledTimes(1);
    });

    it('在提供 routingNodeId 时应当应用 routingNodeId 过滤条件', async () => {
      const countChain = createSelectChain([{ total: 1 }]);
      const dataChain = createSelectChain([
        createRoutingDecisionRecord({ routingNodeId: 'routing-node-9' }),
      ]);
      db.select.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

      await service.findByExecution(TENANT_ID, {
        page: 1,
        pageSize: 20,
        routingNodeId: 'routing-node-9',
      });

      expect(countChain.where).toHaveBeenCalledTimes(1);
      expect(dataChain.where).toHaveBeenCalledTimes(1);
    });

    it('在没有记录时返回空结果', async () => {
      const countChain = createSelectChain([{ total: 0 }]);
      const dataChain = createSelectChain([]);
      db.select.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

      const result = await service.findByExecution(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result).toEqual({
        data: [],
        meta: {
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
        },
      });
    });
  });
});

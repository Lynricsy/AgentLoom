import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import { executionSteps } from '../../../database/schema/execution-steps.schema';
import { routingDecisions } from '../../../database/schema/routing-decisions.schema';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { RouterRegistry } from '../core/router-registry';
import type { QueryRoutingDecisionsDto } from '../dto/query-routing-decisions.dto';
import { llmModelConfigs } from '../../../database/schema/llm-model-configs.schema';
import { routerModels } from '../../../database/schema/router-models.schema';
import { EmbeddingIntegrationService } from '../embedding/embedding.service';
import { SmartRoutingService } from '../smart-routing.service';

const {
  createInsertChain,
  createMockDb,
  createMockCircuitBreakerService,
  createMockEmbeddingService,
  createMockRouterRegistry,
  createSelectChain,
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
    createMockRouterRegistry: () => ({}),
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
    conversationId: null,
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
    fallbackReason: null,
    fallbackSource: null,
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
  let mockRouterRegistry: ReturnType<typeof createMockRouterRegistry>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

    db = createMockDb();
    mockCircuitBreakerService = createMockCircuitBreakerService();
    mockEmbeddingService = createMockEmbeddingService();
    mockRouterRegistry = createMockRouterRegistry();

    module = await Test.createTestingModule({
      providers: [
        SmartRoutingService,
        { provide: DRIZZLE, useValue: db },
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

  describe('loadCandidates', () => {
    it('按传入顺序组装候选：router_models 元数据优先，缺省回落到提供商目录，忽略不存在的配置', async () => {
      const configChain = createSelectChain([
        {
          id: 'model-2',
          name: 'Claude',
          providerSlug: 'anthropic',
          modelId: 'claude-sonnet-4-20250514',
        },
        {
          id: 'model-1',
          name: 'GPT-4o',
          providerSlug: 'openai',
          modelId: 'gpt-4o',
        },
      ]);
      const metaChain = createSelectChain([
        {
          modelConfigId: 'model-1',
          providerName: 'openai-proxy',
          routingMeta: {
            contextWindow: '64000',
            costs: { inputPer1kTokens: 0.5, outputPer1kTokens: 1.5 },
            qualityRank: 77,
            avgLatencyMs: 321,
          },
          eloRating: 1333,
        },
      ]);
      db.select
        .mockReturnValueOnce(configChain)
        .mockReturnValueOnce(metaChain);

      const candidates = await service.loadCandidates(
        ['model-1', 'model-missing', 'model-2'],
        TENANT_ID,
      );

      expect(configChain.from).toHaveBeenCalledWith(llmModelConfigs);
      expect(metaChain.from).toHaveBeenCalledWith(routerModels);
      expect(candidates.map((candidate) => candidate.id)).toEqual([
        'model-1',
        'model-2',
      ]);
      expect(candidates[0]).toEqual({
        id: 'model-1',
        modelConfigId: 'model-1',
        name: 'GPT-4o',
        provider: 'openai-proxy',
        routingMeta: {
          contextWindow: 64000,
          costs: { input: 0.5, output: 1.5 },
          qualityRank: 77,
          avgLatencyMs: 321,
          maxInputTokens: 64000,
          eloRating: 1333,
        },
        healthStatus: 'healthy',
      });
      expect(candidates[1]).toMatchObject({
        id: 'model-2',
        provider: 'anthropic',
        routingMeta: { eloRating: 1200 },
        healthStatus: 'healthy',
      });
      expect(candidates[1].routingMeta.contextWindow).toBeGreaterThan(0);
    });

    it('空 id 列表直接返回空数组且不查询', async () => {
      await expect(service.loadCandidates([], TENANT_ID)).resolves.toEqual([]);
      expect(db.select).not.toHaveBeenCalled();
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

      const decision = {
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
        { executionStepId: 'step-1' },
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
        { executionStepId: 'step-2' },
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
        fallbackReason: null,
        fallbackSource: null,
      });
    });

    it('对话主体写 conversationId 且透传回退标记', async () => {
      const insertChain = createInsertChain();
      db.insert.mockReturnValueOnce(insertChain);

      await service.recordDecision(
        { conversationId: 'conversation-1' },
        TENANT_ID,
        'conversation',
        {
          selectedModelId: 'model-1',
          strategy: 'llm_as_router',
          reasoning: 'LLM 路由回退（llm_timeout）：规则回退',
          evaluatedModels: [],
          latencyMs: 3001,
          routerType: 'llm_as_router',
          fallbackReason: 'llm_timeout',
          fallbackSource: 'rules',
        },
      );

      const values = insertChain.values.mock.calls[0][0];
      expect(values).toMatchObject({
        conversationId: 'conversation-1',
        routingNodeId: 'conversation',
        fallbackReason: 'llm_timeout',
        fallbackSource: 'rules',
      });
      expect(values).not.toHaveProperty('executionStepId');
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

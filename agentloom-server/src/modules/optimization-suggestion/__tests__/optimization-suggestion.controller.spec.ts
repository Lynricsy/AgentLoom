import 'reflect-metadata';

import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { DomainException } from '../../../common/exceptions/domain.exception';
import type { OptimizationSuggestion } from '../../../database/schema';
import { OptimizationSuggestionController } from '../optimization-suggestion.controller';
import {
  QueryStatsSchema,
  QuerySuggestionsSchema,
} from '../dto/optimization-suggestion.dto';
import { OptimizationSuggestionService } from '../optimization-suggestion.service';

const mocks = vi.hoisted(() => ({
  createMockOptimizationSuggestionService: () => ({
    findByWorkflowAndNode: vi.fn(),
    findByTenant: vi.fn(),
    getAdoptionStats: vi.fn(),
    applySuggestion: vi.fn(),
    dismissSuggestion: vi.fn(),
  }),
}));

const NOW = new Date('2025-01-01T00:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_ID = '22222222-2222-4222-8222-222222222222';
const SUGGESTION_ID = '33333333-3333-4333-8333-333333333333';

function createSuggestion(
  overrides: Partial<OptimizationSuggestion> = {},
): OptimizationSuggestion {
  return {
    id: SUGGESTION_ID,
    tenantId: '44444444-4444-4444-8444-444444444444',
    workflowDefinitionId: WORKFLOW_ID,
    nodeId: 'agent-node-1',
    suggestionType: 'model_downgrade',
    status: 'pending',
    confidence: 0.88,
    currentValue: {
      modelId: 'gpt-4',
      modelName: 'GPT-4',
      provider: 'openai',
    },
    suggestedValue: {
      modelId: 'gpt-3.5-turbo',
      modelName: 'GPT-3.5 Turbo',
      provider: 'openai',
    },
    rationale: '建议降低成本',
    impactEstimate: {
      costSavingPct: 0.4,
    },
    analysisMetadata: {
      totalRecords: 10,
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

describe('OptimizationSuggestionController', () => {
  let controller: OptimizationSuggestionController;
  let service: ReturnType<
    typeof mocks.createMockOptimizationSuggestionService
  >;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = mocks.createMockOptimizationSuggestionService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OptimizationSuggestionController],
      providers: [
        {
          provide: OptimizationSuggestionService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get(OptimizationSuggestionController);
  });

  it('应在类级别声明 operator/creator/admin/owner 角色', () => {
    expect(Reflect.getMetadata(ROLES_KEY, OptimizationSuggestionController)).toEqual(
      ['operator', 'creator', 'admin', 'owner'],
    );
  });

  describe('list', () => {
    it('当同时提供 workflowDefinitionId 与 nodeId 时应调用 findByWorkflowAndNode', async () => {
      const query = QuerySuggestionsSchema.parse({
        workflowDefinitionId: WORKFLOW_ID,
        nodeId: 'agent-node-1',
        status: 'pending',
      });
      const suggestions = [createSuggestion()];
      service.findByWorkflowAndNode.mockResolvedValue(suggestions);

      await expect(controller.list(query)).resolves.toEqual({ data: suggestions });
      expect(service.findByWorkflowAndNode).toHaveBeenCalledWith(
        WORKFLOW_ID,
        'agent-node-1',
        'pending',
      );
      expect(service.findByTenant).not.toHaveBeenCalled();
    });

    it('缺少 nodeId 时应回退到租户分页查询', async () => {
      const query = QuerySuggestionsSchema.parse({
        workflowDefinitionId: WORKFLOW_ID,
        limit: 5,
        offset: 10,
      });
      const paginatedResult = {
        data: [createSuggestion()],
        meta: {
          total: 1,
          limit: 5,
          offset: 10,
          hasMore: false,
        },
      };
      service.findByTenant.mockResolvedValue(paginatedResult);

      await expect(controller.list(query)).resolves.toEqual({
        data: paginatedResult,
      });
      expect(service.findByTenant).toHaveBeenCalledWith(query);
      expect(service.findByWorkflowAndNode).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('应调用 service.getAdoptionStats', async () => {
      const query = QueryStatsSchema.parse({ workflowDefinitionId: WORKFLOW_ID });
      const stats = {
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
        ],
      };
      service.getAdoptionStats.mockResolvedValue(stats);

      await expect(controller.getStats(query)).resolves.toEqual({ data: stats });
      expect(service.getAdoptionStats).toHaveBeenCalledWith(WORKFLOW_ID);
    });
  });

  describe('apply', () => {
    it('应使用当前用户调用 service.applySuggestion', async () => {
      const suggestion = createSuggestion({
        status: 'applied',
        appliedAt: NOW,
        appliedByUserId: USER_ID,
      });
      service.applySuggestion.mockResolvedValue(suggestion);

      await expect(controller.apply(SUGGESTION_ID, USER_ID)).resolves.toEqual({
        data: suggestion,
      });
      expect(service.applySuggestion).toHaveBeenCalledWith(SUGGESTION_ID, USER_ID);
    });

    it('应透传 service.applySuggestion 的异常', async () => {
      const error = new DomainException({
        type: 'OPTIMIZATION_SUGGESTION_NOT_FOUND',
        title: 'Suggestion Not Found',
        status: 404,
        detail: 'missing',
      });
      service.applySuggestion.mockRejectedValue(error);

      await expect(controller.apply(SUGGESTION_ID, USER_ID)).rejects.toBe(error);
    });
  });

  describe('dismiss', () => {
    it('应使用当前用户调用 service.dismissSuggestion', async () => {
      const suggestion = createSuggestion({
        status: 'dismissed',
        dismissedAt: NOW,
        dismissedByUserId: USER_ID,
      });
      service.dismissSuggestion.mockResolvedValue(suggestion);

      await expect(controller.dismiss(SUGGESTION_ID, USER_ID)).resolves.toEqual({
        data: suggestion,
      });
      expect(service.dismissSuggestion).toHaveBeenCalledWith(
        SUGGESTION_ID,
        USER_ID,
      );
    });

    it('应透传 service.dismissSuggestion 的冲突异常', async () => {
      const error = new DomainException({
        type: 'OPTIMIZATION_SUGGESTION_STATUS_CONFLICT',
        title: 'Suggestion Status Conflict',
        status: 409,
        detail: 'conflict',
      });
      service.dismissSuggestion.mockRejectedValue(error);

      await expect(controller.dismiss(SUGGESTION_ID, USER_ID)).rejects.toBe(error);
    });
  });
});

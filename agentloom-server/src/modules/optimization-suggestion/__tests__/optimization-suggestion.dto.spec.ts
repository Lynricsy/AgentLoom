import { describe, expect, it } from 'vitest';

import {
  QueryStatsDto,
  QuerySuggestionsDto,
} from '../dto/optimization-suggestion.dto';

describe('OptimizationSuggestion DTO', () => {
  describe('QuerySuggestionsDto', () => {
    it('应为列表查询提供默认分页值', () => {
      const result = QuerySuggestionsDto.schema.safeParse({});

      expect(result.success).toBe(true);
      if (!result.success) {
        expect.unreachable('预期默认分页参数校验通过');
      }

      expect(result.data).toMatchObject({
        limit: 50,
        offset: 0,
      });
    });

    it('应通过完整的过滤参数校验', () => {
      const result = QuerySuggestionsDto.schema.safeParse({
        limit: '10',
        offset: '5',
        status: 'pending',
        suggestionType: 'tool_pruning',
        workflowDefinitionId: '11111111-1111-4111-8111-111111111111',
        nodeId: 'agent-node-1',
      });

      expect(result.success).toBe(true);
      if (!result.success) {
        expect.unreachable('预期完整查询参数校验通过');
      }

      expect(result.data).toMatchObject({
        limit: 10,
        offset: 5,
        status: 'pending',
        suggestionType: 'tool_pruning',
        workflowDefinitionId: '11111111-1111-4111-8111-111111111111',
        nodeId: 'agent-node-1',
      });
    });

    it('非法状态值时应校验失败', () => {
      const result = QuerySuggestionsDto.schema.safeParse({
        status: 'unknown',
      });

      expect(result.success).toBe(false);
    });

    it('limit 超出范围时应校验失败', () => {
      const result = QuerySuggestionsDto.schema.safeParse({
        limit: 201,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('QueryStatsDto', () => {
    it('应通过合法的 workflowDefinitionId 校验', () => {
      const result = QueryStatsDto.schema.safeParse({
        workflowDefinitionId: '22222222-2222-4222-8222-222222222222',
      });

      expect(result.success).toBe(true);
    });

    it('workflowDefinitionId 非 uuid 时应校验失败', () => {
      const result = QueryStatsDto.schema.safeParse({
        workflowDefinitionId: 'not-a-uuid',
      });

      expect(result.success).toBe(false);
    });
  });
});

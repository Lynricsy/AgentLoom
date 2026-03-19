import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  ResourceGovernanceAccessDeniedException,
  ResourceGovernanceDecisionBlockedException,
  type ResourceGovernanceDecisionBlockDetail,
} from '../resource-governance.exceptions';

describe('resource-governance.exceptions', () => {
  describe('ResourceGovernanceAccessDeniedException', () => {
    it('constructs RFC7807 access denial fields', () => {
      const exception = new ResourceGovernanceAccessDeniedException();

      expect(exception.type).toBe(
        'https://agentloom.dev/errors/resource-governance-access-denied',
      );
      expect(exception.message).toBe('资源治理访问被拒绝');
      expect(exception.getResponse()).toBe('资源治理访问被拒绝');
      expect(exception.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(exception.detail).toBe(
        '只有组织 owner 或 admin 可以读取或修改资源治理配置',
      );
    });
  });

  describe('ResourceGovernanceDecisionBlockedException', () => {
    it('constructs RFC7807 too-many-requests fields for minute API rate limits', () => {
      const block: ResourceGovernanceDecisionBlockDetail = {
        decision: 'blocked',
        action: 'api_request',
        category: 'api_rate_limit',
        scope: 'api',
        reason: 'tenant API burst exceeded the configured minute rate limit',
        effectiveState: {
          organizationId: 'org-123',
          tenantControl: {
            scope: 'tenant',
            targetId: 'tenant-123',
            status: 'active',
            reason: null,
            updatedAt: null,
            updatedBy: null,
          },
          workflowControl: null,
        },
        blockedAt: '2026-03-18T00:00:00.000Z',
        metadata: {
          metric: 'apiRateLimitPerMinute',
          limit: 100,
          currentValue: 120,
          retryAfterSeconds: 60,
        },
      };

      const exception = new ResourceGovernanceDecisionBlockedException(block);

      expect(exception.type).toBe(
        'https://agentloom.dev/errors/resource-governance-decision-blocked',
      );
      expect(exception.message).toBe('资源治理决策被阻止');
      expect(exception.getResponse()).toBe('资源治理决策被阻止');
      expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(exception.detail).toBe(
        '组织 org-123 的配额指标 apiRateLimitPerMinute 已阻止 api_request：当前值 120，限制值 100',
      );
      expect(exception.errors).toEqual([
        {
          field: 'apiRateLimitPerMinute',
          message: '当前资源治理限制阻止了该决策',
        },
      ]);
      expect(exception.extensions).toEqual({
        block,
      });
      expect(exception.block).toEqual(block);
    });

    it('keeps daily API quota blocks as RFC7807 conflict responses', () => {
      const block: ResourceGovernanceDecisionBlockDetail = {
        decision: 'blocked',
        action: 'api_request',
        category: 'api_rate_limit',
        scope: 'api',
        reason: 'tenant daily API quota has been exceeded',
        effectiveState: {
          organizationId: 'org-123',
          tenantControl: {
            scope: 'tenant',
            targetId: 'tenant-123',
            status: 'active',
            reason: null,
            updatedAt: null,
            updatedBy: null,
          },
          workflowControl: null,
        },
        blockedAt: '2026-03-18T00:00:00.000Z',
        metadata: {
          metric: 'dailyApiCallLimit',
          limit: 500,
          currentValue: 501,
          retryAfterSeconds: 86_400,
        },
      };

      const exception = new ResourceGovernanceDecisionBlockedException(block);

      expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(exception.detail).toBe(
        '组织 org-123 的配额指标 dailyApiCallLimit 已阻止 api_request：当前值 501，限制值 500',
      );
      expect(exception.errors).toEqual([
        {
          field: 'dailyApiCallLimit',
          message: '当前资源治理限制阻止了该决策',
        },
      ]);
    });
  });
});

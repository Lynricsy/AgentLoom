import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';
import type { FieldError } from '../../common/types/problem-details.type';
import type {
  GovernancePauseStateDto,
  TenantQuotaMetricKey,
} from './dto/resource-governance-response.dto';

export type ResourceGovernanceDecision =
  | 'allow'
  | 'blocked';

export type ResourceGovernanceDecisionAction =
  | 'execution_start'
  | 'api_request'
  | 'quota_update'
  | 'governance_update';

export type ResourceGovernanceDecisionCategory =
  | 'execution_quota'
  | 'api_rate_limit'
  | 'tenant_pause'
  | 'workflow_pause';

export type ResourceGovernanceDecisionScope = 'tenant' | 'workflow' | 'api';

export interface ResourceGovernanceBlockExplainMetadata {
  workflowId?: string;
  metric?: TenantQuotaMetricKey;
  limit?: number | null;
  currentValue?: number | null;
  retryAfterSeconds?: number | null;
}

export interface ResourceGovernanceEffectiveState {
  organizationId: string;
  tenantControl: GovernancePauseStateDto;
  workflowControl?: GovernancePauseStateDto | null;
}

export interface ResourceGovernanceDecisionBlockDetail {
  decision: ResourceGovernanceDecision;
  action: ResourceGovernanceDecisionAction;
  category: ResourceGovernanceDecisionCategory;
  scope: ResourceGovernanceDecisionScope;
  reason: string;
  effectiveState: ResourceGovernanceEffectiveState;
  blockedAt: string;
  metadata?: ResourceGovernanceBlockExplainMetadata;
}

export class ResourceGovernanceAccessDeniedException extends DomainException {
  constructor() {
    super({
      type: 'https://agentloom.dev/errors/resource-governance-access-denied',
      title: '资源治理访问被拒绝',
      status: HttpStatus.FORBIDDEN,
      detail: '只有组织 owner 或 admin 可以读取或修改资源治理配置',
    });
  }
}

export class ResourceGovernanceDecisionBlockedException extends DomainException {
  readonly block: ResourceGovernanceDecisionBlockDetail;

  constructor(block: ResourceGovernanceDecisionBlockDetail) {
    const errors: FieldError[] | undefined = block.metadata?.metric
      ? [
          {
            field: block.metadata.metric,
            message: '当前资源治理限制阻止了该决策',
          },
        ]
      : undefined;

    super({
      type: 'https://agentloom.dev/errors/resource-governance-decision-blocked',
      title: '资源治理决策被阻止',
      status: resolveDecisionStatus(block),
      detail: buildResourceGovernanceDecisionDetail(block),
      errors,
      extensions: {
        block,
      },
    });

    this.block = block;
  }
}

function resolveDecisionStatus(
  block: ResourceGovernanceDecisionBlockDetail,
): HttpStatus {
  if (
    block.category === 'api_rate_limit' &&
    block.metadata?.metric === 'apiRateLimitPerMinute'
  ) {
    return HttpStatus.TOO_MANY_REQUESTS;
  }

  return HttpStatus.CONFLICT;
}

function buildResourceGovernanceDecisionDetail(
  block: ResourceGovernanceDecisionBlockDetail,
): string {
  if (
    (block.category === 'execution_quota' ||
      block.category === 'api_rate_limit') &&
    block.metadata?.metric
  ) {
    const currentValue = block.metadata.currentValue ?? 'unknown';
    const limit = block.metadata.limit ?? 'unknown';

    return `组织 ${block.effectiveState.organizationId} 的配额指标 ${block.metadata.metric} 已阻止 ${block.action}：当前值 ${currentValue}，限制值 ${limit}`;
  }

  if (block.scope === 'workflow') {
    const workflowId =
      block.metadata?.workflowId ??
      block.effectiveState.workflowControl?.targetId ??
      'unknown';

    return `工作流 ${workflowId} 当前处于治理停用状态，组织 ${block.effectiveState.organizationId} 的 ${block.action} 已被阻止`;
  }

  if (block.scope === 'api') {
    return `组织 ${block.effectiveState.organizationId} 当前的 API 资源治理策略已阻止 ${block.action}`;
  }

  return `组织 ${block.effectiveState.organizationId} 当前处于治理限制状态，${block.action} 已被阻止`;
}

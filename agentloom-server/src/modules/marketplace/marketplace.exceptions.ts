import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';
import type { MarketplaceReviewResult } from '../../database/schema';

export class MarketplaceListingNotFoundException extends DomainException {
  constructor(listingId: string) {
    super({
      type: 'https://agentloom.dev/errors/marketplace-listing-not-found',
      title: 'Marketplace listing 不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `Marketplace listing ${listingId} 不存在或无权访问`,
    });
  }
}

export class MarketplaceListingConflictException extends DomainException {
  constructor(detail: string, currentStatus?: string) {
    super({
      type: 'https://agentloom.dev/errors/marketplace-listing-conflict',
      title: 'Marketplace listing 状态冲突',
      status: HttpStatus.CONFLICT,
      detail,
      extensions: currentStatus ? { currentStatus } : undefined,
    });
  }
}

export class MarketplaceReviewFailedException extends DomainException {
  constructor(reviewResult: MarketplaceReviewResult) {
    const failedChecks = reviewResult.checks.filter(
      (c) => c.status === 'failed',
    );
    super({
      type: 'https://agentloom.dev/errors/marketplace-review-failed',
      title: 'Marketplace 审查未通过',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `审查未通过，${failedChecks.length} 项检查失败`,
      extensions: { reviewResult },
    });
  }
}

export class MarketplaceWorkflowNotPublishedException extends DomainException {
  constructor(workflowVersionId: string) {
    super({
      type: 'https://agentloom.dev/errors/marketplace-workflow-not-published',
      title: '工作流版本未发布',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `工作流版本 ${workflowVersionId} 未发布或已归档，无法提交到 Marketplace`,
    });
  }
}

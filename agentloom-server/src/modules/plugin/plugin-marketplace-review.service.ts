import { Injectable, Logger } from '@nestjs/common';

import {
  MARKETPLACE_REVIEW_LIMITS,
  type MarketplaceReviewCheck,
  type MarketplaceReviewCode,
  type MarketplaceReviewResult,
  type PluginRecord,
} from '../../database/schema';

@Injectable()
export class PluginMarketplaceReviewService {
  private readonly logger = new Logger(PluginMarketplaceReviewService.name);

  review(metadata: {
    title: string;
    summary: string;
    tags: string[];
    plugin: Pick<PluginRecord, 'id' | 'pluginId' | 'name'>;
  }): MarketplaceReviewResult {
    const checks = this.checkMetadata(metadata);
    const outcome = checks.every((check) => check.status === 'passed')
      ? 'passed'
      : 'failed';

    const result: MarketplaceReviewResult = {
      outcome,
      checks,
      reviewedAt: new Date().toISOString(),
    };

    this.logger.log(
      JSON.stringify({
        action: 'plugin_marketplace_review_completed',
        pluginDbId: metadata.plugin.id,
        pluginId: metadata.plugin.pluginId,
        pluginName: metadata.plugin.name,
        outcome,
        failedChecks: checks
          .filter((check) => check.status === 'failed')
          .map((check) => check.code),
      }),
    );

    return result;
  }

  private checkMetadata(metadata: {
    title: string;
    summary: string;
    tags: string[];
  }): MarketplaceReviewCheck[] {
    const checks: MarketplaceReviewCheck[] = [];
    const limits = MARKETPLACE_REVIEW_LIMITS;

    if (
      metadata.title.length < limits.titleMinLength ||
      metadata.title.length > limits.titleMaxLength
    ) {
      checks.push(
        this.fail(
          'TITLE_INVALID',
          `标题长度需在 ${limits.titleMinLength}-${limits.titleMaxLength} 字符之间`,
          {
            fixHint: `标题当前 ${metadata.title.length} 字符`,
            field: 'title',
          },
        ),
      );
    } else {
      checks.push(this.pass('TITLE_INVALID', '标题格式正确'));
    }

    if (
      metadata.summary.length < limits.summaryMinLength ||
      metadata.summary.length > limits.summaryMaxLength
    ) {
      checks.push(
        this.fail(
          'SUMMARY_INVALID',
          `摘要长度需在 ${limits.summaryMinLength}-${limits.summaryMaxLength} 字符之间`,
          {
            fixHint: `摘要当前 ${metadata.summary.length} 字符`,
            field: 'summary',
          },
        ),
      );
    } else {
      checks.push(this.pass('SUMMARY_INVALID', '摘要格式正确'));
    }

    if (
      metadata.tags.length < limits.minTags ||
      metadata.tags.length > limits.maxTags
    ) {
      checks.push(
        this.fail(
          'TAGS_INVALID',
          `标签数量需在 ${limits.minTags}-${limits.maxTags} 之间`,
          {
            fixHint: `当前 ${metadata.tags.length} 个标签`,
            field: 'tags',
          },
        ),
      );
    } else {
      const longTags = metadata.tags.filter(
        (tag) => tag.length > limits.tagMaxLength,
      );

      if (longTags.length > 0) {
        checks.push(
          this.fail(
            'TAGS_INVALID',
            `${longTags.length} 个标签超过 ${limits.tagMaxLength} 字符限制`,
            {
              fixHint: '缩短过长的标签',
              field: 'tags',
            },
          ),
        );
      } else {
        checks.push(this.pass('TAGS_INVALID', '标签格式正确'));
      }
    }

    return checks;
  }

  private pass(
    code: MarketplaceReviewCode,
    message: string,
  ): MarketplaceReviewCheck {
    return { code, status: 'passed', message };
  }

  private fail(
    code: MarketplaceReviewCode,
    message: string,
    extra?: {
      fixHint?: string;
      field?: string;
    },
  ): MarketplaceReviewCheck {
    return {
      code,
      status: 'failed',
      message,
      ...extra,
    };
  }
}

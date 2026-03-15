import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import {
  MARKETPLACE_REVIEW_LIMITS,
  type MarketplaceReviewCheck,
  type MarketplaceReviewCode,
  type MarketplaceReviewResult,
} from '../../database/schema';
import type { WorkflowVersionSnapshot } from '../../database/schema/workflow-versions.schema';

@Injectable()
export class MarketplaceReviewService {
  private readonly logger = new Logger(MarketplaceReviewService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async review(
    tenantId: string,
    workflowVersionId: string,
    metadata: { title: string; summary: string; tags: string[] },
  ): Promise<MarketplaceReviewResult> {
    const checks: MarketplaceReviewCheck[] = [];
    let recentSuccessfulExecutionId: string | undefined;
    let recentSuccessfulExecutionAt: string | undefined;

    const versionChecks = await this.checkVersionStatus(workflowVersionId);
    checks.push(...versionChecks);

    const versionBlocking = versionChecks.some((c) => c.status === 'failed');

    if (!versionBlocking) {
      const canvasChecks = await this.checkCanvasStructure(workflowVersionId);
      checks.push(...canvasChecks);

      const executionCheck = await this.checkRecentExecution(
        tenantId,
        workflowVersionId,
      );
      checks.push(executionCheck.check);
      recentSuccessfulExecutionId = executionCheck.executionId;
      recentSuccessfulExecutionAt = executionCheck.executionAt;
    } else {
      checks.push(
        this.fail(
          'WORKFLOW_EMPTY_NODE_DETECTED',
          '无法检查画布结构：工作流版本未发布',
          { fixHint: '请先确保工作流版本已发布' },
        ),
      );
      checks.push(
        this.fail(
          'RECENT_SUCCESSFUL_EXECUTION_MISSING',
          '无法检查执行记录：工作流版本未发布',
          { fixHint: '请先确保工作流版本已发布' },
        ),
      );
    }

    const metadataChecks = this.checkMetadata(metadata);
    checks.push(...metadataChecks);

    const outcome = checks.every((c) => c.status === 'passed')
      ? 'passed'
      : 'failed';

    const result: MarketplaceReviewResult = {
      outcome,
      checks,
      reviewedAt: new Date().toISOString(),
      ...(recentSuccessfulExecutionId && { recentSuccessfulExecutionId }),
      ...(recentSuccessfulExecutionAt && { recentSuccessfulExecutionAt }),
    };

    this.logger.log(
      JSON.stringify({
        action: 'marketplace_review_completed',
        workflowVersionId,
        outcome,
        failedChecks: checks
          .filter((c) => c.status === 'failed')
          .map((c) => c.code),
      }),
    );

    return result;
  }

  private async checkVersionStatus(
    workflowVersionId: string,
  ): Promise<MarketplaceReviewCheck[]> {
    const checks: MarketplaceReviewCheck[] = [];

    const [version] = await this.tenantDb
      .select({
        id: schema.workflowVersions.id,
        publishedAt: schema.workflowVersions.publishedAt,
        archivedAt: schema.workflowVersions.archivedAt,
        workflowStatus: schema.workflowDefinitions.status,
        publishedVersionId: schema.workflowDefinitions.publishedVersionId,
      })
      .from(schema.workflowVersions)
      .innerJoin(
        schema.workflowDefinitions,
        eq(
          schema.workflowVersions.workflowDefinitionId,
          schema.workflowDefinitions.id,
        ),
      )
      .where(eq(schema.workflowVersions.id, workflowVersionId));

    const isPublishedVersion =
      !!version?.publishedAt &&
      version.publishedVersionId === workflowVersionId &&
      version.workflowStatus !== 'draft';

    if (!version || !isPublishedVersion) {
      checks.push(
        this.fail(
          'WORKFLOW_VERSION_NOT_PUBLISHED',
          '工作流版本未发布，无法提交到 Marketplace',
          { fixHint: '请先发布工作流版本' },
        ),
      );
    } else {
      checks.push(this.pass('WORKFLOW_VERSION_NOT_PUBLISHED', '工作流版本已发布'));
    }

    if (version?.archivedAt || version?.workflowStatus === 'archived') {
      checks.push(
        this.fail(
          'WORKFLOW_VERSION_ARCHIVED',
          '工作流版本已归档，无法提交到 Marketplace',
          { fixHint: '请使用未归档的版本' },
        ),
      );
    } else {
      checks.push(this.pass('WORKFLOW_VERSION_ARCHIVED', '工作流版本未归档'));
    }

    return checks;
  }

  private async checkCanvasStructure(
    workflowVersionId: string,
  ): Promise<MarketplaceReviewCheck[]> {
    const checks: MarketplaceReviewCheck[] = [];

    const [version] = await this.tenantDb
      .select({ snapshot: schema.workflowVersions.snapshot })
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.id, workflowVersionId));

    const snapshot = version?.snapshot as WorkflowVersionSnapshot | undefined;
    const nodes = snapshot?.nodes ?? [];

    if (nodes.length === 0) {
      checks.push(
        this.fail(
          'WORKFLOW_EMPTY_NODE_DETECTED',
          '工作流画布中没有任何节点',
          { fixHint: '至少添加一个 Agent 节点' },
        ),
      );
    } else {
      checks.push(
        this.pass(
          'WORKFLOW_EMPTY_NODE_DETECTED',
          `工作流画布包含 ${nodes.length} 个节点`,
        ),
      );
    }

    const agentNodes = nodes.filter((n) => n.type === 'agent');
    const misconfiguredNodes: Array<{
      nodeId: string;
      nodeType: string;
      missingFields: string[];
    }> = [];

    for (const node of agentNodes) {
      const data = node.data ?? {};
      const missing: string[] = [];

      if (!data.systemPrompt && !data.system_prompt) {
        missing.push('systemPrompt');
      }

      if (!data.llmModelId && !data.llm_model_id) {
        missing.push('llmModelId');
      }

      if (missing.length > 0) {
        misconfiguredNodes.push({
          nodeId: node.id,
          nodeType: node.type ?? 'agent',
          missingFields: missing,
        });
      }
    }

    if (misconfiguredNodes.length > 0) {
      checks.push(
        this.fail(
          'WORKFLOW_CRITICAL_CONFIG_INCOMPLETE',
          `${misconfiguredNodes.length} 个 Agent 节点配置不完整`,
          {
            fixHint: '确保每个 Agent 节点都配置了 System Prompt 和 LLM 模型',
            nodeId: misconfiguredNodes[0].nodeId,
            nodeType: misconfiguredNodes[0].nodeType,
            missingFields: misconfiguredNodes[0].missingFields,
          },
        ),
      );
    } else {
      checks.push(
        this.pass(
          'WORKFLOW_CRITICAL_CONFIG_INCOMPLETE',
          '所有 Agent 节点配置完整',
        ),
      );
    }

    return checks;
  }

  private async checkRecentExecution(
    tenantId: string,
    workflowVersionId: string,
  ): Promise<{
    check: MarketplaceReviewCheck;
    executionId?: string;
    executionAt?: string;
  }> {
    const lookbackDate = new Date();
    lookbackDate.setDate(
      lookbackDate.getDate() -
        MARKETPLACE_REVIEW_LIMITS.successfulExecutionLookbackDays,
    );

    const [recentExecution] = await this.tenantDb
      .select({
        id: schema.workflowExecutions.id,
        completedAt: schema.workflowExecutions.completedAt,
      })
      .from(schema.workflowExecutions)
      .where(
        and(
          eq(schema.workflowExecutions.workflowVersionId, workflowVersionId),
          eq(schema.workflowExecutions.tenantId, tenantId),
          eq(schema.workflowExecutions.status, 'completed'),
          gte(schema.workflowExecutions.completedAt, lookbackDate),
        ),
      )
      .orderBy(desc(schema.workflowExecutions.completedAt))
      .limit(1);

    if (!recentExecution) {
      return {
        check: this.fail(
          'RECENT_SUCCESSFUL_EXECUTION_MISSING',
          `过去 ${MARKETPLACE_REVIEW_LIMITS.successfulExecutionLookbackDays} 天内没有成功的执行记录`,
          {
            fixHint: '请先成功运行一次工作流',
          },
        ),
      };
    }

    return {
      check: this.pass(
        'RECENT_SUCCESSFUL_EXECUTION_MISSING',
        '存在近期成功执行记录',
      ),
      executionId: recentExecution.id,
      executionAt: recentExecution.completedAt?.toISOString(),
    };
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
        (t) => t.length > limits.tagMaxLength,
      );
      if (longTags.length > 0) {
        checks.push(
          this.fail(
            'TAGS_INVALID',
            `${longTags.length} 个标签超过 ${limits.tagMaxLength} 字符限制`,
            { fixHint: '缩短过长的标签', field: 'tags' },
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
      nodeId?: string;
      nodeType?: string;
      missingFields?: string[];
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

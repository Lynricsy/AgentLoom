import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import type { AnalysisMetadata } from '../../database/schema/optimization-suggestions.schema';
import {
  optimizationSuggestions,
  organizationAutonomyPolicies,
  organizationMembers,
  organizations,
  workflowDefinitions,
  type ReactFlowNode,
} from '../../database/schema';
import type { AutonomyMode } from '../agent/dto/autonomy.dto';
import {
  clampAutonomyModeToCap,
  compareAutonomyModes,
  explainAutonomyViolation,
  type AutonomyViolationExplanation,
} from '../agent/autonomy-mode-compat';
import { syncAutonomyModeMirrors } from '../agent/autonomy-mode-mirrors';
import { AuditLogService } from '../evidence/audit-log.service';
import {
  InsufficientOrganizationPermissionException,
  OrganizationNotFoundException,
} from './organization.exceptions';
import {
  UpdateOrganizationAutonomyPolicySchema,
  type UpdateOrganizationAutonomyPolicyDto,
} from './dto/update-organization-autonomy-policy.dto';
import type {
  OrganizationAutonomyDowngradeConfirmResponseDto,
  OrganizationAutonomyDowngradePreviewResponseDto,
  OrganizationAutonomyPolicyResponseDto,
  OrganizationAutonomyViolationDetailDto,
  OrganizationAutonomyViolationSummaryDto,
} from './dto/organization-autonomy-policy-response.dto';

export const SYSTEM_DEFAULT_ORGANIZATION_AUTONOMY_POLICY = {
  autonomyCap: 'LLM_SUGGEST' as AutonomyMode,
} as const;

type WorkflowSummaryRow = Pick<
  typeof workflowDefinitions.$inferSelect,
  'id' | 'name' | 'nodes'
>;

type InternalOrganizationAutonomyViolationDetail =
  OrganizationAutonomyViolationDetailDto & {
    nodeIndex: number;
  };

interface WorkflowDowngradeImpactRow {
  workflowId: string;
  workflowName: string;
  nodes: ReactFlowNode[];
  violations: InternalOrganizationAutonomyViolationDetail[];
}

interface OrganizationAutonomyDowngradeImpact {
  violationSummary: OrganizationAutonomyViolationSummaryDto;
  violations: OrganizationAutonomyViolationDetailDto[];
  workflows: WorkflowDowngradeImpactRow[];
}

interface WorkflowPolicyInspectionInput {
  tenantId: string;
  workflowId: string;
  workflowName: string;
  nodes: ReactFlowNode[];
}

interface WorkflowPolicyInspectionResult {
  autonomyCap: AutonomyMode;
  violations: OrganizationAutonomyViolationDetailDto[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}

export function resolveRawAutonomyMode(nodeData: unknown): string {
  const normalizedNodeData = asRecord(nodeData) ?? {};
  const config = asRecord(normalizedNodeData.config) ?? {};
  const settings = asRecord(normalizedNodeData.settings) ?? {};
  const autonomyConfig = asRecord(normalizedNodeData.autonomyConfig) ?? {};

  // 缺省必须与实际执行保持 FULL_AUTO，否则发布期会把未配置节点误判成需人工确认。
  return (
    readString(
      normalizedNodeData.autonomyMode,
      autonomyConfig.mode,
      settings.autonomyMode,
      config.autonomyMode,
    ) ?? 'FULL_AUTO'
  );
}

@Injectable()
export class OrganizationAutonomyPolicyService {
  private readonly logger = new Logger(OrganizationAutonomyPolicyService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Optional() private readonly auditLogService?: AuditLogService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async getAutonomyPolicy(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationAutonomyPolicyResponseDto> {
    const organization = await this.ensureOwnerAccess(organizationId, userId);
    const storedPolicy =
      await this.tenantDb.query.organizationAutonomyPolicies.findFirst({
        where: eq(organizationAutonomyPolicies.organizationId, organizationId),
      });

    if (!storedPolicy) {
      return this.toDefaultResponseDto(organization.id, organization.tenantId);
    }

    return this.toResponseDto(storedPolicy);
  }

  async updateAutonomyPolicy(
    organizationId: string,
    dto: UpdateOrganizationAutonomyPolicyDto,
    userId: string,
  ): Promise<OrganizationAutonomyPolicyResponseDto> {
    const organization = await this.ensureOwnerAccess(organizationId, userId);
    const validated = UpdateOrganizationAutonomyPolicySchema.parse(dto);
    const existingPolicy =
      await this.tenantDb.query.organizationAutonomyPolicies.findFirst({
        where: eq(organizationAutonomyPolicies.organizationId, organizationId),
      });
    const previousCap =
      (existingPolicy?.autonomyCap as AutonomyMode | undefined) ??
      SYSTEM_DEFAULT_ORGANIZATION_AUTONOMY_POLICY.autonomyCap;
    const isTightened =
      compareAutonomyModes(validated.autonomyCap, previousCap) < 0;

    if (!existingPolicy) {
      const [created] = await this.tenantDb
        .insert(organizationAutonomyPolicies)
        .values({
          organizationId,
          tenantId: organization.tenantId,
          autonomyCap: validated.autonomyCap,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      if (isTightened) {
        await this.blockPendingAutonomyUpgradeSuggestions(
          this.tenantDb,
          organization.tenantId,
          validated.autonomyCap,
        );
      }

      this.logger.log(
        `Created organization autonomy policy for ${organizationId}`,
      );
      const response = await this.toResponseDto(created);
      await this.recordAudit({
        tenantId: organization.tenantId,
        actorId: userId,
        eventType: 'organization.autonomy-policy.updated',
        resourceId: organizationId,
        summary: 'Organization autonomy policy updated',
        before: {
          autonomyCap: previousCap,
        },
        after: {
          autonomyCap: response.autonomyCap,
          version: response.version,
          violationSummary: response.violationSummary,
        },
      });
      return response;
    }

    const [updated] = await this.tenantDb
      .update(organizationAutonomyPolicies)
      .set({
        autonomyCap: validated.autonomyCap,
        updatedBy: userId,
        version: sql`${organizationAutonomyPolicies.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(organizationAutonomyPolicies.id, existingPolicy.id))
      .returning();

    if (isTightened) {
      await this.blockPendingAutonomyUpgradeSuggestions(
        this.tenantDb,
        organization.tenantId,
        validated.autonomyCap,
      );
    }

    this.logger.log(
      `Updated organization autonomy policy for ${organizationId}`,
    );
    const response = await this.toResponseDto(updated);
    await this.recordAudit({
      tenantId: organization.tenantId,
      actorId: userId,
      eventType: 'organization.autonomy-policy.updated',
      resourceId: organizationId,
      summary: 'Organization autonomy policy updated',
      before: {
        autonomyCap: previousCap,
        version: existingPolicy.version,
      },
      after: {
        autonomyCap: response.autonomyCap,
        version: response.version,
        violationSummary: response.violationSummary,
      },
    });
    return response;
  }

  async previewAutonomyDowngrade(
    organizationId: string,
    dto: UpdateOrganizationAutonomyPolicyDto,
    userId: string,
  ): Promise<OrganizationAutonomyDowngradePreviewResponseDto> {
    const organization = await this.ensureOwnerAccess(organizationId, userId);
    const validated = UpdateOrganizationAutonomyPolicySchema.parse(dto);
    const impact = await this.buildDowngradeImpact(
      organization.tenantId,
      validated.autonomyCap,
    );

    await this.recordAudit({
      tenantId: organization.tenantId,
      actorId: userId,
      eventType: 'organization.autonomy-policy.previewed',
      resourceId: organizationId,
      summary: 'Organization autonomy downgrade preview generated',
      metadata: this.createImpactAuditMetadata(validated.autonomyCap, impact),
    });

    return {
      organizationId,
      autonomyCap: validated.autonomyCap,
      violationSummary: impact.violationSummary,
      violations: impact.violations,
    };
  }

  async confirmAutonomyDowngrade(
    organizationId: string,
    dto: UpdateOrganizationAutonomyPolicyDto,
    userId: string,
  ): Promise<OrganizationAutonomyDowngradeConfirmResponseDto> {
    const organization = await this.ensureOwnerAccess(organizationId, userId);
    const validated = UpdateOrganizationAutonomyPolicySchema.parse(dto);
    const existingPolicy =
      await this.tenantDb.query.organizationAutonomyPolicies.findFirst({
        where: eq(organizationAutonomyPolicies.organizationId, organizationId),
      });
    const previousCap =
      (existingPolicy?.autonomyCap as AutonomyMode | undefined) ??
      SYSTEM_DEFAULT_ORGANIZATION_AUTONOMY_POLICY.autonomyCap;
    const isTightened =
      compareAutonomyModes(validated.autonomyCap, previousCap) < 0;
    const impact = await this.buildDowngradeImpact(
      organization.tenantId,
      validated.autonomyCap,
    );

    await this.recordAudit({
      tenantId: organization.tenantId,
      actorId: userId,
      eventType: 'organization.autonomy-policy.confirmed',
      resourceId: organizationId,
      summary: 'Organization autonomy downgrade confirmed',
      metadata: this.createImpactAuditMetadata(validated.autonomyCap, impact),
    });

    try {
      const persistedPolicy = await this.tenantDb.transaction(async (tx) => {
        const existingPolicy =
          await tx.query.organizationAutonomyPolicies.findFirst({
            where: eq(
              organizationAutonomyPolicies.organizationId,
              organizationId,
            ),
          });

        const [policy] = existingPolicy
          ? await tx
              .update(organizationAutonomyPolicies)
              .set({
                autonomyCap: validated.autonomyCap,
                updatedBy: userId,
                version: sql`${organizationAutonomyPolicies.version} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(organizationAutonomyPolicies.id, existingPolicy.id))
              .returning()
          : await tx
              .insert(organizationAutonomyPolicies)
              .values({
                organizationId,
                tenantId: organization.tenantId,
                autonomyCap: validated.autonomyCap,
                createdBy: userId,
                updatedBy: userId,
              })
              .returning();

        for (const workflow of impact.workflows) {
          const downgradedNodes = this.applyWorkflowDowngrade(
            workflow.nodes,
            workflow.violations,
          );

          await tx
            .update(workflowDefinitions)
            .set({
              nodes: downgradedNodes,
              updatedBy: userId,
              updatedAt: new Date(),
              version: sql`${workflowDefinitions.version} + 1`,
            })
            .where(eq(workflowDefinitions.id, workflow.workflowId))
            .returning();
        }

        if (isTightened) {
          await this.blockPendingAutonomyUpgradeSuggestions(
            tx,
            organization.tenantId,
            validated.autonomyCap,
          );
        }

        return policy;
      });

      const policy = await this.toResponseDto(persistedPolicy);

      await this.recordAudit({
        tenantId: organization.tenantId,
        actorId: userId,
        eventType: 'organization.autonomy-policy.downgrade-completed',
        resourceId: organizationId,
        summary: 'Organization autonomy downgrade completed',
        after: {
          autonomyCap: validated.autonomyCap,
          policyVersion: policy.version,
          violationSummary: policy.violationSummary,
        },
        metadata: this.createImpactAuditMetadata(validated.autonomyCap, impact),
      });

      return {
        organizationId,
        autonomyCap: validated.autonomyCap,
        downgradedSummary: impact.violationSummary,
        downgradedViolations: impact.violations,
        policy,
      };
    } catch (error) {
      await this.recordDowngradeFailureAudit(
        organization.tenantId,
        organizationId,
        userId,
        validated.autonomyCap,
        impact,
        error,
      );
      throw error;
    }
  }

  async resolveAutonomyCapForTenant(tenantId: string): Promise<AutonomyMode> {
    const organization = await this.tenantDb.query.organizations.findFirst({
      where: eq(organizations.tenantId, tenantId),
    });

    if (!organization) {
      return SYSTEM_DEFAULT_ORGANIZATION_AUTONOMY_POLICY.autonomyCap;
    }

    const policy =
      await this.tenantDb.query.organizationAutonomyPolicies.findFirst({
        where: eq(organizationAutonomyPolicies.organizationId, organization.id),
      });

    return (
      (policy?.autonomyCap as AutonomyMode | undefined) ??
      SYSTEM_DEFAULT_ORGANIZATION_AUTONOMY_POLICY.autonomyCap
    );
  }

  async resolveEffectiveAutonomyMode(
    tenantId: string,
    nodeData: unknown,
  ): Promise<string> {
    const autonomyCap = await this.resolveAutonomyCapForTenant(tenantId);

    // 在唯一入口同时解析节点优先级与租户上限，避免 worker、executor 和发布校验各自漂移。
    return clampAutonomyModeToCap(resolveRawAutonomyMode(nodeData), autonomyCap)
      .effectiveMode;
  }

  async inspectWorkflowNodesAgainstPolicy(
    input: WorkflowPolicyInspectionInput,
  ): Promise<WorkflowPolicyInspectionResult> {
    const autonomyCap = await this.resolveAutonomyCapForTenant(input.tenantId);
    const violations = this.collectWorkflowViolations(
      {
        id: input.workflowId,
        name: input.workflowName,
        nodes: input.nodes,
      },
      autonomyCap,
    ).map(({ nodeIndex: _nodeIndex, ...violation }) => violation);

    return {
      autonomyCap,
      violations,
    };
  }

  private async ensureOwnerAccess(organizationId: string, userId: string) {
    const organization = await this.tenantDb.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    });

    if (!organization) {
      throw new OrganizationNotFoundException();
    }

    const membership = await this.tenantDb.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
      ),
    });

    if (!membership || membership.role !== 'owner') {
      throw new InsufficientOrganizationPermissionException();
    }

    return organization;
  }

  private toDefaultResponseDto(
    organizationId: string,
    tenantId: string,
  ): Promise<OrganizationAutonomyPolicyResponseDto> {
    const autonomyCap = SYSTEM_DEFAULT_ORGANIZATION_AUTONOMY_POLICY.autonomyCap;

    return this.createResponseDto({
      organizationId,
      autonomyCap,
      version: 0,
      tenantId,
    });
  }

  private toResponseDto(
    policy: typeof organizationAutonomyPolicies.$inferSelect,
  ): Promise<OrganizationAutonomyPolicyResponseDto> {
    return this.createResponseDto({
      organizationId: policy.organizationId,
      autonomyCap: policy.autonomyCap as AutonomyMode,
      version: policy.version,
      tenantId: policy.tenantId,
      updatedBy: policy.updatedBy,
      createdAt: policy.createdAt.toISOString(),
      updatedAt: policy.updatedAt.toISOString(),
    });
  }

  private async createResponseDto(params: {
    organizationId: string;
    autonomyCap: AutonomyMode;
    version: number;
    tenantId: string;
    updatedBy?: string;
    createdAt?: string;
    updatedAt?: string;
  }): Promise<OrganizationAutonomyPolicyResponseDto> {
    const violationSummary = await this.buildViolationSummary(
      params.tenantId,
      params.autonomyCap,
    );

    return {
      organizationId: params.organizationId,
      autonomyCap: params.autonomyCap,
      version: params.version,
      violationSummary,
      updatedBy: params.updatedBy,
      createdAt: params.createdAt,
      updatedAt: params.updatedAt,
    };
  }

  private async buildViolationSummary(
    tenantId: string,
    autonomyCap: AutonomyMode,
  ): Promise<OrganizationAutonomyViolationSummaryDto> {
    const impact = await this.buildDowngradeImpact(tenantId, autonomyCap);
    return impact.violationSummary;
  }

  private async buildDowngradeImpact(
    tenantId: string,
    autonomyCap: AutonomyMode,
  ): Promise<OrganizationAutonomyDowngradeImpact> {
    const workflows = await this.tenantDb
      .select({
        id: workflowDefinitions.id,
        name: workflowDefinitions.name,
        nodes: workflowDefinitions.nodes,
      })
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.tenantId, tenantId));

    const impactedWorkflows: WorkflowDowngradeImpactRow[] = [];

    for (const workflow of workflows as WorkflowSummaryRow[]) {
      const violations = this.collectWorkflowViolations(workflow, autonomyCap);

      if (violations.length > 0) {
        impactedWorkflows.push({
          workflowId: workflow.id,
          workflowName: workflow.name,
          nodes: workflow.nodes,
          violations,
        });
      }
    }

    const violations = impactedWorkflows.flatMap((workflow) =>
      workflow.violations.map(
        ({ nodeIndex: _nodeIndex, ...violation }) => violation,
      ),
    );

    return {
      violationSummary: {
        workflowCount: impactedWorkflows.length,
        nodeCount: violations.length,
      },
      violations,
      workflows: impactedWorkflows,
    };
  }

  private collectWorkflowViolations(
    workflow: WorkflowSummaryRow,
    autonomyCap: AutonomyMode,
  ): InternalOrganizationAutonomyViolationDetail[] {
    return workflow.nodes.flatMap((node, nodeIndex) => {
      if (!this.isAgentNode(node)) {
        return [];
      }

      const autonomyMode = this.resolveNodeAutonomyMode(node);
      const explanation = explainAutonomyViolation(autonomyMode, autonomyCap);

      if (!explanation.exceedsCap) {
        return [];
      }

      return [this.toViolationDetail(workflow, node, nodeIndex, explanation)];
    });
  }

  private isAgentNode(node: ReactFlowNode): boolean {
    const nodeData = this.asRecord(node.data) ?? {};

    return (
      node.type === 'agent' ||
      node.type === 'llm-agent' ||
      this.readString(nodeData.category) === 'agent'
    );
  }

  private resolveNodeAutonomyMode(node: ReactFlowNode): string {
    // 发布期复用运行时的同一原始值解析规则，未配置节点因此统一按 FULL_AUTO 参与上限校验。
    return resolveRawAutonomyMode(node.data);
  }

  private toViolationDetail(
    workflow: WorkflowSummaryRow,
    node: ReactFlowNode,
    nodeIndex: number,
    explanation: AutonomyViolationExplanation,
  ): InternalOrganizationAutonomyViolationDetail {
    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      nodeId: node.id,
      nodeName: this.resolveNodeName(node),
      rawMode: explanation.rawMode,
      canonicalMode: explanation.canonicalMode,
      replacementMode: explanation.replacementMode,
      source: explanation.source,
      reasonCode: explanation.reasonCode,
      message: explanation.message,
      nodeIndex,
    };
  }

  private resolveNodeName(node: ReactFlowNode): string {
    const nodeData = this.asRecord(node.data) ?? {};

    return (
      this.readString(nodeData.label, nodeData.name, nodeData.title) ?? node.id
    );
  }

  private applyWorkflowDowngrade(
    nodes: ReactFlowNode[],
    violations: InternalOrganizationAutonomyViolationDetail[],
  ): ReactFlowNode[] {
    const violationByIndex = new Map(
      violations.map((violation) => [violation.nodeIndex, violation]),
    );

    return nodes.map((node, nodeIndex) => {
      const violation = violationByIndex.get(nodeIndex);

      if (!violation) {
        return node;
      }

      return {
        ...node,
        data: syncAutonomyModeMirrors(node.data, violation.replacementMode),
      };
    });
  }

  private async blockPendingAutonomyUpgradeSuggestions(
    tenantDb: unknown,
    tenantId: string,
    autonomyCap: AutonomyMode,
  ) {
    const scopedDb = tenantDb as Pick<DrizzleDB, 'query' | 'update'>;
    const pendingSuggestions =
      await scopedDb.query.optimizationSuggestions.findMany({
        where: and(
          eq(optimizationSuggestions.tenantId, tenantId),
          eq(optimizationSuggestions.suggestionType, 'autonomy_upgrade'),
          eq(optimizationSuggestions.status, 'pending'),
        ),
      });

    const blockedAt = new Date();

    for (const suggestion of pendingSuggestions) {
      const suggestedValue = this.asRecord(suggestion.suggestedValue) ?? {};
      const suggestedMode =
        this.readString(suggestedValue.autonomyMode, suggestedValue.mode) ??
        'MANUAL_CONFIRM';
      const explanation = explainAutonomyViolation(suggestedMode, autonomyCap);

      if (!explanation.exceedsCap) {
        continue;
      }

      await scopedDb
        .update(optimizationSuggestions)
        .set({
          status: 'blocked',
          analysisMetadata: this.buildBlockedAnalysisMetadata(
            this.asRecord(suggestion.analysisMetadata) ?? {},
            autonomyCap,
            explanation,
            blockedAt,
          ),
          updatedAt: blockedAt,
        })
        .where(eq(optimizationSuggestions.id, suggestion.id))
        .returning();
    }
  }

  private buildBlockedAnalysisMetadata(
    analysisMetadata: Record<string, unknown>,
    autonomyCap: AutonomyMode,
    explanation: AutonomyViolationExplanation,
    blockedAt: Date,
  ): AnalysisMetadata {
    return {
      ...analysisMetadata,
      totalRecords: this.readNumber(analysisMetadata.totalRecords) ?? 0,
      analyzerVersion:
        this.readString(analysisMetadata.analyzerVersion) ??
        'optimization-analysis-v1',
      policyBlock: {
        autonomyCap,
        rawMode: explanation.rawMode,
        canonicalMode: explanation.canonicalMode,
        replacementMode: explanation.replacementMode,
        source: explanation.source,
        reasonCode: explanation.reasonCode,
        message: explanation.message,
        blockedAt: blockedAt.toISOString(),
      },
    };
  }

  private createImpactAuditMetadata(
    autonomyCap: AutonomyMode,
    impact: OrganizationAutonomyDowngradeImpact,
  ) {
    return {
      autonomyCap,
      workflowCount: impact.violationSummary.workflowCount,
      nodeCount: impact.violationSummary.nodeCount,
      violations: impact.violations,
    };
  }

  private async recordAudit(params: {
    tenantId: string;
    actorId: string;
    eventType: string;
    resourceId: string;
    summary: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }) {
    if (!this.auditLogService) {
      return;
    }

    await this.auditLogService.record({
      tenantId: params.tenantId,
      actorId: params.actorId,
      actorType: 'user',
      eventType: params.eventType,
      resourceType: 'organization',
      resourceId: params.resourceId,
      summary: params.summary,
      before: params.before ?? null,
      after: params.after ?? null,
      metadata: params.metadata ?? null,
    });
  }

  private async recordDowngradeFailureAudit(
    tenantId: string,
    organizationId: string,
    actorId: string,
    autonomyCap: AutonomyMode,
    impact: OrganizationAutonomyDowngradeImpact,
    error: unknown,
  ) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown downgrade failure';

    try {
      await this.recordAudit({
        tenantId,
        actorId,
        eventType: 'organization.autonomy-policy.downgrade-failed',
        resourceId: organizationId,
        summary: 'Organization autonomy downgrade failed',
        metadata: {
          ...this.createImpactAuditMetadata(autonomyCap, impact),
          errorMessage,
        },
      });
    } catch (auditError) {
      this.logger.error(
        `Failed to record organization autonomy downgrade failure audit for ${organizationId}`,
        auditError instanceof Error ? auditError.stack : undefined,
      );
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : null;
  }

  private readString(...values: unknown[]): string | null {
    const resolved = values.find(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );

    return resolved ?? null;
  }

  private readNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    return null;
  }
}

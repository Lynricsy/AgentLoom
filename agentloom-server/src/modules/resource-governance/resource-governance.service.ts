import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  hasActiveTenantTransaction,
  registerAfterCommitHook,
  runInTenantTransaction,
} from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import type { OrgRole } from '../../common/types/org-role.type';
import type { DrizzleDB } from '../../database/database.module';
import {
  type AuditActorType,
  type AuditLogJson,
  auditLogs,
  executionGovernanceControls,
  organizationMembers,
  organizations,
  tenantQuotas,
  workflowExecutions,
  type ExecutionGovernanceControl,
  type TenantQuota,
} from '../../database/schema';
import { AuditLogService } from '../evidence/audit-log.service';
import { OrganizationNotFoundException } from '../organization/organization.exceptions';
import type {
  GovernancePauseStateDto,
  ExecutionGovernanceControlsResponseDto,
  ResourceGovernanceStateResponseDto,
  TenantQuotaResponseDto,
} from './dto/resource-governance-response.dto';
import type {
  ResourceGovernanceActionResponseDto,
  TerminateExecutionResponseDto,
} from './dto/resource-governance-action-response.dto';
import {
  UpsertExecutionGovernanceControlsSchema,
  type UpsertExecutionGovernanceControlsDto,
} from './dto/upsert-execution-governance-controls.dto';
import {
  UpsertTenantQuotaSchema,
  type UpsertTenantQuotaDto,
} from './dto/upsert-tenant-quota.dto';
import {
  type ResourceGovernanceBlockExplainMetadata,
  type ResourceGovernanceDecisionAction,
  type ResourceGovernanceDecisionBlockDetail,
  type ResourceGovernanceDecisionCategory,
  type ResourceGovernanceDecisionScope,
  ResourceGovernanceAccessDeniedException,
} from './resource-governance.exceptions';
import {
  ResourceGovernanceEventName,
  type ResourceGovernanceControlsUpdatedEvent,
  type ResourceGovernanceExecutionStartBlockedEvent,
  type ResourceGovernanceExecutionTerminatedEvent,
  type ResourceGovernanceQuotaUpdatedEvent,
} from './resource-governance.events';

export const SYSTEM_DEFAULT_TENANT_QUOTA = {
  apiRateLimitPerMinute: 100,
  maxConcurrentExecutions: null,
  dailyExecutionLimit: null,
  dailyApiCallLimit: null,
  storageQuotaMb: null,
  maxSandboxCpuPercent: null,
  maxSandboxMemoryMb: null,
} as const;

export const SYSTEM_DEFAULT_EXECUTION_GOVERNANCE = {
  tenantControlStatus: 'active' as const,
  workflowControls: [] as GovernancePauseStateDto[],
};

const GOVERNANCE_ADMIN_ROLES: readonly OrgRole[] = ['owner', 'admin'];

interface QuotaSnapshot {
  apiRateLimitPerMinute: number;
  maxConcurrentExecutions: number | null;
  dailyExecutionLimit: number | null;
  dailyApiCallLimit: number | null;
  storageQuotaMb: number | null;
  maxSandboxCpuPercent: number | null;
  maxSandboxMemoryMb: number | null;
}

const ACTIVE_EXECUTION_STATUSES = ['pending', 'running', 'paused'] as const;

@Injectable()
export class ResourceGovernanceService {
  private readonly logger = new Logger(ResourceGovernanceService.name);

  constructor(
    private readonly db: DrizzleDB,
    private readonly auditLogService?: AuditLogService,
    private readonly eventEmitter?: EventEmitter2,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async getEffectiveState(
    organizationId: string,
    userId: string,
  ): Promise<ResourceGovernanceStateResponseDto> {
    const organization = await this.ensureGovernanceAccess(organizationId, userId);

    const [storedQuota, storedGovernance] = await Promise.all([
      this.tenantDb.query.tenantQuotas.findFirst({
        where: eq(tenantQuotas.organizationId, organizationId),
      }),
      this.tenantDb.query.executionGovernanceControls.findMany({
        where: eq(executionGovernanceControls.organizationId, organizationId),
      }),
    ]);

    return {
      organizationId,
      quota: storedQuota
        ? this.toTenantQuotaResponse(storedQuota)
        : this.toDefaultTenantQuotaResponse(organization.id, organization.tenantId),
      governance: this.toExecutionGovernanceResponse(
        organization.id,
        organization.tenantId,
        storedGovernance,
      ),
    };
  }

  async resolveRuntimeStateForTenant(
    tenantId: string,
    dbClient: DrizzleDB = this.tenantDb,
  ): Promise<ResourceGovernanceStateResponseDto | null> {
    if (!hasActiveTenantTransaction() && dbClient === this.tenantDb) {
      return runInTenantTransaction(this.db, tenantId, async (tenantDb) =>
        this.resolveRuntimeStateForTenant(tenantId, tenantDb),
      );
    }

    const organization = await dbClient.query.organizations.findFirst({
      where: eq(organizations.tenantId, tenantId),
    });

    if (!organization) {
      return null;
    }

    const [storedQuota, storedGovernance] = await Promise.all([
      dbClient.query.tenantQuotas.findFirst({
        where: eq(tenantQuotas.tenantId, tenantId),
      }),
      dbClient.query.executionGovernanceControls.findMany({
        where: eq(executionGovernanceControls.tenantId, tenantId),
      }),
    ]);

    return {
      organizationId: organization.id,
      quota: storedQuota
        ? this.toTenantQuotaResponse(storedQuota)
        : this.toDefaultTenantQuotaResponse(organization.id, tenantId),
      governance: this.toExecutionGovernanceResponse(
        organization.id,
        tenantId,
        storedGovernance,
      ),
    };
  }

  async resolveExecutionAdmissionDecision(params: {
    tenantId: string;
    workflowId: string;
    now?: Date;
    dbClient?: DrizzleDB;
  }): Promise<ResourceGovernanceDecisionBlockDetail | null> {
    const dbClient = params.dbClient ?? this.tenantDb;
    const runtimeState = await this.resolveRuntimeStateForTenant(
      params.tenantId,
      dbClient,
    );

    if (!runtimeState) {
      return null;
    }

    const tenantControl = runtimeState.governance.tenantControl;
    const workflowControl = runtimeState.governance.workflowControls.find(
      (control) => control.targetId === params.workflowId,
    );

    if (tenantControl.status === 'paused') {
      return this.buildBlockedDecision({
        action: 'execution_start',
        category: 'tenant_pause',
        scope: 'tenant',
        reason:
          tenantControl.reason ??
          'tenant governance pause is preventing new workflow executions',
        organizationId: runtimeState.organizationId,
        tenantControl,
        workflowControl: workflowControl ?? null,
        metadata: {
          workflowId: params.workflowId,
        },
      });
    }

    if (workflowControl?.status === 'paused') {
      return this.buildBlockedDecision({
        action: 'execution_start',
        category: 'workflow_pause',
        scope: 'workflow',
        reason:
          workflowControl.reason ??
          'workflow governance pause is preventing new workflow executions',
        organizationId: runtimeState.organizationId,
        tenantControl,
        workflowControl,
        metadata: {
          workflowId: params.workflowId,
        },
      });
    }

    const [{ count: activeExecutionCount }] = await dbClient
      .select({ count: sql<number>`count(*)::int` })
      .from(workflowExecutions)
      .where(
        and(
          eq(workflowExecutions.tenantId, params.tenantId),
          inArray(workflowExecutions.status, ACTIVE_EXECUTION_STATUSES),
        ),
      );

    if (
      runtimeState.quota.maxConcurrentExecutions !== null &&
      activeExecutionCount >= runtimeState.quota.maxConcurrentExecutions
    ) {
      return this.buildBlockedDecision({
        action: 'execution_start',
        category: 'execution_quota',
        scope: 'tenant',
        reason: 'tenant concurrent execution quota has been exceeded',
        organizationId: runtimeState.organizationId,
        tenantControl,
        workflowControl,
        metadata: {
          workflowId: params.workflowId,
          metric: 'maxConcurrentExecutions',
          limit: runtimeState.quota.maxConcurrentExecutions,
          currentValue: activeExecutionCount,
        },
      });
    }

    const dayStart = params.now ? new Date(params.now) : new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    const [{ count: dailyExecutionCount }] = await dbClient
      .select({ count: sql<number>`count(*)::int` })
      .from(workflowExecutions)
      .where(
        and(
          eq(workflowExecutions.tenantId, params.tenantId),
          gte(workflowExecutions.createdAt, dayStart),
        ),
      );

    if (
      runtimeState.quota.dailyExecutionLimit !== null &&
      dailyExecutionCount >= runtimeState.quota.dailyExecutionLimit
    ) {
      return this.buildBlockedDecision({
        action: 'execution_start',
        category: 'execution_quota',
        scope: 'tenant',
        reason: 'tenant daily execution quota has been exceeded',
        organizationId: runtimeState.organizationId,
        tenantControl,
        workflowControl,
        metadata: {
          workflowId: params.workflowId,
          metric: 'dailyExecutionLimit',
          limit: runtimeState.quota.dailyExecutionLimit,
          currentValue: dailyExecutionCount,
        },
      });
    }

    return null;
  }

  buildBlockedDecision(params: {
    action: ResourceGovernanceDecisionAction;
    category: ResourceGovernanceDecisionCategory;
    scope: ResourceGovernanceDecisionScope;
    reason: string;
    organizationId: string;
    tenantControl: GovernancePauseStateDto;
    workflowControl?: GovernancePauseStateDto | null;
    metadata?: ResourceGovernanceBlockExplainMetadata;
    blockedAt?: Date;
  }): ResourceGovernanceDecisionBlockDetail {
    return {
      decision: 'blocked',
      action: params.action,
      category: params.category,
      scope: params.scope,
      reason: params.reason,
      effectiveState: {
        organizationId: params.organizationId,
        tenantControl: params.tenantControl,
        workflowControl: params.workflowControl ?? null,
      },
      blockedAt: (params.blockedAt ?? new Date()).toISOString(),
      metadata: params.metadata,
    };
  }

  async recordBlockedDecision(params: {
    tenantId: string;
    actorId: string | null;
    actorType: AuditActorType;
    block: ResourceGovernanceDecisionBlockDetail;
    executionId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    const eventType =
      params.block.action === 'api_request'
        ? 'resource-governance.api-request.blocked'
        : 'resource-governance.execution-start.blocked';
    const summary =
      params.block.action === 'api_request'
        ? '资源治理已阻止 API 请求'
        : '资源治理已阻止新的工作流执行';

    await this.recordAuditIndependently({
      tenantId: params.tenantId,
      actorId: params.actorId,
      actorType: params.actorType,
      eventType,
      resourceId: params.block.effectiveState.organizationId,
      executionId: params.executionId ?? null,
      summary,
      metadata: {
        block: params.block,
        ...(params.metadata ?? {}),
      },
    });

    if (
      params.block.action === 'execution_start' &&
      typeof params.block.metadata?.workflowId === 'string'
    ) {
      this.emitExecutionStartBlockedEvent({
        tenantId: params.tenantId,
        organizationId: params.block.effectiveState.organizationId,
        workflowId: params.block.metadata.workflowId,
        category: params.block.category,
        scope: params.block.scope,
        reason: params.block.reason,
        blockedAt: params.block.blockedAt,
        actor: {
          actorId: params.actorId,
          actorType: params.actorType,
        },
        effectiveState: params.block.effectiveState,
      });
    }
  }

  buildGovernanceActionResponse(params: {
    organizationId: string;
    requestedBy: string | null;
    requestedAt: string;
    effectedAt: string;
    reason: string | null;
    effectiveState: ResourceGovernanceStateResponseDto;
    workflowTargetIds: string[];
    tenantControlUpdated: boolean;
  }): ResourceGovernanceActionResponseDto {
    return {
      organizationId: params.organizationId,
      action: 'governance_update',
      scope:
        params.tenantControlUpdated || params.workflowTargetIds.length === 0
          ? 'tenant'
          : 'workflow',
      operator: params.requestedBy,
      requestedAt: params.requestedAt,
      effectedAt: params.effectedAt,
      reason: params.reason,
      effectiveState: params.effectiveState,
      affectedSummary: {
        requested:
          params.workflowTargetIds.length + (params.tenantControlUpdated ? 1 : 0),
        affected:
          params.workflowTargetIds.length + (params.tenantControlUpdated ? 1 : 0),
        skipped: 0,
        workflowTargetIds: params.workflowTargetIds,
      },
      metadata: {
        tenantControlUpdated: params.tenantControlUpdated,
      },
    };
  }

  buildTerminationActionResponse(params: {
    organizationId: string;
    executionId: string;
    workflowId: string;
    requestedBy: string | null;
    reason: string;
    requestedAt: string;
    effectedAt: string;
    finalStatus: string;
    effectiveState: ResourceGovernanceStateResponseDto;
  }): TerminateExecutionResponseDto {
    const timelineUrl = `/executions/${params.executionId}`;

    return {
      organizationId: params.organizationId,
      action: 'execution_termination',
      scope: 'execution',
      executionId: params.executionId,
      workflowId: params.workflowId,
      operator: params.requestedBy,
      requestedAt: params.requestedAt,
      effectedAt: params.effectedAt,
      reason: params.reason,
      effectiveState: params.effectiveState,
      affectedSummary: {
        requested: 1,
        affected: 1,
        skipped: 0,
        executionId: params.executionId,
        workflowId: params.workflowId,
        finalStatus: params.finalStatus,
        timelineUrl,
      },
      execution: {
        id: params.executionId,
        workflowId: params.workflowId,
        status: params.finalStatus,
        timelineUrl,
      },
      metadata: {
        finalStatus: params.finalStatus,
        timelineUrl,
      },
    };
  }

  async finalizeAnomalousExecutionTermination(params: {
    tenantId: string;
    organizationId: string;
    executionId: string;
    workflowId: string;
    requestedBy: string;
    reason: string;
    requestedAt: string;
    finalStatus?: string;
  }): Promise<TerminateExecutionResponseDto> {
    const effectedAt = new Date().toISOString();
    const effectiveState =
      (await this.resolveRuntimeStateForTenant(params.tenantId)) ?? {
        organizationId: params.organizationId,
        quota: this.toDefaultTenantQuotaResponse(
          params.organizationId,
          params.tenantId,
        ),
        governance: this.toDefaultExecutionGovernanceResponse(
          params.organizationId,
          params.tenantId,
        ),
      };
    const response = this.buildTerminationActionResponse({
      organizationId: params.organizationId,
      executionId: params.executionId,
      workflowId: params.workflowId,
      requestedBy: params.requestedBy,
      reason: params.reason,
      requestedAt: params.requestedAt,
      effectedAt,
      finalStatus: params.finalStatus ?? 'cancelled',
      effectiveState,
    });

    await this.recordAudit({
      tenantId: params.tenantId,
      actorId: params.requestedBy,
      actorType: 'user',
      eventType: ResourceGovernanceEventName.EXECUTION_TERMINATED,
      resourceId: params.organizationId,
      executionId: params.executionId,
      summary: '异常执行已被资源治理终止',
      metadata: {
        workflowId: params.workflowId,
        reason: params.reason,
        requestedAt: params.requestedAt,
        effectedAt,
      },
    });

    this.emitGovernanceEventAfterCommit(() => {
      this.emitExecutionTerminatedEvent({
        tenantId: params.tenantId,
        organizationId: params.organizationId,
        executionId: params.executionId,
        workflowId: params.workflowId,
        reason: params.reason,
        requestedAt: params.requestedAt,
        effectedAt,
        actor: {
          actorId: params.requestedBy,
          actorType: 'user',
        },
      });
    });

    return response;
  }

  async upsertTenantQuota(
    organizationId: string,
    dto: UpsertTenantQuotaDto,
    userId: string,
  ): Promise<TenantQuotaResponseDto> {
    const organization = await this.ensureGovernanceAccess(organizationId, userId);
    const requestedAt = new Date().toISOString();
    const validated = UpsertTenantQuotaSchema.parse(dto);
    const existingQuota = await this.tenantDb.query.tenantQuotas.findFirst({
      where: eq(tenantQuotas.organizationId, organizationId),
    });

    const previousResponse = existingQuota
      ? this.toTenantQuotaResponse(existingQuota)
      : this.toDefaultTenantQuotaResponse(organization.id, organization.tenantId);
    const resolvedSnapshot = this.resolveQuotaSnapshot(validated, previousResponse);

    if (!existingQuota) {
      const [created] = await this.tenantDb
        .insert(tenantQuotas)
        .values({
          organizationId,
          tenantId: organization.tenantId,
          ...resolvedSnapshot,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      const response = this.toTenantQuotaResponse(created);
      await this.recordAudit({
        tenantId: organization.tenantId,
        actorId: userId,
        actorType: 'user',
        eventType: 'resource-governance.quota.updated',
        resourceId: organizationId,
        summary: 'Tenant quota updated',
        before: this.toQuotaAuditSnapshot(previousResponse),
        after: this.toQuotaAuditSnapshot(response),
      });
      this.emitGovernanceEventAfterCommit(() => {
        this.emitQuotaUpdatedEvent({
          tenantId: organization.tenantId,
          organizationId,
          previousQuota: previousResponse,
          quota: response,
          requestedAt,
          effectedAt: response.updatedAt ?? requestedAt,
          actor: {
            actorId: userId,
            actorType: 'user',
          },
        });
      });

      this.logger.log(`Created tenant quota for ${organizationId}`);
      return response;
    }

    const [updated] = await this.tenantDb
      .update(tenantQuotas)
      .set({
        ...resolvedSnapshot,
        updatedBy: userId,
        version: sql`${tenantQuotas.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(tenantQuotas.id, existingQuota.id))
      .returning();

    const response = this.toTenantQuotaResponse(updated);
    await this.recordAudit({
      tenantId: organization.tenantId,
      actorId: userId,
      actorType: 'user',
      eventType: 'resource-governance.quota.updated',
      resourceId: organizationId,
      summary: 'Tenant quota updated',
      before: this.toQuotaAuditSnapshot(previousResponse),
      after: this.toQuotaAuditSnapshot(response),
    });
    this.emitGovernanceEventAfterCommit(() => {
      this.emitQuotaUpdatedEvent({
        tenantId: organization.tenantId,
        organizationId,
        previousQuota: previousResponse,
        quota: response,
        requestedAt,
        effectedAt: response.updatedAt ?? requestedAt,
        actor: {
          actorId: userId,
          actorType: 'user',
        },
      });
    });

    this.logger.log(`Updated tenant quota for ${organizationId}`);
    return response;
  }

  async upsertExecutionGovernanceControls(
    organizationId: string,
    dto: UpsertExecutionGovernanceControlsDto,
    userId: string,
  ): Promise<ExecutionGovernanceControlsResponseDto> {
    const organization = await this.ensureGovernanceAccess(organizationId, userId);
    const requestedAt = new Date().toISOString();
    const validated = UpsertExecutionGovernanceControlsSchema.parse(dto);
    const existingControls =
      await this.tenantDb.query.executionGovernanceControls.findMany({
        where: eq(executionGovernanceControls.organizationId, organizationId),
      });

    const previousResponse = this.toExecutionGovernanceResponse(
      organization.id,
      organization.tenantId,
      existingControls,
    );

    const response = await this.tenantDb.transaction(async (tx) => {
      const rowsByKey = new Map(
        existingControls.map((control) => [
          this.toGovernanceRowKey(control.scope, control.targetId),
          control,
        ]),
      );
      const nextControls = [...existingControls];

      if (validated.tenantControl) {
        const tenantRow = rowsByKey.get(
          this.toGovernanceRowKey('tenant', organization.tenantId),
        );

        if (!tenantRow) {
          const [createdTenantControl] = await tx
            .insert(executionGovernanceControls)
            .values({
              organizationId,
              tenantId: organization.tenantId,
              scope: 'tenant',
              targetId: organization.tenantId,
              status: validated.tenantControl.status,
              reason: validated.tenantControl.reason,
              createdBy: userId,
              updatedBy: userId,
            })
            .returning();

          nextControls.push(createdTenantControl);
          rowsByKey.set(
            this.toGovernanceRowKey('tenant', organization.tenantId),
            createdTenantControl,
          );
        } else {
          const [updatedTenantControl] = await tx
            .update(executionGovernanceControls)
            .set({
              status: validated.tenantControl.status,
              reason: validated.tenantControl.reason,
              updatedBy: userId,
              version: sql`${executionGovernanceControls.version} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(executionGovernanceControls.id, tenantRow.id))
            .returning();

          this.replaceGovernanceControl(nextControls, updatedTenantControl);
          rowsByKey.set(
            this.toGovernanceRowKey('tenant', organization.tenantId),
            updatedTenantControl,
          );
        }
      }

      if (validated.workflowControls !== undefined) {
        const existingWorkflowControls = nextControls.filter(
          (control) => control.scope === 'workflow',
        );
        const requestedTargetIds = new Set(
          validated.workflowControls.map((control) => control.targetId),
        );
        const staleWorkflowControlIds = existingWorkflowControls
          .filter((control) => !requestedTargetIds.has(control.targetId))
          .map((control) => control.id);

        if (staleWorkflowControlIds.length > 0) {
          await tx
            .delete(executionGovernanceControls)
            .where(inArray(executionGovernanceControls.id, staleWorkflowControlIds));

          for (const staleWorkflowControlId of staleWorkflowControlIds) {
            const index = nextControls.findIndex(
              (control) => control.id === staleWorkflowControlId,
            );

            if (index >= 0) {
              nextControls.splice(index, 1);
            }
          }
        }

        for (const workflowControl of validated.workflowControls) {
          const workflowRowKey = this.toGovernanceRowKey(
            workflowControl.scope,
            workflowControl.targetId,
          );
          const existingWorkflowControl = rowsByKey.get(workflowRowKey);

          if (!existingWorkflowControl) {
            const [createdWorkflowControl] = await tx
              .insert(executionGovernanceControls)
              .values({
                organizationId,
                tenantId: organization.tenantId,
                scope: workflowControl.scope,
                targetId: workflowControl.targetId,
                status: workflowControl.status,
                reason: workflowControl.reason,
                createdBy: userId,
                updatedBy: userId,
              })
              .returning();

            nextControls.push(createdWorkflowControl);
            rowsByKey.set(workflowRowKey, createdWorkflowControl);
            continue;
          }

          const [updatedWorkflowControl] = await tx
            .update(executionGovernanceControls)
            .set({
              status: workflowControl.status,
              reason: workflowControl.reason,
              updatedBy: userId,
              version: sql`${executionGovernanceControls.version} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(executionGovernanceControls.id, existingWorkflowControl.id))
            .returning();

          this.replaceGovernanceControl(nextControls, updatedWorkflowControl);
          rowsByKey.set(workflowRowKey, updatedWorkflowControl);
        }
      }

      return this.toExecutionGovernanceResponse(
        organization.id,
        organization.tenantId,
        nextControls,
      );
    });

    await this.recordAudit({
      tenantId: organization.tenantId,
      actorId: userId,
      actorType: 'user',
      eventType: 'resource-governance.controls.updated',
      resourceId: organizationId,
      summary: 'Execution governance controls updated',
      before: this.toGovernanceAuditSnapshot(previousResponse),
      after: this.toGovernanceAuditSnapshot(response),
    });
    this.emitGovernanceEventAfterCommit(() => {
      this.emitControlsUpdatedEvent({
        tenantId: organization.tenantId,
        organizationId,
        previousGovernance: previousResponse,
        governance: response,
        requestedAt,
        effectedAt: this.resolveGovernanceEffectedAt(response, requestedAt),
        actor: {
          actorId: userId,
          actorType: 'user',
        },
      });
    });

    this.logger.log(`Updated execution governance controls for ${organizationId}`);
    return response;
  }

  private async ensureGovernanceAccess(organizationId: string, userId: string) {
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

    if (!membership || !this.hasGovernanceAccess(membership.role)) {
      throw new ResourceGovernanceAccessDeniedException();
    }

    return organization;
  }

  private hasGovernanceAccess(role: OrgRole): boolean {
    return GOVERNANCE_ADMIN_ROLES.includes(role);
  }

  private toDefaultTenantQuotaResponse(
    organizationId: string,
    tenantId: string,
  ): TenantQuotaResponseDto {
    return {
      organizationId,
      tenantId,
      ...SYSTEM_DEFAULT_TENANT_QUOTA,
      version: 0,
    };
  }

  private toTenantQuotaResponse(quota: TenantQuota): TenantQuotaResponseDto {
    return {
      organizationId: quota.organizationId,
      tenantId: quota.tenantId,
      apiRateLimitPerMinute: quota.apiRateLimitPerMinute,
      maxConcurrentExecutions: quota.maxConcurrentExecutions,
      dailyExecutionLimit: quota.dailyExecutionLimit,
      dailyApiCallLimit: quota.dailyApiCallLimit,
      storageQuotaMb: quota.storageQuotaMb,
      maxSandboxCpuPercent: quota.maxSandboxCpuPercent,
      maxSandboxMemoryMb: quota.maxSandboxMemoryMb,
      version: quota.version,
      createdBy: quota.createdBy,
      updatedBy: quota.updatedBy,
      createdAt: quota.createdAt.toISOString(),
      updatedAt: quota.updatedAt.toISOString(),
    };
  }

  private toDefaultExecutionGovernanceResponse(
    organizationId: string,
    tenantId: string,
  ): ExecutionGovernanceControlsResponseDto {
    return {
      organizationId,
      tenantId,
      tenantControl: this.toDefaultTenantControl(tenantId),
      workflowControls: [],
      version: 0,
    };
  }

  private toExecutionGovernanceResponse(
    organizationId: string,
    tenantId: string,
    controls: ExecutionGovernanceControl[],
  ): ExecutionGovernanceControlsResponseDto {
    if (controls.length === 0) {
      return this.toDefaultExecutionGovernanceResponse(organizationId, tenantId);
    }

    const tenantControl = controls.find(
      (control) => control.scope === 'tenant' && control.targetId === tenantId,
    );
    const workflowControls = controls
      .filter((control) => control.scope === 'workflow')
      .map((control) => this.toGovernancePauseState(control))
      .sort((left, right) => left.targetId.localeCompare(right.targetId));

    return {
      organizationId,
      tenantId,
      tenantControl: tenantControl
        ? this.toGovernancePauseState(tenantControl)
        : this.toDefaultTenantControl(tenantId),
      workflowControls,
      version: Math.max(...controls.map((control) => control.version)),
    };
  }

  private resolveQuotaSnapshot(
    input: UpsertTenantQuotaDto,
    previous: TenantQuotaResponseDto,
  ): QuotaSnapshot {
    return {
      apiRateLimitPerMinute:
        input.apiRateLimitPerMinute ?? previous.apiRateLimitPerMinute,
      maxConcurrentExecutions:
        input.maxConcurrentExecutions === undefined
          ? previous.maxConcurrentExecutions
          : input.maxConcurrentExecutions,
      dailyExecutionLimit:
        input.dailyExecutionLimit === undefined
          ? previous.dailyExecutionLimit
          : input.dailyExecutionLimit,
      dailyApiCallLimit:
        input.dailyApiCallLimit === undefined
          ? previous.dailyApiCallLimit
          : input.dailyApiCallLimit,
      storageQuotaMb:
        input.storageQuotaMb === undefined
          ? previous.storageQuotaMb
          : input.storageQuotaMb,
      maxSandboxCpuPercent:
        input.maxSandboxCpuPercent === undefined
          ? previous.maxSandboxCpuPercent
          : input.maxSandboxCpuPercent,
      maxSandboxMemoryMb:
        input.maxSandboxMemoryMb === undefined
          ? previous.maxSandboxMemoryMb
          : input.maxSandboxMemoryMb,
    };
  }

  private toQuotaAuditSnapshot(quota: TenantQuotaResponseDto) {
    return {
      apiRateLimitPerMinute: quota.apiRateLimitPerMinute,
      maxConcurrentExecutions: quota.maxConcurrentExecutions,
      dailyExecutionLimit: quota.dailyExecutionLimit,
      dailyApiCallLimit: quota.dailyApiCallLimit,
      storageQuotaMb: quota.storageQuotaMb,
      maxSandboxCpuPercent: quota.maxSandboxCpuPercent,
      maxSandboxMemoryMb: quota.maxSandboxMemoryMb,
      version: quota.version,
    };
  }

  private toGovernanceAuditSnapshot(
    governance: ExecutionGovernanceControlsResponseDto,
  ) {
    return {
      tenantControl: governance.tenantControl,
      workflowControls: governance.workflowControls,
      version: governance.version,
    };
  }

  private toDefaultTenantControl(tenantId: string): GovernancePauseStateDto {
    return {
      scope: 'tenant',
      targetId: tenantId,
      status: SYSTEM_DEFAULT_EXECUTION_GOVERNANCE.tenantControlStatus,
      reason: null,
      updatedAt: null,
      updatedBy: null,
    };
  }

  private toGovernancePauseState(
    control: ExecutionGovernanceControl,
  ): GovernancePauseStateDto {
    return {
      scope: control.scope,
      targetId: control.targetId,
      status: control.status,
      reason: control.reason,
      updatedAt: control.updatedAt.toISOString(),
      updatedBy: control.updatedBy,
    };
  }

  private toGovernanceRowKey(scope: 'tenant' | 'workflow', targetId: string) {
    return `${scope}:${targetId}`;
  }

  private replaceGovernanceControl(
    controls: ExecutionGovernanceControl[],
    nextControl: ExecutionGovernanceControl,
  ) {
    const index = controls.findIndex((control) => control.id === nextControl.id);

    if (index >= 0) {
      controls[index] = nextControl;
      return;
    }

    controls.push(nextControl);
  }

  resolveGovernanceEffectedAt(
    governance: ExecutionGovernanceControlsResponseDto,
    fallback: string,
  ): string {
    const timestamps = [
      governance.tenantControl.updatedAt,
      ...governance.workflowControls.map((control) => control.updatedAt),
    ].filter((value): value is string => typeof value === 'string');

    return timestamps.sort().at(-1) ?? fallback;
  }

  private emitQuotaUpdatedEvent(event: ResourceGovernanceQuotaUpdatedEvent): void {
    this.eventEmitter?.emit(ResourceGovernanceEventName.QUOTA_UPDATED, event);
  }

  private emitControlsUpdatedEvent(
    event: ResourceGovernanceControlsUpdatedEvent,
  ): void {
    this.eventEmitter?.emit(ResourceGovernanceEventName.CONTROLS_UPDATED, event);
  }

  private emitExecutionStartBlockedEvent(
    event: ResourceGovernanceExecutionStartBlockedEvent,
  ): void {
    this.eventEmitter?.emit(
      ResourceGovernanceEventName.EXECUTION_START_BLOCKED,
      event,
    );
  }

  private emitExecutionTerminatedEvent(
    event: ResourceGovernanceExecutionTerminatedEvent,
  ): void {
    this.eventEmitter?.emit(
      ResourceGovernanceEventName.EXECUTION_TERMINATED,
      event,
    );
  }

  private emitGovernanceEventAfterCommit(emit: () => void): void {
    if (hasActiveTenantTransaction()) {
      registerAfterCommitHook(async () => {
        emit();
      });
      return;
    }

    emit();
  }

  private async recordAuditIndependently(params: {
    tenantId: string;
    actorId: string | null;
    actorType: AuditActorType;
    eventType: string;
    resourceId: string;
    summary: string;
    executionId?: string | null;
    before?: AuditLogJson | null;
    after?: AuditLogJson | null;
    metadata?: AuditLogJson | null;
  }) {
    if (typeof this.db.transaction !== 'function') {
      await this.recordAudit(params);
      return;
    }

    await this.db.transaction(async (tx) => {
      if (typeof tx.execute !== 'function') {
        await this.recordAudit(params);
        return;
      }

      await tx.execute(sql`SET LOCAL ROLE authenticated`);
      await tx.execute(
        sql`SELECT set_config('app.current_tenant', ${params.tenantId}, true)`,
      );

      await tx.insert(auditLogs).values({
        tenantId: params.tenantId,
        actorId: params.actorId,
        actorType: params.actorType,
        eventType: params.eventType,
        resourceType: 'organization',
        resourceId: params.resourceId,
        executionId: params.executionId ?? null,
        summary: params.summary,
        before: params.before ?? null,
        after: params.after ?? null,
        metadata: params.metadata ?? null,
      });
    });
  }

  private async recordAudit(params: {
    tenantId: string;
    actorId: string | null;
    actorType: AuditActorType;
    eventType: string;
    resourceId: string;
    summary: string;
    executionId?: string | null;
    before?: AuditLogJson | null;
    after?: AuditLogJson | null;
    metadata?: AuditLogJson | null;
  }) {
    if (!this.auditLogService) {
      return;
    }

    await this.auditLogService.record({
      tenantId: params.tenantId,
      actorId: params.actorId,
      actorType: params.actorType,
      eventType: params.eventType,
      resourceType: 'organization',
      resourceId: params.resourceId,
      executionId: params.executionId ?? null,
      summary: params.summary,
      before: params.before ?? null,
      after: params.after ?? null,
      metadata: params.metadata ?? null,
    });
  }
}

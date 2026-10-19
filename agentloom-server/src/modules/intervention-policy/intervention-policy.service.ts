import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { hasPostgresErrorCode } from '../../common/utils/postgres-error.utils';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import { WorkflowNotFoundException } from '../workflow-definition/workflow-version.exceptions';
import type { CreateInterventionPolicyDto } from './dto/create-intervention-policy.dto';
import type { UpdateInterventionPolicyDto } from './dto/update-intervention-policy.dto';
import type { ListInterventionPoliciesQueryDto } from './dto/list-intervention-policies-query.dto';
import type {
  InterventionPolicyResponseDto,
  ResolvedPolicyResponseDto,
} from './dto/intervention-policy-response.dto';
import {
  InterventionPolicyNotFoundException,
  InterventionPolicyConflictException,
  InterventionPolicyVersionConflictException,
} from './intervention-policy.exceptions';

export const SYSTEM_DEFAULT_POLICY = {
  allowedRoles: ['owner', 'admin'] as string[],
  timeoutSeconds: 86400,
  timeoutAction: 'reject' as const,
  escalateToRole: null as string | null,
  notifyChannels: ['in_app'] as string[],
} as const;

@Injectable()
export class InterventionPolicyService {
  private readonly logger = new Logger(InterventionPolicyService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private get tenantDb() {
    return getTenantDb(this.db);
  }

  async findAll(
    tenantId: string,
    workflowId: string,
    { page, pageSize }: ListInterventionPoliciesQueryDto,
  ) {
    const offset = (page - 1) * pageSize;

    const [policies, countResult] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.interventionPolicies)
        .where(
          and(
            eq(schema.interventionPolicies.tenantId, tenantId),
            eq(schema.interventionPolicies.workflowId, workflowId),
          ),
        )
        .orderBy(schema.interventionPolicies.createdAt)
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.interventionPolicies)
        .where(
          and(
            eq(schema.interventionPolicies.tenantId, tenantId),
            eq(schema.interventionPolicies.workflowId, workflowId),
          ),
        ),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data: policies.map((p) => this.toResponseDto(p)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // 策略只能经其所属工作流的路由访问：路径 workflowId 与策略不符时按不存在处理。
  async findById(tenantId: string, workflowId: string, policyId: string) {
    const [policy] = await this.tenantDb
      .select()
      .from(schema.interventionPolicies)
      .where(
        and(
          eq(schema.interventionPolicies.tenantId, tenantId),
          eq(schema.interventionPolicies.workflowId, workflowId),
          eq(schema.interventionPolicies.id, policyId),
        ),
      )
      .limit(1);

    if (!policy) {
      throw new InterventionPolicyNotFoundException(policyId);
    }

    return this.toResponseDto(policy);
  }

  async create(
    tenantId: string,
    userId: string,
    workflowId: string,
    dto: CreateInterventionPolicyDto,
  ): Promise<InterventionPolicyResponseDto> {
    const [workflow] = await this.tenantDb
      .select({ id: schema.workflowDefinitions.id })
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.id, workflowId),
          eq(schema.workflowDefinitions.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!workflow) {
      throw new WorkflowNotFoundException(workflowId);
    }

    try {
      const [created] = await this.tenantDb
        .insert(schema.interventionPolicies)
        .values({
          workflowId,
          tenantId,
          nodeId: dto.nodeId ?? null,
          allowedRoles: dto.allowedRoles,
          timeoutSeconds: dto.timeoutSeconds,
          timeoutAction: dto.timeoutAction,
          escalateToRole: dto.escalateToRole ?? null,
          notifyChannels: dto.notifyChannels,
          isActive: dto.isActive,
          createdBy: userId,
        })
        .returning();

      this.logger.log(
        `Created intervention policy ${created.id} for workflow ${workflowId}`,
      );

      return this.toResponseDto(created);
    } catch (error: unknown) {
      // 唯一索引 (workflow_id, COALESCE(node_id, '__workflow_level__'))；
      // Drizzle 把 pg 错误包在 cause 里，必须沿 cause 链判断错误码。
      if (hasPostgresErrorCode(error, '23505')) {
        throw new InterventionPolicyConflictException(workflowId, dto.nodeId);
      }
      throw error;
    }
  }

  async update(
    tenantId: string,
    workflowId: string,
    policyId: string,
    dto: UpdateInterventionPolicyDto,
  ): Promise<InterventionPolicyResponseDto> {
    const { version, ...updateFields } = dto;

    const [updated] = await this.tenantDb
      .update(schema.interventionPolicies)
      .set({
        ...updateFields,
        version: sql`${schema.interventionPolicies.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.interventionPolicies.tenantId, tenantId),
          eq(schema.interventionPolicies.workflowId, workflowId),
          eq(schema.interventionPolicies.id, policyId),
          eq(schema.interventionPolicies.version, version),
        ),
      )
      .returning();

    if (!updated) {
      const existing = await this.tenantDb
        .select({ version: schema.interventionPolicies.version })
        .from(schema.interventionPolicies)
        .where(
          and(
            eq(schema.interventionPolicies.tenantId, tenantId),
            eq(schema.interventionPolicies.workflowId, workflowId),
            eq(schema.interventionPolicies.id, policyId),
          ),
        )
        .limit(1);

      if (!existing[0]) {
        throw new InterventionPolicyNotFoundException(policyId);
      }
      throw new InterventionPolicyVersionConflictException(
        policyId,
        existing[0].version,
      );
    }

    this.logger.log(`Updated intervention policy ${policyId}`);
    return this.toResponseDto(updated);
  }

  async remove(
    tenantId: string,
    workflowId: string,
    policyId: string,
  ): Promise<void> {
    const [deleted] = await this.tenantDb
      .delete(schema.interventionPolicies)
      .where(
        and(
          eq(schema.interventionPolicies.tenantId, tenantId),
          eq(schema.interventionPolicies.workflowId, workflowId),
          eq(schema.interventionPolicies.id, policyId),
        ),
      )
      .returning({ id: schema.interventionPolicies.id });

    if (!deleted) {
      throw new InterventionPolicyNotFoundException(policyId);
    }

    this.logger.log(`Deleted intervention policy ${policyId}`);
  }

  // node-level (active) → workflow-level (active) → SYSTEM_DEFAULT_POLICY
  async resolvePolicy(
    tenantId: string,
    workflowId: string,
    nodeId?: string | null,
  ): Promise<ResolvedPolicyResponseDto> {
    if (nodeId) {
      const [nodePolicy] = await this.tenantDb
        .select()
        .from(schema.interventionPolicies)
        .where(
          and(
            eq(schema.interventionPolicies.tenantId, tenantId),
            eq(schema.interventionPolicies.workflowId, workflowId),
            eq(schema.interventionPolicies.nodeId, nodeId),
            eq(schema.interventionPolicies.isActive, true),
          ),
        )
        .limit(1);

      if (nodePolicy) {
        return this.toResolvedPolicyDto(nodePolicy, 'node');
      }
    }

    const [workflowPolicy] = await this.tenantDb
      .select()
      .from(schema.interventionPolicies)
      .where(
        and(
          eq(schema.interventionPolicies.tenantId, tenantId),
          eq(schema.interventionPolicies.workflowId, workflowId),
          isNull(schema.interventionPolicies.nodeId),
          eq(schema.interventionPolicies.isActive, true),
        ),
      )
      .limit(1);

    if (workflowPolicy) {
      return this.toResolvedPolicyDto(workflowPolicy, 'workflow');
    }

    return {
      ...SYSTEM_DEFAULT_POLICY,
      source: 'system_default',
    };
  }

  private toResolvedPolicyDto(
    policy: typeof schema.interventionPolicies.$inferSelect,
    source: ResolvedPolicyResponseDto['source'],
  ): ResolvedPolicyResponseDto {
    return {
      allowedRoles: [...policy.allowedRoles],
      timeoutSeconds: policy.timeoutSeconds,
      timeoutAction: policy.timeoutAction,
      escalateToRole: policy.escalateToRole,
      notifyChannels: [...policy.notifyChannels],
      source,
    };
  }

  private toResponseDto(
    policy: typeof schema.interventionPolicies.$inferSelect,
  ): InterventionPolicyResponseDto {
    return {
      id: policy.id,
      workflowId: policy.workflowId,
      nodeId: policy.nodeId,
      allowedRoles: policy.allowedRoles,
      timeoutSeconds: policy.timeoutSeconds,
      timeoutAction: policy.timeoutAction,
      escalateToRole: policy.escalateToRole,
      notifyChannels: policy.notifyChannels,
      isActive: policy.isActive,
      version: policy.version,
      createdBy: policy.createdBy,
      createdAt: policy.createdAt.toISOString(),
      updatedAt: policy.updatedAt.toISOString(),
    };
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import {
  CreateInterventionPolicySchema,
  type CreateInterventionPolicyDto,
} from './dto/create-intervention-policy.dto';
import {
  UpdateInterventionPolicySchema,
  type UpdateInterventionPolicyDto,
} from './dto/update-intervention-policy.dto';
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

  async findAll(tenantId: string, workflowId: string, page = 1, pageSize = 20) {
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

  async findById(tenantId: string, policyId: string) {
    const [policy] = await this.tenantDb
      .select()
      .from(schema.interventionPolicies)
      .where(
        and(
          eq(schema.interventionPolicies.tenantId, tenantId),
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
    dto: unknown,
  ): Promise<InterventionPolicyResponseDto> {
    const validated = CreateInterventionPolicySchema.parse(dto);

    try {
      const [created] = await this.tenantDb
        .insert(schema.interventionPolicies)
        .values({
          workflowId: validated.workflowId,
          tenantId,
          nodeId: validated.nodeId ?? null,
          allowedRoles: validated.allowedRoles,
          timeoutSeconds: validated.timeoutSeconds,
          timeoutAction: validated.timeoutAction,
          escalateToRole: validated.escalateToRole ?? null,
          notifyChannels: validated.notifyChannels,
          isActive: validated.isActive,
          createdBy: userId,
        })
        .returning();

      this.logger.log(
        `Created intervention policy ${created.id} for workflow ${validated.workflowId}`,
      );

      return this.toResponseDto(created);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message?.includes('uq_intervention_policies_workflow_node')
      ) {
        throw new InterventionPolicyConflictException(
          validated.workflowId,
          validated.nodeId,
        );
      }
      throw error;
    }
  }

  async update(
    tenantId: string,
    policyId: string,
    dto: unknown,
  ): Promise<InterventionPolicyResponseDto> {
    const validated = UpdateInterventionPolicySchema.parse(dto);
    const { version, ...updateFields } = validated;

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

  async remove(tenantId: string, policyId: string): Promise<void> {
    const [deleted] = await this.tenantDb
      .delete(schema.interventionPolicies)
      .where(
        and(
          eq(schema.interventionPolicies.tenantId, tenantId),
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

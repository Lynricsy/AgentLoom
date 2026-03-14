import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type {
  TriggerConfig,
  WorkflowTrigger,
} from '../../database/schema/workflow-triggers.schema';
import {
  CreateTriggerSchema,
  CronConfigSchema,
  QueryTriggerSchema,
  UpdateTriggerSchema,
  WebhookConfigCreateSchema,
  WebhookConfigSchema,
  type CreateTriggerDto,
  type QueryTriggerDto,
  type UpdateTriggerDto,
} from './trigger-dto.compat';
import {
  MAX_TRIGGERS_PER_WORKFLOW,
  WEBHOOK_SECRET_LENGTH,
  WEBHOOK_TOKEN_LENGTH,
} from './trigger.constants';
import {
  TriggerLimitExceededException,
  TriggerNotFoundException,
  TriggerTypePreviewOnlyException,
  WorkflowNotPublishedException,
} from './trigger.exceptions';

type MarkTriggeredOptions = {
  nextFireAt?: Date | null;
};

@Injectable()
export class TriggerService {
  private readonly logger = new Logger(TriggerService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async findAll(
    tenantId: string,
    workflowId: string,
    query: QueryTriggerDto = {},
  ): Promise<WorkflowTrigger[]> {
    const parsedQuery = QueryTriggerSchema.parse(query);
    const conditions = [
      eq(schema.workflowTriggers.tenantId, tenantId),
      eq(schema.workflowTriggers.workflowDefinitionId, workflowId),
    ];

    if (parsedQuery.type) {
      conditions.push(eq(schema.workflowTriggers.type, parsedQuery.type));
    }

    return this.tenantDb
      .select()
      .from(schema.workflowTriggers)
      .where(and(...conditions))
      .orderBy(desc(schema.workflowTriggers.createdAt));
  }

  async findById(tenantId: string, triggerId: string): Promise<WorkflowTrigger> {
    const trigger = await this.findTrigger(tenantId, triggerId);

    if (!trigger) {
      throw new TriggerNotFoundException(triggerId);
    }

    return trigger;
  }

  async create(
    tenantId: string,
    userId: string,
    workflowId: string,
    dto: CreateTriggerDto,
  ): Promise<WorkflowTrigger> {
    const parsedDto = CreateTriggerSchema.parse(dto);
    this.assertMutableTriggerType(parsedDto.type);
    const workflow = await this.findWorkflowDefinition(tenantId, workflowId);

    if (!workflow || workflow.status !== 'published') {
      throw new WorkflowNotPublishedException(workflowId);
    }

    const [countResult] = await this.tenantDb
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.workflowTriggers)
      .where(
        and(
          eq(schema.workflowTriggers.tenantId, tenantId),
          eq(schema.workflowTriggers.workflowDefinitionId, workflowId),
        ),
      );

    const triggerCount = countResult?.count ?? 0;

    if (triggerCount >= MAX_TRIGGERS_PER_WORKFLOW) {
      throw new TriggerLimitExceededException(
        workflowId,
        MAX_TRIGGERS_PER_WORKFLOW,
      );
    }

    const config = this.buildCreateConfig(parsedDto.type, parsedDto.config);

    const [created] = await this.tenantDb
      .insert(schema.workflowTriggers)
      .values({
        workflowDefinitionId: workflowId,
        tenantId,
        name: parsedDto.name,
        description: this.normalizeOptionalText(parsedDto.description),
        type: parsedDto.type,
        config,
        isEnabled: parsedDto.isEnabled,
        createdBy: userId,
      })
      .returning();

    this.logger.log(
      JSON.stringify({
        action: 'workflow_trigger_created',
        triggerId: created.id,
        workflowId,
        tenantId,
        type: created.type,
      }),
    );

    return created;
  }

  async update(
    tenantId: string,
    triggerId: string,
    dto: UpdateTriggerDto,
  ): Promise<WorkflowTrigger> {
    const parsedDto = UpdateTriggerSchema.parse(dto);
    const currentTrigger = await this.findById(tenantId, triggerId);
    this.assertMutableTriggerType(currentTrigger.type);

    const setClause: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (parsedDto.name !== undefined) {
      setClause.name = parsedDto.name;
    }

    if (parsedDto.description !== undefined) {
      setClause.description = this.normalizeNullableText(parsedDto.description);
    }

    if (parsedDto.isEnabled !== undefined) {
      setClause.isEnabled = parsedDto.isEnabled;
    }

    if (parsedDto.config !== undefined) {
      setClause.config = this.buildUpdatedConfig(currentTrigger, parsedDto.config);
    }

    const [updated] = await this.tenantDb
      .update(schema.workflowTriggers)
      .set(setClause)
      .where(
        and(
          eq(schema.workflowTriggers.id, triggerId),
          eq(schema.workflowTriggers.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      throw new TriggerNotFoundException(triggerId);
    }

    this.logger.log(
      JSON.stringify({
        action: 'workflow_trigger_updated',
        triggerId: updated.id,
        tenantId,
        type: updated.type,
      }),
    );

    return updated;
  }

  async remove(tenantId: string, triggerId: string): Promise<void> {
    const [deleted] = await this.tenantDb
      .delete(schema.workflowTriggers)
      .where(
        and(
          eq(schema.workflowTriggers.id, triggerId),
          eq(schema.workflowTriggers.tenantId, tenantId),
        ),
      )
      .returning({ id: schema.workflowTriggers.id });

    if (!deleted) {
      throw new TriggerNotFoundException(triggerId);
    }

    this.logger.log(
      JSON.stringify({
        action: 'workflow_trigger_deleted',
        triggerId,
        tenantId,
      }),
    );
  }

  async toggle(tenantId: string, triggerId: string): Promise<WorkflowTrigger> {
    const currentTrigger = await this.findById(tenantId, triggerId);
    this.assertMutableTriggerType(currentTrigger.type);

    const [updated] = await this.tenantDb
      .update(schema.workflowTriggers)
      .set({
        isEnabled: !currentTrigger.isEnabled,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.workflowTriggers.id, triggerId),
          eq(schema.workflowTriggers.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      throw new TriggerNotFoundException(triggerId);
    }

    this.logger.log(
      JSON.stringify({
        action: 'workflow_trigger_toggled',
        triggerId,
        tenantId,
        isEnabled: updated.isEnabled,
      }),
    );

    return updated;
  }

  async markTriggered(
    tenantId: string,
    triggerId: string,
    options: MarkTriggeredOptions = {},
  ): Promise<WorkflowTrigger> {
    const setClause: Record<string, unknown> = {
      lastTriggeredAt: new Date(),
      triggerCount: sql`${schema.workflowTriggers.triggerCount} + 1`,
      updatedAt: new Date(),
    };

    if (options.nextFireAt !== undefined) {
      setClause.nextFireAt = options.nextFireAt;
    }

    const [updated] = await this.tenantDb
      .update(schema.workflowTriggers)
      .set(setClause)
      .where(
        and(
          eq(schema.workflowTriggers.id, triggerId),
          eq(schema.workflowTriggers.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      throw new TriggerNotFoundException(triggerId);
    }

    return updated;
  }

  private async findTrigger(tenantId: string, triggerId: string) {
    const [trigger] = await this.tenantDb
      .select()
      .from(schema.workflowTriggers)
      .where(
        and(
          eq(schema.workflowTriggers.id, triggerId),
          eq(schema.workflowTriggers.tenantId, tenantId),
        ),
      );

    return trigger;
  }

  private async findWorkflowDefinition(tenantId: string, workflowId: string) {
    const [workflow] = await this.tenantDb
      .select()
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.id, workflowId),
          eq(schema.workflowDefinitions.tenantId, tenantId),
        ),
      );

    return workflow;
  }

  private buildCreateConfig(
    type: WorkflowTrigger['type'],
    config: unknown,
  ): TriggerConfig {
    switch (type) {
      case 'cron':
        return CronConfigSchema.parse(config);
      case 'webhook': {
        const parsedConfig = WebhookConfigCreateSchema.parse(config);

        return {
          token: randomBytes(WEBHOOK_TOKEN_LENGTH).toString('hex'),
          secret: randomBytes(WEBHOOK_SECRET_LENGTH).toString('hex'),
          ipWhitelist: parsedConfig.ipWhitelist,
        };
      }
      case 'api_event':
        throw new TriggerTypePreviewOnlyException(type);
    }
  }

  private buildUpdatedConfig(
    currentTrigger: WorkflowTrigger,
    nextConfig: unknown,
  ): TriggerConfig {
    switch (currentTrigger.type) {
      case 'cron':
        return CronConfigSchema.parse(nextConfig);
      case 'webhook': {
        const currentWebhookConfig = WebhookConfigSchema.parse(
          currentTrigger.config,
        );
        const parsedConfig = WebhookConfigCreateSchema.parse(nextConfig);

        return {
          token: currentWebhookConfig.token,
          secret: currentWebhookConfig.secret,
          ipWhitelist: parsedConfig.ipWhitelist,
        };
      }
      case 'api_event':
        throw new TriggerTypePreviewOnlyException(currentTrigger.type);
    }
  }

  private assertMutableTriggerType(type: WorkflowTrigger['type']): void {
    if (type === 'api_event') {
      throw new TriggerTypePreviewOnlyException(type);
    }
  }

  private normalizeOptionalText(value?: string): string | null {
    if (value === undefined || value === '') {
      return null;
    }

    return value;
  }

  private normalizeNullableText(value: string | null): string | null {
    if (value === null || value === '') {
      return null;
    }

    return value;
  }
}

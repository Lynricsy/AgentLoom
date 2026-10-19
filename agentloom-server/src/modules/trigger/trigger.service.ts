import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type {
  TriggerConfig,
  WorkflowTrigger,
} from '../../database/schema/workflow-triggers.schema';
import { WorkflowNotFoundException } from '../workflow-definition/workflow-version.exceptions';
import {
  ApiEventConfigSchema,
  CronConfigSchema,
  QueryTriggerSchema,
  WebhookConfigSchema,
  WebhookConfigUpdateSchema,
  type CreateTriggerInput,
  type QueryTriggerDto,
  type UpdateTriggerDto,
} from './dto/trigger.dto';
import {
  MAX_TRIGGERS_PER_WORKFLOW,
  WEBHOOK_SECRET_LENGTH,
  WEBHOOK_TOKEN_LENGTH,
} from './trigger.constants';
import {
  TriggerLimitExceededException,
  TriggerNotFoundException,
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

  async findById(
    tenantId: string,
    triggerId: string,
  ): Promise<WorkflowTrigger> {
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
    dto: CreateTriggerInput,
  ): Promise<WorkflowTrigger> {
    this.assertMutableTriggerType(dto.type);
    const workflow = await this.findWorkflowDefinition(tenantId, workflowId);

    // 不存在与他租户工作流同样返回 404，不以 409 暴露其存在性
    if (!workflow) {
      throw new WorkflowNotFoundException(workflowId);
    }

    if (workflow.status !== 'published') {
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

    const config = this.buildCreateConfig(dto);

    const [created] = await this.tenantDb
      .insert(schema.workflowTriggers)
      .values({
        workflowDefinitionId: workflowId,
        tenantId,
        name: dto.name,
        description: this.normalizeOptionalText(dto.description),
        type: dto.type,
        config,
        isEnabled: dto.isEnabled,
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
    parsedDto: UpdateTriggerDto,
  ): Promise<WorkflowTrigger> {
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
      setClause.config = this.buildUpdatedConfig(
        currentTrigger,
        parsedDto.config,
      );
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

  // config 已由 CreateTriggerSchema 按 type 校验（含 cron/时区），这里只补齐服务端生成的字段
  private buildCreateConfig(dto: CreateTriggerInput): TriggerConfig {
    switch (dto.type) {
      case 'cron':
      case 'api_event':
        return dto.config;
      case 'webhook':
        return {
          authMode: dto.config.authMode,
          token: randomBytes(WEBHOOK_TOKEN_LENGTH).toString('hex'),
          secret: randomBytes(WEBHOOK_SECRET_LENGTH).toString('hex'),
          ipWhitelist: dto.config.ipWhitelist,
        };
    }
  }

  // PATCH 不带 type：config 必须符合触发器已存的类型，不符时按请求体校验失败（422）处理
  private buildUpdatedConfig(
    currentTrigger: WorkflowTrigger,
    nextConfig: unknown,
  ): TriggerConfig {
    switch (currentTrigger.type) {
      case 'cron':
        return this.parseConfigForType(CronConfigSchema, nextConfig);
      case 'webhook': {
        const currentWebhookConfig = WebhookConfigSchema.parse(
          currentTrigger.config,
        );
        const parsedConfig = this.parseConfigForType(
          WebhookConfigUpdateSchema,
          nextConfig,
        );

        // 省略即保留：避免编辑触发器时把 signed 静默降级为 simple、或清空 IP 白名单
        return {
          authMode: parsedConfig.authMode ?? currentWebhookConfig.authMode,
          token: currentWebhookConfig.token,
          secret: currentWebhookConfig.secret,
          ipWhitelist:
            parsedConfig.ipWhitelist ?? currentWebhookConfig.ipWhitelist,
        };
      }
      case 'api_event':
        return this.parseConfigForType(ApiEventConfigSchema, nextConfig);
    }
  }

  private parseConfigForType<T>(schema: z.ZodType<T>, config: unknown): T {
    const result = schema.safeParse(config);

    if (!result.success) {
      // 与 DTO 管道同形：字段路径带 config 前缀，由全局过滤器映射为 422 validation-error
      throw new z.ZodError(
        result.error.issues.map((issue) => ({
          ...issue,
          path: ['config', ...issue.path],
        })),
      );
    }

    return result.data;
  }

  private assertMutableTriggerType(_type: WorkflowTrigger['type']): void {}

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

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { llmModelConfigs } from '../../database/schema/llm-model-configs.schema';
import { llmProviders } from '../../database/schema/llm-providers.schema';
import { organizations } from '../../database/schema/organizations.schema';
import type { CreateLlmModelConfigDto } from './dto/create-llm-model-config.dto';
import type { UpdateLlmModelConfigDto } from './dto/update-llm-model-config.dto';
import type { LlmModelType } from './dto/create-llm-model-config.dto';
import type { ResolvedModelConfig } from './pi-ai-adapter';
import {
  LlmModelConfigConflictException,
  LlmModelConfigNotFoundException,
  LlmModelConfigValidationException,
} from './llm.exceptions';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private get tenantDb() {
    return getTenantDb(this.db);
  }

  private validateModelConfig(params: {
    modelType: LlmModelType;
    embeddingDimensions?: number | null;
  }) {
    if (params.modelType === 'embedding' && !params.embeddingDimensions) {
      throw new LlmModelConfigValidationException(
        'Embedding 模型必须配置向量维度',
      );
    }
  }

  /**
   * 将模型配置与提供商数据合并为 ResolvedModelConfig
   */
  private toResolved(
    config: typeof llmModelConfigs.$inferSelect,
    provider: typeof llmProviders.$inferSelect,
  ): ResolvedModelConfig {
    return { ...config, provider };
  }

  async create(
    dto: CreateLlmModelConfigDto,
    tenantId: string,
    _userId: string,
  ) {
    const orgResult = await this.tenantDb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.tenantId, tenantId))
      .limit(1);

    if (orgResult.length === 0) {
      throw new Error('当前租户无关联组织');
    }

    const orgId = orgResult[0].id;

    const existing = await this.tenantDb
      .select({ id: llmModelConfigs.id })
      .from(llmModelConfigs)
      .where(
        and(
          eq(llmModelConfigs.orgId, orgId),
          eq(llmModelConfigs.name, dto.name),
        ),
      );

    if (existing.length > 0) {
      throw new LlmModelConfigConflictException(dto.name);
    }

    if (dto.isDefault) {
      await this.clearDefaultInOrg(orgId, dto.modelType);
    }

    this.validateModelConfig({
      modelType: dto.modelType,
      embeddingDimensions: dto.embeddingDimensions,
    });

    const [result] = await this.tenantDb
      .insert(llmModelConfigs)
      .values({
        orgId,
        tenantId,
        name: dto.name,
        providerId: dto.providerId,
        modelId: dto.modelId,
        parameters: dto.parameters ?? {},
        isDefault: dto.isDefault ?? false,
        isEnabled: dto.isEnabled ?? true,
        modelType: dto.modelType,
        capabilities: dto.capabilities ?? {},
        contextWindow: dto.contextWindow ?? null,
        maxOutputTokens: dto.maxOutputTokens ?? null,
        pricing: dto.pricing ?? null,
        timeoutMs: dto.timeoutMs ?? null,
        embeddingDimensions:
          dto.modelType === 'embedding'
            ? (dto.embeddingDimensions ?? null)
            : null,
      })
      .returning();

    this.logger.log(`创建 LLM 模型配置: ${result.id} (${result.name})`);
    return result;
  }

  async findAll(tenantId: string): Promise<ResolvedModelConfig[]> {
    const orgResult = await this.tenantDb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.tenantId, tenantId))
      .limit(1);

    if (orgResult.length === 0) {
      return [];
    }

    const rows = await this.tenantDb
      .select({
        config: llmModelConfigs,
        provider: llmProviders,
      })
      .from(llmModelConfigs)
      .innerJoin(llmProviders, eq(llmModelConfigs.providerId, llmProviders.id))
      .where(eq(llmModelConfigs.orgId, orgResult[0].id));

    return rows.map((r) => this.toResolved(r.config, r.provider));
  }

  async findById(id: string, tenantId: string): Promise<ResolvedModelConfig> {
    const rows = await this.tenantDb
      .select({
        config: llmModelConfigs,
        provider: llmProviders,
      })
      .from(llmModelConfigs)
      .innerJoin(llmProviders, eq(llmModelConfigs.providerId, llmProviders.id))
      .where(
        and(eq(llmModelConfigs.id, id), eq(llmModelConfigs.tenantId, tenantId)),
      );

    if (rows.length === 0) {
      throw new LlmModelConfigNotFoundException(id);
    }

    return this.toResolved(rows[0].config, rows[0].provider);
  }

  async findByIds(
    ids: string[],
    tenantId: string,
  ): Promise<ResolvedModelConfig[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.tenantDb
      .select({
        config: llmModelConfigs,
        provider: llmProviders,
      })
      .from(llmModelConfigs)
      .innerJoin(llmProviders, eq(llmModelConfigs.providerId, llmProviders.id))
      .where(
        and(
          inArray(llmModelConfigs.id, ids),
          eq(llmModelConfigs.tenantId, tenantId),
        ),
      );

    return rows.map((r) => this.toResolved(r.config, r.provider));
  }

  async findDefaultByType(
    tenantId: string,
    modelType: LlmModelType,
  ): Promise<ResolvedModelConfig | null> {
    const orgResult = await this.tenantDb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.tenantId, tenantId))
      .limit(1);

    if (orgResult.length === 0) {
      return null;
    }

    const rows = await this.tenantDb
      .select({
        config: llmModelConfigs,
        provider: llmProviders,
      })
      .from(llmModelConfigs)
      .innerJoin(llmProviders, eq(llmModelConfigs.providerId, llmProviders.id))
      .where(
        and(
          eq(llmModelConfigs.orgId, orgResult[0].id),
          eq(llmModelConfigs.modelType, modelType),
          eq(llmModelConfigs.isDefault, true),
        ),
      )
      .limit(1);

    return rows.length > 0
      ? this.toResolved(rows[0].config, rows[0].provider)
      : null;
  }

  async update(id: string, dto: UpdateLlmModelConfigDto, tenantId: string) {
    const existing = await this.findById(id, tenantId);

    const modelType = dto.modelType ?? existing.modelType;
    const embeddingDimensions =
      'embeddingDimensions' in dto
        ? dto.embeddingDimensions
        : existing.embeddingDimensions;

    this.validateModelConfig({
      modelType,
      embeddingDimensions,
    });

    if (dto.name && dto.name !== existing.name) {
      const nameConflict = await this.tenantDb
        .select({ id: llmModelConfigs.id })
        .from(llmModelConfigs)
        .where(
          and(
            eq(llmModelConfigs.orgId, existing.orgId),
            eq(llmModelConfigs.name, dto.name),
          ),
        );

      if (nameConflict.length > 0) {
        throw new LlmModelConfigConflictException(dto.name);
      }
    }

    const nextIsDefault = dto.isDefault ?? existing.isDefault;
    if (nextIsDefault) {
      await this.clearDefaultInOrg(existing.orgId, modelType);
    }

    const updateData: Record<string, unknown> = {
      ...dto,
      updatedAt: new Date(),
    };

    if ('modelType' in dto || 'embeddingDimensions' in dto) {
      updateData.modelType = modelType;
      updateData.embeddingDimensions =
        modelType === 'embedding' ? (embeddingDimensions ?? null) : null;
    }

    const [result] = await this.tenantDb
      .update(llmModelConfigs)
      .set(updateData)
      .where(
        and(eq(llmModelConfigs.id, id), eq(llmModelConfigs.tenantId, tenantId)),
      )
      .returning();

    this.logger.log(`更新 LLM 模型配置: ${id}`);
    return result;
  }

  async delete(id: string, tenantId: string) {
    await this.findById(id, tenantId);

    await this.tenantDb
      .delete(llmModelConfigs)
      .where(
        and(eq(llmModelConfigs.id, id), eq(llmModelConfigs.tenantId, tenantId)),
      );

    this.logger.log(`删除 LLM 模型配置: ${id}`);
  }

  private async clearDefaultInOrg(orgId: string, modelType: LlmModelType) {
    await this.tenantDb
      .update(llmModelConfigs)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(llmModelConfigs.orgId, orgId),
          eq(llmModelConfigs.modelType, modelType),
          eq(llmModelConfigs.isDefault, true),
        ),
      );
  }
}

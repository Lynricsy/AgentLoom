import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { llmModelConfigs } from '../../database/schema/llm-model-configs.schema';
import { organizations } from '../../database/schema/organizations.schema';
import type { CreateLlmModelConfigDto } from './dto/create-llm-model-config.dto';
import type { UpdateLlmModelConfigDto } from './dto/update-llm-model-config.dto';
import type { LlmModelType } from './dto/create-llm-model-config.dto';
import {
  LlmModelConfigConflictException,
  LlmModelConfigNotFoundException,
  LlmModelConfigValidationException,
} from './llm.exceptions';

const EMBEDDING_MODEL_PROVIDERS = new Set(['openai', 'private_cloud']);

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private get tenantDb() {
    return getTenantDb(this.db);
  }

  private validateModelConfig(params: {
    provider: string;
    modelType: LlmModelType;
    endpointUrl?: string | null;
    authMethod?: string | null;
    apiKeyId?: string | null;
    embeddingDimensions?: number | null;
  }) {
    if (params.provider !== 'private_cloud') {
      if (params.modelType === 'embedding') {
        if (!EMBEDDING_MODEL_PROVIDERS.has(params.provider)) {
          throw new LlmModelConfigValidationException(
            'Embedding 模型仅支持 OpenAI 或 OpenAI 兼容私有云端点',
          );
        }
        if (!params.embeddingDimensions) {
          throw new LlmModelConfigValidationException(
            'Embedding 模型必须配置向量维度',
          );
        }
      }
      return;
    }

    if (!params.endpointUrl) {
      throw new LlmModelConfigValidationException('私有云部署必须提供端点 URL');
    }

    if (!params.authMethod) {
      throw new LlmModelConfigValidationException('私有云部署必须指定认证方式');
    }

    if (params.authMethod === 'api_key' && !params.apiKeyId) {
      throw new LlmModelConfigValidationException(
        '私有云 API Key 认证必须选择 API Key',
      );
    }

    if (params.modelType === 'embedding' && !params.embeddingDimensions) {
      throw new LlmModelConfigValidationException(
        'Embedding 模型必须配置向量维度',
      );
    }
  }

  private buildPrivateCloudFields(params: {
    provider: string;
    endpointUrl?: string | null;
    authMethod?: string | null;
    authConfig?: Record<string, unknown> | null;
    timeoutMs?: number | null;
    apiKeyId?: string | null;
  }) {
    if (params.provider !== 'private_cloud') {
      return {
        endpointUrl: null,
        authMethod: null,
        authConfig: null,
        timeoutMs: null,
      };
    }

    return {
      endpointUrl: params.endpointUrl ?? null,
      authMethod: params.authMethod ?? null,
      authConfig:
        params.authMethod === 'mtls' ? (params.authConfig ?? null) : null,
      timeoutMs: params.timeoutMs ?? null,
      apiKeyId:
        params.authMethod === 'api_key' ? (params.apiKeyId ?? null) : null,
    };
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
      provider: dto.provider,
      modelType: dto.modelType,
      endpointUrl: dto.endpointUrl,
      authMethod: dto.authMethod,
      apiKeyId: dto.apiKeyId,
      embeddingDimensions: dto.embeddingDimensions,
    });

    const privateCloudFields = this.buildPrivateCloudFields({
      provider: dto.provider,
      endpointUrl: dto.endpointUrl,
      authMethod: dto.authMethod,
      authConfig: dto.authConfig,
      timeoutMs: dto.timeoutMs,
      apiKeyId: dto.apiKeyId,
    });

    const [result] = await this.tenantDb
      .insert(llmModelConfigs)
      .values({
        orgId,
        tenantId,
        name: dto.name,
        provider: dto.provider,
        modelName: dto.modelName,
        parameters: dto.parameters ?? {},
        apiKeyId: privateCloudFields.apiKeyId ?? dto.apiKeyId,
        isDefault: dto.isDefault ?? false,
        endpointUrl: privateCloudFields.endpointUrl,
        authMethod: privateCloudFields.authMethod,
        authConfig: privateCloudFields.authConfig,
        timeoutMs: privateCloudFields.timeoutMs,
        modelType: dto.modelType,
        embeddingDimensions:
          dto.modelType === 'embedding'
            ? (dto.embeddingDimensions ?? null)
            : null,
      })
      .returning();

    this.logger.log(`创建 LLM 模型配置: ${result.id} (${result.name})`);
    return result;
  }

  async findAll(tenantId: string) {
    const orgResult = await this.tenantDb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.tenantId, tenantId))
      .limit(1);

    if (orgResult.length === 0) {
      return [];
    }

    return this.tenantDb
      .select()
      .from(llmModelConfigs)
      .where(eq(llmModelConfigs.orgId, orgResult[0].id));
  }

  async findById(id: string, tenantId: string) {
    const results = await this.tenantDb
      .select()
      .from(llmModelConfigs)
      .where(
        and(eq(llmModelConfigs.id, id), eq(llmModelConfigs.tenantId, tenantId)),
      );

    if (results.length === 0) {
      throw new LlmModelConfigNotFoundException(id);
    }

    return results[0];
  }

  async findByIds(ids: string[], tenantId: string) {
    if (ids.length === 0) {
      return [];
    }

    return this.tenantDb
      .select()
      .from(llmModelConfigs)
      .where(
        and(
          inArray(llmModelConfigs.id, ids),
          eq(llmModelConfigs.tenantId, tenantId),
        ),
      );
  }

  async findDefaultByType(tenantId: string, modelType: LlmModelType) {
    const orgResult = await this.tenantDb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.tenantId, tenantId))
      .limit(1);

    if (orgResult.length === 0) {
      return null;
    }

    const results = await this.tenantDb
      .select()
      .from(llmModelConfigs)
      .where(
        and(
          eq(llmModelConfigs.orgId, orgResult[0].id),
          eq(llmModelConfigs.modelType, modelType),
          eq(llmModelConfigs.isDefault, true),
        ),
      )
      .limit(1);

    return results[0] ?? null;
  }

  async update(id: string, dto: UpdateLlmModelConfigDto, tenantId: string) {
    const existing = await this.findById(id, tenantId);

    const provider = dto.provider ?? existing.provider;
    const modelType = dto.modelType ?? existing.modelType;
    const endpointUrl =
      'endpointUrl' in dto ? dto.endpointUrl : existing.endpointUrl;
    const authMethod =
      'authMethod' in dto ? dto.authMethod : existing.authMethod;
    const apiKeyId = 'apiKeyId' in dto ? dto.apiKeyId : existing.apiKeyId;
    const authConfig: Record<string, unknown> | null =
      'authConfig' in dto
        ? dto.authConfig && typeof dto.authConfig === 'object'
          ? dto.authConfig
          : null
        : existing.authConfig && typeof existing.authConfig === 'object'
          ? (existing.authConfig as Record<string, unknown>)
          : null;
    const timeoutMs = 'timeoutMs' in dto ? dto.timeoutMs : existing.timeoutMs;
    const embeddingDimensions =
      'embeddingDimensions' in dto
        ? dto.embeddingDimensions
        : existing.embeddingDimensions;

    this.validateModelConfig({
      provider,
      modelType,
      endpointUrl,
      authMethod,
      apiKeyId,
      embeddingDimensions,
    });

    const privateCloudFields = this.buildPrivateCloudFields({
      provider,
      endpointUrl,
      authMethod,
      authConfig,
      timeoutMs,
      apiKeyId,
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
    const touchesPrivateCloudFields =
      'provider' in dto ||
      'endpointUrl' in dto ||
      'authMethod' in dto ||
      'authConfig' in dto ||
      'timeoutMs' in dto ||
      'apiKeyId' in dto;

    if (touchesPrivateCloudFields && provider !== 'private_cloud') {
      updateData.endpointUrl = null;
      updateData.authMethod = null;
      updateData.authConfig = null;
      updateData.timeoutMs = null;
      updateData.apiKeyId = null;
    }
    if ('endpointUrl' in dto || provider === 'private_cloud') {
      updateData.endpointUrl = privateCloudFields.endpointUrl;
    }
    if ('authMethod' in dto || provider === 'private_cloud') {
      updateData.authMethod = privateCloudFields.authMethod;
    }
    if ('authConfig' in dto || provider === 'private_cloud') {
      updateData.authConfig = privateCloudFields.authConfig;
    }
    if ('timeoutMs' in dto || provider === 'private_cloud') {
      updateData.timeoutMs = privateCloudFields.timeoutMs;
    }
    if ('apiKeyId' in dto || provider === 'private_cloud') {
      updateData.apiKeyId = privateCloudFields.apiKeyId ?? dto.apiKeyId ?? null;
    }
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

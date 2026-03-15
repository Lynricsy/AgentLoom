import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { llmModelConfigs } from '../../database/schema/llm-model-configs.schema';
import { organizations } from '../../database/schema/organizations.schema';
import type { CreateLlmModelConfigDto } from './dto/create-llm-model-config.dto';
import type { UpdateLlmModelConfigDto } from './dto/update-llm-model-config.dto';
import {
  LlmModelConfigConflictException,
  LlmModelConfigNotFoundException,
} from './llm.exceptions';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private get tenantDb() {
    return getTenantDb(this.db);
  }

  async create(dto: CreateLlmModelConfigDto, tenantId: string, userId: string) {
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
      await this.clearDefaultInOrg(orgId);
    }

    const [result] = await this.tenantDb
      .insert(llmModelConfigs)
      .values({
        orgId,
        tenantId,
        name: dto.name,
        provider: dto.provider,
        modelName: dto.modelName,
        parameters: dto.parameters ?? {},
        apiKeyId: dto.apiKeyId,
        isDefault: dto.isDefault ?? false,
        endpointUrl: dto.endpointUrl ?? null,
        authMethod: dto.authMethod ?? null,
        authConfig: dto.authConfig ?? null,
        timeoutMs: dto.timeoutMs ?? null,
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

  async update(id: string, dto: UpdateLlmModelConfigDto, tenantId: string) {
    const existing = await this.findById(id, tenantId);

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

    if (dto.isDefault === true) {
      await this.clearDefaultInOrg(existing.orgId);
    }

    const updateData: Record<string, unknown> = {
      ...dto,
      updatedAt: new Date(),
    };
    if ('endpointUrl' in dto) updateData.endpointUrl = dto.endpointUrl ?? null;
    if ('authMethod' in dto) updateData.authMethod = dto.authMethod ?? null;
    if ('authConfig' in dto) updateData.authConfig = dto.authConfig ?? null;
    if ('timeoutMs' in dto) updateData.timeoutMs = dto.timeoutMs ?? null;

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

  private async clearDefaultInOrg(orgId: string) {
    await this.tenantDb
      .update(llmModelConfigs)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(llmModelConfigs.orgId, orgId),
          eq(llmModelConfigs.isDefault, true),
        ),
      );
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  llmProviders,
  type LlmProvider,
} from '../../database/schema/llm-providers.schema';
import { organizations } from '../../database/schema/organizations.schema';
import type { CreateLlmProviderDto } from './dto/create-llm-provider.dto';
import type { UpdateLlmProviderDto } from './dto/update-llm-provider.dto';
import {
  LlmProviderDeletionForbiddenException,
  LlmProviderNotFoundException,
  LlmProviderSlugConflictException,
} from './llm.exceptions';

/** 系统级 sentinel 组织 ID，用于存储内置提供商种子数据 */
const SENTINEL_ORG_ID = '00000000-0000-0000-0000-000000000000';
const LEGACY_LOBEHUB_ICON_BASE = 'https://icons.lobehub.com/icons/';
const STATIC_LOBEHUB_SVG_ICON_BASE =
  'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/';
const STATIC_LOBEHUB_PNG_ICON_BASE =
  'https://unpkg.com/@lobehub/icons-static-png@latest/';

@Injectable()
export class LlmProviderService {
  private readonly logger = new Logger(LlmProviderService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  /**
   * 列出组织下所有提供商，按 sortOrder / name 排序。
   * 每次读取前都会补齐缺失的内置 provider，并为旧迁移出来的 builtin 行回填缺失元数据。
   */
  async findAll(tenantId: string): Promise<LlmProvider[]> {
    const orgId = await this.resolveOrgId(tenantId);
    await this.syncBuiltinProviders(orgId, tenantId);

    return this.tenantDb
      .select()
      .from(llmProviders)
      .where(eq(llmProviders.orgId, orgId))
      .orderBy(asc(llmProviders.sortOrder), asc(llmProviders.name));
  }

  /**
   * 根据 ID 获取单个提供商
   */
  async findById(id: string, tenantId: string): Promise<LlmProvider> {
    const orgId = await this.resolveOrgId(tenantId);

    const rows = await this.tenantDb
      .select()
      .from(llmProviders)
      .where(and(eq(llmProviders.id, id), eq(llmProviders.orgId, orgId)));

    if (rows.length === 0) {
      throw new LlmProviderNotFoundException(id);
    }

    return rows[0];
  }

  /**
   * 创建自定义提供商（isBuiltin 始终为 false）
   */
  async create(
    dto: CreateLlmProviderDto,
    tenantId: string,
  ): Promise<LlmProvider> {
    const orgId = await this.resolveOrgId(tenantId);

    // 若未提供 slug，从 name 自动生成
    const slug =
      dto.slug ??
      dto.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    // 检查 slug 在组织内的唯一性
    const conflict = await this.tenantDb
      .select({ id: llmProviders.id })
      .from(llmProviders)
      .where(and(eq(llmProviders.orgId, orgId), eq(llmProviders.slug, slug)));

    if (conflict.length > 0) {
      throw new LlmProviderSlugConflictException(slug);
    }

    const [result] = await this.tenantDb
      .insert(llmProviders)
      .values({
        orgId,
        tenantId,
        slug,
        name: dto.name,
        baseUrl: dto.baseUrl,
        defaultBaseUrl: dto.baseUrl,
        isBuiltin: false,
        isEnabled: dto.isEnabled ?? true,
        apiProtocol: dto.apiProtocol ?? 'openai_chat',
        apiKeyId: dto.apiKeyId ?? null,
        iconUrl: dto.iconUrl ?? null,
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();

    this.logger.log(
      `创建自定义 LLM 提供商: ${result.id} (${result.name}, slug=${result.slug})`,
    );
    return result;
  }

  /**
   * 更新提供商（baseUrl、apiKeyId、isEnabled、name 等）
   */
  async update(
    id: string,
    dto: UpdateLlmProviderDto,
    tenantId: string,
  ): Promise<LlmProvider> {
    // 先确认存在
    await this.findById(id, tenantId);

    const orgId = await this.resolveOrgId(tenantId);

    // 若更新 slug，检查唯一性
    if (dto.slug !== undefined) {
      const conflict = await this.tenantDb
        .select({ id: llmProviders.id })
        .from(llmProviders)
        .where(
          and(eq(llmProviders.orgId, orgId), eq(llmProviders.slug, dto.slug)),
        );

      if (conflict.length > 0 && conflict[0].id !== id) {
        throw new LlmProviderSlugConflictException(dto.slug);
      }
    }

    // 从 DTO 中提取非 undefined 的字段构建更新数据
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if ('baseUrl' in dto) updateData.baseUrl = dto.baseUrl;
    if (dto.apiProtocol !== undefined) updateData.apiProtocol = dto.apiProtocol;
    if ('apiKeyId' in dto) updateData.apiKeyId = dto.apiKeyId;
    if (dto.iconUrl !== undefined) updateData.iconUrl = dto.iconUrl;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;
    if (dto.isEnabled !== undefined) updateData.isEnabled = dto.isEnabled;

    const [result] = await this.tenantDb
      .update(llmProviders)
      .set(updateData)
      .where(and(eq(llmProviders.id, id), eq(llmProviders.orgId, orgId)))
      .returning();

    this.logger.log(`更新 LLM 提供商: ${id}`);
    return result;
  }

  /**
   * 删除自定义提供商。内置提供商不可删除，抛出 LlmProviderDeletionForbiddenException。
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const existing = await this.findById(id, tenantId);

    if (existing.isBuiltin) {
      throw new LlmProviderDeletionForbiddenException(existing.slug);
    }

    const orgId = await this.resolveOrgId(tenantId);

    await this.tenantDb
      .delete(llmProviders)
      .where(and(eq(llmProviders.id, id), eq(llmProviders.orgId, orgId)));

    this.logger.log(`删除自定义 LLM 提供商: ${id} (slug=${existing.slug})`);
  }

  /**
   * 重置提供商 baseUrl 为 defaultBaseUrl（仅限内置提供商）。
   * 将 baseUrl 设为 null，运行时回退到 defaultBaseUrl。
   */
  async resetBaseUrl(id: string, tenantId: string): Promise<LlmProvider> {
    const existing = await this.findById(id, tenantId);

    const orgId = await this.resolveOrgId(tenantId);

    const [result] = await this.tenantDb
      .update(llmProviders)
      .set({ baseUrl: null, updatedAt: new Date() })
      .where(and(eq(llmProviders.id, id), eq(llmProviders.orgId, orgId)))
      .returning();

    this.logger.log(`重置 LLM 提供商 baseUrl: ${id} (slug=${existing.slug})`);
    return result;
  }

  /**
   * 从 sentinel 组织复制内置提供商到目标组织。
   * 若目标组织已存在部分 builtin，则补齐缺失项，并为旧迁移产生的 builtin 行回填 icon/defaultBaseUrl 等缺失元数据。
   */
  async syncBuiltinProviders(orgId: string, tenantId: string): Promise<void> {
    const sentinelProviders = await this.db
      .select()
      .from(llmProviders)
      .where(
        and(
          eq(llmProviders.orgId, SENTINEL_ORG_ID),
          eq(llmProviders.isBuiltin, true),
        ),
      );

    if (sentinelProviders.length === 0) {
      this.logger.warn('Sentinel 组织无内置提供商数据，跳过同步');
      return;
    }

    const existingProviders = await this.tenantDb
      .select()
      .from(llmProviders)
      .where(eq(llmProviders.orgId, orgId));

    const existingBySlug = new Map(
      existingProviders.map((provider) => [provider.slug, provider] as const),
    );

    let insertedCount = 0;
    let backfilledCount = 0;

    for (const provider of sentinelProviders) {
      const existing = existingBySlug.get(provider.slug);

      if (!existing) {
        await this.tenantDb.insert(llmProviders).values({
          orgId,
          tenantId,
          slug: provider.slug,
          name: provider.name,
          iconUrl: provider.iconUrl,
          baseUrl: provider.baseUrl,
          defaultBaseUrl: provider.defaultBaseUrl,
          isBuiltin: true,
          isEnabled: true,
          apiProtocol: provider.apiProtocol,
          sortOrder: provider.sortOrder,
        });
        insertedCount += 1;
        continue;
      }

      // 自定义 provider 占用了内置 slug 时不强行覆盖，避免抹掉用户配置。
      if (!existing.isBuiltin) {
        continue;
      }

      const patch = this.buildBuiltinMetadataPatch(existing, provider);
      if (!patch) {
        continue;
      }

      await this.tenantDb
        .update(llmProviders)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(
          and(eq(llmProviders.id, existing.id), eq(llmProviders.orgId, orgId)),
        );
      backfilledCount += 1;
    }

    if (insertedCount > 0 || backfilledCount > 0) {
      this.logger.log(
        `已同步内置提供商到组织 ${orgId}: 新增 ${insertedCount} 个，回填 ${backfilledCount} 个`,
      );
    }
  }

  private buildBuiltinMetadataPatch(
    existing: LlmProvider,
    builtin: LlmProvider,
  ): Partial<LlmProvider> | null {
    const patch: Partial<LlmProvider> = {};

    if (
      builtin.iconUrl &&
      (!existing.iconUrl ||
        existing.iconUrl.startsWith(LEGACY_LOBEHUB_ICON_BASE) ||
        ((existing.iconUrl.startsWith(STATIC_LOBEHUB_SVG_ICON_BASE) ||
          existing.iconUrl.startsWith(STATIC_LOBEHUB_PNG_ICON_BASE)) &&
          existing.iconUrl !== builtin.iconUrl))
    ) {
      patch.iconUrl = builtin.iconUrl;
    }

    if (!existing.defaultBaseUrl && builtin.defaultBaseUrl) {
      patch.defaultBaseUrl = builtin.defaultBaseUrl;
    }

    // 旧迁移出来的 builtin 行可能同时缺少 base/default base URL，这里只在双缺失时补齐。
    if (!existing.baseUrl && !existing.defaultBaseUrl && builtin.baseUrl) {
      patch.baseUrl = builtin.baseUrl;
    }

    return Object.keys(patch).length > 0 ? patch : null;
  }

  /**
   * 从 tenantId 解析对应的 orgId
   */
  private async resolveOrgId(tenantId: string): Promise<string> {
    const orgResult = await this.tenantDb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.tenantId, tenantId))
      .limit(1);

    if (orgResult.length === 0) {
      throw new Error('当前租户无关联组织');
    }

    return orgResult[0].id;
  }
}

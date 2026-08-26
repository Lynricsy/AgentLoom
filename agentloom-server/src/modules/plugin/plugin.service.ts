import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PluginManifestSchema,
  validateManifest as validatePluginManifest,
  type PluginPermission,
} from '@agentloom/plugin-sdk';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { PluginRecord } from '../../database/schema/plugins.schema';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { normalizeFixedScaleDecimal } from './fixed-scale-decimal';
import {
  QueryPluginsSchema,
  type PluginStatusDto,
  type QueryPluginsDtoType,
} from './dto/plugin.dto';
import {
  PluginAlreadyExistsException,
  PluginInactiveException,
  PluginNotFoundException,
  PluginValidationException,
  PluginVersionConflictException,
} from './plugin.exceptions';

const PluginNodeDefinitionSchema = z.record(z.string(), z.unknown());

const PluginNodeDefinitionsSchema = z.array(PluginNodeDefinitionSchema);

type ParsedPluginManifest = {
  raw: Record<string, unknown>;
  pluginId: string;
  name: string;
  version: string;
  author: string;
  description: string;
  license: string;
  permissions: PluginPermission[];
  metadata: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type PluginListResult = {
  data: PluginRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type MarketplaceCloneMetadata = {
  cloned_from_marketplace: {
    listingId: string;
    listingTitle: string;
    sourceTenantId: string;
    sourceOrgId: string;
    sourcePluginDbId: string;
    sourcePluginId: string;
    clonedAt: string;
    /** 最近一次升级时间;从未升级为 null */
    upgradedAt: string | null;
    /** 安装时的价格快照；旧数据缺失时为 null，回退查询当前 listing */
    pricingModel: schema.MarketplaceListing['pricingModel'] | null;
    pricePerExecution: string | null;
    sourceVersion: string | null;
    sourceContentHash: string | null;
  };
};

type PluginMarketplaceInstallSource = {
  listingId: string;
  listingTitle: string;
  pricingModel: schema.MarketplaceListing['pricingModel'];
  pricePerExecution: string | null;
  plugin: PluginRecord;
};

export interface PluginUsageSourceContext {
  sourceTenantId: string;
  sourceOrgId: string;
  sourcePluginDbId: string;
  sourcePluginId: string;
  sourceListingId: string | null;
  pricingModel: schema.MarketplaceListing['pricingModel'];
  billingAmount: string | null;
  currency: 'USD';
}

@Injectable()
export class PluginService {
  private readonly logger = new Logger(PluginService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly storageService: StorageService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async register(
    tenantId: string,
    orgId: string | undefined,
    userId: string,
    manifestData: Record<string, unknown>,
    nodeDefinitions: Array<Record<string, unknown>>,
    storageKey?: string,
    options?: {
      signature?: string;
      contentHash?: string;
      wasmBundleUrl?: string;
    },
  ): Promise<PluginRecord> {
    const resolvedOrgId =
      orgId ?? (await this.findOrganizationIdOrThrow(tenantId));
    const manifest = this.parseManifest(manifestData);
    const parsedNodeDefinitions = this.parseNodeDefinitions(nodeDefinitions);

    const existing = await this.findByPluginId(
      manifest.pluginId,
      resolvedOrgId,
      tenantId,
    );

    if (existing) {
      throw new PluginAlreadyExistsException(manifest.pluginId);
    }

    const [created] = await this.tenantDb
      .insert(schema.plugins)
      .values({
        tenantId,
        orgId: resolvedOrgId,
        pluginId: manifest.pluginId,
        name: manifest.name,
        version: manifest.version,
        author: manifest.author,
        description: this.normalizeNullableText(manifest.description),
        license: this.normalizeNullableText(manifest.license),
        status: 'registered',
        manifest: manifest.raw,
        nodeDefinitions: parsedNodeDefinitions,
        storageKey: this.normalizeNullableText(storageKey),
        permissions: manifest.permissions,
        installedBy: userId,
        metadata: manifest.metadata,
        signature: this.normalizeNullableText(options?.signature),
        contentHash: this.normalizeNullableText(options?.contentHash),
        wasmBundleUrl: this.normalizeNullableText(options?.wasmBundleUrl),
      })
      .returning();

    this.logger.log(
      JSON.stringify({
        action: 'plugin_registered',
        pluginId: created.pluginId,
        recordId: created.id,
        tenantId,
        userId,
      }),
    );

    return created;
  }

  async findAll(
    tenantId: string,
    query: QueryPluginsDtoType,
  ): Promise<PluginListResult> {
    const parsedQuery = QueryPluginsSchema.parse(query);
    const page = parsedQuery.page;
    const pageSize = parsedQuery.pageSize;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(schema.plugins.tenantId, tenantId)];

    if (parsedQuery.status) {
      conditions.push(eq(schema.plugins.status, parsedQuery.status));
    }

    if (parsedQuery.search) {
      const search = `%${parsedQuery.search}%`;
      conditions.push(
        or(
          ilike(schema.plugins.name, search),
          ilike(schema.plugins.pluginId, search),
          ilike(schema.plugins.author, search),
        )!,
      );
    }

    const whereClause = and(...conditions);

    const [data, countResult] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.plugins)
        .where(whereClause)
        .orderBy(desc(schema.plugins.updatedAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.plugins)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async findById(id: string, tenantId: string): Promise<PluginRecord> {
    const plugin = await this.findPlugin(tenantId, id);

    if (!plugin) {
      throw new PluginNotFoundException(id);
    }

    return plugin;
  }

  async findByPluginId(
    pluginId: string,
    orgId: string | undefined,
    tenantId: string,
  ): Promise<PluginRecord | null> {
    const resolvedOrgId =
      orgId ?? (await this.findOrganizationIdOrThrow(tenantId));

    const [plugin] = await this.tenantDb
      .select()
      .from(schema.plugins)
      .where(
        and(
          eq(schema.plugins.pluginId, pluginId),
          eq(schema.plugins.orgId, resolvedOrgId),
          eq(schema.plugins.tenantId, tenantId),
        ),
      )
      .limit(1);

    return plugin ?? null;
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: PluginStatusDto,
    occVersion: number,
  ): Promise<PluginRecord> {
    const [updated] = await this.tenantDb
      .update(schema.plugins)
      .set({
        status,
        occVersion: sql`${schema.plugins.occVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.plugins.id, id),
          eq(schema.plugins.tenantId, tenantId),
          eq(schema.plugins.occVersion, occVersion),
        ),
      )
      .returning();

    if (!updated) {
      const currentPlugin = await this.findPlugin(tenantId, id);

      if (!currentPlugin) {
        throw new PluginNotFoundException(id);
      }

      throw new PluginVersionConflictException(id, currentPlugin.occVersion);
    }

    this.logger.log(
      JSON.stringify({
        action: 'plugin_status_updated',
        pluginId: updated.pluginId,
        recordId: updated.id,
        tenantId,
        status: updated.status,
        occVersion: updated.occVersion,
      }),
    );

    return updated;
  }

  async updateRegistrationArtifacts(
    id: string,
    tenantId: string,
    occVersion: number,
    manifestData: Record<string, unknown>,
    nodeDefinitions: Array<Record<string, unknown>>,
    storageKey: string,
    options?: {
      signature?: string;
      contentHash?: string;
      wasmBundleUrl?: string;
    },
  ): Promise<PluginRecord> {
    const manifest = this.parseManifest(manifestData);
    const parsedNodeDefinitions = this.parseNodeDefinitions(nodeDefinitions);

    const [updated] = await this.tenantDb
      .update(schema.plugins)
      .set({
        name: manifest.name,
        version: manifest.version,
        author: manifest.author,
        description: this.normalizeNullableText(manifest.description),
        license: this.normalizeNullableText(manifest.license),
        manifest: manifest.raw,
        nodeDefinitions: parsedNodeDefinitions,
        storageKey: this.normalizeNullableText(storageKey),
        permissions: manifest.permissions,
        metadata: manifest.metadata,
        signature: this.normalizeNullableText(options?.signature),
        contentHash: this.normalizeNullableText(options?.contentHash),
        wasmBundleUrl: this.normalizeNullableText(options?.wasmBundleUrl),
        occVersion: sql`${schema.plugins.occVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.plugins.id, id),
          eq(schema.plugins.tenantId, tenantId),
          eq(schema.plugins.occVersion, occVersion),
        ),
      )
      .returning();

    if (!updated) {
      const currentPlugin = await this.findPlugin(tenantId, id);

      if (!currentPlugin) {
        throw new PluginNotFoundException(id);
      }

      throw new PluginVersionConflictException(id, currentPlugin.occVersion);
    }

    this.logger.log(
      JSON.stringify({
        action: 'plugin_registration_artifacts_updated',
        pluginId: updated.pluginId,
        recordId: updated.id,
        tenantId,
        occVersion: updated.occVersion,
      }),
    );

    return updated;
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const plugin = await this.findPlugin(tenantId, id);

    if (!plugin) {
      throw new PluginNotFoundException(id);
    }

    const [deleted] = await this.tenantDb
      .delete(schema.plugins)
      .where(
        and(eq(schema.plugins.id, id), eq(schema.plugins.tenantId, tenantId)),
      )
      .returning({ id: schema.plugins.id });

    if (!deleted) {
      throw new PluginNotFoundException(id);
    }

    await this.deleteOwnedStorageObjects(tenantId, [
      plugin.storageKey,
      plugin.wasmBundleUrl,
    ]);

    this.logger.log(
      JSON.stringify({
        action: 'plugin_deleted',
        recordId: id,
        tenantId,
      }),
    );
  }

  /**
   * best-effort 清理本租户拥有的对象。
   *
   * 历史 clone 的 key 可能仍指向源租户前缀，跨租户删除会毁掉源插件产物，
   * 因此只删 `tenants/<tenantId>/` 前缀下的对象。
   */
  private async deleteOwnedStorageObjects(
    tenantId: string,
    keys: Array<string | null>,
  ): Promise<void> {
    const ownedPrefix = `tenants/${tenantId}/`;

    for (const key of keys) {
      if (!key || !key.startsWith(ownedPrefix)) {
        continue;
      }

      try {
        await this.storageService.delete(key);
      } catch (error) {
        this.logger.warn(
          `插件对象清理失败: ${key} (${
            error instanceof Error ? error.message : String(error)
          })`,
        );
      }
    }
  }

  async findActiveByPluginId(
    pluginId: string,
    orgId: string | undefined,
    tenantId: string,
  ): Promise<PluginRecord> {
    const plugin = await this.findByPluginId(pluginId, orgId, tenantId);

    if (!plugin) {
      throw new PluginNotFoundException(pluginId);
    }

    if (plugin.status !== 'active') {
      throw new PluginInactiveException(plugin.id);
    }

    return plugin;
  }

  /**
   * Smart Routing 用的插件解析。
   *
   * 路由执行可能不在租户事务上下文中，因此用 raw db 并显式按 tenantId 过滤，
   * 而不是依赖 RLS 的 tenantDb。
   */
  async findActiveWasmPluginForRouting(
    tenantId: string,
    pluginId: string,
  ): Promise<PluginRecord> {
    // status 直接进 SQL：同租户可能有多个组织注册同名 pluginId，
    // 只取首行再判状态会被 inactive 副本挡住可用插件。
    const [plugin] = await this.db
      .select()
      .from(schema.plugins)
      .where(
        and(
          eq(schema.plugins.tenantId, tenantId),
          eq(schema.plugins.pluginId, pluginId),
          eq(schema.plugins.status, 'active'),
        ),
      )
      .limit(1);

    if (!plugin) {
      const [inactivePlugin] = await this.db
        .select({ id: schema.plugins.id })
        .from(schema.plugins)
        .where(
          and(
            eq(schema.plugins.tenantId, tenantId),
            eq(schema.plugins.pluginId, pluginId),
          ),
        )
        .limit(1);

      if (inactivePlugin) {
        throw new PluginInactiveException(inactivePlugin.id);
      }

      throw new PluginNotFoundException(pluginId);
    }

    if (!plugin.wasmBundleUrl) {
      throw new PluginValidationException(
        `插件 ${pluginId} 缺少 WASM 产物，无法用于智能路由`,
      );
    }

    return plugin;
  }

  async resolveOrganizationId(tenantId: string): Promise<string> {
    return this.findOrganizationIdOrThrow(tenantId);
  }

  async cloneMarketplacePlugin(params: {
    tenantId: string;
    userId: string;
    source: PluginMarketplaceInstallSource;
    name?: string;
    description?: string;
  }): Promise<PluginRecord> {
    const { tenantId, userId, source, name, description } = params;
    const targetOrgId = await this.findOrganizationIdOrThrow(tenantId);

    const existing = await this.findByPluginId(
      source.plugin.pluginId,
      targetOrgId,
      tenantId,
    );

    if (existing) {
      throw new PluginAlreadyExistsException(source.plugin.pluginId);
    }

    const sourceWasmKey = this.normalizeNullableText(
      source.plugin.wasmBundleUrl,
    );

    if (!sourceWasmKey) {
      throw new PluginValidationException(
        '源插件缺少可执行 WASM 产物，无法安装',
      );
    }

    // copy-on-install：安装方持有自己租户前缀下的产物副本，
    // 源插件被删除或源租户清理对象后已安装实例仍可执行。
    const sourceArchiveKey = this.normalizeNullableText(
      source.plugin.storageKey,
    );
    const targetPrefix = `tenants/${tenantId}/plugins/${source.plugin.pluginId}/${source.plugin.version}`;
    const targetWasmKey = `${targetPrefix}/plugin.wasm`;
    const targetArchiveKey = sourceArchiveKey
      ? `${targetPrefix}/archive.alp`
      : null;
    const copiedKeys: string[] = [];

    try {
      await this.copyStorageObject(
        sourceWasmKey,
        targetWasmKey,
        'application/wasm',
      );
      copiedKeys.push(targetWasmKey);

      if (sourceArchiveKey && targetArchiveKey) {
        await this.copyStorageObject(
          sourceArchiveKey,
          targetArchiveKey,
          'application/zip',
        );
        copiedKeys.push(targetArchiveKey);
      }

      const [created] = await this.tenantDb
        .insert(schema.plugins)
        .values({
          tenantId,
          orgId: targetOrgId,
          pluginId: source.plugin.pluginId,
          name: this.normalizeNullableText(name) ?? source.plugin.name,
          version: source.plugin.version,
          author: source.plugin.author,
          description:
            this.normalizeNullableText(description) ??
            this.normalizeNullableText(source.plugin.description),
          license: this.normalizeNullableText(source.plugin.license),
          status: 'active',
          manifest: source.plugin.manifest,
          nodeDefinitions: source.plugin.nodeDefinitions,
          storageKey: targetArchiveKey,
          signature: this.normalizeNullableText(source.plugin.signature),
          contentHash: this.normalizeNullableText(source.plugin.contentHash),
          wasmBundleUrl: targetWasmKey,
          permissions: source.plugin.permissions,
          installedBy: userId,
          metadata: this.buildMarketplaceCloneMetadata(source),
        })
        .returning();

      this.logger.log(
        JSON.stringify({
          action: 'plugin_marketplace_installed',
          listingId: source.listingId,
          sourcePluginDbId: source.plugin.id,
          installedPluginDbId: created.id,
          tenantId,
          userId,
        }),
      );

      return created;
    } catch (error) {
      await this.deleteOwnedStorageObjects(tenantId, copiedKeys);
      throw error;
    }
  }

  /**
   * 把已安装副本升级到源插件当前版本。
   *
   * 与安装同构:先把新版本产物复制到本租户前缀,再 OCC 更新记录,最后 best-effort
   * 删除旧版本产物(仅本租户前缀)。
   *
   * name/description 不跟随源插件:那是安装方给自己节点起的标签,升级不该覆盖。
   * 价格重新快照:升级是安装方主动接受新版本,连带接受当前定价。
   */
  async upgradeMarketplaceClone(params: {
    tenantId: string;
    userId: string;
    cloneDbId: string;
    source: PluginMarketplaceInstallSource;
  }): Promise<PluginRecord> {
    const { tenantId, userId, cloneDbId, source } = params;
    const clone = await this.findPlugin(tenantId, cloneDbId);

    if (!clone) {
      throw new PluginNotFoundException(cloneDbId);
    }

    const cloneMetadata = this.readMarketplaceCloneMetadata(clone.metadata);

    if (!cloneMetadata || cloneMetadata.listingId !== source.listingId) {
      throw new PluginValidationException(
        `插件 ${clone.pluginId} 不是该 listing 的安装副本，无法升级`,
      );
    }

    // listing 可被 PATCH 换绑到另一个插件（listing id 不变），只比 listingId
    // 会把别的插件的 manifest/WASM 写进本副本，而记录上的 pluginId 还是旧的。
    if (
      clone.pluginId !== source.plugin.pluginId ||
      cloneMetadata.sourcePluginId !== source.plugin.pluginId ||
      cloneMetadata.sourcePluginDbId !== source.plugin.id
    ) {
      throw new PluginValidationException(
        `该 listing 当前绑定的插件已换为 ${source.plugin.pluginId}，与已安装副本 ${clone.pluginId} 不是同一插件，无法升级`,
      );
    }

    const sourceWasmKey = this.normalizeNullableText(
      source.plugin.wasmBundleUrl,
    );

    if (!sourceWasmKey) {
      throw new PluginValidationException(
        '源插件缺少可执行 WASM 产物，无法升级',
      );
    }

    const sourceArchiveKey = this.normalizeNullableText(
      source.plugin.storageKey,
    );
    // 每次升级都写一组本次尝试独占的新 key:
    // - 发布方可以就地重发同 version 的新二进制,沿用 `<version>/plugin.wasm`
    //   会跳过复制却把新 contentHash 写进库,记录声明的哈希与对象字节从此不符;
    // - 不能用 content-addressed key:并发升级会指向同一 key,OCC 失败者的
    //   补偿删除就会删掉胜者记录正在引用的对象。
    const targetPrefix = `tenants/${tenantId}/plugins/${source.plugin.pluginId}/${source.plugin.version}/${randomUUID()}`;
    const targetWasmKey = `${targetPrefix}/plugin.wasm`;
    const targetArchiveKey = sourceArchiveKey
      ? `${targetPrefix}/archive.alp`
      : null;
    const copiedKeys: string[] = [];

    try {
      await this.copyStorageObject(
        sourceWasmKey,
        targetWasmKey,
        'application/wasm',
      );
      copiedKeys.push(targetWasmKey);

      if (sourceArchiveKey && targetArchiveKey) {
        await this.copyStorageObject(
          sourceArchiveKey,
          targetArchiveKey,
          'application/zip',
        );
        copiedKeys.push(targetArchiveKey);
      }

      // name/description:安装方改过就保留他的值,没改过(仍等于旧源值)才跟随
      // 新源。旧源值取副本里存着的上一份 manifest —— 那正是上次安装/升级时
      // 从源插件复制过来的原文。
      const previousManifest = isRecord(clone.manifest) ? clone.manifest : {};
      const previousSourceName =
        typeof previousManifest.name === 'string'
          ? previousManifest.name
          : null;
      const previousSourceDescription = this.normalizeNullableText(
        typeof previousManifest.description === 'string'
          ? previousManifest.description
          : null,
      );
      const followSourceName = clone.name === previousSourceName;
      const followSourceDescription =
        this.normalizeNullableText(clone.description) ===
        previousSourceDescription;

      const [updated] = await this.tenantDb
        .update(schema.plugins)
        .set({
          version: source.plugin.version,
          ...(followSourceName ? { name: source.plugin.name } : {}),
          ...(followSourceDescription
            ? {
                description: this.normalizeNullableText(
                  source.plugin.description,
                ),
              }
            : {}),
          author: source.plugin.author,
          license: this.normalizeNullableText(source.plugin.license),
          manifest: source.plugin.manifest,
          nodeDefinitions: source.plugin.nodeDefinitions,
          permissions: source.plugin.permissions,
          storageKey: targetArchiveKey,
          signature: this.normalizeNullableText(source.plugin.signature),
          contentHash: this.normalizeNullableText(source.plugin.contentHash),
          wasmBundleUrl: targetWasmKey,
          metadata: this.buildMarketplaceCloneMetadata(source, {
            clonedAt: cloneMetadata.clonedAt || undefined,
            upgradedAt: new Date().toISOString(),
          }),
          occVersion: sql`${schema.plugins.occVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.plugins.id, cloneDbId),
            eq(schema.plugins.tenantId, tenantId),
            eq(schema.plugins.occVersion, clone.occVersion),
          ),
        )
        .returning();

      if (!updated) {
        throw new PluginVersionConflictException(cloneDbId, clone.occVersion);
      }

      // 记录写成功后才丢旧产物,失败时旧版本仍可执行;新 key 本次独占,
      // 与旧 key 不可能相同,所以无需再做排除判断。
      await this.deleteOwnedStorageObjects(tenantId, [
        clone.wasmBundleUrl,
        clone.storageKey,
      ]);

      this.logger.log(
        JSON.stringify({
          action: 'plugin_marketplace_upgraded',
          listingId: source.listingId,
          pluginDbId: updated.id,
          fromVersion: clone.version,
          toVersion: updated.version,
          tenantId,
          userId,
        }),
      );

      return updated;
    } catch (error) {
      await this.deleteOwnedStorageObjects(tenantId, copiedKeys);
      throw error;
    }
  }

  private async copyStorageObject(
    sourceKey: string,
    targetKey: string,
    contentType: string,
  ): Promise<void> {
    const readable = await this.storageService.download(sourceKey);
    const chunks: Buffer[] = [];

    for await (const chunk of readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const buffer = Buffer.concat(chunks);
    await this.storageService.upload(
      targetKey,
      buffer,
      buffer.length,
      contentType,
    );
  }

  async resolveUsageSourceContext(
    plugin: PluginRecord,
  ): Promise<PluginUsageSourceContext> {
    const cloneMetadata = this.readMarketplaceCloneMetadata(plugin.metadata);

    if (!cloneMetadata) {
      return {
        sourceTenantId: plugin.tenantId,
        sourceOrgId: plugin.orgId,
        sourcePluginDbId: plugin.id,
        sourcePluginId: plugin.pluginId,
        sourceListingId: null,
        pricingModel: 'free',
        billingAmount: null,
        currency: 'USD',
      };
    }

    // 安装时已快照价格：下架/改价不影响已安装实例的计费口径。
    if (cloneMetadata.pricingModel) {
      return {
        sourceTenantId: cloneMetadata.sourceTenantId,
        sourceOrgId: cloneMetadata.sourceOrgId,
        sourcePluginDbId: cloneMetadata.sourcePluginDbId,
        sourcePluginId: cloneMetadata.sourcePluginId,
        sourceListingId: cloneMetadata.listingId,
        pricingModel: cloneMetadata.pricingModel,
        billingAmount:
          cloneMetadata.pricingModel === 'per_execution'
            ? normalizeFixedScaleDecimal(cloneMetadata.pricePerExecution)
            : null,
        currency: 'USD',
      };
    }

    // 旧 clone 无价格快照：回退查询当前 listing（下架后按 free 处理）。
    const listing = await this.findPluginMarketplaceListingById(
      cloneMetadata.listingId,
    );

    return {
      sourceTenantId: cloneMetadata.sourceTenantId,
      sourceOrgId: cloneMetadata.sourceOrgId,
      sourcePluginDbId: cloneMetadata.sourcePluginDbId,
      sourcePluginId: cloneMetadata.sourcePluginId,
      sourceListingId: cloneMetadata.listingId,
      pricingModel: listing?.pricingModel ?? 'free',
      billingAmount:
        listing?.pricingModel === 'per_execution'
          ? normalizeFixedScaleDecimal(listing.pricePerExecution)
          : null,
      currency: 'USD',
    };
  }

  private async findPlugin(
    tenantId: string,
    id: string,
  ): Promise<PluginRecord | null> {
    const [plugin] = await this.tenantDb
      .select()
      .from(schema.plugins)
      .where(
        and(eq(schema.plugins.id, id), eq(schema.plugins.tenantId, tenantId)),
      );

    return plugin ?? null;
  }

  private async findOrganizationIdOrThrow(tenantId: string): Promise<string> {
    const [organization] = await this.tenantDb
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.tenantId, tenantId))
      .limit(1);

    if (!organization) {
      throw new Error(`tenant ${tenantId} 未找到关联组织`);
    }

    return organization.id;
  }

  private async findPluginMarketplaceListingById(
    listingId: string,
  ): Promise<Pick<
    schema.MarketplaceListing,
    'id' | 'pricingModel' | 'pricePerExecution'
  > | null> {
    const [listing] = await this.db
      .select({
        id: schema.marketplaceListings.id,
        pricingModel: schema.marketplaceListings.pricingModel,
        pricePerExecution: schema.marketplaceListings.pricePerExecution,
      })
      .from(schema.marketplaceListings)
      .where(
        and(
          eq(schema.marketplaceListings.id, listingId),
          eq(schema.marketplaceListings.listingType, 'plugin'),
          eq(schema.marketplaceListings.status, 'listed'),
        ),
      )
      .limit(1);

    return listing ?? null;
  }

  private parseManifest(
    manifestData: Record<string, unknown>,
  ): ParsedPluginManifest {
    const normalizedManifest = this.normalizeManifestData(manifestData);
    const validationResult = validatePluginManifest(normalizedManifest);

    if (!validationResult.valid) {
      throw new PluginValidationException(validationResult.errors);
    }

    const parsedManifest = PluginManifestSchema.parse(normalizedManifest);

    return {
      raw: normalizedManifest,
      pluginId: parsedManifest.id,
      name: parsedManifest.name,
      version: parsedManifest.version,
      author: parsedManifest.author,
      description: parsedManifest.description,
      license: parsedManifest.license,
      permissions: parsedManifest.permissions,
      metadata: this.extractMetadata(normalizedManifest),
    };
  }

  private normalizeManifestData(
    manifestData: Record<string, unknown>,
  ): Record<string, unknown> {
    const normalizedManifest = { ...manifestData };
    const legacyPluginId =
      typeof normalizedManifest.pluginId === 'string'
        ? normalizedManifest.pluginId.trim()
        : undefined;

    if (normalizedManifest.id === undefined && legacyPluginId) {
      normalizedManifest.id = legacyPluginId;
    }

    delete normalizedManifest.pluginId;

    return normalizedManifest;
  }

  private extractMetadata(
    manifestData: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const metadata = manifestData['metadata'];
    return isRecord(metadata) ? metadata : null;
  }

  private parseNodeDefinitions(
    nodeDefinitions: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    const parsedDefinitions =
      PluginNodeDefinitionsSchema.safeParse(nodeDefinitions);

    if (!parsedDefinitions.success) {
      throw new PluginValidationException(
        parsedDefinitions.error.issues[0]?.message ?? '节点定义校验失败',
      );
    }

    return parsedDefinitions.data;
  }

  private normalizeNullableText(
    value: string | null | undefined,
  ): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private buildMarketplaceCloneMetadata(
    source: PluginMarketplaceInstallSource,
    options?: { clonedAt?: string; upgradedAt?: string },
  ): Record<string, unknown> {
    const existingMetadata = isRecord(source.plugin.metadata)
      ? source.plugin.metadata
      : {};

    const cloneMetadata: MarketplaceCloneMetadata = {
      cloned_from_marketplace: {
        listingId: source.listingId,
        listingTitle: source.listingTitle,
        sourceTenantId: source.plugin.tenantId,
        sourceOrgId: source.plugin.orgId,
        sourcePluginDbId: source.plugin.id,
        sourcePluginId: source.plugin.pluginId,
        clonedAt: options?.clonedAt ?? new Date().toISOString(),
        upgradedAt: options?.upgradedAt ?? null,
        pricingModel: source.pricingModel,
        pricePerExecution:
          source.pricingModel === 'per_execution'
            ? normalizeFixedScaleDecimal(source.pricePerExecution)
            : null,
        sourceVersion: source.plugin.version,
        sourceContentHash: source.plugin.contentHash ?? null,
      },
    };

    return {
      ...existingMetadata,
      ...cloneMetadata,
    };
  }

  private readMarketplaceCloneMetadata(
    metadata: Record<string, unknown> | null,
  ): MarketplaceCloneMetadata['cloned_from_marketplace'] | null {
    if (!isRecord(metadata)) {
      return null;
    }

    const clonedFromMarketplace = metadata['cloned_from_marketplace'];
    if (!isRecord(clonedFromMarketplace)) {
      return null;
    }

    if (
      typeof clonedFromMarketplace.listingId !== 'string' ||
      typeof clonedFromMarketplace.sourceTenantId !== 'string' ||
      typeof clonedFromMarketplace.sourceOrgId !== 'string' ||
      typeof clonedFromMarketplace.sourcePluginDbId !== 'string' ||
      typeof clonedFromMarketplace.sourcePluginId !== 'string'
    ) {
      return null;
    }

    return {
      listingId: clonedFromMarketplace.listingId,
      listingTitle:
        typeof clonedFromMarketplace.listingTitle === 'string'
          ? clonedFromMarketplace.listingTitle
          : '',
      sourceTenantId: clonedFromMarketplace.sourceTenantId,
      sourceOrgId: clonedFromMarketplace.sourceOrgId,
      sourcePluginDbId: clonedFromMarketplace.sourcePluginDbId,
      sourcePluginId: clonedFromMarketplace.sourcePluginId,
      clonedAt:
        typeof clonedFromMarketplace.clonedAt === 'string'
          ? clonedFromMarketplace.clonedAt
          : '',
      upgradedAt:
        typeof clonedFromMarketplace.upgradedAt === 'string'
          ? clonedFromMarketplace.upgradedAt
          : null,
      pricingModel:
        clonedFromMarketplace.pricingModel === 'free' ||
        clonedFromMarketplace.pricingModel === 'per_execution'
          ? clonedFromMarketplace.pricingModel
          : null,
      pricePerExecution:
        typeof clonedFromMarketplace.pricePerExecution === 'string'
          ? clonedFromMarketplace.pricePerExecution
          : null,
      sourceVersion:
        typeof clonedFromMarketplace.sourceVersion === 'string'
          ? clonedFromMarketplace.sourceVersion
          : null,
      sourceContentHash:
        typeof clonedFromMarketplace.sourceContentHash === 'string'
          ? clonedFromMarketplace.sourceContentHash
          : null,
    };
  }
}

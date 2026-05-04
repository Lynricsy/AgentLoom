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

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

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
    const [deleted] = await this.tenantDb
      .delete(schema.plugins)
      .where(
        and(eq(schema.plugins.id, id), eq(schema.plugins.tenantId, tenantId)),
      )
      .returning({ id: schema.plugins.id });

    if (!deleted) {
      throw new PluginNotFoundException(id);
    }

    this.logger.log(
      JSON.stringify({
        action: 'plugin_deleted',
        recordId: id,
        tenantId,
      }),
    );
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
        storageKey: this.normalizeNullableText(source.plugin.storageKey),
        signature: this.normalizeNullableText(source.plugin.signature),
        contentHash: this.normalizeNullableText(source.plugin.contentHash),
        wasmBundleUrl: this.normalizeNullableText(source.plugin.wasmBundleUrl),
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
        clonedAt: new Date().toISOString(),
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
    };
  }
}

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
    const resolvedOrgId = orgId ?? (await this.findOrganizationIdOrThrow(tenantId));
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
    const resolvedOrgId = orgId ?? (await this.findOrganizationIdOrThrow(tenantId));

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

  async remove(id: string, tenantId: string): Promise<void> {
    const [deleted] = await this.tenantDb
      .delete(schema.plugins)
      .where(
        and(
          eq(schema.plugins.id, id),
          eq(schema.plugins.tenantId, tenantId),
        ),
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

  private async findPlugin(
    tenantId: string,
    id: string,
  ): Promise<PluginRecord | null> {
    const [plugin] = await this.tenantDb
      .select()
      .from(schema.plugins)
      .where(
        and(
          eq(schema.plugins.id, id),
          eq(schema.plugins.tenantId, tenantId),
        ),
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
    const parsedDefinitions = PluginNodeDefinitionsSchema.safeParse(
      nodeDefinitions,
    );

    if (!parsedDefinitions.success) {
      throw new PluginValidationException(
        parsedDefinitions.error.issues[0]?.message ?? '节点定义校验失败',
      );
    }

    return parsedDefinitions.data;
  }

  private normalizeNullableText(value: string | undefined): string | null {
    if (value === undefined) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}

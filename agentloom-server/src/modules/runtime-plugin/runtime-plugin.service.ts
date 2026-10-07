import type { Readable } from 'node:stream';

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PluginManifest } from '@agentloom/plugin-sdk';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { TenantOrganizationResolver } from '../../common/providers/tenant-organization.resolver';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { RuntimePluginRecord } from '../../database/schema/runtime-plugins.schema';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  QueryRuntimePluginsSchema,
  type QueryRuntimePluginsDtoType,
  type RuntimePluginResponse,
  type RuntimePluginStatusDto,
} from './dto/runtime-plugin.dto';
import {
  RuntimePluginAlreadyExistsException,
  RuntimePluginInactiveException,
  RuntimePluginNotFoundException,
  RuntimePluginVersionConflictException,
} from './runtime-plugin.exceptions';

export interface RegisterRuntimePluginParams {
  tenantId: string;
  orgId: string;
  userId: string;
  /** 已通过 validateManifest 且 kind=runtime 的 manifest */
  manifest: PluginManifest;
  /** 归档内 manifest.json 原文（落库保存） */
  rawManifest: Record<string, unknown>;
  archive: Buffer;
  bundlePatch: string;
  signature: string;
  contentHash: string;
  status: 'registered' | 'active';
}

export interface RuntimePluginListResult {
  data: RuntimePluginResponse[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class RuntimePluginService {
  private readonly logger = new Logger(RuntimePluginService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly storageService: StorageService,
    private readonly tenantOrganizationResolver: TenantOrganizationResolver,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  /** JWT 缺少 org claim 时按 tenant 回查组织。 */
  async resolveOrganizationId(tenantId: string): Promise<string> {
    const organizationId =
      await this.tenantOrganizationResolver.findOrganizationId(tenantId);

    if (!organizationId) {
      throw new Error(`tenant ${tenantId} 未找到关联组织`);
    }

    return organizationId;
  }

  async findByPluginVersion(
    orgId: string,
    pluginId: string,
    version: string,
  ): Promise<RuntimePluginRecord | null> {
    const [record] = await this.tenantDb
      .select()
      .from(schema.runtimePlugins)
      .where(
        and(
          eq(schema.runtimePlugins.orgId, orgId),
          eq(schema.runtimePlugins.pluginId, pluginId),
          eq(schema.runtimePlugins.version, version),
        ),
      )
      .limit(1);

    return record ?? null;
  }

  /**
   * 上传归档并落库；落库失败时回滚删除已上传的对象，避免孤儿对象。
   */
  async register(
    params: RegisterRuntimePluginParams,
  ): Promise<RuntimePluginRecord> {
    const { manifest } = params;
    const existing = await this.findByPluginVersion(
      params.orgId,
      manifest.id,
      manifest.version,
    );

    if (existing) {
      throw new RuntimePluginAlreadyExistsException(
        manifest.id,
        manifest.version,
      );
    }

    const storageKey = `tenants/${params.tenantId}/runtime-plugins/${manifest.id}/${manifest.version}/archive.alp`;

    await this.storageService.upload(
      storageKey,
      params.archive,
      params.archive.length,
      'application/zip',
    );

    let created: RuntimePluginRecord | undefined;
    try {
      [created] = await this.tenantDb
        .insert(schema.runtimePlugins)
        .values({
          tenantId: params.tenantId,
          orgId: params.orgId,
          pluginId: manifest.id,
          name: manifest.name,
          version: manifest.version,
          author: manifest.author,
          description: manifest.description.trim() || null,
          license: manifest.license.trim() || null,
          status: params.status,
          manifest: params.rawManifest,
          bundlePatch: params.bundlePatch,
          configSchema: manifest.runtime?.configSchema ?? null,
          storageKey,
          contentHash: params.contentHash,
          signature: params.signature,
          sizeBytes: params.archive.length,
          installedBy: params.userId,
        })
        .returning();
    } catch (error) {
      await this.deleteStorageObjectBestEffort(storageKey);
      throw error;
    }

    this.logger.log(
      JSON.stringify({
        action: 'runtime_plugin_registered',
        pluginId: created.pluginId,
        version: created.version,
        recordId: created.id,
        tenantId: params.tenantId,
        userId: params.userId,
      }),
    );

    return created;
  }

  async findAll(
    tenantId: string,
    query: QueryRuntimePluginsDtoType,
  ): Promise<RuntimePluginListResult> {
    const parsedQuery = QueryRuntimePluginsSchema.parse(query);
    const { page, pageSize } = parsedQuery;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(schema.runtimePlugins.tenantId, tenantId)];

    if (parsedQuery.status) {
      conditions.push(eq(schema.runtimePlugins.status, parsedQuery.status));
    }

    if (parsedQuery.search) {
      const search = `%${parsedQuery.search}%`;
      conditions.push(
        or(
          ilike(schema.runtimePlugins.name, search),
          ilike(schema.runtimePlugins.pluginId, search),
          ilike(schema.runtimePlugins.author, search),
        )!,
      );
    }

    const whereClause = and(...conditions);

    const [data, countResult] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.runtimePlugins)
        .where(whereClause)
        .orderBy(desc(schema.runtimePlugins.updatedAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.runtimePlugins)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data: data.map(toRuntimePluginResponse),
      meta: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async findById(id: string, tenantId: string): Promise<RuntimePluginRecord> {
    const [record] = await this.tenantDb
      .select()
      .from(schema.runtimePlugins)
      .where(
        and(
          eq(schema.runtimePlugins.id, id),
          eq(schema.runtimePlugins.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!record) {
      throw new RuntimePluginNotFoundException(id);
    }

    return record;
  }

  /** 会话下发与发布校验使用：插件必须存在且处于 active 状态。 */
  async findActiveById(
    id: string,
    tenantId: string,
  ): Promise<RuntimePluginRecord> {
    const record = await this.findById(id, tenantId);

    if (record.status !== 'active') {
      throw new RuntimePluginInactiveException(id);
    }

    return record;
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: RuntimePluginStatusDto,
    occVersion: number,
  ): Promise<RuntimePluginRecord> {
    const [updated] = await this.tenantDb
      .update(schema.runtimePlugins)
      .set({
        status,
        occVersion: sql`${schema.runtimePlugins.occVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.runtimePlugins.id, id),
          eq(schema.runtimePlugins.tenantId, tenantId),
          eq(schema.runtimePlugins.occVersion, occVersion),
        ),
      )
      .returning();

    if (!updated) {
      const current = await this.findById(id, tenantId);
      throw new RuntimePluginVersionConflictException(id, current.occVersion);
    }

    this.logger.log(
      JSON.stringify({
        action: 'runtime_plugin_status_updated',
        pluginId: updated.pluginId,
        recordId: updated.id,
        tenantId,
        status: updated.status,
        occVersion: updated.occVersion,
      }),
    );

    return updated;
  }

  /** 先删存储对象再删行：对象删除失败时保留行，避免留下无记录的孤儿对象。 */
  async remove(id: string, tenantId: string): Promise<void> {
    const record = await this.findById(id, tenantId);

    await this.storageService.delete(record.storageKey);

    const [deleted] = await this.tenantDb
      .delete(schema.runtimePlugins)
      .where(
        and(
          eq(schema.runtimePlugins.id, id),
          eq(schema.runtimePlugins.tenantId, tenantId),
        ),
      )
      .returning({ id: schema.runtimePlugins.id });

    if (!deleted) {
      throw new RuntimePluginNotFoundException(id);
    }

    this.logger.log(
      JSON.stringify({
        action: 'runtime_plugin_deleted',
        recordId: id,
        tenantId,
      }),
    );
  }

  /** 下载插件 .alp 归档全文（会话创建时解包下发到 sandbox）。 */
  async downloadArchive(record: RuntimePluginRecord): Promise<Buffer> {
    const stream: Readable = await this.storageService.download(
      record.storageKey,
    );
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  private async deleteStorageObjectBestEffort(key: string): Promise<void> {
    try {
      await this.storageService.delete(key);
    } catch (error) {
      this.logger.warn(
        `runtime 插件注册回滚清理对象失败: ${key} (${
          error instanceof Error ? error.message : String(error)
        })`,
      );
    }
  }
}

/** 记录 → 对外响应：剔除 storageKey / signature / bundlePatch / manifest 等内部字段。 */
export function toRuntimePluginResponse(
  record: RuntimePluginRecord,
): RuntimePluginResponse {
  return {
    id: record.id,
    pluginId: record.pluginId,
    name: record.name,
    version: record.version,
    author: record.author,
    description: record.description,
    license: record.license,
    status: record.status,
    configSchema: record.configSchema,
    sizeBytes: record.sizeBytes,
    contentHash: record.contentHash,
    installedBy: record.installedBy,
    occVersion: record.occVersion,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

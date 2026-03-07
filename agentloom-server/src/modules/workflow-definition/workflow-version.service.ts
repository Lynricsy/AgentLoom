import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, max, sql } from 'drizzle-orm';

import { RedisCacheService } from '../../common/redis/redis-cache.service';
import { RedisDomain, redisKey } from '../../common/redis/redis-key.util';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import type { WorkflowVersionSnapshot } from '../../database/schema/workflow-versions.schema';
import type { CreateVersionDto } from './dto/create-version.dto';
import type { ListVersionsQueryDto } from './dto/list-versions-query.dto';
import type { PublishWorkflowDto } from './dto/publish-workflow.dto';
import type { VersionResponseDto } from './dto/version-response.dto';
import {
  InvalidStatusTransitionException,
  WorkflowArchivedException,
  WorkflowNotFoundException,
  WorkflowPublishValidationException,
  WorkflowVersionNotFoundException,
} from './workflow-version.exceptions';

/** 发布版本缓存 TTL（秒） */
const PUBLISHED_VERSION_TTL = 300;
/** 空值缓存 TTL（秒），防止缓存穿透 */
const NULL_CACHE_TTL = 60;
/** 空值缓存标记 */
const NULL_SENTINEL = '__NULL__';

@Injectable()
export class WorkflowVersionService {
  private readonly logger = new Logger(WorkflowVersionService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  // ─── 创建版本快照 ─────────────────────────────────────────────

  async createVersion(
    workflowId: string,
    dto: CreateVersionDto,
    userId: string,
  ): Promise<VersionResponseDto> {
    const workflow = await this.findWorkflowOrThrow(workflowId);

    if (workflow.status === 'archived') {
      throw new WorkflowArchivedException(workflowId);
    }

    const [maxResult] = await this.tenantDb
      .select({ maxVersion: max(schema.workflowVersions.versionNumber) })
      .from(schema.workflowVersions)
      .where(
        eq(schema.workflowVersions.workflowDefinitionId, workflowId),
      );

    const nextVersionNumber = (maxResult?.maxVersion ?? 0) + 1;

    const snapshot: WorkflowVersionSnapshot = {
      nodes: (workflow.nodes ?? []) as WorkflowVersionSnapshot['nodes'],
      edges: (workflow.edges ?? []) as WorkflowVersionSnapshot['edges'],
      viewport: (workflow.viewport as WorkflowVersionSnapshot['viewport']) ?? null,
      metadata: {
        nodeCount: Array.isArray(workflow.nodes) ? workflow.nodes.length : 0,
        edgeCount: Array.isArray(workflow.edges) ? workflow.edges.length : 0,
        createdFromVersion: workflow.version,
      },
    };

    const [version] = await this.tenantDb
      .insert(schema.workflowVersions)
      .values({
        workflowDefinitionId: workflowId,
        tenantId: workflow.tenantId,
        versionNumber: nextVersionNumber,
        label: dto.label ?? null,
        snapshot,
        createdBy: userId,
      })
      .returning();

    this.logger.log(
      JSON.stringify({
        action: 'version_created',
        workflowId,
        versionId: version.id,
        versionNumber: nextVersionNumber,
        userId,
      }),
    );

    return this.toResponseDto(version);
  }

  // ─── 列出版本历史 ─────────────────────────────────────────────

  async listVersions(
    workflowId: string,
    query: ListVersionsQueryDto,
  ): Promise<{
    data: VersionResponseDto[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    await this.findWorkflowOrThrow(workflowId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const [versions, countResult] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.workflowVersions)
        .where(
          eq(schema.workflowVersions.workflowDefinitionId, workflowId),
        )
        .orderBy(desc(schema.workflowVersions.versionNumber))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.workflowVersions)
        .where(
          eq(schema.workflowVersions.workflowDefinitionId, workflowId),
        ),
    ]);

    return {
      data: versions.map((v) => this.toResponseDto(v)),
      total: countResult[0]?.count ?? 0,
      page,
      pageSize,
    };
  }

  // ─── 回滚到指定版本 ───────────────────────────────────────────

  async rollback(
    workflowId: string,
    versionId: string,
    userId: string,
  ): Promise<VersionResponseDto> {
    const workflow = await this.findWorkflowOrThrow(workflowId);

    if (workflow.status === 'archived') {
      throw new WorkflowArchivedException(workflowId);
    }

    const version = await this.findVersionOrThrow(versionId, workflowId);

    await this.tenantDb
      .update(schema.workflowDefinitions)
      .set({
        nodes: version.snapshot.nodes,
        edges: version.snapshot.edges,
        viewport: version.snapshot.viewport,
        version: sql`${schema.workflowDefinitions.version} + 1`,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(schema.workflowDefinitions.id, workflowId));

    this.logger.log(
      JSON.stringify({
        action: 'version_rollback',
        workflowId,
        versionId,
        versionNumber: version.versionNumber,
        userId,
      }),
    );

    return this.toResponseDto(version);
  }

  // ─── 发布工作流 ───────────────────────────────────────────────

  async publish(
    workflowId: string,
    dto: PublishWorkflowDto,
    userId: string,
  ): Promise<VersionResponseDto> {
    const workflow = await this.findWorkflowOrThrow(workflowId);

    if (workflow.status === 'archived') {
      throw new WorkflowArchivedException(workflowId);
    }

    if (workflow.status !== 'draft') {
      throw new InvalidStatusTransitionException(workflow.status, 'published');
    }

    const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
    if (nodes.length === 0) {
      throw new WorkflowPublishValidationException(
        '工作流必须包含至少一个节点才能发布',
      );
    }

    let publishedVersion: typeof schema.workflowVersions.$inferSelect;

    if (dto.versionId) {
      publishedVersion = await this.findVersionOrThrow(dto.versionId, workflowId);

      const [updated] = await this.tenantDb
        .update(schema.workflowVersions)
        .set({ publishedAt: new Date() })
        .where(eq(schema.workflowVersions.id, dto.versionId))
        .returning();

      publishedVersion = updated;
    } else {
      const [maxResult] = await this.tenantDb
        .select({ maxVersion: max(schema.workflowVersions.versionNumber) })
        .from(schema.workflowVersions)
        .where(
          eq(schema.workflowVersions.workflowDefinitionId, workflowId),
        );

      const nextVersionNumber = (maxResult?.maxVersion ?? 0) + 1;

      const snapshot: WorkflowVersionSnapshot = {
        nodes: (workflow.nodes ?? []) as WorkflowVersionSnapshot['nodes'],
        edges: (workflow.edges ?? []) as WorkflowVersionSnapshot['edges'],
        viewport: (workflow.viewport as WorkflowVersionSnapshot['viewport']) ?? null,
        metadata: {
          nodeCount: nodes.length,
          edgeCount: Array.isArray(workflow.edges) ? workflow.edges.length : 0,
          createdFromVersion: workflow.version,
        },
      };

      const [created] = await this.tenantDb
        .insert(schema.workflowVersions)
        .values({
          workflowDefinitionId: workflowId,
          tenantId: workflow.tenantId,
          versionNumber: nextVersionNumber,
          label: dto.label ?? null,
          snapshot,
          publishedAt: new Date(),
          createdBy: userId,
        })
        .returning();

      publishedVersion = created;
    }

    await this.tenantDb
      .update(schema.workflowDefinitions)
      .set({
        status: 'published',
        publishedVersionId: publishedVersion.id,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(schema.workflowDefinitions.id, workflowId));

    await this.invalidatePublishedCache(workflow.tenantId, workflowId);

    this.logger.log(
      JSON.stringify({
        action: 'workflow_published',
        workflowId,
        versionId: publishedVersion.id,
        versionNumber: publishedVersion.versionNumber,
        userId,
      }),
    );

    return this.toResponseDto(publishedVersion);
  }

  // ─── 归档工作流 ───────────────────────────────────────────────

  async archive(workflowId: string, userId: string): Promise<void> {
    const workflow = await this.findWorkflowOrThrow(workflowId);

    if (workflow.status === 'archived') {
      throw new WorkflowArchivedException(workflowId);
    }

    const now = new Date();

    await this.tenantDb
      .update(schema.workflowVersions)
      .set({ archivedAt: now })
      .where(
        and(
          eq(schema.workflowVersions.workflowDefinitionId, workflowId),
          sql`${schema.workflowVersions.archivedAt} IS NULL`,
        ),
      );

    await this.tenantDb
      .update(schema.workflowDefinitions)
      .set({
        status: 'archived',
        updatedBy: userId,
        updatedAt: now,
      })
      .where(eq(schema.workflowDefinitions.id, workflowId));

    await this.invalidatePublishedCache(workflow.tenantId, workflowId);

    this.logger.log(
      JSON.stringify({
        action: 'workflow_archived',
        workflowId,
        userId,
      }),
    );
  }

  // ─── 获取已发布版本（Redis L2 缓存） ─────────────────────────

  async getPublishedVersion(
    workflowId: string,
    tenantId: string,
  ): Promise<VersionResponseDto | null> {
    const cacheKey = this.getPublishedCacheKey(tenantId, workflowId);

    const cached = await this.redisCacheService.get(cacheKey);

    if (cached !== null) {
      if (cached === NULL_SENTINEL) {
        return null;
      }
      return JSON.parse(cached) as VersionResponseDto;
    }

    const workflow = await this.findWorkflowOrThrow(workflowId);

    if (!workflow.publishedVersionId) {
      // 缓存空值，防止缓存穿透
      await this.redisCacheService.set(cacheKey, NULL_SENTINEL, NULL_CACHE_TTL);
      return null;
    }

    const [version] = await this.tenantDb
      .select()
      .from(schema.workflowVersions)
      .where(
        and(
          eq(schema.workflowVersions.id, workflow.publishedVersionId),
          eq(schema.workflowVersions.workflowDefinitionId, workflowId),
        ),
      );

    if (!version) {
      await this.redisCacheService.set(cacheKey, NULL_SENTINEL, NULL_CACHE_TTL);
      return null;
    }

    const responseDto = this.toResponseDto(version);

    await this.redisCacheService.set(
      cacheKey,
      JSON.stringify(responseDto),
      PUBLISHED_VERSION_TTL,
    );

    return responseDto;
  }

  // ─── 私有辅助方法 ─────────────────────────────────────────────

  private async findWorkflowOrThrow(workflowId: string) {
    const [workflow] = await this.tenantDb
      .select()
      .from(schema.workflowDefinitions)
      .where(eq(schema.workflowDefinitions.id, workflowId));

    if (!workflow) {
      throw new WorkflowNotFoundException(workflowId);
    }

    return workflow;
  }

  private async findVersionOrThrow(versionId: string, workflowId: string) {
    const [version] = await this.tenantDb
      .select()
      .from(schema.workflowVersions)
      .where(
        and(
          eq(schema.workflowVersions.id, versionId),
          eq(schema.workflowVersions.workflowDefinitionId, workflowId),
        ),
      );

    if (!version) {
      throw new WorkflowVersionNotFoundException(versionId);
    }

    return version;
  }

  private getPublishedCacheKey(tenantId: string, workflowId: string): string {
    return redisKey(tenantId, RedisDomain.CACHE, `wf:published:${workflowId}`);
  }

  private async invalidatePublishedCache(
    tenantId: string,
    workflowId: string,
  ): Promise<void> {
    const cacheKey = this.getPublishedCacheKey(tenantId, workflowId);
    await this.redisCacheService.del(cacheKey);
  }

  private toResponseDto(
    version: typeof schema.workflowVersions.$inferSelect,
  ): VersionResponseDto {
    return {
      id: version.id,
      workflowDefinitionId: version.workflowDefinitionId,
      versionNumber: version.versionNumber,
      label: version.label ?? null,
      snapshot: version.snapshot,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      archivedAt: version.archivedAt?.toISOString() ?? null,
      createdBy: version.createdBy,
      createdAt: version.createdAt.toISOString(),
    };
  }
}

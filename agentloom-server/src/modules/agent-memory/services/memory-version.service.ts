import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import {
  hasActiveTenantTransaction,
  registerAfterCommitHook,
} from '../../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import {
  MemoryNodeNotFoundException,
  MemoryPatchTargetNotFoundException,
  MemoryVersionChainExistsException,
  MemoryVersionConcurrentUpdateException,
  MemoryVersionNotFoundException,
} from '../agent-memory.exceptions';
import { MemoryGateway } from '../memory.gateway';
import {
  getTenantId,
  memoryNodes,
  memoryVersions,
  type MemoryNode,
  type MemoryVersion,
} from '../../../database/schema';

export interface PatchMemoryVersionInput {
  oldString: string;
  newString: string;
}

export type MemoryVersionReviewAction = 'approve' | 'reject';

export interface MemoryVersionReviewInput {
  nodeId: string;
  versionId: string;
  action: MemoryVersionReviewAction;
  /** 审核人用户 ID，随 memory.review.submitted 下发 */
  reviewer: string;
}

type VersionQueryClient = Pick<DrizzleDB, 'select' | 'insert' | 'update'>;

@Injectable()
export class MemoryVersionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly gateway: MemoryGateway,
  ) {}

  /**
   * 广播实时事件。有活跃租户事务时延迟到提交之后，避免回滚后客户端已收到「已创建」。
   * 注意：patch/append/rollback 自带 drizzle 事务，emit 必须放在该事务 **之外**，
   * 否则回调内广播同样早于提交。
   */
  private broadcastAfterCommit(emit: () => void): void {
    if (hasActiveTenantTransaction()) {
      registerAfterCommitHook(async () => emit());
      return;
    }

    emit();
  }

  private emitVersionCreated(
    node: MemoryNode,
    version: MemoryVersion,
    operationType: string,
  ): void {
    this.broadcastAfterCommit(() =>
      this.gateway.emitVersionCreated(node.tenantId, node.instanceId, {
        instanceId: node.instanceId,
        nodeId: node.id,
        versionId: version.id,
        version: version.version,
        operationType,
        reviewStatus: version.reviewStatus,
      }),
    );
  }

  async createVersion(
    nodeId: string,
    content: string,
    createdBy?: string,
  ): Promise<MemoryVersion> {
    const tenantDb = getTenantDb(this.db);

    const node = await this.findNodeOrThrow(nodeId);

    const existingVersion = await this.findLatestVersion(tenantDb, nodeId);

    if (existingVersion) {
      throw new MemoryVersionChainExistsException(nodeId);
    }

    const [createdVersion] = await tenantDb
      .insert(memoryVersions)
      .values({
        nodeId,
        tenantId: getTenantId,
        content,
        version: 1,
        reviewStatus: 'pending',
        createdBy: createdBy ?? null,
      })
      .returning();

    this.emitVersionCreated(node, createdVersion, 'create');

    return createdVersion;
  }

  async patchVersion(
    nodeId: string,
    patch: PatchMemoryVersionInput,
    createdBy?: string,
  ): Promise<MemoryVersion> {
    const tenantDb = getTenantDb(this.db);
    const node = await this.findNodeOrThrow(nodeId);

    const created = await tenantDb.transaction(async (tx) => {
      const latestVersion = await this.findLatestVersionOrThrow(tx, nodeId);

      if (!latestVersion.content.includes(patch.oldString)) {
        throw new MemoryPatchTargetNotFoundException();
      }

      const newContent = latestVersion.content.replace(
        patch.oldString,
        patch.newString,
      );

      const [createdVersion] = await tx
        .insert(memoryVersions)
        .values({
          nodeId,
          tenantId: getTenantId,
          content: newContent,
          version: latestVersion.version + 1,
          reviewStatus: 'pending',
          patchSummary: 'patch: oldString -> newString',
          createdBy: createdBy ?? null,
        })
        .returning();

      await this.deprecateLatestVersionOrThrow(
        tx,
        latestVersion,
        createdVersion.id,
      );

      return createdVersion;
    });

    this.emitVersionCreated(node, created, 'patch');

    return created;
  }

  async appendVersion(
    nodeId: string,
    appendContent: string,
    createdBy?: string,
  ): Promise<MemoryVersion> {
    const tenantDb = getTenantDb(this.db);
    const node = await this.findNodeOrThrow(nodeId);

    const created = await tenantDb.transaction(async (tx) => {
      const latestVersion = await this.findLatestVersionOrThrow(tx, nodeId);
      const [createdVersion] = await tx
        .insert(memoryVersions)
        .values({
          nodeId,
          tenantId: getTenantId,
          content: `${latestVersion.content}\n${appendContent}`,
          version: latestVersion.version + 1,
          reviewStatus: 'pending',
          patchSummary: 'append: add content to tail',
          createdBy: createdBy ?? null,
        })
        .returning();

      await this.deprecateLatestVersionOrThrow(
        tx,
        latestVersion,
        createdVersion.id,
      );

      return createdVersion;
    });

    this.emitVersionCreated(node, created, 'append');

    return created;
  }

  async getLatestVersion(nodeId: string): Promise<MemoryVersion | null> {
    const tenantDb = getTenantDb(this.db);

    return this.findLatestVersion(tenantDb, nodeId);
  }

  async getVersionHistory(nodeId: string): Promise<MemoryVersion[]> {
    const tenantDb = getTenantDb(this.db);

    return tenantDb
      .select()
      .from(memoryVersions)
      .where(eq(memoryVersions.nodeId, nodeId))
      .orderBy(desc(memoryVersions.version));
  }

  async rollbackToVersion(
    nodeId: string,
    targetVersionId: string,
    createdBy?: string,
  ): Promise<MemoryVersion> {
    const tenantDb = getTenantDb(this.db);
    const node = await this.findNodeOrThrow(nodeId);

    const created = await tenantDb.transaction(async (tx) => {
      const [targetVersion] = await tx
        .select()
        .from(memoryVersions)
        .where(
          and(
            eq(memoryVersions.id, targetVersionId),
            eq(memoryVersions.nodeId, nodeId),
          ),
        )
        .limit(1);

      if (!targetVersion) {
        throw new MemoryVersionNotFoundException(nodeId, targetVersionId);
      }

      const latestVersion = await this.findLatestVersionOrThrow(tx, nodeId);
      const [createdVersion] = await tx
        .insert(memoryVersions)
        .values({
          nodeId,
          tenantId: getTenantId,
          content: targetVersion.content,
          version: latestVersion.version + 1,
          reviewStatus: 'pending',
          patchSummary: `rollback: restore version ${targetVersion.version}`,
          createdBy: createdBy ?? null,
        })
        .returning();

      await this.deprecateLatestVersionOrThrow(
        tx,
        latestVersion,
        createdVersion.id,
      );

      return createdVersion;
    });

    this.broadcastAfterCommit(() =>
      this.gateway.emitVersionRollback(node.tenantId, node.instanceId, {
        instanceId: node.instanceId,
        nodeId: node.id,
        versionId: created.id,
        version: created.version,
        targetVersionId,
      }),
    );

    return created;
  }

  /**
   * 审核版本：只命中属于 `nodeId` 的版本，避免借一个节点的路由审核另一个节点的版本；
   * 提交后广播 memory.review.submitted（Studio 审计页据此刷新待审核列表）。
   */
  async updateReviewStatus(
    input: MemoryVersionReviewInput,
  ): Promise<MemoryVersion> {
    const tenantDb = getTenantDb(this.db);
    const node = await this.findNodeOrThrow(input.nodeId);
    const [updatedVersion] = await tenantDb
      .update(memoryVersions)
      .set({
        reviewStatus: input.action === 'approve' ? 'approved' : 'rejected',
      })
      .where(
        and(
          eq(memoryVersions.id, input.versionId),
          eq(memoryVersions.nodeId, input.nodeId),
        ),
      )
      .returning();

    if (!updatedVersion) {
      throw new MemoryVersionNotFoundException(input.nodeId, input.versionId);
    }

    this.broadcastAfterCommit(() =>
      this.gateway.emitReviewSubmitted(node.tenantId, node.instanceId, {
        instanceId: node.instanceId,
        nodeId: node.id,
        versionId: updatedVersion.id,
        action: input.action,
        reviewer: input.reviewer,
      }),
    );

    return updatedVersion;
  }

  private async findNodeOrThrow(nodeId: string): Promise<MemoryNode> {
    const tenantDb = getTenantDb(this.db);
    const [node] = await tenantDb
      .select()
      .from(memoryNodes)
      .where(eq(memoryNodes.id, nodeId))
      .limit(1);

    if (!node) {
      throw new MemoryNodeNotFoundException(nodeId);
    }

    return node;
  }

  private async findLatestVersion(
    dbClient: VersionQueryClient,
    nodeId: string,
  ): Promise<MemoryVersion | null> {
    const [latestVersion] = await dbClient
      .select()
      .from(memoryVersions)
      .where(
        and(
          eq(memoryVersions.nodeId, nodeId),
          eq(memoryVersions.deprecated, false),
        ),
      )
      .orderBy(desc(memoryVersions.version))
      .limit(1);

    return latestVersion ?? null;
  }

  private async findLatestVersionOrThrow(
    dbClient: VersionQueryClient,
    nodeId: string,
  ): Promise<MemoryVersion> {
    const latestVersion = await this.findLatestVersion(dbClient, nodeId);

    if (!latestVersion) {
      throw new MemoryVersionNotFoundException(nodeId);
    }

    return latestVersion;
  }

  private async deprecateLatestVersionOrThrow(
    dbClient: VersionQueryClient,
    latestVersion: MemoryVersion,
    successorVersionId: string,
  ): Promise<void> {
    const [updatedVersion] = await dbClient
      .update(memoryVersions)
      .set({
        deprecated: true,
        migratedTo: successorVersionId,
      })
      .where(
        and(
          eq(memoryVersions.id, latestVersion.id),
          eq(memoryVersions.nodeId, latestVersion.nodeId),
          eq(memoryVersions.version, latestVersion.version),
          eq(memoryVersions.deprecated, false),
        ),
      )
      .returning({ id: memoryVersions.id });

    if (!updatedVersion) {
      throw new MemoryVersionConcurrentUpdateException();
    }
  }
}
